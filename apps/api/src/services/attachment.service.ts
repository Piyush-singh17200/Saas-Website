import { prisma } from "@workspace/database";
import { AppError } from "../middleware/error-handler.js";
import {
  ErrorCode,
  type AttachmentResponse,
  type PresignUploadInput,
  type PresignUploadResponse,
} from "@workspace/contracts";
import { env } from "../config/env.js";
import {
  getStorageAdapter,
  validateFileMetadata,
  validateFileContentSignature,
  generateStorageKey,
  type StorageAdapter,
} from "../lib/storage/index.js";
import { recordAuditLog } from "./audit.service.js";
import { logger } from "../lib/logger.js";

function mapAttachment(att: any, downloadUrl?: string): AttachmentResponse {
  return {
    id: att.id,
    organizationId: att.organizationId,
    uploaderId: att.uploaderId,
    uploader: att.uploader
      ? {
          id: att.uploader.id,
          displayName: att.uploader.displayName,
          email: att.uploader.email,
        }
      : undefined,
    projectId: att.projectId,
    taskId: att.taskId,
    fileName: att.fileName,
    storageKey: att.storageKey,
    mimeType: att.mimeType,
    fileSize: att.fileSize,
    status: att.status,
    downloadUrl,
    createdAt: att.createdAt.toISOString
      ? att.createdAt.toISOString()
      : att.createdAt,
    updatedAt: att.updatedAt.toISOString
      ? att.updatedAt.toISOString()
      : att.updatedAt,
  };
}

export class AttachmentService {
  private readonly storage: StorageAdapter;

  constructor(storageAdapter?: StorageAdapter) {
    this.storage = storageAdapter || getStorageAdapter();
  }

  /**
   * Verifies that the task or project (if specified) belongs to the organization.
   */
  private async verifyResourceScope(
    organizationId: string,
    projectId?: string,
    taskId?: string,
  ): Promise<{ verifiedProjectId?: string; verifiedTaskId?: string }> {
    let verifiedProjectId = projectId;
    let verifiedTaskId = taskId;

    if (taskId) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, organizationId: true, projectId: true },
      });

      if (!task || task.organizationId !== organizationId) {
        throw new AppError(
          "Associated task not found in this organization",
          404,
          ErrorCode.NOT_FOUND,
        );
      }

      verifiedTaskId = task.id;
      verifiedProjectId = task.projectId;
    } else if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, organizationId: true },
      });

      if (!project || project.organizationId !== organizationId) {
        throw new AppError(
          "Associated project not found in this organization",
          404,
          ErrorCode.NOT_FOUND,
        );
      }
      verifiedProjectId = project.id;
    }

    return { verifiedProjectId, verifiedTaskId };
  }

  /**
   * Direct server-mediated upload with content validation & signature verification.
   */
  public async uploadDirect(params: {
    organizationId: string;
    uploaderId: string;
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    projectId?: string;
    taskId?: string;
    requestId?: string;
  }): Promise<AttachmentResponse> {
    const {
      organizationId,
      uploaderId,
      fileBuffer,
      fileName,
      mimeType,
      projectId,
      taskId,
      requestId,
    } = params;

    // 1. Verify resource scope
    const { verifiedProjectId, verifiedTaskId } =
      await this.verifyResourceScope(organizationId, projectId, taskId);

    // 2. Validate metadata and enforce allowlist
    const { cleanFileName, verifiedMimeType } = validateFileMetadata(
      fileName,
      mimeType,
      fileBuffer.length,
      env.STORAGE_MAX_FILE_SIZE_BYTES,
    );

    // 3. Verify content signature (magic numbers)
    validateFileContentSignature(fileBuffer, verifiedMimeType);

    // 4. Generate random, unguessable storage key
    const storageKey = generateStorageKey(organizationId, cleanFileName);

    // 5. Save to storage adapter
    await this.storage.putObject({
      key: storageKey,
      buffer: fileBuffer,
      contentType: verifiedMimeType,
      metadata: {
        organizationId,
        uploaderId,
        fileName: cleanFileName,
      },
    });

    // 6. Record attachment in database
    const attachment = await prisma.attachment.create({
      data: {
        organizationId,
        uploaderId,
        projectId: verifiedProjectId,
        taskId: verifiedTaskId,
        fileName: cleanFileName,
        storageKey,
        mimeType: verifiedMimeType,
        fileSize: fileBuffer.length,
        status: "READY",
      },
      include: {
        uploader: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });

    // 7. Audit log
    await recordAuditLog({
      organizationId,
      actorId: uploaderId,
      action: "ATTACHMENT_UPLOADED",
      targetType: "Attachment",
      targetId: attachment.id,
      requestId,
      metadata: {
        fileName: cleanFileName,
        fileSize: fileBuffer.length,
        mimeType: verifiedMimeType,
        taskId: verifiedTaskId,
        projectId: verifiedProjectId,
      },
    });

    logger.info("File attachment uploaded successfully", {
      attachmentId: attachment.id,
      organizationId,
      uploaderId,
      fileName: cleanFileName,
      fileSize: fileBuffer.length,
    });

    return mapAttachment(attachment);
  }

  /**
   * Initiates a presigned upload session for S3-compatible providers.
   */
  public async initiatePresignedUpload(params: {
    organizationId: string;
    uploaderId: string;
    input: PresignUploadInput;
  }): Promise<PresignUploadResponse> {
    const { organizationId, uploaderId, input } = params;

    // 1. Verify resource scope
    const { verifiedProjectId, verifiedTaskId } =
      await this.verifyResourceScope(
        organizationId,
        input.projectId,
        input.taskId,
      );

    // 2. Validate metadata
    const { cleanFileName, verifiedMimeType } = validateFileMetadata(
      input.fileName,
      input.mimeType,
      input.fileSize,
      env.STORAGE_MAX_FILE_SIZE_BYTES,
    );

    // 3. Generate storage key
    const storageKey = generateStorageKey(organizationId, cleanFileName);

    // 4. Create PENDING attachment record
    const attachment = await prisma.attachment.create({
      data: {
        organizationId,
        uploaderId,
        projectId: verifiedProjectId,
        taskId: verifiedTaskId,
        fileName: cleanFileName,
        storageKey,
        mimeType: verifiedMimeType,
        fileSize: input.fileSize,
        status: "PENDING",
      },
      include: {
        uploader: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });

    // 5. Generate signed upload URL if supported, else fallback to direct API route
    let uploadUrl: string;
    const expiresInSeconds = env.STORAGE_SIGNED_URL_EXPIRES_SECONDS;

    if (this.storage.getSignedUploadUrl) {
      const presigned = await this.storage.getSignedUploadUrl(
        storageKey,
        verifiedMimeType,
        expiresInSeconds,
      );
      uploadUrl = presigned.uploadUrl;
    } else {
      uploadUrl = `/api/v1/organizations/${organizationId}/attachments/upload`;
    }

    return {
      attachment: mapAttachment(attachment),
      uploadUrl,
      storageKey,
      expiresInSeconds,
    };
  }

  /**
   * Confirms a presigned upload once the client has uploaded the object.
   */
  public async confirmPresignedUpload(params: {
    organizationId: string;
    attachmentId: string;
    uploaderId: string;
    requestId?: string;
  }): Promise<AttachmentResponse> {
    const { organizationId, attachmentId, uploaderId, requestId } = params;

    const attachment = await prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        organizationId,
      },
      include: {
        uploader: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });

    if (!attachment) {
      throw new AppError("Attachment not found", 404, ErrorCode.NOT_FOUND);
    }

    if (attachment.status === "READY") {
      return mapAttachment(attachment);
    }

    // Verify object exists in storage
    const metadata = await this.storage.getObjectMetadata(
      attachment.storageKey,
    );
    if (!metadata || metadata.size <= 0) {
      await prisma.attachment.update({
        where: { id: attachment.id },
        data: { status: "FAILED" },
      });
      throw new AppError(
        "Uploaded file object not found in storage or is empty",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    // Mark READY and update actual size
    const updated = await prisma.attachment.update({
      where: { id: attachment.id },
      data: {
        status: "READY",
        fileSize: metadata.size,
      },
      include: {
        uploader: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: uploaderId,
      action: "ATTACHMENT_UPLOADED",
      targetType: "Attachment",
      targetId: updated.id,
      requestId,
      metadata: {
        fileName: updated.fileName,
        fileSize: updated.fileSize,
        mimeType: updated.mimeType,
      },
    });

    return mapAttachment(updated);
  }

  /**
   * Lists attachments for an authorized organization, project, or task.
   */
  public async listAttachments(params: {
    organizationId: string;
    taskId?: string;
    projectId?: string;
    status?: "PENDING" | "READY" | "FAILED";
  }): Promise<AttachmentResponse[]> {
    const { organizationId, taskId, projectId, status } = params;

    const where: any = { organizationId };

    if (taskId) where.taskId = taskId;
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    else where.status = "READY"; // default to ready attachments

    const attachments = await prisma.attachment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        uploader: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });

    return attachments.map((att) => mapAttachment(att));
  }

  /**
   * Authorizes and generates a short-lived download URL or retrieves file buffer.
   */
  public async getAttachmentDownload(params: {
    organizationId: string;
    attachmentId: string;
  }): Promise<{
    attachment: AttachmentResponse;
    downloadUrl: string;
    streamBuffer?: Buffer;
  }> {
    const { organizationId, attachmentId } = params;

    const attachment = await prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        organizationId,
      },
      include: {
        uploader: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });

    if (!attachment) {
      throw new AppError("Attachment not found", 404, ErrorCode.NOT_FOUND);
    }

    if (attachment.status !== "READY") {
      throw new AppError(
        "Attachment is not ready for download",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    const downloadUrl = await this.storage.getSignedDownloadUrl(
      attachment.storageKey,
      attachment.fileName,
      env.STORAGE_SIGNED_URL_EXPIRES_SECONDS,
    );

    return {
      attachment: mapAttachment(attachment, downloadUrl),
      downloadUrl,
    };
  }

  /**
   * Retrieves raw file buffer from storage for streaming endpoints.
   */
  public async getAttachmentFileBuffer(params: {
    organizationId: string;
    attachmentId: string;
  }): Promise<{
    buffer: Buffer;
    contentType: string;
    fileName: string;
    size: number;
  }> {
    const { organizationId, attachmentId } = params;

    const attachment = await prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        organizationId,
      },
    });

    if (!attachment) {
      throw new AppError("Attachment not found", 404, ErrorCode.NOT_FOUND);
    }

    const { buffer, contentType, size } = await this.storage.getObject(
      attachment.storageKey,
    );

    return {
      buffer,
      contentType: attachment.mimeType || contentType,
      fileName: attachment.fileName,
      size: attachment.fileSize || size,
    };
  }

  /**
   * Deletes an attachment record and removes the object from storage.
   */
  public async deleteAttachment(params: {
    organizationId: string;
    attachmentId: string;
    actorId: string;
    actorRole: string;
    requestId?: string;
  }): Promise<void> {
    const { organizationId, attachmentId, actorId, actorRole, requestId } =
      params;

    const attachment = await prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        organizationId,
      },
    });

    if (!attachment) {
      throw new AppError("Attachment not found", 404, ErrorCode.NOT_FOUND);
    }

    // Role check: Only uploader or OWNER/ADMIN can delete
    if (
      attachment.uploaderId !== actorId &&
      actorRole !== "OWNER" &&
      actorRole !== "ADMIN"
    ) {
      throw new AppError(
        "You do not have permission to delete this attachment",
        403,
        ErrorCode.FORBIDDEN,
      );
    }

    // 1. Delete object from storage
    try {
      await this.storage.deleteObject(attachment.storageKey);
    } catch (err) {
      logger.warn("Storage deletion warning", {
        storageKey: attachment.storageKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 2. Delete database record
    await prisma.attachment.delete({
      where: { id: attachment.id },
    });

    // 3. Audit log
    await recordAuditLog({
      organizationId,
      actorId,
      action: "ATTACHMENT_DELETED",
      targetType: "Attachment",
      targetId: attachment.id,
      requestId,
      metadata: {
        fileName: attachment.fileName,
        storageKey: attachment.storageKey,
      },
    });

    logger.info("File attachment deleted", {
      attachmentId: attachment.id,
      organizationId,
      actorId,
    });
  }
}

export const attachmentService = new AttachmentService();

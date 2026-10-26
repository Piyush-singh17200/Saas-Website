import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer from "multer";
import {
  createSuccessResponse,
  ErrorCode,
  PresignUploadInputSchema,
  ConfirmUploadInputSchema,
  AttachmentListQuerySchema,
} from "@workspace/contracts";
import { attachmentService } from "../services/attachment.service.js";
import { requireActiveMembership } from "../middleware/organization.middleware.js";
import { AppError } from "../middleware/error-handler.js";
import { env } from "../config/env.js";

export const attachmentRouter: Router = Router({ mergeParams: true });

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

// Multer memory storage configuration with strict size limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.STORAGE_MAX_FILE_SIZE_BYTES,
    files: 1,
  },
});

/**
 * Direct file upload endpoint (multipart/form-data)
 * POST /api/v1/organizations/:organizationId/attachments/upload
 */
attachmentRouter.post(
  "/upload",
  requireActiveMembership,
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new AppError(
          "No file uploaded. Please select a valid file.",
          400,
          ErrorCode.BAD_REQUEST,
        );
      }

      const organizationId = getParam(req.params.organizationId);
      const user = (req as any).user;
      if (!user) {
        throw new AppError(
          "Authentication required",
          401,
          ErrorCode.UNAUTHORIZED,
        );
      }

      const taskId = req.body.taskId ? String(req.body.taskId) : undefined;
      const projectId = req.body.projectId
        ? String(req.body.projectId)
        : undefined;

      const attachment = await attachmentService.uploadDirect({
        organizationId,
        uploaderId: user.id,
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        taskId,
        projectId,
        requestId: (req as any).id,
      });

      res.status(201).json(createSuccessResponse(attachment, (req as any).id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Initiates presigned upload session
 * POST /api/v1/organizations/:organizationId/attachments/presign
 */
attachmentRouter.post(
  "/presign",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = PresignUploadInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid upload parameters",
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const organizationId = getParam(req.params.organizationId);
      const user = (req as any).user;
      if (!user) {
        throw new AppError(
          "Authentication required",
          401,
          ErrorCode.UNAUTHORIZED,
        );
      }

      const result = await attachmentService.initiatePresignedUpload({
        organizationId,
        uploaderId: user.id,
        input: parsed.data,
      });

      res.status(201).json(createSuccessResponse(result, (req as any).id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Confirms a presigned upload
 * POST /api/v1/organizations/:organizationId/attachments/:attachmentId/confirm
 */
attachmentRouter.post(
  "/:attachmentId/confirm",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      ConfirmUploadInputSchema.safeParse(req.body);
      const organizationId = getParam(req.params.organizationId);
      const attachmentId = getParam(req.params.attachmentId);
      const user = (req as any).user;
      if (!user) {
        throw new AppError(
          "Authentication required",
          401,
          ErrorCode.UNAUTHORIZED,
        );
      }

      const attachment = await attachmentService.confirmPresignedUpload({
        organizationId,
        attachmentId,
        uploaderId: user.id,
        requestId: (req as any).id,
      });

      res
        .status(200)
        .json(createSuccessResponse({ attachment }, (req as any).id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Lists attachments
 * GET /api/v1/organizations/:organizationId/attachments
 */
attachmentRouter.get(
  "/",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = AttachmentListQuerySchema.safeParse(req.query);
      const organizationId = getParam(req.params.organizationId);

      const taskId = req.query.taskId ? String(req.query.taskId) : undefined;
      const projectId = req.query.projectId
        ? String(req.query.projectId)
        : undefined;
      const status = parsed.success ? parsed.data.status : undefined;

      const attachments = await attachmentService.listAttachments({
        organizationId,
        taskId,
        projectId,
        status,
      });

      res
        .status(200)
        .json(createSuccessResponse({ attachments }, (req as any).id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Retrieves a download URL
 * GET /api/v1/organizations/:organizationId/attachments/:attachmentId/download
 */
attachmentRouter.get(
  "/:attachmentId/download",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const attachmentId = getParam(req.params.attachmentId);

      const { attachment, downloadUrl } =
        await attachmentService.getAttachmentDownload({
          organizationId,
          attachmentId,
        });

      if (req.query.redirect === "true") {
        res.redirect(downloadUrl);
        return;
      }

      res
        .status(200)
        .json(
          createSuccessResponse({ attachment, downloadUrl }, (req as any).id),
        );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Streams file content securely with safe download headers
 * GET /api/v1/organizations/:organizationId/attachments/:attachmentId/file
 */
attachmentRouter.get(
  "/:attachmentId/file",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const attachmentId = getParam(req.params.attachmentId);

      const { buffer, contentType, fileName, size } =
        await attachmentService.getAttachmentFileBuffer({
          organizationId,
          attachmentId,
        });

      const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", size.toString());
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFileName}"`,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'");

      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Deletes an attachment
 * DELETE /api/v1/organizations/:organizationId/attachments/:attachmentId
 */
attachmentRouter.delete(
  "/:attachmentId",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const attachmentId = getParam(req.params.attachmentId);
      const user = (req as any).user;
      const membership = (req as any).membership;

      if (!user) {
        throw new AppError(
          "Authentication required",
          401,
          ErrorCode.UNAUTHORIZED,
        );
      }

      await attachmentService.deleteAttachment({
        organizationId,
        attachmentId,
        actorId: user.id,
        actorRole: membership?.role || "MEMBER",
        requestId: (req as any).id,
      });

      res
        .status(200)
        .json(
          createSuccessResponse(
            { message: "Attachment deleted successfully" },
            (req as any).id,
          ),
        );
    } catch (err) {
      next(err);
    }
  },
);

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  StorageAdapter,
  StorageObjectMetadata,
  PutObjectOptions,
  PresignedUploadResult,
} from "./types.js";
import { AppError } from "../../middleware/error-handler.js";
import { ErrorCode } from "@workspace/contracts";

export interface S3AdapterOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

export class S3StorageAdapter implements StorageAdapter {
  public readonly providerName = "s3" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3AdapterOptions) {
    this.bucket = options.bucket;

    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: options.region,
      forcePathStyle: options.forcePathStyle ?? true,
    };

    if (options.endpoint) {
      clientConfig.endpoint = options.endpoint;
    }

    if (options.accessKeyId && options.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      };
    }

    this.client = new S3Client(clientConfig);
  }

  public async putObject(options: PutObjectOptions): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: options.key,
        Body: options.buffer,
        ContentType: options.contentType,
        Metadata: options.metadata,
      });

      await this.client.send(command);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to put object in S3";
      throw new AppError(
        `Storage provider error: ${message}`,
        500,
        ErrorCode.INTERNAL_ERROR,
      );
    }
  }

  public async getObject(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string; size: number }> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);
      if (!response.Body) {
        throw new AppError(
          "Empty response body from S3",
          404,
          ErrorCode.NOT_FOUND,
        );
      }

      const byteArray = await response.Body.transformToByteArray();
      const buffer = Buffer.from(byteArray);

      return {
        buffer,
        contentType: response.ContentType || "application/octet-stream",
        size: response.ContentLength ?? buffer.length,
      };
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "NoSuchKey") {
        throw new AppError(
          "Storage object not found",
          404,
          ErrorCode.NOT_FOUND,
        );
      }
      const message =
        err instanceof Error ? err.message : "Failed to get object from S3";
      throw new AppError(
        `Storage provider error: ${message}`,
        500,
        ErrorCode.INTERNAL_ERROR,
      );
    }
  }

  public async getObjectMetadata(
    key: string,
  ): Promise<StorageObjectMetadata | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      return {
        key,
        size: response.ContentLength || 0,
        contentType: response.ContentType || "application/octet-stream",
        lastModified: response.LastModified,
        etag: response.ETag,
      };
    } catch (err: unknown) {
      if (
        (err as { name?: string; $metadata?: { httpStatusCode?: number } })
          .name === "NotFound" ||
        (err as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      ) {
        return null;
      }
      return null;
    }
  }

  public async deleteObject(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
    } catch (err: unknown) {
      // S3 delete is idempotent; log warning but don't crash
      console.warn(`[STORAGE] Failed to delete S3 object ${key}:`, err);
    }
  }

  public async getSignedDownloadUrl(
    key: string,
    originalFileName?: string,
    expiresInSeconds: number = 900,
  ): Promise<string> {
    try {
      const safeName = originalFileName
        ? originalFileName.replace(/[^a-zA-Z0-9._-]/g, "_")
        : "download";
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${safeName}"`,
      });

      return await getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to generate signed download URL";
      throw new AppError(
        `Storage provider error: ${message}`,
        500,
        ErrorCode.INTERNAL_ERROR,
      );
    }
  }

  public async getSignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number = 900,
  ): Promise<PresignedUploadResult> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
      });

      return {
        uploadUrl,
        key,
        expiresInSeconds,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to generate signed upload URL";
      throw new AppError(
        `Storage provider error: ${message}`,
        500,
        ErrorCode.INTERNAL_ERROR,
      );
    }
  }
}

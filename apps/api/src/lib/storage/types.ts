export interface StorageObjectMetadata {
  key: string;
  size: number;
  contentType: string;
  lastModified?: Date;
  etag?: string;
}

export interface PutObjectOptions {
  key: string;
  buffer: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  key: string;
  fields?: Record<string, string>;
  expiresInSeconds: number;
}

export interface StorageAdapter {
  readonly providerName: "local" | "s3";
  putObject(options: PutObjectOptions): Promise<void>;
  getObject(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string; size: number }>;
  getObjectMetadata(key: string): Promise<StorageObjectMetadata | null>;
  deleteObject(key: string): Promise<void>;
  getSignedDownloadUrl(
    key: string,
    originalFileName?: string,
    expiresInSeconds?: number,
  ): Promise<string>;
  getSignedUploadUrl?(
    key: string,
    contentType: string,
    expiresInSeconds?: number,
  ): Promise<PresignedUploadResult>;
}

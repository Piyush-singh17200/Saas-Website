import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import type {
  StorageAdapter,
  StorageObjectMetadata,
  PutObjectOptions,
} from "./types.js";
import { AppError } from "../../middleware/error-handler.js";
import { ErrorCode } from "@workspace/contracts";

export class LocalStorageAdapter implements StorageAdapter {
  public readonly providerName = "local" as const;
  private readonly baseDir: string;

  constructor(baseDir: string = "./uploads") {
    this.baseDir = path.resolve(baseDir);
  }

  private resolveSafePath(key: string): string {
    if (!key || key.includes("..")) {
      throw new AppError(
        "Invalid storage path: directory traversal attempt detected",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }
    const fullPath = path.resolve(this.baseDir, key);

    // Enforce path traversal protection: fullPath MUST be strictly inside baseDir
    if (!fullPath.startsWith(this.baseDir)) {
      throw new AppError(
        "Invalid storage path: directory traversal attempt detected",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }
    return fullPath;
  }

  public async putObject(options: PutObjectOptions): Promise<void> {
    const fullPath = this.resolveSafePath(options.key);
    const parentDir = path.dirname(fullPath);

    await fs.mkdir(parentDir, { recursive: true });
    await fs.writeFile(fullPath, options.buffer);

    // Save metadata sidecar if needed
    const metaPath = `${fullPath}.meta.json`;
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        contentType: options.contentType,
        size: options.buffer.length,
        metadata: options.metadata || {},
        updatedAt: new Date().toISOString(),
      }),
      "utf-8",
    );
  }

  public async getObject(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string; size: number }> {
    const fullPath = this.resolveSafePath(key);
    if (!existsSync(fullPath)) {
      throw new AppError("Storage object not found", 404, ErrorCode.NOT_FOUND);
    }

    const buffer = await fs.readFile(fullPath);
    let contentType = "application/octet-stream";

    const metaPath = `${fullPath}.meta.json`;
    if (existsSync(metaPath)) {
      try {
        const raw = await fs.readFile(metaPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.contentType) contentType = parsed.contentType;
      } catch {
        // Fallback
      }
    }

    return { buffer, contentType, size: buffer.length };
  }

  public async getObjectMetadata(
    key: string,
  ): Promise<StorageObjectMetadata | null> {
    const fullPath = this.resolveSafePath(key);
    if (!existsSync(fullPath)) {
      return null;
    }

    const stat = await fs.stat(fullPath);
    let contentType = "application/octet-stream";

    const metaPath = `${fullPath}.meta.json`;
    if (existsSync(metaPath)) {
      try {
        const raw = await fs.readFile(metaPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.contentType) contentType = parsed.contentType;
      } catch {
        // Fallback
      }
    }

    return {
      key,
      size: stat.size,
      contentType,
      lastModified: stat.mtime,
    };
  }

  public async deleteObject(key: string): Promise<void> {
    const fullPath = this.resolveSafePath(key);
    try {
      if (existsSync(fullPath)) {
        await fs.unlink(fullPath);
      }
      const metaPath = `${fullPath}.meta.json`;
      if (existsSync(metaPath)) {
        await fs.unlink(metaPath);
      }
    } catch {
      // Idempotent delete
    }
  }

  public async getSignedDownloadUrl(
    key: string,
    _originalFileName?: string,
    _expiresInSeconds?: number,
  ): Promise<string> {
    // For local storage, download is served through the authenticated API route
    return `/api/v1/attachments/file?key=${encodeURIComponent(key)}`;
  }
}

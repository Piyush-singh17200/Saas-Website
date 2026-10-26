import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "../../middleware/error-handler.js";
import { ErrorCode } from "@workspace/contracts";

export interface AllowedFileType {
  mimeType: string;
  extensions: string[];
  signatureCheck?: (buffer: Buffer) => boolean;
}

export const ALLOWED_FILE_TYPES: Record<string, AllowedFileType> = {
  "image/png": {
    mimeType: "image/png",
    extensions: [".png"],
    signatureCheck: (buf: Buffer) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  "image/jpeg": {
    mimeType: "image/jpeg",
    extensions: [".jpg", ".jpeg"],
    signatureCheck: (buf: Buffer) =>
      buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  "image/gif": {
    mimeType: "image/gif",
    extensions: [".gif"],
    signatureCheck: (buf: Buffer) =>
      buf.length >= 6 && buf.toString("ascii", 0, 6).startsWith("GIF8"),
  },
  "image/webp": {
    mimeType: "image/webp",
    extensions: [".webp"],
    signatureCheck: (buf: Buffer) =>
      buf.length >= 12 &&
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP",
  },
  "application/pdf": {
    mimeType: "application/pdf",
    extensions: [".pdf"],
    signatureCheck: (buf: Buffer) =>
      buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-",
  },
  "application/zip": {
    mimeType: "application/zip",
    extensions: [".zip"],
    signatureCheck: (buf: Buffer) =>
      buf.length >= 4 &&
      buf[0] === 0x50 &&
      buf[1] === 0x4b &&
      (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07) &&
      (buf[3] === 0x04 || buf[3] === 0x06 || buf[3] === 0x08),
  },
  "text/plain": {
    mimeType: "text/plain",
    extensions: [".txt", ".log"],
    signatureCheck: (buf: Buffer) => isTextBuffer(buf),
  },
  "text/csv": {
    mimeType: "text/csv",
    extensions: [".csv"],
    signatureCheck: (buf: Buffer) => isTextBuffer(buf),
  },
  "application/json": {
    mimeType: "application/json",
    extensions: [".json"],
    signatureCheck: (buf: Buffer) => isTextBuffer(buf),
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: [".docx"],
    signatureCheck: (buf: Buffer) =>
      buf.length >= 4 &&
      buf[0] === 0x50 &&
      buf[1] === 0x4b &&
      buf[2] === 0x03 &&
      buf[3] === 0x04,
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extensions: [".xlsx"],
    signatureCheck: (buf: Buffer) =>
      buf.length >= 4 &&
      buf[0] === 0x50 &&
      buf[1] === 0x4b &&
      buf[2] === 0x03 &&
      buf[3] === 0x04,
  },
};

function isTextBuffer(buf: Buffer): boolean {
  // Check first 512 bytes for null byte (\0) which indicates binary content
  const checkLen = Math.min(buf.length, 512);
  for (let i = 0; i < checkLen; i++) {
    if (buf[i] === 0x00) return false;
  }
  return true;
}

/**
 * Sanitizes a filename:
 * - Strips directory traversal (/ and \)
 * - Replaces unsafe characters
 * - Limits length to 200 characters
 * - Ensures a clean fallback filename if empty
 */
export function sanitizeFileName(rawFileName: string): string {
  if (!rawFileName || typeof rawFileName !== "string") {
    return "unnamed-file";
  }

  // Extract base filename without directories
  const base = path.basename(rawFileName).trim();

  // Replace dangerous/invalid characters with underscore
  let sanitized = base.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Prevent multiple consecutive dots and leading dots
  sanitized = sanitized.replace(/^\.+/, "");
  sanitized = sanitized.replace(/\.{2,}/g, ".");

  if (!sanitized || sanitized.length === 0) {
    sanitized = `file-${Date.now()}`;
  }

  if (sanitized.length > 200) {
    const ext = path.extname(sanitized);
    const nameWithoutExt = path.basename(sanitized, ext);
    sanitized = `${nameWithoutExt.substring(0, 190)}${ext}`;
  }

  return sanitized;
}

/**
 * Validates file metadata and enforces allowlist restrictions.
 */
export function validateFileMetadata(
  fileName: string,
  claimedMimeType: string,
  fileSize: number,
  maxSizeBytes: number,
): { cleanFileName: string; verifiedMimeType: string } {
  const cleanFileName = sanitizeFileName(fileName);
  const ext = path.extname(cleanFileName).toLowerCase();

  if (fileSize > maxSizeBytes) {
    const maxMb = Math.round(maxSizeBytes / (1024 * 1024));
    throw new AppError(
      `File size (${Math.round(fileSize / 1024)} KB) exceeds maximum allowed size of ${maxMb} MB`,
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  if (fileSize <= 0) {
    throw new AppError("File cannot be empty", 400, ErrorCode.BAD_REQUEST);
  }

  // Match claimed MIME type against allowlist
  const normalizedMime = claimedMimeType.toLowerCase().trim();
  const allowed = ALLOWED_FILE_TYPES[normalizedMime];

  if (!allowed) {
    throw new AppError(
      `File type '${claimedMimeType}' is not supported. Allowed formats include PNG, JPEG, GIF, WebP, PDF, TXT, CSV, JSON, DOCX, XLSX, and ZIP.`,
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  // Verify extension matches allowed extensions for this MIME type
  if (allowed.extensions.length > 0 && !allowed.extensions.includes(ext)) {
    throw new AppError(
      `File extension '${ext}' does not match the content type '${claimedMimeType}'`,
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  return { cleanFileName, verifiedMimeType: allowed.mimeType };
}

/**
 * Validates the file buffer signatures (magic numbers) to protect against disguised malicious files.
 */
export function validateFileContentSignature(
  buffer: Buffer,
  expectedMimeType: string,
): void {
  const allowed = ALLOWED_FILE_TYPES[expectedMimeType.toLowerCase().trim()];
  if (!allowed) {
    throw new AppError(
      `Unsupported file type: ${expectedMimeType}`,
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  if (allowed.signatureCheck) {
    const isValid = allowed.signatureCheck(buffer);
    if (!isValid) {
      throw new AppError(
        `File signature verification failed: the file content does not match the expected format '${expectedMimeType}'`,
        400,
        ErrorCode.BAD_REQUEST,
      );
    }
  }
}

/**
 * Generates an unpredictable, tenant-isolated storage key.
 * Format: orgs/<orgId>/<uuid>-<sanitizedFileName>
 */
export function generateStorageKey(
  organizationId: string,
  cleanFileName: string,
): string {
  const randomPrefix = randomUUID();
  const safeName = cleanFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `orgs/${organizationId}/${randomPrefix}-${safeName}`;
}

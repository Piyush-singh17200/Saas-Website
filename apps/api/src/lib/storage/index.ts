import { env } from "../../config/env.js";
import type { StorageAdapter } from "./types.js";
import { LocalStorageAdapter } from "./local-adapter.js";
import { S3StorageAdapter } from "./s3-adapter.js";

export * from "./types.js";
export * from "./file-validation.js";
export * from "./local-adapter.js";
export * from "./s3-adapter.js";

let instance: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (instance) return instance;

  if (env.STORAGE_PROVIDER === "s3") {
    instance = new S3StorageAdapter({
      bucket: env.STORAGE_S3_BUCKET,
      region: env.STORAGE_S3_REGION,
      endpoint: env.STORAGE_S3_ENDPOINT,
      accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE,
    });
  } else {
    instance = new LocalStorageAdapter(env.STORAGE_LOCAL_DIR);
  }

  return instance;
}

export function resetStorageAdapter(): void {
  instance = null;
}

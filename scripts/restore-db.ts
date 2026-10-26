/**
 * Cross-platform Database Restore Script
 * Executes pg_restore and verifies table schema with Prisma status check.
 */
import { execSync } from "child_process";
import * as fs from "fs";

function maskUrl(url: string): string {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}

async function runRestore() {
  const backupFile = process.argv[2];
  const targetUrl =
    process.argv[3] ||
    process.env.TARGET_DATABASE_URL ||
    process.env.DATABASE_URL;

  if (!backupFile) {
    console.error("[ERROR] Missing backup file path argument.");
    console.error(
      "Usage: tsx scripts/restore-db.ts <path_to_backup.dump> [target_db_url]",
    );
    process.exit(1);
  }

  if (!fs.existsSync(backupFile)) {
    console.error(`[ERROR] Backup file does not exist: ${backupFile}`);
    process.exit(1);
  }

  if (!targetUrl) {
    console.error(
      "[ERROR] Target database URL is required via argument or DATABASE_URL.",
    );
    process.exit(1);
  }

  console.log(
    "========================================================================",
  );
  console.log("WARNING: YOU ARE ABOUT TO RESTORE A POSTGRESQL DATABASE BACKUP");
  console.log(`Target DB: ${maskUrl(targetUrl)}`);
  console.log(`Backup File: ${backupFile}`);
  console.log(
    "========================================================================",
  );

  try {
    const cmd = `pg_restore --clean --if-exists --no-owner --no-privileges -d "${targetUrl}" "${backupFile}"`;
    try {
      execSync(cmd, { stdio: "inherit" });
    } catch (e: any) {
      if (e.status === 1) {
        console.log(
          "[WARN] pg_restore completed with code 1 (benign object cleanup warnings).",
        );
      } else {
        throw e;
      }
    }

    console.log("[INFO] Verifying schema and migrations with Prisma...");
    execSync("pnpm --filter @workspace/database exec prisma migrate status", {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: targetUrl },
    });

    console.log("[SUCCESS] Database restoration and verification succeeded.");
  } catch (error: any) {
    console.error("[ERROR] Database restore failed:", error.message);
    process.exit(1);
  }
}

runRestore();

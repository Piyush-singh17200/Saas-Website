/**
 * Cross-platform Database Backup Script
 * Executes pg_dump and verifies output file integrity.
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

function maskUrl(url: string): string {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}

async function runBackup() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[ERROR] DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  const backupDir = process.argv[2] || path.join(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `workspace_db_${timestamp}.dump`;
  const targetPath = path.join(backupDir, filename);

  console.log(`[INFO] Starting database backup...`);
  console.log(`[INFO] Target: ${maskUrl(dbUrl)}`);
  console.log(`[INFO] Output: ${targetPath}`);

  try {
    const cmd = `pg_dump -Fc --no-owner --no-privileges -d "${dbUrl}" -f "${targetPath}"`;
    execSync(cmd, { stdio: "inherit" });

    if (fs.existsSync(targetPath)) {
      const stats = fs.statSync(targetPath);
      if (stats.size > 0) {
        console.log(
          `[SUCCESS] Backup completed successfully (${(stats.size / 1024 / 1024).toFixed(2)} MB).`,
        );
      } else {
        console.error("[ERROR] Backup file was created but is empty.");
        process.exit(1);
      }
    } else {
      console.error("[ERROR] Backup file was not created.");
      process.exit(1);
    }
  } catch (error: any) {
    console.error("[ERROR] Database backup failed:", error.message);
    process.exit(1);
  }
}

runBackup();

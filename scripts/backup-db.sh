#!/usr/bin/env bash
# ==============================================================================
# WorkSpace SaaS - Production PostgreSQL Backup Script
# ==============================================================================
# Usage:
#   ./scripts/backup-db.sh [output_directory]
#
# Requirements:
#   - DATABASE_URL environment variable OR standard PG* variables
#   - pg_dump CLI installed
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="workspace_db_${TIMESTAMP}.dump"
TARGET_FILE="${BACKUP_DIR}/${BACKUP_FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "[INFO] Starting database backup at $(date -u +"%Y-%m-%dT%H:%M:%SZ")..."

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -z "${PGDATABASE:-}" ]; then
    echo "[ERROR] Neither DATABASE_URL nor PGDATABASE is set. Aborting." >&2
    exit 1
  fi
  echo "[INFO] Using individual PG environment variables for connection."
  pg_dump -Fc --no-owner --no-privileges -f "${TARGET_FILE}"
else
  echo "[INFO] Using DATABASE_URL connection string."
  # Redact password when logging
  SAFE_URL=$(echo "${DATABASE_URL}" | sed -E 's/:\/\/([^:]+):([^@]+)@/:\/\/\1:***@/')
  echo "[INFO] Target database: ${SAFE_URL}"
  pg_dump -Fc --no-owner --no-privileges -d "${DATABASE_URL}" -f "${TARGET_FILE}"
fi

if [ -f "${TARGET_FILE}" ] && [ -s "${TARGET_FILE}" ]; then
  FILE_SIZE=$(du -h "${TARGET_FILE}" | cut -f1)
  echo "[SUCCESS] Backup created successfully: ${TARGET_FILE} (${FILE_SIZE})"
  
  # Optional: Upload to S3 if BACKUP_S3_BUCKET is configured
  if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    echo "[INFO] Uploading backup to S3 bucket: s3://${BACKUP_S3_BUCKET}/backups/${BACKUP_FILENAME}"
    aws s3 cp "${TARGET_FILE}" "s3://${BACKUP_S3_BUCKET}/backups/${BACKUP_FILENAME}" --sse aws:kms
    echo "[SUCCESS] S3 upload completed."
  fi

  # Retention policy: Prune local backups older than 7 days if configured
  RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
  echo "[INFO] Pruning backups older than ${RETENTION_DAYS} days in ${BACKUP_DIR}..."
  find "${BACKUP_DIR}" -name "workspace_db_*.dump" -mtime +"${RETENTION_DAYS}" -exec rm {} +
  echo "[INFO] Pruning complete."
else
  echo "[ERROR] Backup file is empty or failed to generate!" >&2
  exit 1
fi

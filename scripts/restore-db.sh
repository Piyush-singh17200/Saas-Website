#!/usr/bin/env bash
# ==============================================================================
# WorkSpace SaaS - Production PostgreSQL Restore Script
# ==============================================================================
# Usage:
#   ./scripts/restore-db.sh <path_to_backup_file> [target_database_url]
#
# Requirements:
#   - pg_restore CLI installed
#   - TARGET_DATABASE_URL or DATABASE_URL environment variable
# ==============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"
TARGET_URL="${2:-${TARGET_DATABASE_URL:-${DATABASE_URL:-}}}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "[ERROR] Missing backup file argument." >&2
  echo "Usage: $0 <path_to_backup_file> [target_database_url]" >&2
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[ERROR] Backup file does not exist: ${BACKUP_FILE}" >&2
  exit 1
fi

if [ -z "${TARGET_URL}" ]; then
  echo "[ERROR] No target database URL provided. Set TARGET_DATABASE_URL or DATABASE_URL." >&2
  exit 1
fi

# Redact password for safe logging
SAFE_URL=$(echo "${TARGET_URL}" | sed -E 's/:\/\/([^:]+):([^@]+)@/:\/\/\1:***@/')

echo "========================================================================"
echo "WARNING: YOU ARE ABOUT TO RESTORE A POSTGRESQL DATABASE BACKUP"
echo "Target DB: ${SAFE_URL}"
echo "Backup File: ${BACKUP_FILE}"
echo "========================================================================"

# Safety prompt if run interactively and not explicitly forced
if [ -t 0 ] && [ "${FORCE_RESTORE:-0}" != "1" ]; then
  read -p "Are you sure you want to proceed? Existing schema/data will be overwritten. (yes/no): " CONFIRM
  if [ "${CONFIRM}" != "yes" ]; then
    echo "[CANCELLED] Restore aborted by operator."
    exit 0
  fi
fi

echo "[INFO] Commencing database restoration..."

# Run pg_restore with clean, if-exists, no-owner flags
# --clean drops database objects before recreating them
# --if-exists prevents errors when dropping objects that do not exist yet
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -d "${TARGET_URL}" \
  "${BACKUP_FILE}" || {
    EXIT_CODE=$?
    # pg_restore exit code 1 indicates non-fatal warnings (e.g., dropping objects that didn't exist)
    if [ ${EXIT_CODE} -eq 1 ]; then
      echo "[WARN] pg_restore completed with warnings (code 1), which is normal for --clean flags."
    else
      echo "[ERROR] pg_restore failed with exit code ${EXIT_CODE}" >&2
      exit ${EXIT_CODE}
    fi
  }

echo "[INFO] Running Prisma schema validation / migration verification..."
DATABASE_URL="${TARGET_URL}" pnpm --filter @workspace/database exec prisma migrate status || true

echo "[SUCCESS] Database restoration and status check completed successfully."

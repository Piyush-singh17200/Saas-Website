# WorkSpace SaaS — Secure File Attachments & Object Storage

This document outlines the object storage architecture, adapter integration, security boundaries, and operational procedures for attachments in WorkSpace SaaS.

---

## 1. Architecture Overview

WorkSpace decouples business logic from physical storage providers using a typed `StorageAdapter` interface.

```
┌────────────────────────────────┐
│   Attachment API / Service     │
│   (Auth, Tenant Isolation,     │
│    Metadata, Magic Validation) │
└───────────────┬────────────────┘
                │
     ┌──────────┴──────────┐
     ▼                     ▼
┌───────────────┐   ┌────────────────────────┐
│ LocalStorage  │   │   S3StorageAdapter     │
│ Adapter (FS)  │   │  (AWS S3, MinIO, R2)   │
└───────────────┘   └────────────────────────┘
```

- **Local Storage (`LocalStorageAdapter`)**: Stores files in a local directory (`STORAGE_LOCAL_DIR`, defaults to `./uploads`). Enforces path traversal checks to guarantee files cannot escape the designated root.
- **S3-Compatible Storage (`S3StorageAdapter`)**: Uses the official `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`. Supports AWS S3, MinIO, Cloudflare R2, and LocalStack via custom endpoints and path-style addressing (`STORAGE_S3_FORCE_PATH_STYLE=true`).

---

## 2. Configuration & Environment Variables

Add the following variables to `.env` (templates provided in `.env.example`):

```bash
# Storage Provider Selection ('local' or 's3')
STORAGE_PROVIDER=local

# Local Storage (when STORAGE_PROVIDER=local)
STORAGE_LOCAL_DIR=./uploads

# Upload Constraints & Presigned URLs
STORAGE_MAX_FILE_SIZE_BYTES=10485760 # 10 MB
STORAGE_SIGNED_URL_EXPIRES_SECONDS=900 # 15 minutes

# S3 Configuration (when STORAGE_PROVIDER=s3)
STORAGE_S3_BUCKET=workspace-attachments
STORAGE_S3_REGION=us-east-1
STORAGE_S3_ENDPOINT=http://localhost:9000
STORAGE_S3_ACCESS_KEY_ID=minioadmin
STORAGE_S3_SECRET_ACCESS_KEY=minioadmin
STORAGE_S3_FORCE_PATH_STYLE=true
```

---

## 3. Database Migration & RLS

Attachment metadata is tracked in the `attachments` PostgreSQL table with Row-Level Security (RLS) enabled.

### Migration Details

- Migration file: `packages/database/prisma/migrations/20261011000000_add_attachments_and_storage/migration.sql`
- Run migrations:

```bash
pnpm --filter @workspace/database db:migrate:deploy
```

### Table Schema

- `id` (UUID, primary key)
- `organization_id` (UUID, foreign key to `organizations`, indexed, RLS-enforced)
- `uploader_id` (UUID, foreign key to `users`)
- `project_id` (UUID, optional foreign key to `projects`)
- `task_id` (UUID, optional foreign key to `tasks`)
- `file_name` (String, sanitized display name)
- `storage_key` (String, server-generated unique path: `orgs/<orgId>/<uuid>-<safeName>`)
- `mime_type` (String, verified MIME type)
- `file_size` (Integer, bytes)
- `status` (`PENDING`, `READY`, `FAILED`)
- `created_at` / `updated_at` (Timestamps)

---

## 4. Security & Content Validation

### A. Filename Sanitization & Storage Key Generation

- User filenames are sanitized: directory traversal sequences (`../`, `..\`) and dangerous characters are stripped.
- Display filenames are capped at 200 characters.
- Storage keys are generated strictly on the server using `orgs/<organizationId>/<cryptoUUID>-<sanitizedName>` to prevent key collisions, arbitrary overwrites, and cross-tenant access.

### B. MIME Type & Magic Number Verification

Files are verified against an allowlist of supported formats. Server-side validation inspects the file header buffer (magic numbers) to protect against disguised executables:

- **PNG**: `89 50 4E 47 0D 0A 1A 0A`
- **JPEG**: `FF D8 FF`
- **GIF**: `GIF87a` / `GIF89a`
- **WebP**: `RIFF` ... `WEBP`
- **PDF**: `%PDF-`
- **ZIP / DOCX / XLSX**: `PK\x03\x04`
- **Plain Text / CSV / JSON**: Null-byte inspection to reject binary executables disguised as text.

### C. Safe File Serving Headers

All file streaming routes send the following security headers:

- `Content-Disposition: attachment; filename="<sanitized>"`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy: default-src 'none'`

---

## 5. API Endpoints

| Method   | Endpoint                                                | Description                                              |
| :------- | :------------------------------------------------------ | :------------------------------------------------------- |
| `POST`   | `/api/v1/organizations/:orgId/attachments/upload`       | Multipart direct upload (file, taskId, projectId)        |
| `POST`   | `/api/v1/organizations/:orgId/attachments/presign`      | Initiates presigned upload session                       |
| `POST`   | `/api/v1/organizations/:orgId/attachments/:id/confirm`  | Confirms upload and marks status `READY`                 |
| `GET`    | `/api/v1/organizations/:orgId/attachments`              | Lists attachments (supports `?taskId=` or `?projectId=`) |
| `GET`    | `/api/v1/organizations/:orgId/attachments/:id/download` | Generates short-lived download URL                       |
| `GET`    | `/api/v1/organizations/:orgId/attachments/:id/file`     | Authorized file streaming endpoint                       |
| `DELETE` | `/api/v1/organizations/:orgId/attachments/:id`          | Deletes object from storage and DB                       |

---

## 6. Background Cleanup & Stale Upload Handling

- The maintenance worker (`apps/worker/src/processors/cleanup.processor.ts`) inspects attachments in `PENDING` status.
- Any presigned upload session that remains `PENDING` for longer than 24 hours is treated as abandoned and automatically deleted.
- Storage deletion during file removal is idempotent: storage removal is attempted first, followed by database record deletion.

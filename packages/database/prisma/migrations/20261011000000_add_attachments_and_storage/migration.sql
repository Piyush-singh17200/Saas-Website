-- Migration: 20261011000000_add_attachments_and_storage
-- Description: Adds attachments table with PostgreSQL Row-Level Security

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "project_id" UUID,
    "task_id" UUID,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'READY',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");
CREATE INDEX "attachments_organization_id_task_id_idx" ON "attachments"("organization_id", "task_id");
CREATE INDEX "attachments_organization_id_project_id_idx" ON "attachments"("organization_id", "project_id");
CREATE INDEX "attachments_organization_id_created_at_idx" ON "attachments"("organization_id", "created_at");
CREATE INDEX "attachments_status_created_at_idx" ON "attachments"("status", "created_at");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (RLS) Configuration
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attachments" FORCE ROW LEVEL SECURITY;

CREATE POLICY "attachment_isolation_policy" ON "attachments"
  FOR ALL
  USING (app.is_admin_bypass() OR "organization_id" = app.current_org_id());

-- Grant privileges to unprivileged application role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'workspace_app') THEN
    GRANT ALL PRIVILEGES ON TABLE "attachments" TO workspace_app;
  END IF;
END $$;

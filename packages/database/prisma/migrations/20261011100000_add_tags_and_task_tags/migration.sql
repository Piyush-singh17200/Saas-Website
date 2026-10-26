-- Migration: 20261011100000_add_tags_and_task_tags
-- Description: Adds tags and task_tags tables with indexes and Row-Level Security

-- CreateTable tags
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable task_tags
CREATE TABLE "task_tags" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes on tags
CREATE UNIQUE INDEX "tags_organization_id_name_key" ON "tags"("organization_id", "name");
CREATE INDEX "tags_organization_id_idx" ON "tags"("organization_id");

-- CreateIndexes on task_tags
CREATE UNIQUE INDEX "task_tags_task_id_tag_id_key" ON "task_tags"("task_id", "tag_id");
CREATE INDEX "task_tags_organization_id_tag_id_idx" ON "task_tags"("organization_id", "tag_id");
CREATE INDEX "task_tags_task_id_idx" ON "task_tags"("task_id");

-- CreateIndexes on tasks for search and composite filtering
CREATE INDEX IF NOT EXISTS "tasks_project_id_due_date_idx" ON "tasks"("project_id", "due_date");
CREATE INDEX IF NOT EXISTS "tasks_project_id_priority_idx" ON "tasks"("project_id", "priority");
CREATE INDEX IF NOT EXISTS "tasks_project_id_title_idx" ON "tasks"("project_id", "title");

-- AddForeignKeys
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (RLS) Configuration
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tags" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tag_isolation_policy" ON "tags"
  FOR ALL
  USING (app.is_admin_bypass() OR "organization_id" = app.current_org_id());

ALTER TABLE "task_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_tags" FORCE ROW LEVEL SECURITY;
CREATE POLICY "task_tag_isolation_policy" ON "task_tags"
  FOR ALL
  USING (app.is_admin_bypass() OR "organization_id" = app.current_org_id());

-- Grant privileges to unprivileged application role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'workspace_app') THEN
    GRANT ALL PRIVILEGES ON TABLE "tags" TO workspace_app;
    GRANT ALL PRIVILEGES ON TABLE "task_tags" TO workspace_app;
  END IF;
END $$;

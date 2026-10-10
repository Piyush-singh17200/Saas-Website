-- Migration: 20261010300000_add_notifications_and_outbox
-- Description: Adds notifications and outbox_messages tables with PostgreSQL Row-Level Security

-- CreateTable notifications
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "metadata" JSONB,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable outbox_messages
CREATE TABLE "outbox_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "queue_name" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_idempotency_key_key" ON "notifications"("idempotency_key");
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");
CREATE INDEX "notifications_organization_id_created_at_idx" ON "notifications"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_messages_idempotency_key_key" ON "outbox_messages"("idempotency_key");
CREATE INDEX "outbox_messages_status_created_at_idx" ON "outbox_messages"("status", "created_at");
CREATE INDEX "outbox_messages_queue_name_status_idx" ON "outbox_messages"("queue_name", "status");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (RLS) Configuration
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_notifications" ON "notifications"
    FOR ALL
    TO "workspace_app"
    USING (
        organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        OR current_setting('app.admin_bypass', true) = 'true'
    )
    WITH CHECK (
        organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        OR current_setting('app.admin_bypass', true) = 'true'
    );

ALTER TABLE "outbox_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_messages" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_outbox_messages" ON "outbox_messages"
    FOR ALL
    TO "workspace_app"
    USING (
        organization_id IS NULL
        OR organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        OR current_setting('app.admin_bypass', true) = 'true'
    )
    WITH CHECK (
        organization_id IS NULL
        OR organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        OR current_setting('app.admin_bypass', true) = 'true'
    );

-- Grant privileges to application user
GRANT SELECT, INSERT, UPDATE, DELETE ON "notifications" TO "workspace_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON "outbox_messages" TO "workspace_app";

-- Migration: 20261011200000_add_api_keys_and_webhooks
-- Description: Adds API keys, webhook subscriptions, and delivery history with indexes and Row-Level Security

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable api_keys
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable webhook_subscriptions
CREATE TABLE "webhook_subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "secret" TEXT NOT NULL,
    "event_types" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable webhook_deliveries
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "status_code" INTEGER,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "duration_ms" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes on api_keys
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_organization_id_revoked_at_idx" ON "api_keys"("organization_id", "revoked_at");
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys"("key_prefix");

-- CreateIndexes on webhook_subscriptions
CREATE INDEX "webhook_subscriptions_organization_id_is_active_idx" ON "webhook_subscriptions"("organization_id", "is_active");

-- CreateIndexes on webhook_deliveries
CREATE INDEX "webhook_deliveries_subscription_id_created_at_idx" ON "webhook_deliveries"("subscription_id", "created_at");
CREATE INDEX "webhook_deliveries_organization_id_created_at_idx" ON "webhook_deliveries"("organization_id", "created_at");
CREATE INDEX "webhook_deliveries_status_created_at_idx" ON "webhook_deliveries"("status", "created_at");

-- AddForeignKeys
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (RLS) Configuration
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY "api_key_isolation_policy" ON "api_keys"
  FOR ALL
  USING (app.is_admin_bypass() OR "organization_id" = app.current_org_id());

ALTER TABLE "webhook_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "webhook_subscription_isolation_policy" ON "webhook_subscriptions"
  FOR ALL
  USING (app.is_admin_bypass() OR "organization_id" = app.current_org_id());

ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "webhook_delivery_isolation_policy" ON "webhook_deliveries"
  FOR ALL
  USING (app.is_admin_bypass() OR "organization_id" = app.current_org_id());

-- Grant privileges to unprivileged application role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'workspace_app') THEN
    GRANT ALL PRIVILEGES ON TABLE "api_keys" TO workspace_app;
    GRANT ALL PRIVILEGES ON TABLE "webhook_subscriptions" TO workspace_app;
    GRANT ALL PRIVILEGES ON TABLE "webhook_deliveries" TO workspace_app;
  END IF;
END $$;

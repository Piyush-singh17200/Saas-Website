-- Migration: 20261011300000_add_enterprise_security_mfa_audit
-- Description: Adds TOTP MFA, session tracking, enhanced audit logging, and organization security policies with RLS

-- AlterTable users
ALTER TABLE "users" ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "mfa_secret_encrypted" TEXT;
ALTER TABLE "users" ADD COLUMN "mfa_enrolled_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "mfa_last_used_code" TEXT;
ALTER TABLE "users" ADD COLUMN "mfa_last_used_at" TIMESTAMP(3);

-- AlterTable sessions
ALTER TABLE "sessions" ADD COLUMN "user_agent" TEXT;
ALTER TABLE "sessions" ADD COLUMN "ip_address" TEXT;

-- AlterTable audit_logs
ALTER TABLE "audit_logs" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE "audit_logs" ADD COLUMN "ip_address" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "user_agent" TEXT;

-- CreateTable mfa_recovery_codes
CREATE TABLE "mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable mfa_challenges
CREATE TABLE "mfa_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "challenge_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable organization_security_policies
CREATE TABLE "organization_security_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "require_mfa" BOOLEAN NOT NULL DEFAULT false,
    "session_max_age_minutes" INTEGER NOT NULL DEFAULT 43200,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_security_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes on mfa_recovery_codes
CREATE INDEX "mfa_recovery_codes_user_id_idx" ON "mfa_recovery_codes"("user_id");

-- CreateIndexes on mfa_challenges
CREATE UNIQUE INDEX "mfa_challenges_challenge_hash_key" ON "mfa_challenges"("challenge_hash");
CREATE INDEX "mfa_challenges_user_id_idx" ON "mfa_challenges"("user_id");
CREATE INDEX "mfa_challenges_expires_at_idx" ON "mfa_challenges"("expires_at");

-- CreateIndexes on organization_security_policies
CREATE UNIQUE INDEX "organization_security_policies_organization_id_key" ON "organization_security_policies"("organization_id");

-- AddForeignKeys
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_security_policies" ADD CONSTRAINT "organization_security_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (RLS) Configuration on organization_security_policies
ALTER TABLE "organization_security_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_security_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_security_policy_isolation_policy" ON "organization_security_policies"
  FOR ALL
  USING (app.is_admin_bypass() OR "organization_id" = app.current_org_id());

-- Grant privileges to unprivileged application role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'workspace_app') THEN
    GRANT ALL PRIVILEGES ON TABLE "organization_security_policies" TO workspace_app;
    GRANT ALL PRIVILEGES ON TABLE "mfa_recovery_codes" TO workspace_app;
    GRANT ALL PRIVILEGES ON TABLE "mfa_challenges" TO workspace_app;
  END IF;
END $$;

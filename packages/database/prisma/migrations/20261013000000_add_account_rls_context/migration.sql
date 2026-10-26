-- =============================================================================
-- Account-level RLS context for the unprivileged runtime role
--
-- Organization-scoped requests set app.current_organization_id and are already
-- covered by the tenant isolation policies. A small number of legitimate
-- account-level operations (listing a user's organizations, writing personal
-- security audit events that are not attached to a tenant) need a user scope.
-- These policies are strictly additive and never widen tenant data access.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_id', true), '')::uuid;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'workspace_app') THEN
    GRANT EXECUTE ON FUNCTION app.current_user_id() TO workspace_app;
  END IF;
END $$;

-- A user may read their own membership rows (used to list their organizations).
CREATE POLICY "membership_self_select_policy" ON "memberships"
  FOR SELECT
  USING ("user_id" = app.current_user_id());

-- A user may read organizations in which they hold an active membership.
-- The membership subquery is itself constrained by the policy above.
CREATE POLICY "organization_self_membership_select_policy" ON "organizations"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "memberships" m
      WHERE m."organization_id" = "organizations"."id"
        AND m."user_id" = app.current_user_id()
        AND m."status" = 'ACTIVE'
    )
  );

-- Personal (organization-less) audit events are visible to their actor and may
-- be inserted while app.current_user_id is set.
CREATE POLICY "audit_log_self_select_policy" ON "audit_logs"
  FOR SELECT
  USING ("organization_id" IS NULL AND "actor_id" = app.current_user_id());

CREATE POLICY "audit_log_self_insert_policy" ON "audit_logs"
  FOR INSERT
  WITH CHECK ("organization_id" IS NULL AND "actor_id" = app.current_user_id());

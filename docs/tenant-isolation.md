# WorkSpace Tenant Isolation & Row-Level Security (RLS)

This document describes the multi-tenant isolation architecture for **WorkSpace**, combining application-level authorization with PostgreSQL Row-Level Security (RLS) to enforce a strict defense-in-depth posture.

---

## 1. Threat Model & Security Invariants

In multi-tenant SaaS environments, application-layer authorization bugs (missing middleware, IDOR vulnerabilities, parameter tampering) represent the most frequent cause of cross-tenant data leaks.

WorkSpace mitigates this by enforcing **dual-layer isolation**:

1. **Application Layer (Fast Rejection & Context Verification)**: Express middleware resolves the caller's session, authenticates the user, verifies active membership in the requested organization, and asserts fine-grained RBAC permissions. Non-disclosing 404 responses are returned when an organization does not exist or the caller is not a member, preventing tenant ID enumeration.
2. **Database Layer (Hard Boundary via PostgreSQL RLS)**: Even if application middleware were bypassed or misconfigured, PostgreSQL itself rejects cross-tenant queries, inserts, updates, and deletes at the storage engine level.

---

## 2. PostgreSQL Row-Level Security (RLS) Architecture

### 2.1 Unprivileged Database Role

By default, the table owner and PostgreSQL superusers bypass RLS. Therefore, the application executes queries under the dedicated role `workspace_app`:

- Configured with `NOBYPASSRLS` and `NOSUPERUSER`.
- Granted explicit `SELECT`, `INSERT`, `UPDATE`, `DELETE` privileges on public tables and sequences.
- Table policies are enforced using `FORCE ROW LEVEL SECURITY` to prevent any table-level bypass.
- Provisioned by `scripts/provision-app-role.sql`. The script is idempotent and safe to run both before migrations (role creation) and after migrations (grants for the `app` schema and public tables).
- The Compose stack runs a one-shot `migrate` service with the owner connection, then a `provision-app-role` service with the owner connection, before starting the API or worker.

The API and worker use separate credentials from migrations. Production startup calls `assertRlsRuntimeRole()` before opening HTTP listeners or registering BullMQ consumers; it exits when the runtime connection is a superuser or has `BYPASSRLS`.

### 2.2 Transaction-Local Setting (`set_config(..., true)`)

To avoid leaking tenant identity across pooled database connections (e.g., PgBouncer, Prisma connection pool):

- The tenant context is set inside a database transaction using:
  ```sql
  SELECT set_config('app.current_organization_id', $orgId, true);
  ```
- The third parameter `true` sets the variable as **local to the current transaction** (`SET LOCAL`).
- Once the transaction completes (commit or rollback), PostgreSQL immediately clears the variable. Subsequent queries on the same pooled connection have `app.current_organization_id = NULL`.

### 2.3 RLS Functions & Policies

Defined in the migration script inside schema `app`:

```sql
-- Helper functions
CREATE OR REPLACE FUNCTION app.current_org_id() RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_organization_id', true), '')::uuid;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION app.is_admin_bypass() RETURNS boolean AS $$
BEGIN
  RETURN COALESCE(current_setting('app.admin_bypass', true) = 'true', false);
EXCEPTION
  WHEN OTHERS THEN RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;
```

#### Protected Tables & Policies

- **`organizations`**:
  ```sql
  CREATE POLICY organization_isolation_policy ON "organizations"
    AS PERMISSIVE FOR ALL TO workspace_app
    USING (id = app.current_org_id() OR app.is_admin_bypass())
    WITH CHECK (id = app.current_org_id() OR app.is_admin_bypass());
  ```
- **`memberships`**:
  ```sql
  CREATE POLICY membership_isolation_policy ON "memberships"
    AS PERMISSIVE FOR ALL TO workspace_app
    USING (organization_id = app.current_org_id() OR app.is_admin_bypass())
    WITH CHECK (organization_id = app.current_org_id() OR app.is_admin_bypass());
  ```
- **`invitations`**:
  ```sql
  CREATE POLICY invitation_isolation_policy ON "invitations"
    AS PERMISSIVE FOR ALL TO workspace_app
    USING (organization_id = app.current_org_id() OR app.is_admin_bypass())
    WITH CHECK (organization_id = app.current_org_id() OR app.is_admin_bypass());
  ```
- **`audit_logs`**:
  ```sql
  CREATE POLICY audit_log_isolation_policy ON "audit_logs"
    AS PERMISSIVE FOR ALL TO workspace_app
    USING (organization_id = app.current_org_id() OR app.is_admin_bypass())
    WITH CHECK (organization_id = app.current_org_id() OR app.is_admin_bypass());
  ```
- **`projects`**:
  ```sql
  CREATE POLICY project_isolation_policy ON "projects"
    AS PERMISSIVE FOR ALL TO workspace_app
    USING (organization_id = app.current_org_id() OR app.is_admin_bypass())
    WITH CHECK (organization_id = app.current_org_id() OR app.is_admin_bypass());
  ```
- **`tasks`**:
  ```sql
  CREATE POLICY task_isolation_policy ON "tasks"
    AS PERMISSIVE FOR ALL TO workspace_app
    USING (organization_id = app.current_org_id() OR app.is_admin_bypass())
    WITH CHECK (organization_id = app.current_org_id() OR app.is_admin_bypass());
  ```
- **`comments`**:
  ```sql
  CREATE POLICY comment_isolation_policy ON "comments"
    AS PERMISSIVE FOR ALL TO workspace_app
    USING (organization_id = app.current_org_id() OR app.is_admin_bypass())
    WITH CHECK (organization_id = app.current_org_id() OR app.is_admin_bypass());
  ```
- **`activity_logs`**:
  ```sql
  CREATE POLICY activity_log_isolation_policy ON "activity_logs"
    AS PERMISSIVE FOR ALL TO workspace_app
    USING (organization_id = app.current_org_id() OR app.is_admin_bypass())
    WITH CHECK (organization_id = app.current_org_id() OR app.is_admin_bypass());
  ```

---

## 3. Transaction Helpers

The `@workspace/database` package exports a context-aware `prisma` proxy plus scoped transaction helpers. Application code should use the proxy; while a helper is active, every query is routed to the associated transaction automatically:

```typescript
import { prisma, withTenantTransaction } from "@workspace/database";

await withTenantTransaction(organizationId, async () => {
  // Routed through the tenant transaction, constrained by RLS.
  const projects = await prisma.project.findMany();
  const tasks = await prisma.task.findMany();
  return { projects, tasks };
});
```

- **`withTenantTransaction`**: Sets `app.current_organization_id` for request/job-scoped tenant work. Re-entrant calls for the same organization reuse the surrounding transaction; changing tenants inside a nested context throws.
- **`withUserTransaction`**: Sets `app.current_user_id` for legitimate account-level operations such as listing the current user's organizations or writing personal security audit events.
- **`withDetachedTenantTransaction`**: Always opens a fresh tenant transaction, even when another context is active. Used for fire-and-forget webhook fan-out so it cannot race the request transaction's commit.
- **`withAdminBypassTransaction`**: Narrowly scoped trusted cross-tenant operations only: API-key lookup, invitation token resolution/acceptance, account deletion, Stripe webhook processing, and maintenance sweeps. It sets `app.admin_bypass = 'true'` in a dedicated transaction.

Request-scoped API transactions are opened by `requireActiveMembership` / developer authentication and remain open until the response finishes. This ensures downstream services cannot accidentally query outside the tenant scope.

---

## 4. Invariants & Adversarial Verification

Two live-database suites verify RLS:

- `tenant-isolation.test.ts` connects directly as both owner and `workspace_app` to test missing context, cross-tenant reads, mutations, invitation/membership isolation, connection-pool safety, and atomic rollback.
- `rls-runtime.test.ts` runs the actual Express API with `DATABASE_URL` pointing at `workspace_app`. It registers users through public endpoints, creates organizations and projects, verifies organization listings are account-scoped, verifies cross-tenant project reads return non-disclosing 404s, and verifies direct context-free queries return zero rows. It also proves startup accepts the app role.
- `rls-startup-fail-closed.test.ts` proves `assertRlsRuntimeRole()` rejects the owner/superuser connection.

The integration suite verifies the following behaviors against a live PostgreSQL 18 database using `workspace_app`:

1. **Missing Tenant Context**: Queries executed without setting `app.current_organization_id` return **0 rows**, completely blocking data discovery.
2. **Cross-Tenant ID Access**: Attempting to query `organization.findUnique({ where: { id: tenantBId } })`, `project.findMany()`, or `task.findMany()` while in Tenant A's context returns **0 records**.
3. **Cross-Tenant Mutation**: Attempting to `updateMany` or `deleteMany` records belonging to Tenant B while in Tenant A's context affects **0 records**.
4. **Cross-Tenant Membership & Invitation Isolation**: Invitations and memberships from other organizations cannot be read or altered.
5. **Connection Pooling Safety**: Context set within a transaction is purged automatically on transaction completion.
6. **Atomic Rollback**: Catastrophic failures during organization provisioning or task updates trigger a clean database rollback leaving no orphaned records or stale activity logs.
7. **Runtime API Isolation**: Cross-tenant HTTP requests receive 404 and no context-free query can see tenant rows; startup fails closed on a bypassing role.

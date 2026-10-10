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

## 3. Transaction Helper (`withTenantTransaction`)

The `@workspace/database` package provides the transactional execution helper:

```typescript
import { withTenantTransaction } from "@workspace/database";

await withTenantTransaction(organizationId, async (tx) => {
  // All queries executed on tx are restricted strictly to organizationId
  const projects = await tx.project.findMany();
  const tasks = await tx.task.findMany();
  return { projects, tasks };
});
```

For administrative platform operations (such as global database migrations or tenant provisioning), `withAdminBypassTransaction` explicitly activates `app.admin_bypass = 'true'`.

---

## 4. Invariants & Adversarial Verification

The integration test suite (`tenant-isolation.test.ts`) verifies the following behaviors against a live PostgreSQL 18 database using `workspace_app`:

1. **Missing Tenant Context**: Queries executed without setting `app.current_organization_id` return **0 rows**, completely blocking data discovery.
2. **Cross-Tenant ID Access**: Attempting to query `organization.findUnique({ where: { id: tenantBId } })`, `project.findMany()`, or `task.findMany()` while in Tenant A's context returns **0 records**.
3. **Cross-Tenant Mutation**: Attempting to `updateMany` or `deleteMany` records belonging to Tenant B while in Tenant A's context affects **0 records**.
4. **Cross-Tenant Membership & Invitation Isolation**: Invitations and memberships from other organizations cannot be read or altered.
5. **Connection Pooling Safety**: Context set within a transaction is purged automatically on transaction completion.
6. **Atomic Rollback**: Catastrophic failures during organization provisioning or task updates trigger a clean database rollback leaving no orphaned records or stale activity logs.

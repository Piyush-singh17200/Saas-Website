# ADR 0002: Dual-Layer Tenant Isolation with PostgreSQL Row-Level Security (RLS)

## Status

Accepted

## Context

Multi-tenant architectures require foolproof guarantees that data belonging to Organization A can never be accessed, modified, or deleted by Organization B. Relying solely on application-level filtering (`WHERE organization_id = :id`) is error-prone: a single developer mistake, forgotten filter, or IDOR vulnerability can result in cross-tenant data exposure.

## Decision

We enforce **dual-layer isolation**:

1. **Application Layer (RBAC & Membership Verification)**:
   - Express middleware resolves membership, enforces RBAC, and masks non-existent/unauthorized organizations with non-disclosing 404 responses.
2. **Database Layer (PostgreSQL Row-Level Security)**:
   - All tenant-owned tables (`organizations`, `memberships`, `invitations`, `audit_logs`) have RLS enabled and forced (`FORCE ROW LEVEL SECURITY`).
   - The application connects using an unprivileged role (`workspace_app`) configured with `NOBYPASSRLS`.
   - Tenant context is set per transaction using `SELECT set_config('app.current_organization_id', $orgId, true)`.
   - The `true` parameter makes the variable transaction-local (`SET LOCAL`), guaranteeing that context is automatically discarded upon transaction completion and never leaks across connection pool reuse.
   - Operations without tenant context or with mismatched tenant IDs return 0 rows at the database engine level.

## Consequences

### Positive

- Cross-tenant data leaks are prevented even if application code omits an organization filter.
- Real integration tests against PostgreSQL verify policies under adversarial conditions.
- Zero connection pool leakage due to PostgreSQL transaction-scoped settings.

### Negative

- Protected operations must be wrapped in transactions that set `app.current_organization_id`.
- Helper abstraction `withTenantTransaction(orgId, callback)` is required for database queries.

# WorkSpace Testing Strategy & Execution Guide

WorkSpace features automated tests across units, integration suites, concurrency validation, and PostgreSQL Row-Level Security (RLS) policies.

---

## 1. Running Tests

### Run all tests across the monorepo

Tests require a PostgreSQL database with all migrations applied. API/worker
tests use `TEST_DATABASE_URL` (owner/migration role); the RLS runtime suites
also use `TEST_APP_DATABASE_URL` (unprivileged `workspace_app` role).

```bash
# One-time database preparation (owner URL)
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @workspace/database exec prisma migrate deploy

# Run all tests
pnpm test
```

### Run API integration tests

```bash
pnpm --filter @workspace/api test
```

### Run specific test suites

```bash
# Task API & Optimistic Concurrency Control tests
pnpm --filter @workspace/api exec vitest run src/__tests__/task.test.ts

# PostgreSQL Row-Level Security (RLS) tenant isolation tests
pnpm --filter @workspace/api exec vitest run src/__tests__/tenant-isolation.test.ts

# Projects API tests
pnpm --filter @workspace/api exec vitest run src/__tests__/project.test.ts

# Comments API tests
pnpm --filter @workspace/api exec vitest run src/__tests__/comment.test.ts

# Activity Log API tests
pnpm --filter @workspace/api exec vitest run src/__tests__/activity.test.ts

# Organization & RBAC tests
pnpm --filter @workspace/api exec vitest run src/__tests__/organization.test.ts

# Authentication & Session tests
pnpm --filter @workspace/api exec vitest run src/__tests__/auth.test.ts
```

---

## 2. Test Architecture

### Real PostgreSQL Integration (`workspace_test`)

Tests run against a real PostgreSQL database selected by environment variables:

- **`TEST_DATABASE_URL`**: Owner/migration role used for fixtures and cleanup.
- **`TEST_APP_DATABASE_URL`**: Unprivileged `workspace_app` role with `NOBYPASSRLS` and `NOSUPERUSER`.
- **`set_config('app.current_organization_id', orgId, true)`**: Ensures real SQL row-filtering matches production behavior.
- Tests do NOT rely solely on mocks for security assertions.

Local defaults target `127.0.0.1:5433/workspace_test`; CI sets both variables to
the service container on port 5432 and provisions the app role before applying
migrations.

### RLS Runtime Tests

- `rls-runtime.test.ts` starts the real Express app with `DATABASE_URL` pointing
  at `workspace_app`, then registers users and creates organizations/projects
  through public endpoints. It verifies cross-tenant reads return 404, account
  listings stay scoped, context-free queries see zero rows, and the startup
  assertion accepts the app role.
- `rls-startup-fail-closed.test.ts` verifies startup rejects the owner/superuser
  role when `ENFORCE_RLS_RUNTIME=true`.

### End-to-End Browser Tests

Playwright starts the built Next.js server automatically through `webServer`
when `PLAYWRIGHT_BASE_URL` is not set. The specs mock API responses in the
browser, so no live API process or seeded tenant data is required. CI builds the
web app before running `test:e2e`.

### Optimistic Concurrency Control (OCC) Tests

Located in `apps/api/src/__tests__/task.test.ts`:

1. **Sequential Stale Update**: User A reads task at `v1`, User B updates it to `v2`. User A attempts to update with `version: 1` -> Server rejects with **HTTP 409 Conflict** (`CONCURRENCY_CONFLICT`).
2. **True Concurrent Race Condition**:
   ```typescript
   // Two requests simultaneously attempt to mutate task v1 in parallel
   const [res1, res2] = await Promise.all([
     request(app)
       .patch(url)
       .set("Cookie", alice.cookie)
       .send({ title: "Alice edit", version: 1 }),
     request(app)
       .patch(url)
       .set("Cookie", bob.cookie)
       .send({ title: "Bob edit", version: 1 }),
   ]);

   // Atomically, exactly one request succeeds and the other receives 409 Conflict
   const statuses = [res1.status, res2.status].sort();
   expect(statuses).toEqual([200, 409]);
   ```

### Row-Level Security (RLS) Tests

Located in `apps/api/src/__tests__/tenant-isolation.test.ts`:

- Asserts queries executed without tenant context return 0 records across `organizations`, `memberships`, `projects`, `tasks`, `comments`, and `activity_logs`.
- Asserts queries inside Tenant A cannot read Tenant B's records.
- Asserts mutations in Tenant A targeting Tenant B affect 0 records.
- Asserts connection reuse does not leak tenant context across transactions.

---

## 3. Linting, Typechecking & Build Verification

```bash
# Typecheck all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Production build of all packages (Next.js, API, Worker, Contracts, Database)
pnpm build
```

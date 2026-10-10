# WorkSpace — Multi-Tenant SaaS Platform

WorkSpace is an engineering-first, multi-tenant SaaS project management application designed to provide organizations with shared tooling, collaborative workflows, and guaranteed data isolation.

This repository implements **Phase 1 (Engineering Foundation)**, **Phase 2 (Database Schema, Authentication, Organizations & Tenant Isolation)**, **Phase 3 (Workspace Projects, Task Management, Comments & Activity Tracking)**, **Phase 4 (WorkSpace SaaS Billing, Stripe Subscriptions & Server-Side Entitlements)**, and **Phase 5 (WorkSpace Background Jobs, Redis Queues, Rate Limiting & Observability)** of a planned 12-week production architecture.

---

## 1. Architecture Overview

WorkSpace is structured as a high-performance monorepo utilizing **pnpm workspaces** and **Turborepo**:

- **`apps/web`**: Next.js App Router (React 18, TypeScript, Tailwind CSS). Includes Organization Projects, Kanban Board & Table Project Workspace, Task Modals, Comments thread, Activity Timeline, and Billing & Plans Dashboard with Stripe Checkout and Customer Portal integration.
- **`apps/api`**: Express, TypeScript, Zod validation, cookie-based session auth, RBAC authorization, Stripe Billing integration, server-side entitlement engine, Redis-backed rate limiting with fail-closed policies, transactional outbox producer, structured JSON logging, and versioned REST endpoints (`/api/v1/...`).
- **`apps/worker`**: Dedicated background worker runtime (BullMQ, Redis) for notifications, invitation expiry sweeps, subscription reconciliation, and maintenance cleanup with strict RLS tenant isolation.
- **`packages/database`**: PostgreSQL database management with Prisma ORM, Row-Level Security (RLS) migration policies, notifications & transactional outbox tables, subscriptions & webhook event storage, and tenant transaction helpers.
- **`packages/contracts`**: Shared API contracts, response envelopes (`ApiResponse<T>`), error codes, and Zod schemas for auth, organizations, projects, tasks, comments, activity logs, billing, notifications, and background job payloads.
- **`packages/config`**: Strict base TypeScript configurations and tool presets.
- **`packages/test-utils`**: Reusable unit/integration test mocks and assertion utilities.

For in-depth architectural and security documentation:

- [docs/jobs.md](docs/jobs.md) — Background jobs, BullMQ queues, rate limiting, and observability
- [docs/architecture.md](docs/architecture.md) — System architecture and monorepo topology
- [docs/billing.md](docs/billing.md) — Stripe subscriptions, server-side entitlements, atomic concurrency, and webhooks
- [docs/api.md](docs/api.md) — Complete REST API reference and request/response specifications
- [docs/authorization-model.md](docs/authorization-model.md) — RBAC and tenant authorization policies
- [docs/tenant-isolation.md](docs/tenant-isolation.md) — PostgreSQL Row-Level Security (RLS) & tenant isolation
- [docs/testing.md](docs/testing.md) — Testing strategy, OCC validation, and execution guide
- [docs/authentication.md](docs/authentication.md) — Session authentication, cookie security & CSRF policy

---

## 2. Prerequisites

- **Node.js**: `v20.x` or higher (tested on Node v24.x)
- **pnpm**: `v9.x` or higher (recommended `pnpm@12.x`)
- **PostgreSQL**: `16+` (tested on PostgreSQL 18 with Row-Level Security support)
- **Git**: `2.x+`

---

## 3. Initial Setup

### Step 1: Clone and navigate to repository

```bash
git clone <repository-url>
cd workspace-saas
```

### Step 2: Configure Environment Variables

Copy the template configuration into `.env`:

```bash
cp .env.example .env
```

Review `.env` and verify the values:

```env
PORT=4000
NODE_ENV=development
DATABASE_URL=postgresql://workspace_user:workspace_pass@localhost:5432/workspace_dev?schema=public
TEST_DATABASE_URL=postgresql://workspace_user:workspace_pass@localhost:5432/workspace_test?schema=public
SESSION_COOKIE_NAME=workspace_session
SESSION_TTL_DAYS=7
COOKIE_SECURE=false
CORS_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Step 3: Install Dependencies

```bash
pnpm install
```

---

## 4. Database Setup & Row-Level Security (RLS)

### 4.1 Database Roles Setup

The platform enforces database-level isolation through two PostgreSQL roles:

1. **`workspace_user`** (Superuser/Owner): Used for migrations and administrative setup.
2. **`workspace_app`** (Unprivileged Application Role): Has `NOBYPASSRLS`, subject to `FORCE ROW LEVEL SECURITY`.

### 4.2 Migration Commands

```bash
# Generate Prisma Client
pnpm prisma:generate

# In development: Apply migrations
pnpm --filter @workspace/database db:migrate:dev

# In production / CI: Deploy migrations
pnpm --filter @workspace/database db:migrate:deploy
```

---

## 5. Authentication & Cookie Behavior

Authentication uses stateful database sessions stored in PostgreSQL:

- Raw session tokens are 256-bit cryptographically secure random values.
- Only SHA-256 hashes of tokens are stored in the database. Raw tokens are **never** returned in JSON responses.
- The raw token is stored in an `HttpOnly`, `SameSite=Lax`, `Path=/` browser cookie (`workspace_session`).
- In local development (`COOKIE_SECURE=false`), cookies work over HTTP. In production (`COOKIE_SECURE=true`), cookies are strictly transmitted over HTTPS (`Secure`).
- State-changing requests enforce origin and referer verification against `CORS_ORIGIN` to prevent CSRF attacks.

---

## 6. API Reference & Examples

### Authentication Endpoints

#### Register

```bash
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "displayName": "Jane Doe"
}
```

_Response: HTTP 201 Created with `Set-Cookie: workspace_session=...; HttpOnly; SameSite=Lax`_

#### Login

```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

_Response: HTTP 200 OK with rotated `Set-Cookie`_

#### Logout

```bash
POST /api/v1/auth/logout
Cookie: workspace_session=...
```

_Response: HTTP 200 OK (session immediately revoked in database and cookie cleared)_

#### Current User

```bash
GET /api/v1/me
Cookie: workspace_session=...
```

_Response: HTTP 200 OK with user profile (no secrets or hashes)_

### Organization Endpoints

| Method   | Path                                                    | Required Role             | Description                                                            |
| -------- | ------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| `POST`   | `/api/v1/organizations`                                 | Authenticated             | Creates organization & assigns creator as `OWNER` atomically           |
| `GET`    | `/api/v1/organizations`                                 | Authenticated             | Lists only organizations the user actively belongs to                  |
| `GET`    | `/api/v1/organizations/:organizationId`                 | Active Member             | Gets organization details (returns non-disclosing 404 if unauthorized) |
| `PATCH`  | `/api/v1/organizations/:organizationId`                 | `OWNER` or `ADMIN`        | Renames organization                                                   |
| `GET`    | `/api/v1/organizations/:organizationId/members`         | Active Member             | Lists all members and profiles                                         |
| `PATCH`  | `/api/v1/organizations/:organizationId/members/:userId` | `OWNER`                   | Changes member role (prevents demoting last owner)                     |
| `DELETE` | `/api/v1/organizations/:organizationId/members/:userId` | `OWNER`/`ADMIN` (or self) | Removes member (prevents removing last owner)                          |

### Project Endpoints

| Method  | Path                                                                | Required Role     | Description                                       |
| :------ | :------------------------------------------------------------------ | :---------------- | :------------------------------------------------ |
| `POST`  | `/api/v1/organizations/:organizationId/projects`                    | Active Member     | Creates project with auto-slug & records activity |
| `GET`   | `/api/v1/organizations/:organizationId/projects`                    | Active Member     | Lists projects with status filter & task counts   |
| `GET`   | `/api/v1/organizations/:organizationId/projects/:projectId`         | Active Member     | Gets project details                              |
| `PATCH` | `/api/v1/organizations/:organizationId/projects/:projectId`         | Active Member     | Updates project name/description                  |
| `POST`  | `/api/v1/organizations/:organizationId/projects/:projectId/archive` | `OWNER` / `ADMIN` | Archives project (sets read-only for tasks)       |
| `POST`  | `/api/v1/organizations/:organizationId/projects/:projectId/restore` | `OWNER` / `ADMIN` | Restores archived project                         |

### Task Endpoints & Optimistic Concurrency Control (OCC)

Every task mutation enforces optimistic concurrency control through a numeric `version` field. Stale client updates are atomically rejected with **HTTP 409 Conflict** (`CONCURRENCY_CONFLICT`).

| Method   | Path                                                                             | Required Role | Description                                  |
| :------- | :------------------------------------------------------------------------------- | :------------ | :------------------------------------------- |
| `POST`   | `/api/v1/organizations/:organizationId/projects/:projectId/tasks`                | Active Member | Creates task with status, priority, assignee |
| `GET`    | `/api/v1/organizations/:organizationId/projects/:projectId/tasks`                | Active Member | Lists tasks with filters, search, sorting    |
| `GET`    | `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId`        | Active Member | Gets task details with author and assignee   |
| `PATCH`  | `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId`        | Active Member | Updates task (OCC protected with `version`)  |
| `POST`   | `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/move`   | Active Member | Moves status & position (OCC protected)      |
| `POST`   | `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/assign` | Active Member | Assigns/unassigns task (OCC protected)       |
| `DELETE` | `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId`        | Active Member | Deletes task permanently                     |

### Comments & Activity History Endpoints

| Method   | Path                                             | Required Role  | Description                              |
| :------- | :----------------------------------------------- | :------------- | :--------------------------------------- |
| `POST`   | `.../tasks/:taskId/comments`                     | Active Member  | Creates comment on task                  |
| `GET`    | `.../tasks/:taskId/comments`                     | Active Member  | Lists comments (paginated)               |
| `PATCH`  | `.../tasks/:taskId/comments/:commentId`          | Author only    | Updates comment body                     |
| `DELETE` | `.../tasks/:taskId/comments/:commentId`          | Author / Admin | Soft-deletes comment                     |
| `GET`    | `/api/v1/organizations/:organizationId/activity` | Active Member  | Queries tenant-scoped audit activity log |

### Billing & Subscription Endpoints

| Method | Path                                                     | Required Role | Description                                             |
| :----- | :------------------------------------------------------- | :------------ | :------------------------------------------------------ |
| `GET`  | `/api/v1/organizations/:organizationId/billing`          | Active Member | Retrieves subscription plan, limits & usage meters      |
| `POST` | `/api/v1/organizations/:organizationId/billing/checkout` | Owner / Admin | Creates Stripe Checkout Session for Pro upgrade         |
| `POST` | `/api/v1/organizations/:organizationId/billing/portal`   | Owner / Admin | Generates Stripe Customer Portal session URL            |
| `POST` | `/api/v1/billing/webhook`                                | Stripe HMAC   | Signature-verified, idempotent Stripe webhook ingestion |

---

## 7. Development & Quality Commands

```bash
# Start all dev servers (web, api, worker)
pnpm dev

# Run automated tests across all packages
pnpm test

# Run API tests specifically
pnpm --filter @workspace/api test

# Type checking
pnpm typecheck

# Code formatting & linting
pnpm format:check
pnpm lint

# Production build
pnpm build
```

---

## 8. Common Troubleshooting

1. **`Prisma client has not been generated yet`**:
   Execute `pnpm prisma:generate` from the root repository directory.
2. **`404 Organization not found`**:
   By security design, non-members querying arbitrary organization IDs receive a non-disclosing HTTP 404 to prevent tenant ID discovery.
3. **`401 Unauthorized on /api/v1/me`**:
   Verify that your HTTP client or browser is transmitting the `workspace_session` cookie.
4. **`PostgreSQL Row-Level Security permission denied`**:
   Ensure `workspace_app` has been granted `USAGE` on schema `app` and table privileges on public tables.

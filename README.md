# WorkSpace — Multi-Tenant SaaS Platform

WorkSpace is an engineering-first, multi-tenant SaaS project management application designed to provide organizations with shared tooling, collaborative workflows, and guaranteed data isolation.

This repository represents **Phase 1: Engineering Foundation** of a planned 12-week production architecture.

---

## 1. Architecture Overview

WorkSpace is structured as a high-performance monorepo utilizing **pnpm workspaces** and **Turborepo**:

- **`apps/web`**: Next.js App Router, React 18, TypeScript, Tailwind CSS.
- **`apps/api`**: Express, TypeScript, Zod environment validation, structured error boundaries, liveness and readiness probes.
- **`apps/worker`**: Independent background worker runtime with lifecycle management.
- **`packages/database`**: PostgreSQL database management with Prisma ORM and connectivity probes.
- **`packages/contracts`**: Shared API contracts, response envelopes (`ApiResponse<T>`), error codes, and Zod schemas.
- **`packages/config`**: Strict base TypeScript configurations and tool presets.
- **`packages/test-utils`**: Reusable unit/integration test mocks and assertion utilities.

For in-depth architectural details, see [docs/architecture.md](docs/architecture.md).

---

## 2. Prerequisites

Ensure the following tools are installed on your workstation:

- **Node.js**: `v20.x` or higher (tested on Node v24.x)
- **pnpm**: `v9.x` or higher (recommended `pnpm@12.10.1`)
- **Docker & Docker Compose**: (optional if running local PostgreSQL / Redis instances)
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
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Step 3: Install Dependencies

```bash
pnpm install
```

---

## 4. Infrastructure with Docker Compose

Start local containerized services (PostgreSQL 16 and Redis 7):

```bash
# Start containers in detached mode
docker compose up -d

# Check service health status
docker compose ps

# View container logs
docker compose logs -f

# Stop containers
docker compose stop

# Destroy containers and remove persistent volumes
docker compose down -v
```

> **Note**: If Docker is not installed on your local host system, you may configure a local PostgreSQL 16+ instance running on port 5432 with credentials matching `.env`.

---

## 5. Database Initialization & Migrations

WorkSpace uses Prisma ORM for schema definitions and migrations.

```bash
# Generate the Prisma Client
pnpm prisma:generate

# In development: create and apply migrations
pnpm --filter @workspace/database db:migrate:dev

# In CI / Production: deploy pre-calculated migrations
pnpm --filter @workspace/database db:migrate:deploy
```

---

## 6. Development Commands

Run all applications and services concurrently via Turborepo:

```bash
pnpm dev
```

Or run applications individually:

```bash
# Start frontend only (Next.js on http://localhost:3000)
pnpm --filter @workspace/web dev

# Start backend API only (Express on http://localhost:4000)
pnpm --filter @workspace/api dev

# Start background worker process
pnpm --filter @workspace/worker dev
```

---

## 7. Quality Gates & Verification

WorkSpace enforces strict quality standards across all packages:

```bash
# Validate code formatting
pnpm format:check

# Auto-format codebase
pnpm format

# Run linter
pnpm lint

# Run strict TypeScript type checks
pnpm typecheck

# Run automated test suites (Vitest & Supertest)
pnpm test

# Build production bundles
pnpm build
```

---

## 8. Health & Readiness Probes

The backend exposes two standard telemetry endpoints:

- **Liveness Probe**: `GET /api/v1/health`
  - Returns HTTP 200 with service metadata, uptime, and correlation ID.
- **Readiness Probe**: `GET /api/v1/ready`
  - Verifies PostgreSQL database connectivity. Returns HTTP 200 (`ready`) if connected, or HTTP 503 (`not_ready`) if disconnected.

Example health response:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "workspace-api",
    "version": "0.1.0",
    "uptime": 142,
    "timestamp": "2026-10-10T12:00:00.000Z"
  },
  "meta": {
    "requestId": "f8a7e0d3-3b12-4c56-9a1b-c74b6f123456",
    "timestamp": "2026-10-10T12:00:00.000Z"
  }
}
```

---

## 9. Common Troubleshooting

1. **`pnpm: command not found`**:
   Install pnpm globally using npm:
   ```bash
   npm install -g pnpm
   ```
2. **`Prisma client has not been generated yet`**:
   Execute `pnpm prisma:generate` from the root directory before running or testing the API.
3. **`Database connection timeout or ECONNREFUSED`**:
   Ensure PostgreSQL is running (`docker compose up -d` or native service) and that `DATABASE_URL` in `.env` matches your database credentials.
4. **Port Conflicts (`EADDRINUSE`)**:
   Ensure ports `3000` (web) and `4000` (api) are free or adjust `PORT` in `.env`.

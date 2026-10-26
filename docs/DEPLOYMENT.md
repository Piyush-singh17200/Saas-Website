# WorkSpace SaaS - Production Deployment Architecture & Runbook

## 1. Overview & Architecture Selection

WorkSpace SaaS is a modern multi-tenant enterprise application structured as a PNPM monorepo with separate execution contexts:

1. **Web Frontend (`@workspace/web`)**: Next.js 15 App Router providing SSR, static landing pages, and interactive authenticated client UI.
2. **REST API (`@workspace/api`)**: Node.js / Express server hosting authenticated JSON endpoints, public developer API (`/api/v1`), Stripe webhook listeners, and background job dispatchers.
3. **Background Worker (`@workspace/worker`)**: BullMQ consumer processing email dispatch, file attachment processing, and outbound webhook delivery.
4. **Primary Relational Store**: PostgreSQL (v16+) storing tenants, users, projects, tasks, audit logs, and developer API keys.
5. **Caching & Job Queue Broker**: Redis (v7+) broker for BullMQ queues and rate limiter tracking.
6. **Object Storage**: S3-compatible private bucket (AWS S3, Cloudflare R2, or MinIO) with pre-signed URLs.
7. **Reverse Proxy / Ingress**: Nginx / Cloudflare terminating TLS, applying HSTS and security headers, enforcing request body limits (12 MB), and rate limiting.

### Service Topology

```text
               +-------------------------------------------------+
               |          Clients / Browsers / Webhooks          |
               +-----------------------+-------------------------+
                                       | HTTPS (Port 443)
                                       v
               +-------------------------------------------------+
               |     Ingress Layer: Cloudflare / Nginx Proxy     |
               |       - TLS Termination, HSTS, Rate Limiting    |
               +-----------+-------------------------+-----------+
                           |                         |
               /api, /webhooks                       | All other paths (/)
                           v                         v
               +-----------------------+ +-----------------------+
               |  API Service (Node)   | |  Web Frontend (Next)  |
               |  Port 4000            | |  Port 3000            |
               +-----------+-----------+ +-----------+-----------+
                           |                         |
                           +------------+------------+
                                        |
           +----------------------------+----------------------------+
           |                            |                            |
           v                            v                            v
+---------------------+      +---------------------+      +---------------------+
|  Managed PostgreSQL |      |    Managed Redis    |      |  S3 Object Storage  |
|  (Port 5432)        |      |    (Port 6379)      |      |  (Private Bucket)   |
|  - Private VPC Only |      |    - Private VPC    |      +---------------------+
+---------------------+      +----------+----------+
                                        |
                                        v
                             +---------------------+
                             | Worker Service      |
                             | (BullMQ Processor)  |
                             +---------------------+
```

---

## 2. Infrastructure & Hosting Options

### Option A: Managed Cloud (AWS / Render / Fly.io / Railway) — _Recommended for Production_

- **Compute**:
  - Web & API: AWS ECS Fargate, Render Web Services, or Fly.io VMs.
  - Background Worker: ECS Service (0 public IP, non-web worker) or Render Background Worker.
- **Data Stores**:
  - PostgreSQL: AWS RDS PostgreSQL 16 (Multi-AZ) or Neon / Supabase Managed Postgres.
  - Redis: AWS ElastiCache for Redis 7 (or Upstash / Dragonfly).
  - Storage: AWS S3 with KMS encryption and bucket policies blocking public access.
- **Estimated Baseline Cost**: ~$45–$120/month depending on RDS instance size and traffic.

### Option B: Self-Hosted VM (Docker Compose + Nginx) — _Budget / Staging / On-Premise_

- Deploy the production `docker-compose.prod.yml` on a dedicated Linux VPS (Ubuntu 22.04 LTS, 4 vCPU, 8GB RAM).
- PostgreSQL and Redis reside within an isolated Docker network (`internal_network`) inaccessible to the public internet.
- Nginx binds to ports 80 and 443.
- Let's Encrypt Certbot provisions and auto-renews SSL certificates.

---

## 3. Production Environment & Secrets Configuration

All configuration is strictly supplied via environment variables. See `.env.production.example` for the complete roster.

### Key Production Requirements

1. **`NODE_ENV=production`**: Enables optimized React runtime, production Express error shielding, and secure cookie attributes.
2. **`COOKIE_SECURE=true`**: Restricts session and refresh cookies to `SameSite=Lax; Secure; HttpOnly`.
3. **`MFA_ENCRYPTION_KEY`**: Must be a 32-byte cryptographically random hex string (`openssl rand -hex 32`). Development fallback is rejected at startup.
4. **`DATABASE_URL`**: Must connect via TLS (`sslmode=require`) to the managed PostgreSQL database. Connection pool sizes:
   - API: `connection_limit=20`
   - Worker: `connection_limit=10`
5. **Private VPC Isolation**: `DATABASE_URL` and `REDIS_URL` must point to internal VPC IP addresses or private hostnames, never exposed on public IP interfaces.

---

## 4. Database Migrations & Rollout Strategy

### Migration Principles

1. **Never use `prisma migrate dev` in production**: Only use `pnpm --filter @workspace/database exec prisma migrate deploy`.
2. **Backward Compatibility**: Schema migrations should follow expand-and-contract patterns:
   - Phase 1: Add new optional column / table.
   - Phase 2: Deploy updated application code writing to both / reading from new.
   - Phase 3: Backfill existing data.
   - Phase 4: Drop old column in a subsequent migration.
3. **Pre-Deployment Safety Snapshot**: Before any migration step in production, run `./scripts/backup-db.sh` to take a restorable snapshot.

---

## 5. Reverse Proxy, TLS, and Networking

Nginx configuration (`infra/nginx/nginx.conf`) enforces:

- **Rate Limiting**:
  - General API: 30 requests/second with burst 20.
  - Authentication endpoints: 5 requests/second with burst 5.
- **Security Headers**:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- **Request Size Limiting**:
  - `client_max_body_size 12M` (matches application 10MB file limit + envelope overhead).
- **Public Surface Exposure**:
  - Ports 5432 (Postgres) and 6379 (Redis) are blocked from ingress and bound only to private internal networks.

---

## 6. Continuous Integration & Deployment (CI/CD)

The GitHub Actions workflows manage delivery:

1. **`.github/workflows/ci.yml`**:
   - Triggers on PRs and pushes to `main`.
   - Runs `pnpm format:check`, `pnpm lint`, `pnpm typecheck`.
   - Runs Prisma migration validation against a disposable test PostgreSQL instance.
   - Executes crypto, security, unit, integration, and Playwright E2E tests.
   - Builds production artifacts (`pnpm build`).
   - Builds multi-stage Docker images (`Dockerfile.api`, `Dockerfile.worker`, `Dockerfile.web`).
2. **`.github/workflows/deploy.yml`**:
   - Supports manual deployment to staging or production via `workflow_dispatch`.
   - Executes automated database backup before applying `prisma migrate deploy`.
   - Performs health-check validation post-rollout.

---

## 7. Graceful Shutdown & Worker Safety

- **API (`apps/api/src/server.ts`)**:
  - Listens for `SIGTERM` and `SIGINT`.
  - Stops accepting new HTTP requests.
  - Drains BullMQ queue producers, closes Redis connections, and disconnects Prisma within a 10-second timeout.
- **Worker (`apps/worker/src/index.ts`)**:
  - Listens for `SIGTERM` and `SIGINT`.
  - Clears scheduled periodic sweep intervals.
  - Calls `worker.close()` to allow in-flight job processing to complete cleanly before exiting.

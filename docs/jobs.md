# Background Jobs, Redis Queues, Rate Limiting & Observability

This document details the architecture, reliability guarantees, tenant safety, rate-limiting policies, structured logging, and observability of **WorkSpace** background processing.

---

## 1. Architecture Overview

WorkSpace decouples slow, asynchronous, or recurring side-effects from the Express HTTP API using a dedicated background worker process (`apps/worker`), Redis-backed queues powered by **BullMQ**, and a transactional database outbox pattern.

```
┌─────────────────────────────────┐
│        Express API              │
│  (apps/api, port 4000)          │
└────┬────────────────────────┬───┘
     │ 1. Transactional Write │ 2. Enqueue Job
     ▼                        ▼
┌──────────────────┐    ┌──────────────────────────────────┐
│ PostgreSQL RLS   │    │ Redis (BullMQ Queues)            │
│ (outbox_messages)│    │  • notifications                 │
└──────────────────┘    │  • invitation-expiry             │
                        │  • billing-reconciliation        │
                        │  • maintenance                   │
                        └─────────────┬────────────────────┘
                                      │ 3. Pull & Process
                                      ▼
                        ┌──────────────────────────────────┐
                        │ Background Worker Process        │
                        │ (apps/worker)                    │
                        │  • Re-fetch & Verify Relations   │
                        │  • withTenantTransaction (RLS)   │
                        │  • Domain Idempotency Keys       │
                        │  • Simulated Dev Email Provider  │
                        └──────────────────────────────────┘
```

---

## 2. Queue Definitions & Job Types

| Queue Name | Job Name | Payload Schema | Processor | Concurrency | Retry / Backoff Policy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `notifications` | `send-notification` | `NotificationJobPayloadSchema` | `processNotificationJob` | 5 | 5 attempts, exponential backoff (initial delay 2s) |
| `invitation-expiry` | `sweep-invitations` | `InvitationExpiryJobPayloadSchema` | `processInvitationExpiryJob` | 2 | 3 attempts, exponential backoff (initial delay 3s) |
| `billing-reconciliation` | `reconcile-billing` | `BillingReconciliationJobPayloadSchema` | `processBillingReconciliationJob` | 2 | 4 attempts, exponential backoff (initial delay 5s) |
| `maintenance` | `run-cleanup` | `CleanupJobPayloadSchema` | `processCleanupJob` | 1 | 3 attempts, exponential backoff (initial delay 5s) |

---

## 3. Reliability, Idempotency & Transactional Outbox

### At-Least-Once Delivery & Idempotency Controls
Queue processing follows an at-least-once delivery model. Duplicate executions (from worker restarts, network blips, or BullMQ retries) are guaranteed not to duplicate business side effects:
1. **Stable Job IDs**: Enqueued jobs use deterministic identifiers:
   - Notifications: `jobId = "notification:" + idempotencyKey`
   - Invitations: `jobId = "invitation-sweep:" + timestampMinute`
   - Billing: `jobId = "billing-reconcile:" + organizationId + ":" + timestampInterval`
2. **Database Domain Idempotency**:
   - The `notifications` table enforces a composite unique constraint: `UNIQUE (organization_id, idempotency_key)`.
   - Before inserting, workers check for existing records. If found, the job returns `status: "idempotent_skip"` without duplicating email delivery or database mutations.
3. **Permanent vs. Transient Failures**:
   - Invalid payloads are validated at runtime via Zod schemas. On validation failure, workers throw `UnrecoverableError` so BullMQ immediately marks the job failed instead of retrying endlessly.
   - Database deadlocks or network disconnects trigger exponential backoff retries.

### Transactional Outbox Pattern
When a business mutation occurs (e.g., adding an organization member or assigning a task), the HTTP API inserts an `OutboxMessage` record inside the same database transaction.
- If queue publishing succeeds immediately, the message is dispatched.
- If Redis is unreachable at request time, the outbox record remains `PENDING`.
- The worker's periodic maintenance job sweeps pending outbox messages older than 30 seconds and re-dispatches them to Redis.

---

## 4. Tenant Isolation in Worker Jobs

Queued data is treated as untrusted input:
1. **Authoritative Re-Verification**:
   - The worker never trusts payload claims. It re-fetches the recipient user, organization membership, project, and task from PostgreSQL.
   - If a recipient is not an active member of the target organization (for non-invitation notifications), the job is rejected immediately (`status: "rejected"`).
2. **PostgreSQL RLS Context**:
   - Database mutations execute inside `withTenantTransaction(organizationId, callback)`.
   - `SELECT set_config('app.current_organization_id', organizationId, true)` ensures PostgreSQL transaction-local isolation. When the transaction finishes, the setting is automatically cleared, preventing connection pool leaks.
3. **No Cross-Tenant Side Effects**:
   - Integration tests (`apps/worker/src/__tests__/notification.processor.test.ts`) verify that an organization notification cannot be read by or sent to a user who only belongs to another organization.

---

## 5. API Rate Limiting & Redis Failure Policies

Rate limiting is enforced centrally via `apps/api/src/middleware/rate-limit.middleware.ts`:

| Route Category | Window | Limit | Key Generator | Redis Failure Policy |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication & Sessions** (`/auth/login`, `/auth/register`) | 15 min | 15 req | `rl:auth:ip:<client_ip>` | **Fail-Closed (HTTP 503)** |
| **Abuse-Prone Operations** (`/invitations`, `/members`, `/checkout`) | 15 min | 30 req | `rl:abuse:user:<user_id>` (or IP) | **Fail-Closed (HTTP 503)** |
| **General Authenticated API** (`/projects`, `/tasks`, `/activity`) | 15 min | 600 req | `rl:general:user:<user_id>` (or IP) | **Bounded In-Memory Fallback** (500 items max LRU) |

### Redis Failure Behavior
- **High-Risk / Auth Endpoints**: Guarded by `failClosedGuard`. If Redis is down, requests return `503 Service Unavailable` with `SERVICE_UNAVAILABLE` error code. Endpoints **never** become silently unrestricted.
- **Low-Risk Endpoints**: Fall back to `BoundedLruStore` with maximum capacity 500 and least-recently-used eviction. Memory usage is strictly bounded.
- **Proxy Trust**: Client IPs are extracted using `getClientIp(req)`. Forwarding headers (`X-Forwarded-For`) are only trusted when `TRUST_PROXY=true`.

---

## 6. Structured Logging & Recursive Redaction

The API and worker utilize a structured JSON logger (`StructuredLogger`) logging to standard output in newline-delimited JSON.

### Sample Log Entry
```json
{
  "timestamp": "2026-10-10T12:52:08.832Z",
  "severity": "info",
  "service": "workspace-worker",
  "environment": "production",
  "message": "Notification job completed successfully",
  "correlationId": "req-9b87c",
  "jobId": "notification:task-assigned-123",
  "queueName": "notifications",
  "durationMs": 42,
  "context": {
    "organizationId": "550e8400-e29b-41d4-a716-446655440000",
    "recipientUserId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
  }
}
```

### Recursive Redaction
All context and error data are recursively passed through `redactSensitiveData()`. The following fields are automatically replaced with `"[REDACTED]"`:
- `password`, `newPassword`, `oldPassword`
- `token`, `accessToken`, `refreshToken`, `session`, `cookie`
- `authorization` (Bearer tokens replaced with `Bearer [REDACTED]`)
- `secret`, `stripeSecretKey`, `stripeWebhookSecret`, `apiKey`
- `creditCard`, `cardNumber`, `cvv`, `cvc`, `ssn`

---

## 7. Health Checks & Observability

### Endpoints
- **`GET /api/v1/health`** (Liveness Probe):
  - Returns `200 OK` with uptime, service name, and timestamp.
- **`GET /api/v1/ready`** (Readiness Probe):
  - Checks PostgreSQL (`SELECT 1`) and Redis (`PING`).
  - Returns `200 OK` with component latencies when operational.
  - Returns `503 Service Unavailable` when downstream dependencies are disconnected.

---

## 8. Graceful Shutdown

Both API and background worker processes listen for `SIGTERM` and `SIGINT`:
1. Stop accepting new connections or jobs (`worker.close()`, `server.close()`).
2. Allow active in-flight requests and jobs a bounded opportunity to finish (10-second timeout deadline).
3. Close queue producers and Redis client connections (`closeRedis()`).
4. Disconnect Prisma database connections (`prisma.$disconnect()`).
5. Process exits cleanly with code `0`.

---

## 9. Local Development & Docker Run Commands

### 1. Start Backing Infrastructure (PostgreSQL & Redis)
```bash
docker compose up -d
```

### 2. Run Database Migrations
```bash
pnpm --filter @workspace/database prisma:migrate:deploy
```

### 3. Start Services Separately
In Terminal 1 (API Server):
```bash
pnpm --filter @workspace/api dev
```

In Terminal 2 (Background Worker):
```bash
pnpm --filter @workspace/worker dev
```

In Terminal 3 (Next.js Web Frontend):
```bash
pnpm --filter @workspace/web dev
```

### 4. Run Automated Tests
```bash
# Full test suite across API and Worker
pnpm test

# Run worker tests specifically
pnpm --filter @workspace/worker test

# Run API tests specifically
pnpm --filter @workspace/api test
```

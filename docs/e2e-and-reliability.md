# WorkSpace SaaS: E2E Testing, Performance & Reliability

This document outlines the end-to-end testing, performance verification, reliability protections, and CI/CD automation established for **WorkSpace SaaS**.

---

## 1. Test Architecture & Directory Structure

WorkSpace SaaS follows a multi-tier testing strategy across packages:

```
├── apps/web/
│   ├── e2e/                             # Playwright Browser E2E Journeys
│   │   ├── auth.spec.ts                 # Registration, Login, MFA challenge, Session management
│   │   ├── organization.spec.ts         # Member management, Security policy, Audit logs
│   │   ├── projects-tasks.spec.ts       # Board, Priorities, Tags, Search, Filtering
│   │   ├── attachments.spec.ts          # File attachments, dropzone, limits
│   │   ├── billing.spec.ts              # Plan selection, upgrade checkout, limit meters
│   │   └── developer-webhooks.spec.ts   # API keys, Webhooks, event deliveries
│   └── playwright.config.ts             # Playwright configuration
│
├── apps/api/src/__tests__/
│   ├── security-and-reliability-verification.test.ts # Tenant isolation, RBAC, Scopes, SSRF, MFA policy
│   ├── performance-benchmarks.test.ts   # Micro-benchmarks: AES-GCM, TOTP, Recovery codes, Zod validation
│   ├── crypto-and-security-unit.test.ts # Base32, AES-256-GCM, RFC 6238 TOTP, sanitization
│   ├── rate-limit.test.ts               # Sliding window rate limiting, LRU fallback, Fail-closed guard
│   ├── ready.test.ts                    # Dependency readiness probe checks (Postgres/Redis)
│   ├── logger.test.ts                   # Structured Winston logging and metadata scrubbing
│   ├── error-handling.test.ts           # AppError status codes and correlation request IDs
│   ├── enterprise-security.test.ts      # MFA enrollment, sessions, audit log queries
│   └── tenant-isolation.test.ts         # PostgreSQL RLS and organization isolation boundaries
│
└── apps/worker/src/__tests__/
    ├── notification.processor.test.ts   # Tenant verification, UnrecoverableError, idempotency
    └── maintenance.processor.test.ts    # Invitation expiry, subscription reconciliation, cleanup
```

---

## 2. End-to-End User Journeys (Playwright)

### Authentication & Account Security (`auth.spec.ts`)

- **Login Form Validation**: Client-side feedback on required email/password inputs.
- **MFA Challenge Flow**: Detects `mfaRequired: true` response, suppresses session cookie issuance, prompts for 6-digit TOTP code with 5-minute timeout.
- **Session Management**: Lists active user sessions with IP, browser, and OS metadata. Supports single session revocation and "revoke all other sessions".

### Organization Governance (`organization.spec.ts`)

- **Member Management**: Role indicators (`OWNER`, `ADMIN`, `MEMBER`), invitation dispatch modal, member removal.
- **Security Policy Enforcement**: Organization-level MFA mandate toggle and session max age configuration.
- **Audit Logs**: Filterable event log with metadata inspection.

### Projects & Task Board (`projects-tasks.spec.ts`)

- **Interactive Board**: Tasks categorized by status (`TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`).
- **Priority Badges**: Distinct visual treatments for `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.
- **Tag Manager**: Organization-scoped tags with color coding and modal manager.
- **Search & Filters**: Real-time filtering by keyword and priority.

### Attachments & Object Storage (`attachments.spec.ts`)

- **File Upload Dropzone**: Drag-and-drop file attachment support.
- **Security Limits**: Enforces 10MB file limit and MIME type allowlisting.
- **Signed URL Downloads**: Time-limited signed URL download generation.

### Billing & Entitlements (`billing.spec.ts`)

- **Plan Usage Meters**: Real-time usage indicators comparing current project count against plan limits (3 on Free, 50 on Pro).
- **Checkout Initiation**: Stripe Checkout session creation and customer portal navigation.

### Developer Platform (`developer-webhooks.spec.ts`)

- **API Key Lifecycle**: Key creation with granular scope selection (`tasks:read`, `tasks:write`, `*`), one-time secret modal display, and key revocation.
- **Webhook Subscriptions**: Destination URL validation with SSRF protection, secret generation, event type subscriptions, and delivery history.

---

## 3. Security & Tenant Isolation Verifications

Automated unit and integration checks guarantee the following security properties:

1. **Unauthenticated Route Protection**: All protected routes reject missing or invalid credentials with `401 UNAUTHORIZED`.
2. **Cross-Tenant Boundary Rejection**:
   - Requests with an API key belonging to Org A targeting Org B receive `403 FORBIDDEN`.
   - Requests with a session belonging to a user not in Org B receive non-disclosing `404 NOT_FOUND` to prevent organization existence enumeration.
3. **Role-Based Access Control (RBAC)**: Destructive and administrative settings require `OWNER` or `ADMIN` roles.
4. **API Key Scopes**: Granular enforcement blocks write operations when keys only hold read scopes.
5. **SSRF Guard**: Destination URLs targeting internal IPs (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`) or cloud metadata (`169.254.169.254`) are rejected with `VALIDATION_ERROR`.
6. **MFA Organization Policy**: When an organization mandates MFA, users without MFA enrolled are denied access with `403 FORBIDDEN`.

---

## 4. Performance Benchmarks

Measured under bounded local workload on Node.js v24 (1,000 to 5,000 iterations):

| Operation                         | Total Iterations | Throughput      | p50 Latency | p95 Latency | p99 Latency |
| --------------------------------- | ---------------- | --------------- | ----------- | ----------- | ----------- |
| **AES-256-GCM Encrypt & Decrypt** | 1,000            | 14,211 ops/sec  | 0.050 ms    | 0.126 ms    | 0.241 ms    |
| **RFC 6238 TOTP Gen & Verify**    | 1,000            | 20,307 ops/sec  | 0.038 ms    | 0.086 ms    | 0.187 ms    |
| **Recovery Codes (10x) & Hash**   | 500              | 12,589 ops/sec  | 0.066 ms    | 0.130 ms    | 0.238 ms    |
| **Zod Task Schema Validation**    | 5,000            | 110,544 ops/sec | 0.006 ms    | 0.014 ms    | 0.041 ms    |

---

## 5. Background Worker Reliability

BullMQ background queues (`notifications`, `invitation_expiry`, `billing_reconciliation`, `maintenance`, `webhooks`):

- **Retry Limit & Backoff**: Standard exponential backoff (1s, 2s, 4s...) capped at 3 attempts.
- **Unrecoverable Errors**: Permanent failures (e.g. invalid payload schemas, recipient not in target organization) throw `UnrecoverableError` to prevent infinite queue retries.
- **Tenant Isolation**: Processors verify membership and organization ownership before processing any side effects.
- **Idempotency**: Webhook deliveries and notifications verify duplicate execution markers before sending duplicate emails or HTTP requests.

---

## 6. Continuous Integration (CI) Workflow

The GitHub Actions pipeline (`.github/workflows/ci.yml`) runs on push and pull requests to `main`, `master`, and `develop`:

1. Frozen lockfile installation (`pnpm install --frozen-lockfile`).
2. Prisma Client generation (`pnpm prisma:generate`).
3. Migration application (`prisma migrate deploy`).
4. Prettier formatting verification (`pnpm format:check`).
5. ESLint linting (`pnpm lint`).
6. Monorepo TypeScript typecheck (`pnpm typecheck`).
7. Security & Cryptographic Verifications (`pnpm --filter @workspace/api test ...`).
8. Full automated test suite (`pnpm test`).
9. Monorepo production build (`pnpm build`).
10. Playwright browser install & E2E suite (`pnpm --filter @workspace/web test:e2e`).

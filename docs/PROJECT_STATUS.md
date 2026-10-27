# WorkSpace — Project Status & Handover

**Last verified:** 2026-10-27 (local Windows workstation + GitHub Actions Linux runner)
**Repository:** `C:\Users\singh\OneDrive\Desktop\Saas Project`
**Git state:** code verified at `eebc35c` on `master`; remote `origin` is `https://github.com/Piyush-singh17200/Saas-Website.git`. Remote CI run [`40490031815`](https://github.com/Piyush-singh17200/Saas-Website/actions/runs/40490031815) is green for that commit.
**Verification scope:** local PostgreSQL/Docker, local live API-backed preview, local release gates, GitHub Actions Linux tests/build/Playwright, and remote Docker image builds. No production deployment, production database, live Stripe call, real email send, public DNS/TLS check, or backup/restore drill was performed. The local preview uses the Docker test database and is not a production environment.

This document distinguishes what was actually executed from what is only implemented or configured. Status values:

| Status       | Meaning                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| VERIFIED     | Exercised successfully in this environment with recorded evidence.           |
| PARTIAL      | Implemented, but only part of the path was exercised or a known gap remains. |
| MISSING      | No implementation found.                                                     |
| BLOCKED      | Cannot be completed without credentials, infrastructure, or a decision.      |
| NEEDS REVIEW | Cannot yet be classified confidently; requires owner review.                 |

---

## 1. Bottom Line

Priority 1 (RLS on the runtime database path) and Priority 2 (executable CI/E2E) are implemented. The production Compose stack was also built and started locally with a throwaway project.

- API and worker use the unprivileged `workspace_app` role, provisioned without `SUPERUSER` or `BYPASSRLS`.
- Production startup calls `assertRlsRuntimeRole()` before listening for HTTP traffic or registering BullMQ consumers. A bypassing role is rejected.
- The production Compose stack separates owner/migration credentials from runtime credentials. One-shot `migrate` and `provision-app-role` services ran before the API and worker.
- The Compose run applied all 10 migrations, served `/api/v1/ready` through Nginx with database and Redis connected, and proved tenant isolation with the live app role.
- CI now creates `workspace_test`, provisions `workspace_app` before and after migrations, exposes `TEST_APP_DATABASE_URL`, and builds the migration image target.
- Playwright starts the built Next.js server automatically through `webServer`.
- The full local release gates pass: formatting, lint, typecheck, 230 API tests, 16 worker tests, 28 additional package tests, production build, 10 Playwright tests, and Docker image builds/container smoke tests.
- Remote GitHub Actions run `40490031815` passes: Linux formatting/lint/typecheck/security checks, API 230/230, worker 16/16, 28 additional tests, the production build, Playwright 10/10, and Docker builds for API, migration, worker, and web images.
- A local API-backed browser preview was exercised at `http://localhost:3000` against the Docker `workspace_test` database with the unprivileged app role and RLS enforcement. The preview is local-only and uses demo data.

It is **not globally launched yet**:

1. There is no production host, public domain, DNS, TLS ingress, or production secret set. The verified Compose run used placeholder secrets, HTTP on `localhost`, and a throwaway volume.
2. Real email delivery, live Stripe billing, deployment automation, and backup/restore drills remain blocked on credentials or infrastructure.
3. Real outbound worker webhook/email delivery has not been exercised against an external endpoint or provider.
4. Ownership transfer and some operational integrations remain unimplemented.
5. No production deployment has been performed or approved.

---

## 2. Repository Contents

```text
Saas Project/
├── apps/
│   ├── api/          Express REST API, 17 route modules, 26 test files
│   ├── web/          Next.js 14.2.35 App Router UI, 6 Playwright specs
│   └── worker/       BullMQ worker, 5 processors, 3 test files
├── packages/
│   ├── contracts/    Shared Zod schemas, response envelopes, error codes
│   ├── database/     Prisma schema, client, RLS helpers, 10 migrations
│   ├── config/       Shared TypeScript configurations
│   └── test-utils/   Test factories and helpers
├── infra/
│   ├── docker/       Dockerfile.api (api + migrator), Dockerfile.web, Dockerfile.worker
│   ├── postgres/     First-init app-role bootstrap script
│   └── nginx/        nginx.conf (HTTP only today)
├── docs/             Product, API, security, operations, and handover documentation
├── scripts/          Backup/restore utilities and app-role provisioning SQL
├── .github/workflows/ ci.yml, deploy.yml
├── docker-compose.yml        Local PostgreSQL + Redis
├── docker-compose.prod.yml   Production-style stack with app role and migration jobs
├── .env.example              Local environment template
├── .env.production.example   Production template; secrets are placeholders
└── rea/                      Unrelated untracked reverse-engineering data; not part of this app
```

Measured contents:

- **26 Prisma models**, 10 enums, **10 migrations** in `packages/database/prisma/migrations`.
- API route groups: auth, organizations, invitations, projects, tasks, comments, activity, tags, attachments, billing, notifications, developer API keys, webhooks, security/MFA, health.
- Web pages: landing, login, register, forgot/reset password, verify email, invitations, organizations, members, projects, project board, activity, billing, developer settings, security, privacy, terms.
- Worker queues: `notifications`, `invitation-expiry`, `billing-reconciliation`, `maintenance`, `webhooks`.

`rea/` is unrelated and was not modified. It is excluded from Docker build context by `.dockerignore`.

---

## 3. Verified Results (2026-10-27)

Results below combine local verification with remote GitHub Actions run [`40490031815`](https://github.com/Piyush-singh17200/Saas-Website/actions/runs/40490031815) for code commit `eebc35c`.

| Check                   | Command                                                                                    | Result                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions CI       | Push `eebc35c` to `master`                                                                 | **Success**: all 20 test/build steps and all Docker-build steps passed on the Linux runner                                                                                   |
| Remote test totals      | CI job log                                                                                 | **API 230/230**, **worker 16/16**, **28 additional package tests**, **Playwright 10/10**, production build **6/6**                                                           |
| Remote Docker images    | CI `Build & Validate Docker Images` job                                                    | **API, database migration, worker, and web images built successfully**                                                                                                       |
| Local live preview      | `http://localhost:3000`; `http://localhost:4000/api/v1/ready`                              | **200**; app role `workspace_app`, database + Redis connected; project board showed the seeded task                                                                          |
| Formatting              | `pnpm format:check`                                                                        | **All matched files use Prettier code style**                                                                                                                                |
| Lint                    | `pnpm lint`                                                                                | **6/6 tasks successful** (API/worker TypeScript, web ESLint)                                                                                                                 |
| Full typecheck          | `pnpm turbo typecheck --force`                                                             | **9/9 tasks successful, 0 cached**                                                                                                                                           |
| Full production build   | `pnpm turbo build --force`                                                                 | **6/6 tasks successful, 0 cached**; Next.js production build completed                                                                                                       |
| Full serialized suite   | `pnpm test` (`turbo test --concurrency=1`) with owner/app DB URLs                          | **5/5 test tasks successful**; API and worker share the test database without racing                                                                                         |
| API test suite          | `pnpm --filter @workspace/api exec vitest run` with explicit owner/app DB URLs             | **230/230 tests passed, 26/26 files**, 168.97s                                                                                                                               |
| Worker test suite       | `pnpm --filter @workspace/worker exec vitest run` with explicit owner DB URL               | **16/16 tests passed, 3/3 files**; 7 integration tests skip if the DB URL is absent                                                                                          |
| Playwright E2E          | `pnpm test:e2e`                                                                            | **10/10 tests passed**; Playwright auto-started `next start` on port 3000                                                                                                    |
| RLS runtime             | `vitest run src/__tests__/rls-runtime.test.ts`                                             | 5/5 tests: registration, tenant-scoped organization/project access, cross-tenant 404s, zero rows without context, startup accepted                                           |
| RLS fail-closed startup | `vitest run src/__tests__/rls-startup-fail-closed.test.ts`                                 | 1/1 test: owner/superuser role rejected with `ENFORCE_RLS_RUNTIME=true`                                                                                                      |
| Fresh DB provisioning   | Empty DB → pre-migration provisioning → `prisma migrate deploy` → post-migration provision | **10/10 migrations applied**; role `workspace_app` has `rolsuper=f`, `rolbypassrls=f`; no-context `organizations` count = 0                                                  |
| Docker image builds     | `docker compose --env-file <temp> -p workspace-verify -f docker-compose.prod.yml build`    | **api, migrate, worker, and web images built successfully**; only unset S3 placeholder warnings                                                                              |
| Compose startup order   | `... up -d`                                                                                | Postgres/Redis healthy → **migrate exit 0** → **provision exit 0** → API healthy → web healthy → Nginx started                                                               |
| Compose idempotency     | Re-run `migrate` and `provision-app-role` on the same volume                               | **No pending migrations**; provisioning exited 0 again; app role remained non-superuser/non-bypass                                                                           |
| Container readiness     | `curl.exe -i http://localhost/api/v1/ready`; direct container probe                        | **200 via Nginx and direct**; database and Redis both connected; `/api/v1/health` and web root also 200                                                                      |
| Container RLS           | Live app-role SQL with tenant/user GUCs; API cross-tenant request                          | No context: **0 orgs**. Tenant A: 1 org/1 membership/1 project. Tenant B: 1 org/1 membership/1 project. A could not see B's project; non-member API request returned **404** |
| Runtime role            | `psql` on the Compose database; API/worker container env                                   | API and worker use `workspace_app`, `ENFORCE_RLS_RUNTIME=true`; `rolsuper=f`, `rolbypassrls=f`; `_prisma_migrations` SELECT/INSERT denied                                    |
| Web build-time URL      | Built web image/static bundle                                                              | Bundle contains `http://localhost`; no `localhost:4000`; Compose now passes `NEXT_PUBLIC_API_URL` as a build argument                                                        |
| Worker network          | `docker inspect` on the worker container                                                   | Attached to `internal_network` and the new outbound `egress_network`; no published ports                                                                                     |
| Nginx config            | `docker exec workspace-prod-nginx nginx -t`                                                | **syntax is ok**; auth rate-limit location now matches `/api/v1/auth/`                                                                                                       |
| YAML syntax             | Parse `ci.yml`, `docker-compose.yml`, `docker-compose.prod.yml` with PyYAML                | All parsed successfully                                                                                                                                                      |

### Not verified in this environment

- A real public DNS name, certificate, TLS termination, or production host. The local Compose run used HTTP on `localhost`.
- Real email delivery, live Stripe checkout or webhooks, deployment, and backup/restore.
- Real outbound worker webhook/email delivery against an external endpoint or provider. Only network attachment and local worker startup were verified.
- A production load test, external penetration test, or disaster-recovery drill.
- Ownership transfer.

The local Docker/Compose results above were produced against a throwaway `workspace-verify` project, then the containers, networks, and volumes were removed. The remote Docker job builds the images but does not deploy them. None of this constitutes a production launch.

---

## 4. Priority 1 — RLS Runtime Enforcement (Implemented)

### Database context

`packages/database` is split into:

- `client.ts` — the singleton Prisma client using the runtime `DATABASE_URL`.
- `tenant-context.ts` — `AsyncLocalStorage` context and transaction helpers.
- `index.ts` — a context-aware `prisma` proxy plus stable delegate/client methods so existing application and test mocking surfaces keep working.

Helpers:

- `withTenantTransaction(organizationId, callback)` sets `app.current_organization_id` for request/job-scoped tenant work. Re-entrant calls for the same tenant reuse the transaction; changing tenant inside a nested context throws.
- `withUserTransaction(userId, callback)` sets `app.current_user_id` for account-level operations such as listing a user's organizations and personal audit events.
- `withDetachedTenantTransaction(organizationId, callback)` always opens a fresh tenant transaction for fire-and-forget fan-out, avoiding races with a request transaction.
- `withAdminBypassTransaction(callback)` is limited to trusted cross-tenant paths: API-key lookup, invitation token resolution/acceptance, account deletion, Stripe webhook processing, and maintenance sweeps.

Request-scoped API transactions are opened by `requireActiveMembership` and developer authentication and remain active until the response fires `finish`/`close`. Services therefore execute through the RLS-constrained transaction even when they use the `prisma` proxy.

The new account-level RLS migration adds `app.current_user_id()` and additive self-membership/account audit policies. Tenant policies are forced with `FORCE ROW LEVEL SECURITY`.

### Startup fail-closed behavior

`assertRlsRuntimeRole()`:

- Reads `current_user`, `rolsuper`, and `rolbypassrls`.
- Enforces when `ENFORCE_RLS_RUNTIME=true`, or by default when `NODE_ENV=production`.
- Throws on a superuser or `BYPASSRLS` role.

The API calls it before `listen()`. The worker calls it before registering any BullMQ consumers.

### Provisioning and Compose

`scripts/provision-app-role.sql` is idempotent and safe at both stages:

- Before migrations: creates/updates the role, grants connect/public access, and skips `app` schema grants until the schema exists.
- After migrations: grants `USAGE` on `app`, table/sequence privileges, function execution, and future default privileges.

`docker-compose.prod.yml` now:

- Runs PostgreSQL with app-role bootstrap environment variables and mounts the init/provision scripts.
- Runs a one-shot `migrate` service using the owner URL and the `migrator` Docker target.
- Runs a one-shot `provision-app-role` service after migrations. Provisioning grants runtime object access but **revokes** `_prisma_migrations` access.
- Starts API and worker only after provisioning completes, using the app-role URL and `ENFORCE_RLS_RUNTIME=true`.
- Uses the readiness endpoint `/api/v1/ready` as the API container health check.
- Passes `NEXT_PUBLIC_API_URL` into the web image as a build argument; the value is embedded in the browser bundle at build time.
- Attaches the worker to a dedicated outbound `egress_network` for email/webhooks while keeping it off the public edge and without published ports.
- Uses a TCP healthcheck so the migration job waits for first-init scripts and the final PostgreSQL server.

The local `docker-compose.yml` also creates `workspace_app` on a fresh volume.

---

## 5. Priority 2 — CI and E2E (Remote CI Verified)

`.github/workflows/ci.yml` now:

1. Creates `workspace_test` in the PostgreSQL service.
2. Provisions `workspace_app` before migrations, because several migrations grant privileges to that role.
3. Applies all Prisma migrations to `workspace_test` with the owner URL.
4. Re-runs provisioning after migrations to grant the `app` schema and migrated objects.
5. Exposes `TEST_DATABASE_URL` and `TEST_APP_DATABASE_URL`.
6. Runs formatting, lint, typecheck, security checks, the full test suite, the production build, and Playwright.
7. Builds the API, migration, worker, and web images.

Test database URLs are environment-driven rather than hardcoded. `apps/api/vitest.config.ts` disables file parallelism because suites share and truncate one database. Worker tests use the same helper pattern.

Playwright starts `next start` through `webServer` when `PLAYWRIGHT_BASE_URL` is not supplied. The specs mock API responses in the browser, so they do not need a live API process.

**Remote result (2026-10-27):** run [`40490031815`](https://github.com/Piyush-singh17200/Saas-Website/actions/runs/40490031815) on `eebc35c` passed. The `Lint, Test & Build` job completed all 20 steps, including migrations, the 230-test API suite, the 16-test worker suite, the production build, and Playwright 10/10. The `Build & Validate Docker Images` job built the API, database migration, worker, and web images successfully.

**Remaining work:** none for CI on this commit. A production deployment and the external integrations listed in sections 7–8 are still separate, approval-gated work.

---

## 6. Status by Area

| Area                                      | Status                       | Evidence / Remaining gap                                                                                                                    |
| ----------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo build & typecheck                | VERIFIED                     | 9/9 typecheck, 6/6 build, 0 cached                                                                                                          |
| Formatting and lint                       | VERIFIED                     | `format:check` clean; 6/6 lint tasks pass                                                                                                   |
| Authentication, sessions, password reset  | VERIFIED                     | API suites cover lifecycle, revocation, CSRF, reset, verification                                                                           |
| MFA / TOTP / recovery codes               | VERIFIED                     | Enterprise security tests, replay protection, AES-256-GCM storage                                                                           |
| Organizations, RBAC, invitations          | VERIFIED                     | 230-test API suite covers roles, invitations, last-owner protection                                                                         |
| Ownership transfer                        | MISSING                      | No endpoint to promote another member to `OWNER`                                                                                            |
| Projects, tasks, comments, tags, activity | VERIFIED                     | API and concurrency tests pass                                                                                                              |
| Attachments                               | PARTIAL                      | Local storage tested; S3 adapter not exercised against a real bucket                                                                        |
| Billing entitlements (Free plan limits)   | VERIFIED                     | Limit enforcement tests pass                                                                                                                |
| Stripe checkout / portal / webhooks       | BLOCKED                      | Code and signature tests only; no real Stripe credentials or interaction                                                                    |
| Notifications & transactional outbox      | VERIFIED                     | API outbox and worker notification tests pass                                                                                               |
| Developer API keys & webhooks             | PARTIAL                      | API and mocked UI tests pass; real outbound delivery/SSRF behavior not exercised end-to-end                                                 |
| Security policies & audit logs            | VERIFIED                     | MFA policy, session max age, sanitized metadata, admin audit tests                                                                          |
| PostgreSQL RLS                            | VERIFIED (local + container) | API tests, startup fail-closed test, and live Compose app-role checks: no-context zero rows, tenant A/B isolation, user-context memberships |
| Background worker                         | VERIFIED                     | 16/16 tests; startup assertion precedes queue registration; worker starts in Compose and is attached to internal + egress networks          |
| Web UI                                    | VERIFIED                     | Playwright 10/10 in remote CI; local live API-backed preview showed the seeded project and task                                             |
| Docker images                             | VERIFIED (local + CI)        | API, migrator, worker, and web images built locally and by GitHub Actions run `40490031815`                                                 |
| Production Compose stack                  | VERIFIED (local)             | Throwaway stack started in order; migrations/provisioning, readiness, RLS, Nginx, and web build arg checked                                 |
| TLS / Nginx                               | PARTIAL                      | HTTP proxy, auth prefix, rate limits, and config test verified; no TLS/domain or 443 server block                                           |
| CI pipeline                               | VERIFIED (remote)            | GitHub Actions run `40490031815` passed all test/build and Docker-image steps                                                               |
| Deployment / rollback                     | BLOCKED                      | `deploy.yml` remains a placeholder                                                                                                          |
| Real email delivery                       | BLOCKED                      | Production API logs dispatches; worker uses in-memory development provider                                                                  |
| Backup / restore                          | PARTIAL                      | Scripts exist; no restore drill performed                                                                                                   |
| Monitoring / alerting                     | PARTIAL                      | Structured logs and health/readiness endpoints; no external metrics/tracing/alerting                                                        |
| Email verification / reset delivery       | PARTIAL                      | Token lifecycle works; messages are not delivered                                                                                           |

---

## 7. Remaining Blockers

| Blocker                    | Why it blocks production                                                                                 | What is needed                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Production host absent     | Local Compose ran on Windows with HTTP and placeholder secrets; no DNS, TLS, or production secrets exist | Choose a host, provide domain/certificates/secrets, deploy, and repeat the readiness/RLS checks |
| Launch not approved        | Production deployment, DNS changes, and live billing require explicit owner approval                     | Owner approval, target host, domain, and production secret set                                  |
| Real email absent          | No production delivery provider                                                                          | Choose Resend/SES, add credentials and adapter, add delivery test, fail startup if missing      |
| Stripe unusable            | Placeholder keys and price ID; no test-mode checkout/webhook                                             | Provide test credentials, run checkout/webhook, validate entitlements                           |
| No TLS / ingress           | Nginx is HTTP-only                                                                                       | Domain, certificates, 443 server block, HTTP→HTTPS redirect, ingress test                       |
| Deployment placeholder     | `deploy.yml` only echoes; no registry rollout, health verification, or rollback                          | Choose target, registry, secrets, and implement/validate rollout                                |
| Backup/restore unverified  | Scripts exist but no restore drill was run                                                               | Disposable restore environment and documented drill                                             |
| Ownership transfer missing | No API can promote another member to `OWNER`                                                             | Define and implement ownership-transfer flow with tests                                         |
| Worker delivery unverified | Egress network exists, but no external email/webhook receiver has been exercised                         | Provide a test receiver/provider and run real delivery tests                                    |

---

## 8. Next Actions

1. **Approve a launch target and provide production inputs**: host/VPS or cloud account, public domain, DNS access, TLS certificates or managed certificate, production `DATABASE_URL`/app-role credentials, a unique `MFA_ENCRYPTION_KEY`, Redis, and email/Stripe credentials.
2. **Deploy to a staging environment first**: run the production Compose stack, apply migrations with the owner role, provision `workspace_app`, verify `/api/v1/ready`, RLS isolation, API-backed browser journeys, and TLS.
3. **Complete provider integrations**: real email delivery, Stripe test-mode checkout/webhook, then live billing only after explicit approval.
4. **Operate it**: run a backup/restore drill, configure log retention/monitoring/alerting, and define rollback.
5. **Close the remaining product gap**: implement and test ownership transfer; commission load and external penetration tests before broad public traffic.

---

## 9. Evidence Commands

Run from the repository root in PowerShell unless noted.

```powershell
# Test database: Docker postgres:16 on 127.0.0.1:5433
# psql client: PostgreSQL 18 binaries
$env:PGPASSWORD = "workspace_pass"
$env:DATABASE_URL = "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_test?schema=public"
$env:TEST_DATABASE_URL = $env:DATABASE_URL
$env:TEST_APP_DATABASE_URL = "postgresql://workspace_app:workspace_app_pass@127.0.0.1:5433/workspace_test?schema=public"

# Provision the runtime role (idempotent; repeat after migrations)
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5433 `
  -U workspace_user -d workspace_test -v ON_ERROR_STOP=1 `
  -v app_user=workspace_app -v app_password=workspace_app_pass `
  -v db_name=workspace_test -f scripts/provision-app-role.sql

# Apply migrations with the owner/migration URL
pnpm --filter @workspace/database exec prisma migrate deploy

$env:MFA_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
$env:ENFORCE_RLS_RUNTIME = "true"
$env:REDIS_URL = "redis://127.0.0.1:6379"

# Static gates
pnpm format:check
pnpm lint -- --force
pnpm turbo typecheck --force
pnpm turbo build --force

# Test suites (root script serializes database-backed packages)
pnpm test
pnpm test:e2e

# Local Docker Desktop / Compose (verified 2026-10-26; throwaway project removed afterward)
# Remote Docker image builds: GitHub Actions run 40490031815 (2026-10-27)
docker version
docker compose version
$env:COMPOSE_FILE = Join-Path $env:TEMP "workspace-compose-verify.env"
docker compose --env-file $env:COMPOSE_FILE -p workspace-verify -f docker-compose.prod.yml build
docker compose --env-file $env:COMPOSE_FILE -p workspace-verify -f docker-compose.prod.yml up -d
docker compose --env-file $env:COMPOSE_FILE -p workspace-verify -f docker-compose.prod.yml ps -a
docker logs workspace-prod-migrate
docker logs workspace-prod-provision
curl.exe -i http://localhost/api/v1/ready
docker exec workspace-prod-nginx nginx -t
docker compose --env-file $env:COMPOSE_FILE -p workspace-verify -f docker-compose.prod.yml run --rm -T migrate
docker compose --env-file $env:COMPOSE_FILE -p workspace-verify -f docker-compose.prod.yml run --rm -T provision-app-role
docker compose --env-file $env:COMPOSE_FILE -p workspace-verify -f docker-compose.prod.yml down -v

# YAML syntax check (requires PyYAML)
python -c "import yaml; [yaml.safe_load(open(f, encoding='utf-8')) for f in ['.github/workflows/ci.yml','docker-compose.yml','docker-compose.prod.yml']]; print('YAML OK')"
```

The temporary Compose env file contained placeholders only and was deleted after the run. GitHub Actions run `40490031815` is green for code commit `eebc35c`; its Docker job built all four images. No production deployment has been performed.

---

## 10. Related Documentation

- [README.md](../README.md) — local setup, environment variables, and role provisioning
- [ARCHITECTURE.md](ARCHITECTURE.md) — implemented system architecture and boundaries
- [TESTING.md](TESTING.md) — test strategy, environment variables, RLS runtime tests, and E2E
- [SECURITY.md](SECURITY.md) — implemented controls and open security gaps
- [DEPLOYMENT.md](DEPLOYMENT.md) — role separation, Compose migration flow, and deployment blockers
- [tenant-isolation.md](tenant-isolation.md) — RLS helpers and adversarial verification
- `docs/jobs.md`, `docs/api.md`, `docs/billing.md` — detailed subsystem references

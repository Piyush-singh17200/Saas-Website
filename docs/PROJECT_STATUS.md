# WorkSpace — Project Status & Handover

**Last verified:** 2026-10-27 (live UI audit, four UI defect fixes, local Windows workstation, GitHub Actions Linux runner)
**Repository:** `C:\Users\singh\OneDrive\Desktop\Saas Project`
**Git state:** base commit `eebc35c` on `master`; the four UI defect fixes and their regression coverage are **uncommitted working-tree changes**. Remote `origin` is `https://github.com/Piyush-singh17200/Saas-Website.git`. Remote CI run [`40490031815`](https://github.com/Piyush-singh17200/Saas-Website/actions/runs/40490031815) is green for `eebc35c` only; the new changes have not been committed, pushed, or deployed.
**Verification scope:** local PostgreSQL/Docker, local live API-backed preview, a separate live API/UI audit and post-fix verification on the isolated audit database, local release gates, GitHub Actions Linux tests/build/Playwright, and remote Docker image builds. The live audit and the post-fix checks used `workspace_audit_20261027` and the unprivileged `workspace_app` role with `ENFORCE_RLS_RUNTIME=true`. The preview database `workspace_test` was not used for destructive tests; a final read-only count showed **4 users, 4 organizations, 3 projects, 2 tasks, 1 comment**. The local Playwright suite is now **18/18** and still uses mocked API routes; the post-fix live browser run adds 13 real API/database checks. No production deployment, production database, live Stripe call, real email send, public DNS/TLS check, or backup/restore drill was performed.

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
- The local release gates were re-run after the UI fixes: formatting, lint, typecheck, 230 API tests, 16 worker tests, production build, and 18 Playwright tests. Docker image builds/container smoke tests were verified earlier for the base commit but were not repeated after the UI-only changes.
- Remote GitHub Actions run `40490031815` passes for base commit `eebc35c`: Linux formatting/lint/typecheck/security checks, API 230/230, worker 16/16, 28 additional tests, the production build, Playwright 10/10, and Docker builds for API, migration, worker, and web images. The current uncommitted changes have not run remotely.
- A local API-backed browser preview was exercised at `http://localhost:3000` against the Docker `workspace_test` database with the unprivileged app role and RLS enforcement. The preview is local-only and uses demo data.
- A separate live API-backed UI audit ran against `workspace_audit_20261027`: 15 phases, 31 checks, 0 harness failures, and 4 UI defects. It exercised owner/admin/member signup, owner sign-in, organization/project/task/comment flows, invitations, role boundaries, loading/empty/validation/error states, and tenant isolation. `workspace_test` was not modified.
- All four audit defects were then fixed locally. A new 8-test Playwright regression spec covers the four areas, and a 13-check live browser run under the `workspace_app` role passed against the rebuilt app. The fixes remain uncommitted.
- The 18/18 Playwright E2E suite intercepts API routes with mocks. It is useful UI regression coverage, but it is not proof that the browser is working against the live API and database; the separate 13-check live run is that evidence.

It is **not globally launched yet**:

1. There is no production host, public domain, DNS, TLS ingress, or production secret set. The verified Compose run used placeholder secrets, HTTP on `localhost`, and a throwaway volume.
2. Real email delivery, live Stripe billing, deployment automation, and backup/restore drills remain blocked on credentials or infrastructure.
3. Real outbound worker webhook/email delivery has not been exercised against an external endpoint or provider.
4. The four release-candidate UI defects are fixed and verified locally, but the changes are uncommitted. No review, commit, push, remote CI run, or staging deployment has consumed them yet.
5. Ownership transfer and some operational integrations remain unimplemented.
6. No production deployment has been performed or approved.

---

## 2. Repository Contents

```text
Saas Project/
├── apps/
│   ├── api/          Express REST API, 17 route modules, 26 test files
│   ├── web/          Next.js 14.2.35 App Router UI, 7 Playwright specs
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

Results below combine local post-fix verification with remote GitHub Actions run [`40490031815`](https://github.com/Piyush-singh17200/Saas-Website/actions/runs/40490031815) for base commit `eebc35c`. Rows marked **post-fix** include the current uncommitted changes; remote CI results apply only to `eebc35c`.

| Check                            | Command                                                                                    | Result                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions CI                | Push `eebc35c` to `master`                                                                 | **Success**: all 20 test/build steps and all Docker-build steps passed on the Linux runner                                                                                                                                       |
| Remote test totals               | CI job log                                                                                 | **API 230/230**, **worker 16/16**, **28 additional package tests**, **Playwright 10/10**, production build **6/6**                                                                                                               |
| Remote Docker images             | CI `Build & Validate Docker Images` job                                                    | **API, database migration, worker, and web images built successfully**                                                                                                                                                           |
| Local live preview               | `http://localhost:3000`; `http://localhost:4000/api/v1/ready`                              | **200**; app role `workspace_app`, database + Redis connected; project board showed the seeded task                                                                                                                              |
| Live UI audit                    | Playwright Chromium against web `localhost:3000` and API `127.0.0.1:4000`                  | **15 phases, 31 checks, 0 harness failures, 4 defects found**; URL assertions, screenshots, and live API reads/writes; `workspace_audit_20261027` only                                                                           |
| Live UI fixes (post-fix)         | Rebuilt app + real API; `workspace_app` role; `ENFORCE_RLS_RUNTIME=true`                   | **13/13 checks passed**: demo control absent, owner archive visible, member archive hidden, cross-tenant list/detail non-disclosing, register + sign-in invitation preservation/acceptance, mismatch blocked, invalid token safe |
| Live RBAC matrix                 | Live API with browser `Origin` header; UI role controls                                    | **Owner promote/demote 200; member project create 201; member invite/archive 403; admin role change 403; admin invite-as-admin 403; owner cross-tenant 404; anonymous 401**                                                      |
| Preview data preserved           | Final read-only SQL counts on `workspace_test`                                             | **4 users, 4 organizations, 3 projects, 2 tasks, 1 comment**; destructive tests used only `workspace_audit_20261027`                                                                                                             |
| Formatting (post-fix)            | `pnpm format:check`                                                                        | **All matched files use Prettier code style**                                                                                                                                                                                    |
| Lint (post-fix)                  | `pnpm turbo lint --force`                                                                  | **6/6 tasks successful** (API/worker TypeScript, web ESLint)                                                                                                                                                                     |
| Full typecheck (post-fix)        | `pnpm turbo typecheck --force`                                                             | **9/9 tasks successful, 0 cached**                                                                                                                                                                                               |
| Full production build (post-fix) | `pnpm turbo build --force`                                                                 | **6/6 tasks successful, 0 cached**; Next.js production build completed                                                                                                                                                           |
| Full serialized suite            | Prior `pnpm test` (`turbo test --concurrency=1`) with owner/app DB URLs                    | **5/5 test tasks successful**; not rerun after the UI-only fix because API and worker suites were run directly                                                                                                                   |
| API test suite (post-fix)        | `pnpm --filter @workspace/api exec vitest run` against `workspace_audit_20261027`          | **230/230 tests passed, 26/26 files**, 163.18s; owner/app DB URLs; `workspace_test` untouched                                                                                                                                    |
| Worker test suite (post-fix)     | `pnpm --filter @workspace/worker exec vitest run` against `workspace_audit_20261027`       | **16/16 tests passed, 3/3 files**, 7.16s                                                                                                                                                                                         |
| Playwright E2E (post-fix)        | `pnpm test:e2e` against rebuilt `next start`                                               | **18/18 tests passed**: 10 existing + 8 new UI-defect regressions; API routes are mocked, so this is not live API/DB proof                                                                                                       |
| RLS runtime                      | `vitest run src/__tests__/rls-runtime.test.ts`                                             | 5/5 tests: registration, tenant-scoped organization/project access, cross-tenant 404s, zero rows without context, startup accepted                                                                                               |
| RLS fail-closed startup          | `vitest run src/__tests__/rls-startup-fail-closed.test.ts`                                 | 1/1 test: owner/superuser role rejected with `ENFORCE_RLS_RUNTIME=true`                                                                                                                                                          |
| Fresh DB provisioning            | Empty DB → pre-migration provisioning → `prisma migrate deploy` → post-migration provision | **10/10 migrations applied**; role `workspace_app` has `rolsuper=f`, `rolbypassrls=f`; no-context `organizations` count = 0                                                                                                      |
| Docker image builds              | `docker compose --env-file <temp> -p workspace-verify -f docker-compose.prod.yml build`    | **api, migrate, worker, and web images built successfully**; only unset S3 placeholder warnings                                                                                                                                  |
| Compose startup order            | `... up -d`                                                                                | Postgres/Redis healthy → **migrate exit 0** → **provision exit 0** → API healthy → web healthy → Nginx started                                                                                                                   |
| Compose idempotency              | Re-run `migrate` and `provision-app-role` on the same volume                               | **No pending migrations**; provisioning exited 0 again; app role remained non-superuser/non-bypass                                                                                                                               |
| Container readiness              | `curl.exe -i http://localhost/api/v1/ready`; direct container probe                        | **200 via Nginx and direct**; database and Redis both connected; `/api/v1/health` and web root also 200                                                                                                                          |
| Container RLS                    | Live app-role SQL with tenant/user GUCs; API cross-tenant request                          | No context: **0 orgs**. Tenant A: 1 org/1 membership/1 project. Tenant B: 1 org/1 membership/1 project. A could not see B's project; non-member API request returned **404**                                                     |
| Runtime role                     | `psql` on the Compose database; API/worker container env                                   | API and worker use `workspace_app`, `ENFORCE_RLS_RUNTIME=true`; `rolsuper=f`, `rolbypassrls=f`; `_prisma_migrations` SELECT/INSERT denied                                                                                        |
| Web build-time URL               | Built web image/static bundle                                                              | Bundle contains `http://localhost`; no `localhost:4000`; Compose now passes `NEXT_PUBLIC_API_URL` as a build argument                                                                                                            |
| Worker network                   | `docker inspect` on the worker container                                                   | Attached to `internal_network` and the new outbound `egress_network`; no published ports                                                                                                                                         |
| Nginx config                     | `docker exec workspace-prod-nginx nginx -t`                                                | **syntax is ok**; auth rate-limit location now matches `/api/v1/auth/`                                                                                                                                                           |
| YAML syntax                      | Parse `ci.yml`, `docker-compose.yml`, `docker-compose.prod.yml` with PyYAML                | All parsed successfully                                                                                                                                                                                                          |

### Not verified in this environment

- A browser run through a public domain, TLS certificate, and production-like ingress; the live UI audit and post-fix check used local HTTP.
- Real email delivery, live Stripe checkout/webhooks, and live billing.
- Real outbound worker webhook/email delivery against an external endpoint or provider. Only network attachment and local worker startup were verified.
- Deployment automation, backup/restore, a production load test, external penetration test, or disaster-recovery drill.
- Commit, push, remote CI, staging deployment, and production deployment of the four UI fixes.
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

| Area                                      | Status                       | Evidence / Remaining gap                                                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo build & typecheck                | VERIFIED                     | 9/9 typecheck, 6/6 build, 0 cached                                                                                                                                                                                               |
| Formatting and lint                       | VERIFIED                     | `format:check` clean; 6/6 lint tasks pass                                                                                                                                                                                        |
| Authentication, sessions, password reset  | VERIFIED                     | API suites cover lifecycle, revocation, CSRF, reset, verification                                                                                                                                                                |
| MFA / TOTP / recovery codes               | VERIFIED                     | Enterprise security tests, replay protection, AES-256-GCM storage                                                                                                                                                                |
| Organizations, RBAC, invitations          | PARTIAL                      | 230-test API suite and live RBAC matrix pass; invitation onboarding now preserves email/redirect and passed live register/sign-in checks; account mismatch and invalid tokens remain fail-safe; real email delivery still absent |
| Ownership transfer                        | MISSING                      | No endpoint to promote another member to `OWNER`                                                                                                                                                                                 |
| Projects, tasks, comments, tags, activity | PARTIAL                      | API and concurrency tests pass; live UI shows archive/restore only to `OWNER`/`ADMIN`, hides them from `MEMBER`, while the API still returns `403` to members; owner project/task/comment UI flow passes                         |
| Attachments                               | PARTIAL                      | Local storage tested; S3 adapter not exercised against a real bucket                                                                                                                                                             |
| Billing entitlements (Free plan limits)   | VERIFIED                     | Limit enforcement tests pass                                                                                                                                                                                                     |
| Stripe checkout / portal / webhooks       | BLOCKED                      | Code and signature tests only; no real Stripe credentials or interaction                                                                                                                                                         |
| Notifications & transactional outbox      | VERIFIED                     | API outbox and worker notification tests pass                                                                                                                                                                                    |
| Developer API keys & webhooks             | PARTIAL                      | API and mocked UI tests pass; real outbound delivery/SSRF behavior not exercised end-to-end                                                                                                                                      |
| Security policies & audit logs            | VERIFIED                     | MFA policy, session max age, sanitized metadata, admin audit tests                                                                                                                                                               |
| PostgreSQL RLS                            | VERIFIED (local + container) | API tests, startup fail-closed test, and live Compose app-role checks: no-context zero rows, tenant A/B isolation, user-context memberships                                                                                      |
| Background worker                         | VERIFIED                     | 16/16 tests; startup assertion precedes queue registration; worker starts in Compose and is attached to internal + egress networks                                                                                               |
| Web UI                                    | PARTIAL                      | 18/18 mocked Playwright tests plus 13/13 live app-role checks; all four audit defects fixed locally and uncommitted; public-domain/TLS staging run still pending                                                                 |
| Docker images                             | VERIFIED (local + CI)        | API, migrator, worker, and web images built locally and by GitHub Actions run `40490031815`                                                                                                                                      |
| Production Compose stack                  | VERIFIED (local)             | Throwaway stack started in order; migrations/provisioning, readiness, RLS, Nginx, and web build arg checked                                                                                                                      |
| TLS / Nginx                               | PARTIAL                      | HTTP proxy, auth prefix, rate limits, and config test verified; no TLS/domain or 443 server block                                                                                                                                |
| CI pipeline                               | VERIFIED (remote)            | GitHub Actions run `40490031815` passed all test/build and Docker-image steps                                                                                                                                                    |
| Deployment / rollback                     | BLOCKED                      | `deploy.yml` remains a placeholder                                                                                                                                                                                               |
| Real email delivery                       | BLOCKED                      | Production API logs dispatches; worker uses in-memory development provider                                                                                                                                                       |
| Backup / restore                          | PARTIAL                      | Scripts exist; no restore drill performed                                                                                                                                                                                        |
| Monitoring / alerting                     | PARTIAL                      | Structured logs and health/readiness endpoints; no external metrics/tracing/alerting                                                                                                                                             |
| Email verification / reset delivery       | PARTIAL                      | Token lifecycle works; messages are not delivered                                                                                                                                                                                |

---

## 7. Remaining Blockers

| Blocker                    | Why it blocks production                                                                                                                     | What is needed                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Production host absent     | Local Compose ran on Windows with HTTP and placeholder secrets; no DNS, TLS, or production secrets exist                                     | Choose a host, provide domain/certificates/secrets, deploy, and repeat the readiness/RLS checks |
| Launch not approved        | Production deployment, DNS changes, and live billing require explicit owner approval                                                         | Owner approval, target host, domain, and production secret set                                  |
| UI fixes uncommitted       | The four defects are fixed and locally verified, but no review/commit/push has happened, so remote CI and staging cannot consume the changes | Review the diff, commit and push, let CI run, then repeat the live browser checks in staging    |
| Real email absent          | No production delivery provider                                                                                                              | Choose Resend/SES, add credentials and adapter, add delivery test, fail startup if missing      |
| Stripe unusable            | Placeholder keys and price ID; no test-mode checkout/webhook                                                                                 | Provide test credentials, run checkout/webhook, validate entitlements                           |
| No TLS / ingress           | Nginx is HTTP-only                                                                                                                           | Domain, certificates, 443 server block, HTTP→HTTPS redirect, ingress test                       |
| Deployment placeholder     | `deploy.yml` only echoes; `DEPLOYMENT.md` §6 overstates backup/health automation; no registry rollout or rollback                            | Choose target, registry, secrets, and implement/validate rollout                                |
| Backup/restore unverified  | Scripts exist but no restore drill was run                                                                                                   | Disposable restore environment and documented drill                                             |
| Ownership transfer missing | No API can promote another member to `OWNER`                                                                                                 | Define and implement ownership-transfer flow with tests                                         |
| Worker delivery unverified | Egress network exists, but no external email/webhook receiver has been exercised                                                             | Provide a test receiver/provider and run real delivery tests                                    |

---

## 8. Next Actions

1. **Approve a launch target and provide production inputs**: host/VPS or cloud account, public domain, DNS access, TLS certificates or managed certificate, production `DATABASE_URL`/app-role credentials, a unique `MFA_ENCRYPTION_KEY`, Redis, and email/Stripe credentials.
2. **Review and commit the four UI fixes** before staging: the demo shortcut is removed, invitation email/redirect is preserved through login and registration with same-origin redirect validation, archive/restore controls are hidden from members, and 403/cross-tenant 404 share the non-disclosing `Access Restricted` state. The local gates and 13-check live run already pass; commit/push and let remote CI run before deployment.
3. **Deploy to a staging environment first**: run the production Compose stack, apply migrations with the owner role, provision `workspace_app`, verify `/api/v1/ready`, RLS isolation, API-backed browser journeys, and TLS.
4. **Complete provider integrations**: real email delivery, Stripe test-mode checkout/webhook, then live billing only after explicit approval.
5. **Operate it**: run a backup/restore drill, configure log retention/monitoring/alerting, and define rollback.
6. **Close the remaining product gap**: implement and test ownership transfer; commission load and external penetration tests before broad public traffic.

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

---

## 11. Live UI Audit (2026-10-27)

### Environment and method

- Web: `http://localhost:3000` (local production build served by Node).
- API: `http://127.0.0.1:4000`; browser requests use `http://localhost:3000` origin for CORS/CSRF consistency.
- Database: isolated `workspace_audit_20261027`; runtime role `workspace_app`; `ENFORCE_RLS_RUNTIME=true`.
- Browser: Playwright Chromium, real API calls, real database reads/writes; no mocked routes.
- Preview preservation: `workspace_test` remained at **4 users, 4 organizations, 3 projects, 2 tasks, 1 comment**. All audit accounts/data were created only in the audit database.
- Result: **15 phases, 31 checks, 0 harness failures, 4 defects found**. After the fixes, a separate live browser run completed **13/13 checks** with no failures.
- Post-fix data: disposable fixtures were created only in `workspace_audit_20261027`; `workspace_test` received no live-test writes during the fix pass.

The live audit is separate from `pnpm test:e2e`. The current 18/18 Playwright E2E result uses mocked API routes; the results below are the live-stack evidence.

### Verified flows

- Owner, admin, and member signup; explicit owner sign-in with redirect into the owner organization.
- New-account empty organization state; organization creation.
- Empty project list; project creation after client-side validation; delayed live request loading state.
- Empty task board; task creation/validation; status change to `IN_PROGRESS`; live API confirmation.
- Task detail empty-comments state; comment creation and display.
- Owner invited an `ADMIN` and a `MEMBER`; both accepted; owner member list updated.
- Invitation account mismatch is rejected; invalid invitation token renders an error state.
- Member has no invitation control and the live API rejects member invitation with `403 FORBIDDEN`.
- Admin invitation role selector is disabled; live API rejects admin-as-`ADMIN` invitation with `403` (“Only organization owners can invite administrators”).
- Admin cannot change a member's role (`403 FORBIDDEN`); owner can promote a member to `ADMIN` and restore `MEMBER` through the UI (both `PATCH` responses `200`, server state confirmed).
- Member project creation is allowed (`201`); the member `New Project` control is consistent with the API.
- Cross-tenant API access returns `404`; unauthenticated API access returns `401`; cross-tenant browser navigation did not reveal the other tenant's data.
- Invalid login, short-password registration, project-name validation, and empty task title all render visible error states.

### Live role matrix

| Operation / test          | OWNER                              | ADMIN                           | MEMBER                                                                       |
| ------------------------- | ---------------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| Signup / session          | Signup + explicit sign-in verified | Signup verified (auto-session)  | Signup verified (auto-session)                                               |
| Create organization       | Created organization               | Created own second organization | Not exercised                                                                |
| View organization/project | Verified                           | Verified                        | Verified                                                                     |
| Invite MEMBER             | UI + API verified                  | UI + API verified               | No UI control; API `403`                                                     |
| Invite ADMIN              | UI verified                        | Selector disabled; API `403`    | No UI control; API `403`                                                     |
| Change member role        | Promote/demote verified, `200`     | API `403`                       | Not exercised                                                                |
| Create project            | UI verified                        | UI verified                     | API `201` (allowed)                                                          |
| Archive project           | UI control visible; API verified   | UI control visible; API `403`   | UI control hidden; API `403` (post-fix live check)                           |
| Task status/comment       | Verified                           | Not exercised (project access)  | Not exercised (project access)                                               |
| Cross-tenant org/project  | `404` (no leak)                    | Own tenant `200`                | Non-disclosing `Access Restricted` for org/project 404 (post-fix live check) |
| Unauthenticated API       | `401` (signed out)                 | —                               | —                                                                            |

All direct state-changing API probes used `Origin: http://localhost:3000`; without that header the CSRF middleware returns `403`, which must not be interpreted as an RBAC result.

### UI defects found and fixed

| Severity | Defect                                                                                | Root cause                                                                                                                        | Fix                                                                                                                                                                                                                                                                                                                        | Post-fix evidence                                                                                                                                                                                                 | Status              |
| -------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| High     | Production login exposed “Fill Demo Credentials (Alice)” and prefilled a demo account | The shortcut and literal demo values were rendered unconditionally from `/login`                                                  | Removed the shortcut, handler, and unused icon import entirely; no environment branch or literal credential shortcut remains                                                                                                                                                                                               | Rebuilt `/login` shows no demo control/email/password; `.next/static` and `.next/server` contain none of the three strings                                                                                        | Fixed (uncommitted) |
| High     | New invited users lost the invitation context                                         | Invitation links went to the landing page, which did not read `email`/`redirect`; login/register did not preserve or consume them | Added shared safe-redirect/email helpers; invitation page links directly to login/register; login and registration prefill the invited email and preserve only same-origin `/invitations/<token>` redirects; legacy landing links hand off to `/login` with context; mismatched/invalid accounts remain blocked by the API | Live registration and sign-in both returned to the pending invitation and accepted it; prefilled email/redirect assertions passed; mismatched account had no accept action; invalid token rendered the safe error | Fixed (uncommitted) |
| Medium   | Member project cards showed “Archive project” although the API denies it              | Projects page did not resolve the signed-in membership role                                                                       | Projects page fetches `/me` and organization members, resolves the current role, and renders archive/restore only for `OWNER`/`ADMIN`; lookup failure hides the controls                                                                                                                                                   | Live member page: archive `0`, restore `0`; live owner page: archive visible; API still returns `403` to members                                                                                                  | Fixed (uncommitted) |
| Low      | Cross-tenant navigation did not show the intended access-denied state                 | Project list handled only `403`; project detail rendered a generic error and workspace shell for `404`                            | Added shared `AccessRestrictedState`; both `403` and cross-tenant `404` render the same non-disclosing message and suppress workspace controls/data                                                                                                                                                                        | Live member opened another tenant's project list and detail: both showed “Access Restricted” with the shared message, no project data, and no `Create Task`/`New Project` controls                                | Fixed (uncommitted) |

No product code was committed, pushed, or deployed. The fixes exist only in the working tree and must be reviewed and committed before remote CI or staging can use them.

### Post-fix verification (2026-10-27)

- `pnpm format:check` — pass.
- `pnpm turbo lint --force` — **6/6 tasks successful**.
- `pnpm turbo typecheck --force` — **9/9 tasks successful, 0 cached**.
- `pnpm turbo build --force` — **6/6 tasks successful, 0 cached**; Next.js production build completed.
- API tests against `workspace_audit_20261027` with owner/app DB URLs — **230/230 tests passed, 26/26 files**, 163.18s.
- Worker tests against `workspace_audit_20261027` — **16/16 tests passed, 3/3 files**, 7.16s.
- Local Playwright against the rebuilt `next start` — **18/18 tests passed**, including 8 new regression tests in `apps/web/e2e/ui-defect-regressions.spec.ts`. These still mock API routes.
- Live browser run against the rebuilt app, real API/database, `workspace_app`, and `ENFORCE_RLS_RUNTIME=true` — **13/13 checks passed**. It covered the demo-control absence, owner/member archive visibility, cross-tenant list/detail states, registration and sign-in invitation preservation/acceptance, account mismatch, and invalid-token handling.
- Production bundle check — `Fill Demo Credentials`, `alice@workspace.test`, and `Password123!` are absent from `apps/web/.next/static` and `apps/web/.next/server`. Stale matches remain only in the disposable `.next/cache/webpack` build cache and are not served.
- `workspace_test` destruction guard — destructive suites and live fixtures used only `workspace_audit_20261027`; final read-only `workspace_test` counts were **4 users, 4 organizations, 3 projects, 2 tasks, 1 comment**.

Changed product files:

- `apps/web/src/lib/invitation-auth.ts`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/app/register/page.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/invitations/[token]/page.tsx`
- `apps/web/src/components/AccessRestrictedState.tsx`
- `apps/web/src/app/organizations/[organizationId]/projects/page.tsx`
- `apps/web/src/app/organizations/[organizationId]/projects/[projectId]/page.tsx`
- `apps/web/e2e/ui-defect-regressions.spec.ts`

### Corrections made during the audit

- The owner role controls were initially reported as undiscoverable because the harness looked for an `aria-label` that is not present in the rendered table. The real controls exist and the owner promote/demote flow was verified.
- Initial direct `403` responses from member/admin API probes were CSRF failures caused by a missing `Origin` header, not RBAC failures. The CSRF-corrected probe returned member project creation `201`, member invite/archive `403`, admin role change `403`, and admin-as-admin invite `403`.
- Member project creation is therefore **allowed** and is not a defect.

### Evidence and limits

Local, non-versioned evidence:

- `C:\Users\singh\AppData\Local\Temp\opencode\live-audit\ui-audit-report.json`
- `C:\Users\singh\AppData\Local\Temp\opencode\live-audit\rbac-probe.json`
- `C:\Users\singh\AppData\Local\Temp\opencode\live-audit\owner-role-check.json`
- `C:\Users\singh\AppData\Local\Temp\opencode\live-audit\screens\`
- `C:\Users\singh\AppData\Local\Temp\opencode\live-ui-evidence\live-ui-results.json`
- `C:\Users\singh\AppData\Local\Temp\opencode\live-ui-evidence\*.png`

The live UI audit did not cover live billing, real email delivery, external worker webhooks, public DNS/TLS, load testing, external penetration testing, backup/restore, or a deployed staging environment. Those remain blocked or unverified. The post-fix run used local HTTP and disposable audit-database fixtures; it is not a production deployment test.

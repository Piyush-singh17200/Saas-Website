# WorkSpace SaaS - Production Launch Checklist

This checklist must be systematically verified before flipping DNS or admitting public customer traffic to the production instance.

---

## 1. Environment & Secrets Management

- [ ] **No Secrets in Source Control**: Verified that `.env`, `.env.production`, private keys, and production API tokens are absent from Git (`git status`, `.gitignore`).
- [ ] **Environment Validation**: `apps/api/src/config/env.ts` enforces non-empty variables for all required production keys.
- [ ] **MFA Encryption Key**: `MFA_ENCRYPTION_KEY` is a distinct 32-byte cryptographically random hex string (`openssl rand -hex 32`), not the development fallback string.
- [ ] **JWT / Cookie Secret**: `JWT_SECRET` is at least 32 characters of high-entropy randomness.
- [ ] **Production Flags**: `NODE_ENV=production` and `COOKIE_SECURE=true` are active across all runtime containers.
- [ ] **Next.js Public Variables**: Only non-sensitive URLs (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`) use the `NEXT_PUBLIC_` prefix.

---

## 2. Networking, DNS & Ingress

- [ ] **Domain & DNS**: Root domain (`workspacesaas.com`) and subdomains (`app.`, `api.`) configured with appropriate A/AAAA/CNAME records and Cloudflare/Route53 DNSSEC.
- [ ] **TLS / HTTPS**: Valid SSL certificate installed (Let's Encrypt or Cloudflare Edge SSL) with automatic renewal.
- [ ] **HTTP to HTTPS Redirection**: Port 80 unconditionally 301-redirects to Port 443.
- [ ] **Security Headers**: HSTS (`max-age=31536000`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` verified via `curl -I`.
- [ ] **CORS Isolation**: `CORS_ORIGIN` strictly set to production web domain(s); wildcards (`*`) forbidden in production.
- [ ] **Trusted Proxy**: `TRUST_PROXY=1` enabled behind Cloudflare or Nginx reverse proxy so client IP address resolution is accurate for rate limiting.
- [ ] **Private Data Stores**: Ports 5432 (Postgres) and 6379 (Redis) are inaccessible to the public internet, bound strictly to private VPC / internal Docker bridge.

---

## 3. Database & Storage Readiness

- [ ] **Migration Status**: All migrations applied using `prisma migrate deploy`.
- [ ] **Connection Pooling**: Database connection strings include `connection_limit` tuned to instance capacity (API: 20, Worker: 10).
- [ ] **Automated Backups**: Continuous archiving (WAL) or daily `pg_dump` snapshot schedule enabled and confirmed.
- [ ] **Restore Tested**: Database restoration tested in an isolated test environment using `./scripts/restore-db.sh`.
- [ ] **Object Storage**: S3 bucket created with:
  - Public access block enabled (`BlockPublicAcls`, `BlockPublicPolicy`, `IgnorePublicAcls`, `RestrictPublicBuckets`).
  - Default server-side encryption enabled (SSE-S3 or SSE-KMS).
  - CORS configuration permitting pre-signed PUT requests from frontend origin.

---

## 4. Authentication & Security Controls

- [ ] **Rate Limiting**: In-memory / Redis rate limiting active on `/api/auth/*` (5 req/sec burst) and `/api/*` (30 req/sec burst).
- [ ] **Multi-Tenant Isolation**: Tenant boundaries validated by automated tests (`tenant-isolation.test.ts`).
- [ ] **API Keys**: Developer platform keys hashed with SHA-256; unhashed secret displayed only once at creation time.
- [ ] **SSRF Protection**: Outbound webhook delivery validates target URLs and blocks loopback/link-local/private RFC1918 IP addresses.
- [ ] **Audit Logging**: Sensitive actions (role change, member removal, MFA toggle, API key generation) generate immutable audit records.

---

## 5. Billing & Webhooks

- [ ] **Stripe Live Keys**: Production `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` configured in production secret manager.
- [ ] **Webhook Endpoint Registered**: Production webhook endpoint (`https://api.workspacesaas.com/api/billing/webhook`) registered in Stripe Dashboard.
- [ ] **Signature Verification**: Live webhook events cryptographically verified using raw body buffer.
- [ ] **Idempotency**: Webhook events recorded in database to prevent double-processing on Stripe delivery retries.
- [ ] **Subscription Entitlements**: Subscription tiers accurately restrict seat counts and storage limits server-side.

---

## 6. Email Delivery

- [ ] **Provider Setup**: Resend / SendGrid / Postmark production API key configured.
- [ ] **Domain Verification**: SPF, DKIM, and DMARC DNS records verified for outbound email domain (`workspacesaas.com`).
- [ ] **Templates**: Verification emails, invitation links, and password resets verified with production base URL (`APP_URL`).

---

## 7. Observability & Monitoring

- [ ] **Health Endpoints**:
  - `/health`: Liveness probe returns `{"status":"ok"}`.
  - `/health/ready`: Readiness probe checks Postgres and Redis connectivity without leaking infrastructure details.
- [ ] **Structured Logging**: JSON logging with request correlation IDs enabled.
- [ ] **Log Sanitization**: Passwords, authorization tokens, credit card tokens, and MFA keys scrubbed from log output.
- [ ] **Uptime Monitoring**: External monitor (Better Uptime, Pingdom, or AWS CloudWatch Synthetic) polling `/health` every 60 seconds.
- [ ] **Alerting**: PagerDuty / Slack notifications configured for error rate spikes (>1% of requests) and queue backlog depth (>1,000 jobs).

---

## 8. Compliance & Legal

- [ ] **Terms of Service**: Published at `/terms` with company details and liability terms.
- [ ] **Privacy Policy**: Published at `/privacy` detailing data collection, cookie usage, sub-processors (Stripe, AWS, Resend), and GDPR/CCPA data subject rights.
- [ ] **Support Contact**: Functioning support email (`support@workspacesaas.com`) or help desk portal accessible in app footer.

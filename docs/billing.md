# WorkSpace SaaS — Billing, Stripe Subscriptions & Server-Side Entitlements

## Overview

WorkSpace implements a production-grade, multi-tenant subscription billing architecture powered by **Stripe Billing**, **PostgreSQL Row-Level Security (RLS)**, and **centralized server-side entitlement enforcement**.

Subscriptions are associated strictly with **Organizations** (tenants), never individual user accounts. Plan tiers dictate organizational resource limits, seat counts, and feature availability.

---

## 1. Plan Structure & Server-Side Entitlements

WorkSpace defines two primary subscription tiers:

| Attribute                  | Free Plan                     | Pro Plan                       |
| :------------------------- | :---------------------------- | :----------------------------- |
| **Price**                  | $0 / month                    | $29 / month (configurable)     |
| **Active Projects Limit**  | Configurable (default: **3**) | Configurable (default: **50**) |
| **Team Member Limit**      | Configurable (default: **5**) | Configurable (default: **50**) |
| **Kanban Task Boards**     | Included                      | Included                       |
| **Activity Audit Trail**   | Included                      | Included                       |
| **Stripe Customer Portal** | Not applicable                | Included                       |
| **Invoice Downloads**      | Not applicable                | Included                       |
| **Support SLA**            | Community                     | Priority                       |

### Centralized Entitlement Engine

Limits are defined and enforced solely on the server in `apps/api/src/services/entitlement.service.ts`.

- Limits are **never** trusted from frontend assertions or request payloads.
- Plan limits are configurable via environment variables (`FREE_MAX_PROJECTS`, `FREE_MAX_MEMBERS`, `PRO_MAX_PROJECTS`, `PRO_MAX_MEMBERS`).
- If an organization's subscription expires, is delinquent, or canceled, the entitlement engine automatically resolves its effective plan to `FREE`.

---

## 2. Concurrency Control & Atomic Limit Invariants

A critical requirement of multi-tenant billing systems is **race-condition safety**: concurrent requests must not exceed organizational plan limits.

WorkSpace guarantees atomic limit enforcement using PostgreSQL row-level locks within transactions:

```sql
SELECT id FROM organizations WHERE id = $1::uuid FOR UPDATE;
```

When creating a new project or adding a member:

1. The transaction acquires an exclusive row lock on the organization record.
2. The current active project count or active member count is counted within the locked transaction.
3. If `currentCount >= maxLimit`, the transaction throws an `AppError` with status code `403` and error code `PLAN_LIMIT_EXCEEDED`.
4. If within limits, the project or member is inserted, and the transaction commits.
5. Concurrent requests are serialized by the row lock; the second request re-evaluates the updated count and is rejected.

---

## 3. Safe Downgrade & Data Preservation Policy

When an organization downgrades from Pro to Free (or its subscription is canceled):

- **Zero Data Deletion**: Existing projects, tasks, comments, and members are **never deleted or hidden**.
- **Queryability**: All existing data remains fully viewable, searchable, and manageable.
- **Future Actions Blocked**: If an organization has 4 active projects upon downgrade to Free (where limit is 3), creating a 5th project or un-archiving a project will fail with `PLAN_LIMIT_EXCEEDED` until active projects are archived to below the Free threshold.

---

## 4. Subscription State Machine

WorkSpace tracks subscription states using the `SubscriptionStatus` enum in PostgreSQL:

| Status               | Effective Plan            | Description                                    | Entitlement State                                    |
| :------------------- | :------------------------ | :--------------------------------------------- | :--------------------------------------------------- |
| `ACTIVE`             | `PRO`                     | Current paid subscription in good standing     | Full Pro features & limits                           |
| `TRIALING`           | `PRO`                     | Active trial period                            | Full Pro features & limits                           |
| `PAST_DUE`           | `PRO` (with grace notice) | Last invoice payment attempt failed            | Warning banner shown; manage billing prompt          |
| `UNPAID`             | `FREE`                    | Multiple failed invoices; collection exhausted | Reverts to Free plan limits                          |
| `CANCELED`           | `FREE`                    | Subscription explicitly terminated             | Reverts to Free plan limits; existing data preserved |
| `INCOMPLETE`         | `FREE`                    | Initial checkout was not finalized             | Free plan limits                                     |
| `INCOMPLETE_EXPIRED` | `FREE`                    | Setup intent expired                           | Free plan limits                                     |

### Scheduled Cancellations (`cancelAtPeriodEnd`)

When an owner cancels their subscription via the Stripe Customer Portal, Stripe marks `cancel_at_period_end: true`.

- The organization **retains Pro access** until `currentPeriodEnd`.
- The UI displays an informational notice with the exact expiration date.
- Upon cycle end, Stripe fires `customer.subscription.deleted`, transitioning local state to `CANCELED` and `plan: FREE`.

---

## 5. Stripe Webhook Architecture & Idempotency

Webhooks arrive at `POST /api/v1/billing/webhook`.

### Signature Verification on Raw Request Body

Stripe requires the **exact, unmodified raw request buffer** for HMAC SHA-256 signature verification.

- The webhook router is mounted with `express.raw({ type: "application/json" })` **before** the global JSON body parser.
- Signatures are verified using `stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)`.
- Requests with invalid or missing signatures are rejected with HTTP `400`.

### Durable Deduplication & Idempotency

Every processed Stripe event is recorded in the `WebhookEvent` table:

```prisma
model WebhookEvent {
  id        String   @id // Stripe Event ID (e.g. evt_1Q...)
  eventType String   @map("event_type")
  data      Json
  createdAt DateTime @default(now()) @map("created_at")

  @@map("webhook_events")
}
```

If an event with the same ID arrives again:

1. `WebhookEvent.findUnique({ where: { id: event.id } })` detects the duplicate.
2. The handler immediately returns HTTP `200` with `{ received: true, duplicate: true }`.
3. Side-effects (such as database updates) are **not repeated**.

### Out-of-Order Event Protection

Network delays can cause older Stripe events to arrive after newer ones (e.g., a delayed `customer.subscription.updated` arriving after `customer.subscription.deleted`).
WorkSpace compares `event.created * 1000` against the subscription's `canceledAt` timestamp. If an incoming event is older than the cancellation timestamp, the update is ignored to prevent resurrecting a canceled subscription.

### Handled Stripe Events

| Stripe Event                    | Handling Logic                                                                                     |
| :------------------------------ | :------------------------------------------------------------------------------------------------- |
| `checkout.session.completed`    | Extracts `metadata.organizationId`, associates Stripe customer & subscription, activates Pro plan. |
| `customer.subscription.created` | Upserts subscription details (status, current period, price ID).                                   |
| `customer.subscription.updated` | Updates subscription status, period timestamps, and cancellation schedule.                         |
| `customer.subscription.deleted` | Transitions subscription to `CANCELED` and `plan: FREE` (data preserved).                          |
| `invoice.payment_succeeded`     | Ensures subscription status is `ACTIVE`.                                                           |
| `invoice.payment_failed`        | Transitions subscription status to `PAST_DUE`.                                                     |
| Unhandled events                | Safely acknowledged with HTTP `200` `{ received: true }`.                                          |

---

## 6. Stripe Test Mode Setup & Local Development

### 1. Configure Stripe API Keys

Create a free Stripe account and toggle **Test Mode**.
In your `.env` file:

```env
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_1...
APP_URL=http://localhost:3000
```

### 2. Create the Pro Product & Price

1. In the Stripe Dashboard (Test Mode), navigate to **Product Catalog**.
2. Click **Add Product**:
   - Name: `WorkSpace Pro`
   - Description: `Multi-tenant SaaS project management for growing teams`
   - Pricing Model: `Standard pricing`
   - Price: `$29.00 USD` (or desired amount)
   - Billing Period: `Monthly` (recurring)
3. Copy the created **Price ID** (`price_...`) into `STRIPE_PRO_PRICE_ID`.

### 3. Forward Webhooks with Stripe CLI

Download the [Stripe CLI](https://stripe.com/docs/stripe-cli) and run:

```bash
stripe login
stripe listen --forward-to localhost:4000/api/v1/billing/webhook
```

The CLI will output a webhook signing secret:

```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxx
```

Set `STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx` in your `.env`.

---

## 7. Database Migrations & Rollback

### Applied Migration

- `packages/database/prisma/migrations/20261010200000_add_subscriptions_and_billing/migration.sql`
  - Adds `SubscriptionPlan` enum (`FREE`, `PRO`).
  - Adds `SubscriptionStatus` enum.
  - Creates `subscriptions` table with unique constraint on `organization_id` and unique `stripe_customer_id`, `stripe_subscription_id`.
  - Creates `webhook_events` table for idempotency tracking.
  - Applies PostgreSQL Row-Level Security (`ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`) and tenant isolation policies for `workspace_app`.

### Migration Commands

```bash
# Run migrations on local dev database
pnpm --filter @workspace/database migrate:deploy

# Run migrations on test database
DATABASE_URL="postgresql://workspace_user:workspace_pass@localhost:5433/workspace_test?schema=public" pnpm --filter @workspace/database migrate:deploy
```

---

## 8. Automated Testing

WorkSpace includes 20 automated billing integration and unit tests in `apps/api/src/__tests__/billing.test.ts`:

- **Authorization & Security**:
  - Unauthenticated requests rejected with `401`.
  - Non-members blocked from viewing billing with `403`/`404`.
  - Ordinary members blocked from creating checkout sessions or opening Customer Portal (`403`).
  - Owner and Admin authorized to manage subscriptions.
- **Server-Side Entitlements & Limits**:
  - Free plan enforces 3 active projects; 4th project blocked with `403 PLAN_LIMIT_EXCEEDED`.
  - Archiving a project frees up a slot immediately; restoring project re-evaluates limit.
  - Member limit enforced at 5 members; 6th member blocked with `403 PLAN_LIMIT_EXCEEDED`.
- **Concurrency Safety**:
  - Parallel requests at limit threshold serialized by PostgreSQL row locking (`SELECT FOR UPDATE`). Exactly 1 request succeeds (201) and 1 fails (403). Total projects in DB equals exactly limit.
- **Elevation & Safe Downgrades**:
  - Pro plan allows creating beyond Free limits.
  - Canceled subscription downgrades to Free while preserving all 4 existing projects.
- **Webhook Idempotency & Signatures**:
  - Invalid signature rejected (`400`).
  - Valid `checkout.session.completed` upgrades organization to Pro.
  - Duplicate delivery of identical event ID returns `{ received: true, duplicate: true }` without re-execution.
  - Invoice payment failures and successes update status to `PAST_DUE` and `ACTIVE`.
  - Out-of-order delayed events do not resurrect canceled subscriptions.

Run the test suite:

```bash
pnpm --filter @workspace/api test src/__tests__/billing.test.ts
```

---

## 9. Security & Production Checklist

1. **Never Log Sensitive Payloads**: Webhook logs and API logs must never print card numbers, tokens, or customer bank data.
2. **Never Trust Client Prices**: All checkout sessions use server-configured `STRIPE_PRO_PRICE_ID`. The frontend cannot pass custom amounts.
3. **Strict Origin Validation**: Checkout `success_url` and `cancel_url` use validated server-side `APP_URL`.
4. **Idempotency Keys**: Use Stripe idempotency keys for external API mutations when automated retry mechanisms are configured.
5. **No PCI DSS Exposure**: WorkSpace never handles, processes, or stores raw payment credentials. Payment information is handled exclusively in Stripe's PCI-compliant hosted fields and checkout pages.

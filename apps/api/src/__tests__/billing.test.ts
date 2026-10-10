import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "@workspace/database";
import { stripe } from "../services/stripe.service.js";
import { env } from "../config/env.js";

describe("WorkSpace Billing, Subscriptions & Entitlements API", () => {
  const app = createApp();

  beforeEach(async () => {
    vi.restoreAllMocks();

    await prisma.webhookEvent.deleteMany();
    await prisma.activityLog.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.session.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  });

  async function registerUser(email: string, name: string) {
    const res = await request(app).post("/api/v1/auth/register").send({
      email,
      password: "Password123!",
      displayName: name,
    });
    const cookie = res.headers["set-cookie"]?.[0];
    if (!cookie) {
      throw new Error(`Failed to obtain cookie for ${email}`);
    }
    return {
      user: res.body.data.user,
      cookie,
    };
  }

  async function createTestOrg(
    cookie: string,
    name = "Acme Corp",
    slug = "acme-corp",
  ) {
    const res = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", cookie)
      .send({ name, slug });
    return res.body.data.organization;
  }

  function signPayload(payloadString: string): string {
    return stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: env.STRIPE_WEBHOOK_SECRET,
    });
  }

  describe("Billing Authorization & Tenant Isolation", () => {
    it("rejects unauthenticated requests to billing endpoints with 401", async () => {
      const res = await request(app).get(
        "/api/v1/organizations/00000000-0000-0000-0000-000000000000/billing",
      );
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rejects users who are not members of the organization with 403 or 404", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const bob = await registerUser("bob@billing.com", "Bob");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      const res = await request(app)
        .get(`/api/v1/organizations/${org.id}/billing`)
        .set("Cookie", bob.cookie);

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it("allows organization members to view billing summary and limits", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      const res = await request(app)
        .get(`/api/v1/organizations/${org.id}/billing`)
        .set("Cookie", alice.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subscription.plan).toBe("FREE");
      expect(res.body.data.limits.maxActiveProjects).toBe(
        env.FREE_MAX_PROJECTS,
      );
      expect(res.body.data.usage.activeProjects).toBe(0);
      expect(res.body.data.usage.members).toBe(1); // Alice is owner
    });

    it("prevents ordinary members from creating checkout sessions or opening portal (requires OWNER/ADMIN)", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const bob = await registerUser("bob@billing.com", "Bob");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      // Add Bob as MEMBER
      const addRes = await request(app)
        .post(`/api/v1/organizations/${org.id}/members`)
        .set("Cookie", alice.cookie)
        .send({ email: "bob@billing.com", role: "MEMBER" });
      expect(addRes.status).toBe(201);

      // Bob tries to create checkout session
      const checkoutRes = await request(app)
        .post(`/api/v1/organizations/${org.id}/billing/checkout`)
        .set("Cookie", bob.cookie);
      expect(checkoutRes.status).toBe(403);

      // Bob tries to open portal session
      const portalRes = await request(app)
        .post(`/api/v1/organizations/${org.id}/billing/portal`)
        .set("Cookie", bob.cookie);
      expect(portalRes.status).toBe(403);
    });
  });

  describe("Checkout and Customer Portal Integration", () => {
    it("creates a Stripe checkout session for organization owner", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      vi.spyOn(stripe.customers, "create").mockResolvedValueOnce({
        id: "cus_mock_alice_123",
      } as any);

      vi.spyOn(stripe.checkout.sessions, "create").mockResolvedValueOnce({
        url: "https://checkout.stripe.com/c/pay/cs_test_mock_session",
      } as any);

      const res = await request(app)
        .post(`/api/v1/organizations/${org.id}/billing/checkout`)
        .set("Cookie", alice.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.checkoutUrl).toBe(
        "https://checkout.stripe.com/c/pay/cs_test_mock_session",
      );

      // Verify stripe customer was associated with organization
      const sub = await prisma.subscription.findUnique({
        where: { organizationId: org.id },
      });
      expect(sub?.stripeCustomerId).toBe("cus_mock_alice_123");
    });

    it("rejects portal session creation when organization has no stripe customer", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      const res = await request(app)
        .post(`/api/v1/organizations/${org.id}/billing/portal`)
        .set("Cookie", alice.cookie);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("No billing account found");
    });

    it("creates a Stripe Customer Portal session when customer exists", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      // Associate customer ID
      await prisma.subscription.update({
        where: { organizationId: org.id },
        data: { stripeCustomerId: "cus_existing_456" },
      });

      vi.spyOn(stripe.billingPortal.sessions, "create").mockResolvedValueOnce({
        url: "https://billing.stripe.com/p/session/portal_test_mock",
      } as any);

      const res = await request(app)
        .post(`/api/v1/organizations/${org.id}/billing/portal`)
        .set("Cookie", alice.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.portalUrl).toBe(
        "https://billing.stripe.com/p/session/portal_test_mock",
      );
    });
  });

  describe("Server-Side Entitlement & Limit Enforcement", () => {
    it("enforces Free plan project limit and rejects extra projects", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      // Create up to FREE limit (3)
      for (let i = 1; i <= env.FREE_MAX_PROJECTS; i++) {
        const createRes = await request(app)
          .post(`/api/v1/organizations/${org.id}/projects`)
          .set("Cookie", alice.cookie)
          .send({ name: `Project ${i}` });
        expect(createRes.status).toBe(201);
      }

      // Attempt to create 1 more project beyond limit
      const overflowRes = await request(app)
        .post(`/api/v1/organizations/${org.id}/projects`)
        .set("Cookie", alice.cookie)
        .send({ name: "Overflow Project" });

      expect(overflowRes.status).toBe(403);
      expect(overflowRes.body.success).toBe(false);
      expect(overflowRes.body.error.code).toBe("PLAN_LIMIT_EXCEEDED");
      expect(overflowRes.body.error.message).toContain("Plan limit reached");
      expect(overflowRes.body.error.message).toContain(
        `${env.FREE_MAX_PROJECTS} active projects`,
      );
    });

    it("allows creating a new project after archiving an active project", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      let lastProjectId = "";
      for (let i = 1; i <= env.FREE_MAX_PROJECTS; i++) {
        const createRes = await request(app)
          .post(`/api/v1/organizations/${org.id}/projects`)
          .set("Cookie", alice.cookie)
          .send({ name: `Project ${i}` });
        expect(createRes.status).toBe(201);
        lastProjectId = createRes.body.data.project.id;
      }

      // Archive project 3
      const archiveRes = await request(app)
        .post(
          `/api/v1/organizations/${org.id}/projects/${lastProjectId}/archive`,
        )
        .set("Cookie", alice.cookie);
      expect(archiveRes.status).toBe(200);

      // Now create another active project should succeed
      const newRes = await request(app)
        .post(`/api/v1/organizations/${org.id}/projects`)
        .set("Cookie", alice.cookie)
        .send({ name: "New Active Project" });
      expect(newRes.status).toBe(201);

      // Attempting to restore the archived project should be blocked by limit
      const restoreRes = await request(app)
        .post(
          `/api/v1/organizations/${org.id}/projects/${lastProjectId}/restore`,
        )
        .set("Cookie", alice.cookie);
      expect(restoreRes.status).toBe(403);
      expect(restoreRes.body.error.code).toBe("PLAN_LIMIT_EXCEEDED");
    });

    it("enforces Free plan member limit and rejects extra members", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      // Alice is member 1. Add members up to FREE_MAX_MEMBERS (5)
      for (let i = 2; i <= env.FREE_MAX_MEMBERS; i++) {
        await registerUser(`user${i}@billing.com`, `User ${i}`);
        const addRes = await request(app)
          .post(`/api/v1/organizations/${org.id}/members`)
          .set("Cookie", alice.cookie)
          .send({ email: `user${i}@billing.com`, role: "MEMBER" });
        expect(addRes.status).toBe(201);
      }

      // Attempt to add 6th member
      await registerUser("overflow@billing.com", "Overflow User");
      const overflowRes = await request(app)
        .post(`/api/v1/organizations/${org.id}/members`)
        .set("Cookie", alice.cookie)
        .send({ email: "overflow@billing.com", role: "MEMBER" });

      expect(overflowRes.status).toBe(403);
      expect(overflowRes.body.error.code).toBe("PLAN_LIMIT_EXCEEDED");
      expect(overflowRes.body.error.message).toContain("Plan limit reached");
      expect(overflowRes.body.error.message).toContain(
        `${env.FREE_MAX_MEMBERS} members`,
      );
    });

    it("atomically enforces limit under concurrent project creation race conditions", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      // Create 2 projects (1 remaining slot before limit of 3)
      await request(app)
        .post(`/api/v1/organizations/${org.id}/projects`)
        .set("Cookie", alice.cookie)
        .send({ name: "Project One" });
      await request(app)
        .post(`/api/v1/organizations/${org.id}/projects`)
        .set("Cookie", alice.cookie)
        .send({ name: "Project Two" });

      // Launch 2 parallel requests attempting to fill the last remaining slot
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/v1/organizations/${org.id}/projects`)
          .set("Cookie", alice.cookie)
          .send({ name: "Concurrent Race Project A" }),
        request(app)
          .post(`/api/v1/organizations/${org.id}/projects`)
          .set("Cookie", alice.cookie)
          .send({ name: "Concurrent Race Project B" }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one must succeed (201) and one must be rejected (403 PLAN_LIMIT_EXCEEDED)
      expect(statuses).toEqual([201, 403]);

      const rejected = res1.status === 403 ? res1 : res2;
      expect(rejected.body.error.code).toBe("PLAN_LIMIT_EXCEEDED");

      // Verify total active projects in DB is exactly 3 (never 4)
      const totalProjects = await prisma.project.count({
        where: { organizationId: org.id, status: "ACTIVE" },
      });
      expect(totalProjects).toBe(3);
    });
  });

  describe("Pro Plan Elevation and Safe Downgrade Behavior", () => {
    it("allows creating projects beyond free limit when organization has active Pro subscription", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      // Upgrade to Pro in database
      await prisma.subscription.update({
        where: { organizationId: org.id },
        data: {
          plan: "PRO",
          status: "ACTIVE",
          stripeSubscriptionId: "sub_test_pro_123",
        },
      });

      // Create 4 projects (more than Free limit of 3)
      for (let i = 1; i <= 4; i++) {
        const res = await request(app)
          .post(`/api/v1/organizations/${org.id}/projects`)
          .set("Cookie", alice.cookie)
          .send({ name: `Pro Project ${i}` });
        expect(res.status).toBe(201);
      }

      const totalProjects = await prisma.project.count({
        where: { organizationId: org.id },
      });
      expect(totalProjects).toBe(4);
    });

    it("preserves all existing data upon downgrade while blocking new creation over limit", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      // Upgrade to Pro
      await prisma.subscription.update({
        where: { organizationId: org.id },
        data: {
          plan: "PRO",
          status: "ACTIVE",
          stripeSubscriptionId: "sub_test_pro_456",
        },
      });

      // Create 4 projects
      for (let i = 1; i <= 4; i++) {
        await request(app)
          .post(`/api/v1/organizations/${org.id}/projects`)
          .set("Cookie", alice.cookie)
          .send({ name: `Project ${i}` });
      }

      // Now simulate downgrade/cancellation
      await prisma.subscription.update({
        where: { organizationId: org.id },
        data: {
          plan: "FREE",
          status: "CANCELED",
          canceledAt: new Date(),
        },
      });

      // 1. Verify existing 4 projects are preserved and fully accessible
      const listRes = await request(app)
        .get(`/api/v1/organizations/${org.id}/projects`)
        .set("Cookie", alice.cookie);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.items).toHaveLength(4);

      // 2. Verify creating a 5th project is blocked because active count (4) >= Free limit (3)
      const createRes = await request(app)
        .post(`/api/v1/organizations/${org.id}/projects`)
        .set("Cookie", alice.cookie)
        .send({ name: "Project 5 Over Limit" });
      expect(createRes.status).toBe(403);
      expect(createRes.body.error.code).toBe("PLAN_LIMIT_EXCEEDED");
    });
  });

  describe("Stripe Webhook Processing & Idempotency", () => {
    it("rejects webhook requests with missing or invalid signatures", async () => {
      const res = await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", "invalid_signature")
        .send({ id: "evt_123", type: "checkout.session.completed" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("processes valid checkout.session.completed event and upgrades subscription", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      const eventPayload = {
        id: "evt_checkout_completed_1",
        object: "event",
        type: "checkout.session.completed",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "cs_test_session_1",
            object: "checkout.session",
            customer: "cus_webhook_test_1",
            subscription: "sub_webhook_test_1",
            metadata: {
              organizationId: org.id,
            },
          },
        },
      };

      const payloadString = JSON.stringify(eventPayload);
      const signature = signPayload(payloadString);

      // Mock stripe.subscriptions.retrieve
      vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValueOnce({
        id: "sub_webhook_test_1",
        status: "active",
        items: { data: [{ price: { id: "price_pro_test" } }] },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        cancel_at_period_end: false,
      } as any);

      const res = await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", signature)
        .set("Content-Type", "application/json")
        .send(payloadString);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.duplicate).toBe(false);

      // Verify subscription in database is now PRO and ACTIVE
      const sub = await prisma.subscription.findUnique({
        where: { organizationId: org.id },
      });
      expect(sub?.plan).toBe("PRO");
      expect(sub?.status).toBe("ACTIVE");
      expect(sub?.stripeCustomerId).toBe("cus_webhook_test_1");
      expect(sub?.stripeSubscriptionId).toBe("sub_webhook_test_1");
    });

    it("handles duplicate webhook deliveries idempotently without re-execution", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      const eventPayload = {
        id: "evt_idempotency_test_1",
        object: "event",
        type: "checkout.session.completed",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "cs_test_session_2",
            object: "checkout.session",
            customer: "cus_webhook_test_2",
            subscription: "sub_webhook_test_2",
            metadata: {
              organizationId: org.id,
            },
          },
        },
      };

      const payloadString = JSON.stringify(eventPayload);
      const signature = signPayload(payloadString);

      vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue({
        id: "sub_webhook_test_2",
        status: "active",
        items: { data: [{ price: { id: "price_pro_test" } }] },
        cancel_at_period_end: false,
      } as any);

      // First delivery
      const res1 = await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", signature)
        .set("Content-Type", "application/json")
        .send(payloadString);
      expect(res1.status).toBe(200);
      expect(res1.body.duplicate).toBe(false);

      // Second delivery with identical event ID
      const res2 = await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", signature)
        .set("Content-Type", "application/json")
        .send(payloadString);
      expect(res2.status).toBe(200);
      expect(res2.body.duplicate).toBe(true);

      // Verify webhook event recorded exactly once in database
      const events = await prisma.webhookEvent.findMany({
        where: { id: "evt_idempotency_test_1" },
      });
      expect(events).toHaveLength(1);
    });

    it("handles customer.subscription.deleted event by canceling subscription and downgrading", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      // Setup active Pro subscription
      await prisma.subscription.update({
        where: { organizationId: org.id },
        data: {
          plan: "PRO",
          status: "ACTIVE",
          stripeSubscriptionId: "sub_delete_test",
        },
      });

      const eventPayload = {
        id: "evt_sub_deleted_1",
        object: "event",
        type: "customer.subscription.deleted",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "sub_delete_test",
            object: "subscription",
            status: "canceled",
            canceled_at: Math.floor(Date.now() / 1000),
          },
        },
      };

      const payloadString = JSON.stringify(eventPayload);
      const signature = signPayload(payloadString);

      const res = await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", signature)
        .set("Content-Type", "application/json")
        .send(payloadString);

      expect(res.status).toBe(200);

      const sub = await prisma.subscription.findUnique({
        where: { organizationId: org.id },
      });
      expect(sub?.plan).toBe("FREE");
      expect(sub?.status).toBe("CANCELED");
    });

    it("handles invoice payment events: payment_failed marks PAST_DUE and payment_succeeded marks ACTIVE", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      await prisma.subscription.update({
        where: { organizationId: org.id },
        data: {
          plan: "PRO",
          status: "ACTIVE",
          stripeSubscriptionId: "sub_invoice_test",
        },
      });

      // 1. Payment failure
      const failPayload = {
        id: "evt_invoice_fail_1",
        object: "event",
        type: "invoice.payment_failed",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "in_fail_1",
            object: "invoice",
            subscription: "sub_invoice_test",
          },
        },
      };
      const failStr = JSON.stringify(failPayload);
      const failRes = await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", signPayload(failStr))
        .set("Content-Type", "application/json")
        .send(failStr);
      expect(failRes.status).toBe(200);

      let sub = await prisma.subscription.findUnique({
        where: { organizationId: org.id },
      });
      expect(sub?.status).toBe("PAST_DUE");

      // 2. Subsequent payment success
      const succPayload = {
        id: "evt_invoice_succ_1",
        object: "event",
        type: "invoice.payment_succeeded",
        created: Math.floor(Date.now() / 1000) + 10,
        data: {
          object: {
            id: "in_succ_1",
            object: "invoice",
            subscription: "sub_invoice_test",
          },
        },
      };
      const succStr = JSON.stringify(succPayload);
      const succRes = await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", signPayload(succStr))
        .set("Content-Type", "application/json")
        .send(succStr);
      expect(succRes.status).toBe(200);

      sub = await prisma.subscription.findUnique({
        where: { organizationId: org.id },
      });
      expect(sub?.status).toBe("ACTIVE");
    });

    it("safely handles irrelevant or unhandled Stripe events", async () => {
      const eventPayload = {
        id: "evt_unhandled_1",
        object: "event",
        type: "payment_intent.created",
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: "pi_test" } },
      };

      const payloadString = JSON.stringify(eventPayload);
      const signature = signPayload(payloadString);

      const res = await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", signature)
        .set("Content-Type", "application/json")
        .send(payloadString);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });

    it("prevents out-of-order delayed events from regressing a canceled subscription", async () => {
      const alice = await registerUser("alice@billing.com", "Alice");
      const org = await createTestOrg(alice.cookie, "Alice Org", "alice-org");

      // Subscription was canceled at t = 2000
      const cancellationTime = new Date("2026-10-10T12:00:00Z");
      await prisma.subscription.update({
        where: { organizationId: org.id },
        data: {
          plan: "FREE",
          status: "CANCELED",
          canceledAt: cancellationTime,
          stripeSubscriptionId: "sub_stale_test",
        },
      });

      // A delayed event from t = 1000 (before cancellation) arrives now
      const delayedEvent = {
        id: "evt_delayed_stale_1",
        object: "event",
        type: "customer.subscription.updated",
        created: Math.floor(cancellationTime.getTime() / 1000) - 300, // 5 mins before cancellation
        data: {
          object: {
            id: "sub_stale_test",
            object: "subscription",
            status: "active",
            metadata: { organizationId: org.id },
            items: { data: [{ price: { id: "price_pro" } }] },
            cancel_at_period_end: false,
          },
        },
      };

      const payloadString = JSON.stringify(delayedEvent);
      const signature = signPayload(payloadString);

      const res = await request(app)
        .post("/api/v1/billing/webhook")
        .set("stripe-signature", signature)
        .set("Content-Type", "application/json")
        .send(payloadString);

      expect(res.status).toBe(200);

      // Verify the subscription remains CANCELED and was NOT resurrected
      const sub = await prisma.subscription.findUnique({
        where: { organizationId: org.id },
      });
      expect(sub?.status).toBe("CANCELED");
      expect(sub?.plan).toBe("FREE");
    });
  });
});

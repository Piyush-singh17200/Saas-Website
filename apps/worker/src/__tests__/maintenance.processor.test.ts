import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@workspace/database";
import { randomUUID } from "node:crypto";
import { processInvitationExpiryJob } from "../processors/invitation-expiry.processor.js";
import { processCleanupJob } from "../processors/cleanup.processor.js";
import { processBillingReconciliationJob } from "../processors/billing-reconciliation.processor.js";

describe("Maintenance, Cleanup & Billing Processors", () => {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_test?schema=public",
      },
    },
  });

  let testOrgId: string;
  let testUserId: string;

  beforeAll(async () => {
    await (db as any).outboxMessage.deleteMany();
    await (db as any).notification.deleteMany();
    await db.session.deleteMany();
    await db.invitation.deleteMany();
    await db.subscription.deleteMany();
    await db.membership.deleteMany();
    await db.organization.deleteMany();
    await db.user.deleteMany();

    const user = await db.user.create({
      data: {
        id: randomUUID(),
        email: "maint.user@example.com",
        passwordHash: "hash-maint",
        displayName: "Maintenance User",
      },
    });
    testUserId = user.id;

    const org = await db.organization.create({
      data: {
        id: randomUUID(),
        name: "Maint Org",
        slug: "maint-org",
        creatorId: testUserId,
        memberships: {
          create: {
            userId: testUserId,
            role: "OWNER",
            status: "ACTIVE",
          },
        },
      },
    });
    testOrgId = org.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe("Invitation Expiry", () => {
    it("expires only past-due unaccepted invitations and preserves audit records", async () => {
      const now = new Date();

      // 1. Expired invitation (should be revoked)
      const expiredInvite = await db.invitation.create({
        data: {
          id: randomUUID(),
          organizationId: testOrgId,
          email: "expired@example.com",
          tokenHash: "hash-expired-1",
          inviterId: testUserId,
          expiresAt: new Date(now.getTime() - 3600000), // 1 hour ago
        },
      });

      // 2. Active invitation (should NOT be revoked)
      const activeInvite = await db.invitation.create({
        data: {
          id: randomUUID(),
          organizationId: testOrgId,
          email: "active@example.com",
          tokenHash: "hash-active-1",
          inviterId: testUserId,
          expiresAt: new Date(now.getTime() + 86400000), // tomorrow
        },
      });

      // 3. Accepted invitation (should NOT be modified)
      const acceptedInvite = await db.invitation.create({
        data: {
          id: randomUUID(),
          organizationId: testOrgId,
          email: "accepted@example.com",
          tokenHash: "hash-accepted-1",
          inviterId: testUserId,
          expiresAt: new Date(now.getTime() - 3600000),
          acceptedAt: new Date(now.getTime() - 7200000),
        },
      });

      // Run sweep job
      const result = await processInvitationExpiryJob({
        id: "sweep-1",
        data: { sweepOnly: true },
      } as any);

      expect(result.status).toBe("sweep_completed");
      expect(result.expiredCount).toBeGreaterThanOrEqual(1);

      // Verify expired invitation was revoked, NOT deleted
      const refreshedExpired = await db.invitation.findUnique({ where: { id: expiredInvite.id } });
      expect(refreshedExpired?.revokedAt).not.toBeNull();

      // Verify active invitation remains unrevoked
      const refreshedActive = await db.invitation.findUnique({ where: { id: activeInvite.id } });
      expect(refreshedActive?.revokedAt).toBeNull();

      // Verify accepted invitation remains unchanged
      const refreshedAccepted = await db.invitation.findUnique({ where: { id: acceptedInvite.id } });
      expect(refreshedAccepted?.acceptedAt).not.toBeNull();
      expect(refreshedAccepted?.revokedAt).toBeNull();

      // Verify repeated runs are safe and idempotent
      const secondSweep = await processInvitationExpiryJob({
        id: "sweep-2",
        data: { sweepOnly: true },
      } as any);
      expect(secondSweep.expiredCount).toBe(0);
    });
  });

  describe("Cleanup & Outbox Maintenance", () => {
    it("purges expired sessions beyond retention while keeping valid sessions intact", async () => {
      const now = new Date();

      // Session older than 30 days retention
      await db.session.create({
        data: {
          id: randomUUID(),
          userId: testUserId,
          tokenHash: "hash-old-sess",
          expiresAt: new Date(now.getTime() - 40 * 24 * 3600 * 1000),
        },
      });

      // Active valid session
      const validSession = await db.session.create({
        data: {
          id: randomUUID(),
          userId: testUserId,
          tokenHash: "hash-valid-sess",
          expiresAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
        },
      });

      const cleanupResult = await processCleanupJob({
        id: "cleanup-1",
        data: { retentionDays: 30, scope: "sessions" },
      } as any);

      expect(cleanupResult.status).toBe("completed");
      expect(cleanupResult.expiredSessionsCount).toBe(1);

      // Verify active session was NOT deleted
      const surviving = await db.session.findUnique({ where: { id: validSession.id } });
      expect(surviving).not.toBeNull();
    });
  });

  describe("Billing Reconciliation", () => {
    it("reconciles subscription state without granting unearned Pro access", async () => {
      const sub = await db.subscription.create({
        data: {
          id: randomUUID(),
          organizationId: testOrgId,
          plan: "FREE",
          status: "ACTIVE",
        },
      });

      const reconResult = await processBillingReconciliationJob({
        id: "recon-1",
        data: {
          organizationId: testOrgId,
        },
      } as any);

      expect(reconResult.status).toBe("reconciled");
      expect(reconResult.plan).toBe("FREE");

      const refreshed = await db.subscription.findUnique({ where: { id: sub.id } });
      expect(refreshed?.plan).toBe("FREE"); // Did NOT unearned grant PRO
    });
  });
});

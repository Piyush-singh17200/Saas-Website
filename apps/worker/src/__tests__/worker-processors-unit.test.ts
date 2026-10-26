import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnrecoverableError, type Job } from "bullmq";
import { processWebhookDeliveryJob } from "../processors/webhook.processor.js";
import { processNotificationJob } from "../processors/notification.processor.js";
import { processInvitationExpiryJob } from "../processors/invitation-expiry.processor.js";
import { prisma, withTenantTransaction } from "@workspace/database";
import * as ssrfModule from "../lib/ssrf.js";

// Mock database methods
vi.mock("@workspace/database", () => {
  const mockPrisma = {
    webhookSubscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    webhookDelivery: {
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    membership: {
      findFirst: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    invitation: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return {
    prisma: mockPrisma,
    withTenantTransaction: vi.fn(async (_orgId, callback) =>
      callback(mockPrisma),
    ),
    withAdminBypassTransaction: vi.fn(async (callback) => callback(mockPrisma)),
  };
});

describe("Worker Processors Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Webhook Delivery Processor", () => {
    it("rejects invalid payload with UnrecoverableError", async () => {
      const mockJob = {
        id: "job-1",
        data: { invalidField: true },
      } as unknown as Job<any>;

      await expect(processWebhookDeliveryJob(mockJob)).rejects.toThrow(
        UnrecoverableError,
      );
    });

    it("skips delivery if subscription is not found", async () => {
      vi.mocked(prisma.webhookSubscription.findUnique).mockResolvedValueOnce(
        null,
      );

      const mockJob = {
        id: "job-2",
        data: {
          subscriptionId: "11111111-1111-1111-1111-111111111111",
          deliveryId: "22222222-2222-2222-2222-222222222222",
          organizationId: "44444444-4444-4444-4444-444444444444",
          event: {
            id: "33333333-3333-3333-3333-333333333333",
            type: "task.created",
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            organizationId: "44444444-4444-4444-4444-444444444444",
            resourceId: "55555555-5555-5555-5555-555555555555",
            payload: { title: "Test Task" },
          },
          attempt: 1,
        },
      } as unknown as Job<any>;

      const result = await processWebhookDeliveryJob(mockJob);
      expect(result).toEqual({
        status: "skipped",
        reason: "subscription_deleted",
      });
    });

    it("skips delivery if subscription is marked inactive", async () => {
      vi.mocked(prisma.webhookSubscription.findUnique).mockResolvedValueOnce({
        id: "11111111-1111-1111-1111-111111111111",
        url: "https://example.com/webhook",
        secret: "whsec_test123",
        isActive: false,
        consecutiveFailures: 10,
        organizationId: "44444444-4444-4444-4444-444444444444",
      } as any);

      const mockJob = {
        id: "job-3",
        data: {
          subscriptionId: "11111111-1111-1111-1111-111111111111",
          deliveryId: "22222222-2222-2222-2222-222222222222",
          organizationId: "44444444-4444-4444-4444-444444444444",
          event: {
            id: "33333333-3333-3333-3333-333333333333",
            type: "task.created",
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            organizationId: "44444444-4444-4444-4444-444444444444",
            resourceId: "55555555-5555-5555-5555-555555555555",
            payload: { title: "Test Task" },
          },
          attempt: 1,
        },
      } as unknown as Job<any>;

      const result = await processWebhookDeliveryJob(mockJob);
      expect(result).toEqual({
        status: "skipped",
        reason: "subscription_inactive",
      });
    });

    it("dispatches webhook and records SUCCESS on HTTP 200", async () => {
      vi.mocked(prisma.webhookSubscription.findUnique).mockResolvedValueOnce({
        id: "11111111-1111-1111-1111-111111111111",
        url: "https://webhook.site/receiver",
        secret: "whsec_test_secret_abc123",
        isActive: true,
        consecutiveFailures: 2,
        organizationId: "44444444-4444-4444-4444-444444444444",
      } as any);

      const spySend = vi
        .spyOn(ssrfModule, "sendSafeWebhookRequest")
        .mockResolvedValueOnce({
          success: true,
          statusCode: 200,
          durationMs: 45,
        });

      const mockJob = {
        id: "job-4",
        data: {
          subscriptionId: "11111111-1111-1111-1111-111111111111",
          deliveryId: "22222222-2222-2222-2222-222222222222",
          organizationId: "44444444-4444-4444-4444-444444444444",
          event: {
            id: "33333333-3333-3333-3333-333333333333",
            type: "task.created",
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            organizationId: "44444444-4444-4444-4444-444444444444",
            resourceId: "55555555-5555-5555-5555-555555555555",
            payload: { title: "Test Task" },
          },
          attempt: 1,
        },
      } as unknown as Job<any>;

      const result = await processWebhookDeliveryJob(mockJob);
      expect(result.status).toBe("success");
      expect(result.statusCode).toBe(200);
      expect(spySend).toHaveBeenCalled();
      expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "22222222-2222-2222-2222-222222222222" },
          data: expect.objectContaining({
            status: "SUCCESS",
            statusCode: 200,
          }),
        }),
      );
      expect(prisma.webhookSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "11111111-1111-1111-1111-111111111111" },
          data: { consecutiveFailures: 0 },
        }),
      );
    });

    it("commits failure health before throwing a retry error", async () => {
      let callbackErrored = false;
      vi.mocked(withTenantTransaction).mockImplementationOnce(
        async (_orgId, callback) => {
          try {
            return await callback(prisma as any);
          } catch (err) {
            callbackErrored = true;
            throw err;
          }
        },
      );

      vi.mocked(prisma.webhookSubscription.findUnique).mockResolvedValueOnce({
        id: "11111111-1111-1111-1111-111111111111",
        url: "https://example.com/webhook",
        secret: "whsec_test_secret_abc123",
        isActive: true,
        consecutiveFailures: 3,
        organizationId: "44444444-4444-4444-4444-444444444444",
      } as any);

      vi.spyOn(ssrfModule, "sendSafeWebhookRequest").mockResolvedValueOnce({
        success: false,
        statusCode: 503,
        durationMs: 20,
        errorMessage: "upstream unavailable",
      });

      const mockJob = {
        id: "job-webhook-failure",
        data: {
          subscriptionId: "11111111-1111-1111-1111-111111111111",
          deliveryId: "22222222-2222-2222-2222-222222222222",
          organizationId: "44444444-4444-4444-4444-444444444444",
          event: {
            id: "33333333-3333-3333-3333-333333333333",
            type: "task.created",
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            organizationId: "44444444-4444-4444-4444-444444444444",
            resourceId: "55555555-5555-5555-5555-555555555555",
            payload: { title: "Test Task" },
          },
          attempt: 1,
        },
      } as unknown as Job<any>;

      await expect(processWebhookDeliveryJob(mockJob)).rejects.toThrow(
        "Webhook dispatch failed: upstream unavailable",
      );

      // The callback must return normally so Prisma commits the failure state;
      // the retry error is raised after the transaction closes.
      expect(callbackErrored).toBe(false);
      expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "22222222-2222-2222-2222-222222222222" },
          data: expect.objectContaining({ status: "FAILED" }),
        }),
      );
      expect(prisma.webhookSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "11111111-1111-1111-1111-111111111111" },
          data: { consecutiveFailures: 4, isActive: true },
        }),
      );
    });
  });

  describe("Notification Processor", () => {
    it("rejects invalid payload with UnrecoverableError", async () => {
      const mockJob = {
        id: "job-notif-1",
        data: {},
      } as unknown as Job<any>;

      await expect(processNotificationJob(mockJob)).rejects.toThrow(
        UnrecoverableError,
      );
    });

    it("skips notification if recipient is disabled", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        email: "disabled@example.com",
        displayName: "Disabled User",
        status: "DISABLED",
      } as any);

      const mockJob = {
        id: "job-notif-2",
        data: {
          organizationId: "44444444-4444-4444-4444-444444444444",
          recipientUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          type: "TASK_ASSIGNED",
          title: "New Task Assigned",
          body: "You have been assigned to Task A",
          idempotencyKey: "notif-idem-key-1",
        },
      } as unknown as Job<any>;

      const result = await processNotificationJob(mockJob);
      expect(result).toEqual({
        status: "skipped",
        reason: "recipient_ineligible",
      });
    });

    it("skips notification if recipient is not a member of the organization", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        email: "user@example.com",
        displayName: "Active User",
        status: "ACTIVE",
      } as any);

      vi.mocked(prisma.membership.findFirst).mockResolvedValueOnce(null);

      const mockJob = {
        id: "job-notif-3",
        data: {
          organizationId: "44444444-4444-4444-4444-444444444444",
          recipientUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          type: "TASK_ASSIGNED",
          title: "New Task Assigned",
          body: "You have been assigned to Task A",
          idempotencyKey: "notif-idem-key-2",
        },
      } as unknown as Job<any>;

      const result = await processNotificationJob(mockJob);
      expect(result).toEqual({
        status: "rejected",
        reason: "recipient_not_member",
      });
    });
  });

  describe("Invitation Expiry Processor", () => {
    it("sweeps expired invitations and updates revokedAt without data loss", async () => {
      vi.mocked(prisma.invitation.updateMany).mockResolvedValueOnce({
        count: 3,
      } as any);

      const mockJob = {
        id: "job-inv-1",
        data: { sweepOnly: true },
      } as unknown as Job<any>;

      const result = await processInvitationExpiryJob(mockJob);
      expect(result.status).toBe("sweep_completed");
      expect(result.expiredCount).toBe(3);
      expect(prisma.invitation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            acceptedAt: null,
            revokedAt: null,
          }),
        }),
      );
    });
  });
});

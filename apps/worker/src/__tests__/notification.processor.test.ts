import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@workspace/database";
import { randomUUID } from "node:crypto";
import { UnrecoverableError } from "bullmq";
import { processNotificationJob } from "../processors/notification.processor.js";
import { emailProvider } from "../services/email.service.js";
import { testDatabaseUrl } from "./test-env.js";

describe("Notification Processor & Tenant Isolation", () => {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: testDatabaseUrl,
      },
    },
  });

  let dbAvailable = false;
  let orgAId: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    try {
      await db.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
      return;
    }

    // Clean fixtures
    await (db as any).outboxMessage.deleteMany();
    await (db as any).notification.deleteMany();
    await db.membership.deleteMany();
    await db.organization.deleteMany();
    await db.user.deleteMany();

    // Create users
    const userA = await db.user.create({
      data: {
        id: randomUUID(),
        email: "alice.worker@example.com",
        passwordHash: "hash-a",
        displayName: "Alice Worker",
      },
    });
    userAId = userA.id;

    const userB = await db.user.create({
      data: {
        id: randomUUID(),
        email: "bob.worker@example.com",
        passwordHash: "hash-b",
        displayName: "Bob Worker",
      },
    });
    userBId = userB.id;

    // Create Org A (Alice is member)
    const orgA = await db.organization.create({
      data: {
        id: randomUUID(),
        name: "Org Alpha",
        slug: "org-alpha-worker",
        creatorId: userAId,
        memberships: {
          create: {
            userId: userAId,
            role: "OWNER",
            status: "ACTIVE",
          },
        },
      },
    });
    orgAId = orgA.id;

    // Create Org B (Bob is member)
    await db.organization.create({
      data: {
        id: randomUUID(),
        name: "Org Beta",
        slug: "org-beta-worker",
        creatorId: userBId,
        memberships: {
          create: {
            userId: userBId,
            role: "OWNER",
            status: "ACTIVE",
          },
        },
      },
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach((ctx) => {
    if (!dbAvailable) {
      ctx.skip();
    }
  });

  it("successfully processes valid notification job and dispatches simulated email", async () => {
    emailProvider.clearSentMessages();
    const idempotencyKey = `notif-test-${Date.now()}`;

    const job: any = {
      id: "job-valid-1",
      data: {
        type: "TASK_ASSIGNED",
        organizationId: orgAId,
        recipientUserId: userAId,
        title: "New Task Assigned",
        body: "You have been assigned to Task 1",
        idempotencyKey,
      },
    };

    const result = await processNotificationJob(job);
    expect(result.status).toBe("success");
    expect(result.notificationId).toBeDefined();

    // Verify database record
    const record = await (db as any).notification.findFirst({
      where: { organizationId: orgAId, idempotencyKey },
    });
    expect(record).not.toBeNull();
    expect(record.title).toBe("New Task Assigned");

    // Verify simulated email
    const emails = emailProvider.getSentMessages();
    expect(emails.length).toBeGreaterThan(0);
    expect(emails[emails.length - 1]?.to).toBe("alice.worker@example.com");
  });

  it("rejects invalid payloads with UnrecoverableError to prevent infinite retries", async () => {
    const invalidJob: any = {
      id: "job-invalid-1",
      data: {
        type: "INVALID_TYPE",
        organizationId: "not-a-uuid",
        // missing required fields
      },
    };

    await expect(processNotificationJob(invalidJob)).rejects.toThrow(
      UnrecoverableError,
    );
  });

  it("enforces tenant isolation: rejects job attempting to deliver Org A notification to Bob (member of Org B only)", async () => {
    const idempotencyKey = `notif-cross-tenant-${Date.now()}`;

    const crossTenantJob: any = {
      id: "job-cross-tenant",
      data: {
        type: "TASK_ASSIGNED",
        organizationId: orgAId, // Org Alpha
        recipientUserId: userBId, // Bob is only in Org Beta!
        title: "Secret Org Alpha Task",
        body: "Confidential details",
        idempotencyKey,
      },
    };

    const result = await processNotificationJob(crossTenantJob);
    expect(result.status).toBe("rejected");
    expect(result.reason).toBe("recipient_not_member");

    // Verify no notification was created for Bob in Org A
    const record = await (db as any).notification.findFirst({
      where: { organizationId: orgAId, userId: userBId },
    });
    expect(record).toBeNull();
  });

  it("guarantees idempotency: duplicate job execution skips duplicate side effects", async () => {
    const idempotencyKey = `notif-idempotent-${Date.now()}`;

    const job: any = {
      id: "job-idempotent-1",
      data: {
        type: "TASK_ASSIGNED",
        organizationId: orgAId,
        recipientUserId: userAId,
        title: "Idempotent Task Notification",
        body: "Notification body",
        idempotencyKey,
      },
    };

    // First execution
    const firstResult = await processNotificationJob(job);
    expect(firstResult.status).toBe("success");

    emailProvider.clearSentMessages();

    // Second execution with identical payload and idempotencyKey
    const secondResult = await processNotificationJob(job);
    expect(secondResult.status).toBe("idempotent_skip");
    expect(secondResult.notificationId).toBe(firstResult.notificationId);

    // No duplicate email dispatched
    expect(emailProvider.getSentMessages()).toHaveLength(0);

    // Exactly one database row exists
    const count = await (db as any).notification.count({
      where: { organizationId: orgAId, idempotencyKey },
    });
    expect(count).toBe(1);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@workspace/database";
import { createApp } from "../app.js";
import { randomUUID } from "node:crypto";
import { createSession } from "../services/session.service.js";
import { env } from "../config/env.js";

describe("Notifications API & Asynchronous Outbox Integration", () => {
  const app = createApp();
  const db = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_test?schema=public",
      },
    },
  });

  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    // Clean fixtures
    await (db as any).outboxMessage.deleteMany();
    await (db as any).notification.deleteMany();
    await db.comment.deleteMany();
    await db.task.deleteMany();
    await db.project.deleteMany();
    await db.session.deleteMany();
    await db.membership.deleteMany();
    await db.organization.deleteMany();
    await db.user.deleteMany();

    // Create User A
    const userA = await db.user.create({
      data: {
        id: randomUUID(),
        email: "alice.notif@example.com",
        passwordHash: "hash-a",
        displayName: "Alice Notifications",
      },
    });
    userAId = userA.id;
    const sessionA = await createSession(userAId);
    userACookie = `${env.SESSION_COOKIE_NAME}=${sessionA.rawToken}`;

    // Create User B
    const userB = await db.user.create({
      data: {
        id: randomUUID(),
        email: "bob.notif@example.com",
        passwordHash: "hash-b",
        displayName: "Bob Notifications",
      },
    });
    userBId = userB.id;
    const sessionB = await createSession(userBId);
    userBCookie = `${env.SESSION_COOKIE_NAME}=${sessionB.rawToken}`;

    // Create Org A (Alice is OWNER, Bob is MEMBER)
    const orgA = await db.organization.create({
      data: {
        id: randomUUID(),
        name: "Org Alpha Notif",
        slug: "org-alpha-notif",
        creatorId: userAId,
        memberships: {
          createMany: {
            data: [
              { userId: userAId, role: "OWNER", status: "ACTIVE" },
              { userId: userBId, role: "MEMBER", status: "ACTIVE" },
            ],
          },
        },
      },
    });
    orgAId = orgA.id;

    // Create Org B (Bob is OWNER only)
    const orgB = await db.organization.create({
      data: {
        id: randomUUID(),
        name: "Org Beta Notif",
        slug: "org-beta-notif",
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
    orgBId = orgB.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("lists notifications for current user scoped by organization", async () => {
    // Seed notification for Bob in Org A
    await (db as any).notification.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        userId: userBId,
        type: "TASK_ASSIGNED",
        title: "Test Task 1 Assigned",
        body: "Alice assigned you to task 1",
        idempotencyKey: `notif-seed-1`,
      },
    });

    const res = await request(app)
      .get(`/api/v1/organizations/${orgAId}/notifications`)
      .set("Cookie", [userBCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.notifications).toHaveLength(1);
    expect(res.body.data.notifications[0].title).toBe("Test Task 1 Assigned");
    expect(res.body.data.unreadCount).toBe(1);
  });

  it("enforces tenant isolation: Alice cannot view Bob's notifications in Org B where she is not a member", async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgBId}/notifications`)
      .set("Cookie", [userACookie]);

    // Returns non-disclosing 404 to avoid tenant discovery
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("marks a notification as read and reflects in unreadCount", async () => {
    const notif = await (db as any).notification.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        userId: userBId,
        type: "TASK_ASSIGNED",
        title: "To Be Read",
        body: "Unread notification",
        idempotencyKey: `notif-seed-2`,
      },
    });

    const res = await request(app)
      .patch(`/api/v1/organizations/${orgAId}/notifications/${notif.id}/read`)
      .set("Cookie", [userBCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.readAt).not.toBeNull();

    // Verify unread filter
    const listRes = await request(app)
      .get(`/api/v1/organizations/${orgAId}/notifications?unreadOnly=true`)
      .set("Cookie", [userBCookie]);

    const ids = listRes.body.data.notifications.map((n: any) => n.id);
    expect(ids).not.toContain(notif.id);
  });

  it("marks all unread notifications as read via /read-all endpoint", async () => {
    await (db as any).notification.createMany({
      data: [
        {
          id: randomUUID(),
          organizationId: orgAId,
          userId: userBId,
          type: "TASK_ASSIGNED",
          title: "Batch 1",
          body: "Batch 1 body",
          idempotencyKey: `batch-1`,
        },
        {
          id: randomUUID(),
          organizationId: orgAId,
          userId: userBId,
          type: "TASK_ASSIGNED",
          title: "Batch 2",
          body: "Batch 2 body",
          idempotencyKey: `batch-2`,
        },
      ],
    });

    const res = await request(app)
      .post(`/api/v1/organizations/${orgAId}/notifications/read-all`)
      .set("Cookie", [userBCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBeGreaterThanOrEqual(2);
  });
});

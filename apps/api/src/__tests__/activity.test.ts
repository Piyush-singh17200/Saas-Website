import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "@workspace/database";

describe("Activity Log API", () => {
  const app = createApp();

  beforeEach(async () => {
    await prisma.activityLog.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
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

  it("records and queries tenant-scoped activity without leaking secrets", async () => {
    const alice = await registerUser("alice@activity.com", "Alice");
    const bob = await registerUser("bob@activity.com", "Bob");

    // Alice creates Org A
    const orgARes = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", alice.cookie)
      .send({ name: "Activity Tenant A", slug: "act-a" });
    const orgAId = orgARes.body.data.organization.id;

    // Bob creates Org B
    const orgBRes = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", bob.cookie)
      .send({ name: "Activity Tenant B", slug: "act-b" });
    const orgBId = orgBRes.body.data.organization.id;

    // Alice creates project & task in Org A
    const projRes = await request(app)
      .post(`/api/v1/organizations/${orgAId}/projects`)
      .set("Cookie", alice.cookie)
      .send({ name: "Roadmap 2026" });
    const projectId = projRes.body.data.project.id;

    const taskRes = await request(app)
      .post(`/api/v1/organizations/${orgAId}/projects/${projectId}/tasks`)
      .set("Cookie", alice.cookie)
      .send({ title: "Q1 Launch" });
    const taskId = taskRes.body.data.task.id;

    // Alice queries Org A activity
    const activityRes = await request(app)
      .get(`/api/v1/organizations/${orgAId}/activity`)
      .set("Cookie", alice.cookie);

    expect(activityRes.status).toBe(200);
    expect(activityRes.body.data.items.length).toBeGreaterThanOrEqual(2);

    const eventTypes = activityRes.body.data.items.map(
      (i: { eventType: string }) => i.eventType,
    );
    expect(eventTypes).toContain("PROJECT_CREATED");
    expect(eventTypes).toContain("TASK_CREATED");

    // Verify metadata does not contain sensitive tokens or passwords
    for (const item of activityRes.body.data.items) {
      const meta = item.metadata || {};
      expect(meta.password).toBeUndefined();
      expect(meta.token).toBeUndefined();
      expect(meta.passwordHash).toBeUndefined();
    }

    // Filter by task
    const taskFiltered = await request(app)
      .get(`/api/v1/organizations/${orgAId}/activity?taskId=${taskId}`)
      .set("Cookie", alice.cookie);

    expect(taskFiltered.status).toBe(200);
    expect(taskFiltered.body.data.items).toHaveLength(1);
    expect(taskFiltered.body.data.items[0].eventType).toBe("TASK_CREATED");

    // Cross-tenant: Bob cannot see Org A's activity stream
    const crossRes = await request(app)
      .get(`/api/v1/organizations/${orgAId}/activity`)
      .set("Cookie", bob.cookie);

    expect(crossRes.status).toBe(404);

    // Org B's activity is completely isolated and does not contain Org A's events
    const orgBActivity = await request(app)
      .get(`/api/v1/organizations/${orgBId}/activity`)
      .set("Cookie", bob.cookie);
    expect(orgBActivity.status).toBe(200);
    expect(orgBActivity.body.data.items).toHaveLength(0);
  });
});

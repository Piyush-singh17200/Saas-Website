import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "@workspace/database";

describe("Comments API", () => {
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

  async function setupFixture() {
    const alice = await registerUser("alice@comments.com", "Alice");
    const bob = await registerUser("bob@comments.com", "Bob");

    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", alice.cookie)
      .send({ name: "Comment Org", slug: "comment-org" });
    const orgId = orgRes.body.data.organization.id;

    // Add Bob to org
    await prisma.membership.create({
      data: {
        organizationId: orgId,
        userId: bob.user.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });

    const projRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects`)
      .set("Cookie", alice.cookie)
      .send({ name: "App Development", slug: "app-dev" });
    const projectId = projRes.body.data.project.id;

    const taskRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
      .set("Cookie", alice.cookie)
      .send({ title: "Build Authentication" });
    const taskId = taskRes.body.data.task.id;

    return { alice, bob, orgId, projectId, taskId };
  }

  it("creates a comment and includes author metadata", async () => {
    const { alice, orgId, projectId, taskId } = await setupFixture();

    const res = await request(app)
      .post(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments`,
      )
      .set("Cookie", alice.cookie)
      .send({ body: "Please ensure token hashing follows SHA-256 standard." });

    expect(res.status).toBe(201);
    expect(res.body.data.comment.body).toBe(
      "Please ensure token hashing follows SHA-256 standard.",
    );
    expect(res.body.data.comment.author.email).toBe("alice@comments.com");

    // Verify activity recorded
    const activities = await prisma.activityLog.findMany({
      where: { organizationId: orgId, eventType: "COMMENT_CREATED" },
    });
    expect(activities).toHaveLength(1);
    expect(activities[0]?.entityId).toBe(res.body.data.comment.id);
  });

  it("rejects empty comments with validation error", async () => {
    const { alice, orgId, projectId, taskId } = await setupFixture();

    const res = await request(app)
      .post(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments`,
      )
      .set("Cookie", alice.cookie)
      .send({ body: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("enforces edit authorization: non-authors cannot edit someone else's comment", async () => {
    const { alice, bob, orgId, projectId, taskId } = await setupFixture();

    const createRes = await request(app)
      .post(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments`,
      )
      .set("Cookie", alice.cookie)
      .send({ body: "Alice original comment" });

    const commentId = createRes.body.data.comment.id;

    // Bob attempts to edit Alice's comment
    const bobEdit = await request(app)
      .patch(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
      )
      .set("Cookie", bob.cookie)
      .send({ body: "Hacked comment text" });

    expect(bobEdit.status).toBe(403);

    // Alice edits her own comment
    const aliceEdit = await request(app)
      .patch(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
      )
      .set("Cookie", alice.cookie)
      .send({ body: "Alice edited text" });

    expect(aliceEdit.status).toBe(200);
    expect(aliceEdit.body.data.comment.body).toBe("Alice edited text");
  });

  it("soft-deletes comments and hides them from ordinary listings", async () => {
    const { alice, orgId, projectId, taskId } = await setupFixture();

    const createRes = await request(app)
      .post(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments`,
      )
      .set("Cookie", alice.cookie)
      .send({ body: "Temporary comment" });

    const commentId = createRes.body.data.comment.id;

    // Delete comment
    const delRes = await request(app)
      .delete(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
      )
      .set("Cookie", alice.cookie);

    expect(delRes.status).toBe(200);

    // Listing comments must not return the soft-deleted comment
    const listRes = await request(app)
      .get(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments`,
      )
      .set("Cookie", alice.cookie);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items).toHaveLength(0);

    // Verify row still exists in database with deletedAt populated
    const dbComment = await prisma.comment.findUnique({
      where: { id: commentId },
    });
    expect(dbComment?.deletedAt).not.toBeNull();
  });
});

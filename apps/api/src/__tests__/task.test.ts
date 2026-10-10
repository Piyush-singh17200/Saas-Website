import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "@workspace/database";

describe("Tasks API & Optimistic Concurrency Control", () => {
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

  async function setupOrgAndProject(ownerCookie: string) {
    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", ownerCookie)
      .send({ name: "Task Org", slug: "task-org" });
    const orgId = orgRes.body.data.organization.id;

    const projRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects`)
      .set("Cookie", ownerCookie)
      .send({ name: "Sprint 1", slug: "sprint-1" });
    const projectId = projRes.body.data.project.id;

    return { orgId, projectId };
  }

  it("creates a task and sets completedAt when status is DONE", async () => {
    const alice = await registerUser("alice@tasks.com", "Alice");
    const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

    // Create TODO task
    const todoRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
      .set("Cookie", alice.cookie)
      .send({
        title: "Setup CI Pipeline",
        description: "Configure GitHub Actions workflow",
        priority: "HIGH",
        status: "TODO",
      });

    expect(todoRes.status).toBe(201);
    expect(todoRes.body.data.task.title).toBe("Setup CI Pipeline");
    expect(todoRes.body.data.task.version).toBe(1);
    expect(todoRes.body.data.task.completedAt).toBeNull();

    // Create DONE task
    const doneRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
      .set("Cookie", alice.cookie)
      .send({
        title: "Initial Commit",
        status: "DONE",
      });

    expect(doneRes.status).toBe(201);
    expect(doneRes.body.data.task.completedAt).toBeDefined();
    expect(doneRes.body.data.task.completedAt).not.toBeNull();
  });

  it("manages status transitions: completing sets timestamp and reopening clears it", async () => {
    const alice = await registerUser("alice2@tasks.com", "Alice");
    const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

    const taskRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
      .set("Cookie", alice.cookie)
      .send({ title: "Feature Design", status: "IN_PROGRESS" });

    const taskId = taskRes.body.data.task.id;

    // Transition to DONE
    const completeRes = await request(app)
      .patch(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`,
      )
      .set("Cookie", alice.cookie)
      .send({ status: "DONE", version: 1 });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.task.status).toBe("DONE");
    expect(completeRes.body.data.task.completedAt).not.toBeNull();
    expect(completeRes.body.data.task.version).toBe(2);

    // Reopen task back to TODO
    const reopenRes = await request(app)
      .patch(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`,
      )
      .set("Cookie", alice.cookie)
      .send({ status: "TODO", version: 2 });

    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.data.task.status).toBe("TODO");
    expect(reopenRes.body.data.task.completedAt).toBeNull();
    expect(reopenRes.body.data.task.version).toBe(3);
  });

  it("prevents assigning users outside the organization", async () => {
    const alice = await registerUser("alice3@tasks.com", "Alice");
    const outsider = await registerUser("outsider@tasks.com", "Outsider");
    const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
      .set("Cookie", alice.cookie)
      .send({
        title: "Security Audit",
        assigneeId: outsider.user.id,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain(
      "Assignee must be an active member",
    );
  });

  it("enforces Optimistic Concurrency Control: rejects stale concurrent updates with 409", async () => {
    const alice = await registerUser("alice4@tasks.com", "Alice");
    const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

    const createRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
      .set("Cookie", alice.cookie)
      .send({ title: "Concurrent Target", priority: "MEDIUM" });

    const taskId = createRes.body.data.task.id;
    expect(createRes.body.data.task.version).toBe(1);

    // Alice updates task specifying version 1 -> succeeds, bumps to version 2
    const update1 = await request(app)
      .patch(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`,
      )
      .set("Cookie", alice.cookie)
      .send({ title: "Alice First Edit", version: 1 });

    expect(update1.status).toBe(200);
    expect(update1.body.data.task.version).toBe(2);

    // Bob attempts to update task with stale version 1 -> rejected with 409 Conflict
    const staleUpdate = await request(app)
      .patch(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`,
      )
      .set("Cookie", alice.cookie)
      .send({ title: "Stale Overwrite Attempt", version: 1 });

    expect(staleUpdate.status).toBe(409);
    expect(staleUpdate.body.error.code).toBe("CONFLICT");
    expect(staleUpdate.body.error.message).toContain(
      "modified by another user",
    );
  });

  it("proves two race-condition concurrent updates result in exactly one winner and one 409", async () => {
    const alice = await registerUser("alice5@tasks.com", "Alice");
    const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

    const createRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
      .set("Cookie", alice.cookie)
      .send({ title: "Parallel Race Target" });

    const taskId = createRes.body.data.task.id;

    // Fire two updates simultaneously both claiming version 1
    const [resA, resB] = await Promise.all([
      request(app)
        .patch(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`,
        )
        .set("Cookie", alice.cookie)
        .send({ title: "Winner A", version: 1 }),
      request(app)
        .patch(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`,
        )
        .set("Cookie", alice.cookie)
        .send({ title: "Winner B", version: 1 }),
    ]);

    const statuses = [resA.status, resB.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);
  });

  it("supports move and assign operations with version tracking", async () => {
    const alice = await registerUser("alice6@tasks.com", "Alice");
    const bob = await registerUser("bob6@tasks.com", "Bob");
    const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

    // Add bob to org
    await prisma.membership.create({
      data: {
        organizationId: orgId,
        userId: bob.user.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });

    const createRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
      .set("Cookie", alice.cookie)
      .send({ title: "Moveable Task", position: 1000 });

    const taskId = createRes.body.data.task.id;

    // Move task
    const moveRes = await request(app)
      .post(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/move`,
      )
      .set("Cookie", alice.cookie)
      .send({ status: "IN_PROGRESS", position: 500, version: 1 });

    expect(moveRes.status).toBe(200);
    expect(moveRes.body.data.task.status).toBe("IN_PROGRESS");
    expect(moveRes.body.data.task.position).toBe(500);
    expect(moveRes.body.data.task.version).toBe(2);

    // Assign task to Bob
    const assignRes = await request(app)
      .post(
        `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/assign`,
      )
      .set("Cookie", alice.cookie)
      .send({ assigneeId: bob.user.id, version: 2 });

    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.task.assigneeId).toBe(bob.user.id);
    expect(assignRes.body.data.task.version).toBe(3);
  });
});

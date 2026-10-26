import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "@workspace/database";

describe("Prompt 8: Advanced Task Management, Tags, Due Dates, and Search", () => {
  const app = createApp();

  beforeEach(async () => {
    await prisma.taskTag.deleteMany();
    await prisma.tag.deleteMany();
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

  async function setupOrgAndProject(
    ownerCookie: string,
    name = "Task Org",
    slug = "task-org",
  ) {
    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", ownerCookie)
      .send({ name, slug });
    const orgId = orgRes.body.data.organization.id;

    const projRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects`)
      .set("Cookie", ownerCookie)
      .send({ name: "Core Sprint", slug: "core-sprint" });
    const projectId = projRes.body.data.project.id;

    return { orgId, projectId };
  }

  describe("Task Priorities", () => {
    it("assigns sensible default priority (MEDIUM) when priority is omitted", async () => {
      const alice = await registerUser("alice@priority.com", "Alice");
      const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({
          title: "Default Priority Task",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.task.priority).toBe("MEDIUM");
    });

    it("allows authorized users to set and update priority across all levels", async () => {
      const alice = await registerUser("alice2@priority.com", "Alice");
      const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

      // Create URGENT task
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({
          title: "Critical Server Crash",
          priority: "URGENT",
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.task.priority).toBe("URGENT");
      const taskId = createRes.body.data.task.id;

      // Update to LOW
      const updateRes = await request(app)
        .patch(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`,
        )
        .set("Cookie", alice.cookie)
        .send({
          priority: "LOW",
          version: 1,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.task.priority).toBe("LOW");
    });

    it("rejects invalid priority values with HTTP 400 validation error", async () => {
      const alice = await registerUser("alice3@priority.com", "Alice");
      const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({
          title: "Invalid Priority Task",
          priority: "SUPER_CRITICAL",
        });

      expect(res.status).toBe(400);
    });
  });

  describe("Tags and Labels", () => {
    it("creates, renames, lists, and deletes organization tags", async () => {
      const alice = await registerUser("alice@tags.com", "Alice");
      const { orgId } = await setupOrgAndProject(alice.cookie);

      // Create tag
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/tags`)
        .set("Cookie", alice.cookie)
        .send({
          name: "Backend",
          color: "#10B981",
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.tag.name).toBe("Backend");
      expect(createRes.body.data.tag.color).toBe("#10B981");
      const tagId = createRes.body.data.tag.id;

      // Rename tag
      const updateRes = await request(app)
        .patch(`/api/v1/organizations/${orgId}/tags/${tagId}`)
        .set("Cookie", alice.cookie)
        .send({
          name: "API & Backend",
          color: "#3B82F6",
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.tag.name).toBe("API & Backend");
      expect(updateRes.body.data.tag.color).toBe("#3B82F6");

      // List tags
      const listRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/tags`)
        .set("Cookie", alice.cookie);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.tags.length).toBe(1);
      expect(listRes.body.data.tags[0].name).toBe("API & Backend");

      // Delete tag
      const delRes = await request(app)
        .delete(`/api/v1/organizations/${orgId}/tags/${tagId}`)
        .set("Cookie", alice.cookie);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.deleted).toBe(true);

      const afterDelList = await request(app)
        .get(`/api/v1/organizations/${orgId}/tags`)
        .set("Cookie", alice.cookie);

      expect(afterDelList.body.data.tags.length).toBe(0);
    });

    it("prevents duplicate tag names within the same organization with case-insensitivity (HTTP 409)", async () => {
      const alice = await registerUser("alice2@tags.com", "Alice");
      const { orgId } = await setupOrgAndProject(alice.cookie);

      // Create first tag
      const first = await request(app)
        .post(`/api/v1/organizations/${orgId}/tags`)
        .set("Cookie", alice.cookie)
        .send({ name: "Frontend", color: "#6366F1" });

      expect(first.status).toBe(201);

      // Attempt duplicate with different casing and whitespace
      const duplicate = await request(app)
        .post(`/api/v1/organizations/${orgId}/tags`)
        .set("Cookie", alice.cookie)
        .send({ name: "  frontend  ", color: "#EC4899" });

      expect(duplicate.status).toBe(409);
    });

    it("assigns and removes multiple tags from tasks", async () => {
      const alice = await registerUser("alice3@tags.com", "Alice");
      const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

      // Create two tags
      const t1 = await request(app)
        .post(`/api/v1/organizations/${orgId}/tags`)
        .set("Cookie", alice.cookie)
        .send({ name: "Security", color: "#EF4444" });
      const t2 = await request(app)
        .post(`/api/v1/organizations/${orgId}/tags`)
        .set("Cookie", alice.cookie)
        .send({ name: "Auth", color: "#8B5CF6" });

      const tagId1 = t1.body.data.tag.id;
      const tagId2 = t2.body.data.tag.id;

      // Create task with initial tags
      const taskRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({
          title: "Implement JWT Rotation",
          tagIds: [tagId1],
        });

      expect(taskRes.status).toBe(201);
      expect(taskRes.body.data.task.tags.length).toBe(1);
      expect(taskRes.body.data.task.tags[0].name).toBe("Security");
      const taskId = taskRes.body.data.task.id;

      // Assign second tag via dedicated endpoint
      const assignRes = await request(app)
        .post(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/tags`,
        )
        .set("Cookie", alice.cookie)
        .send({
          tagIds: [tagId2],
        });

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.data.tags.length).toBe(2);

      // Verify task get reflects both tags
      const getTask = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`,
        )
        .set("Cookie", alice.cookie);

      expect(getTask.body.data.task.tags.length).toBe(2);

      // Remove tag 1
      const removeRes = await request(app)
        .delete(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/tags/${tagId1}`,
        )
        .set("Cookie", alice.cookie);

      expect(removeRes.status).toBe(200);

      const afterRemove = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`,
        )
        .set("Cookie", alice.cookie);

      expect(afterRemove.body.data.task.tags.length).toBe(1);
      expect(afterRemove.body.data.task.tags[0].id).toBe(tagId2);
    });

    it("rejects cross-organization tag assignment", async () => {
      const alice = await registerUser("alice_cross@tags.com", "Alice");
      const bob = await registerUser("bob_cross@tags.com", "Bob");

      const orgA = await setupOrgAndProject(alice.cookie, "Org A", "org-a");
      const orgB = await setupOrgAndProject(bob.cookie, "Org B", "org-b");

      // Bob creates a tag in Org B
      const bobTag = await request(app)
        .post(`/api/v1/organizations/${orgB.orgId}/tags`)
        .set("Cookie", bob.cookie)
        .send({ name: "Bob Confidential", color: "#EF4444" });
      const foreignTagId = bobTag.body.data.tag.id;

      // Alice creates a task in Org A
      const aliceTask = await request(app)
        .post(
          `/api/v1/organizations/${orgA.orgId}/projects/${orgA.projectId}/tasks`,
        )
        .set("Cookie", alice.cookie)
        .send({ title: "Alice Secure Task" });
      const taskId = aliceTask.body.data.task.id;

      // Alice attempts to assign Bob's tag to Alice's task in Org A -> rejected
      const assignRes = await request(app)
        .post(
          `/api/v1/organizations/${orgA.orgId}/projects/${orgA.projectId}/tasks/${taskId}/tags`,
        )
        .set("Cookie", alice.cookie)
        .send({
          tagIds: [foreignTagId],
        });

      expect(assignRes.status).toBe(400);

      // Also on task update -> rejected
      const updateRes = await request(app)
        .patch(
          `/api/v1/organizations/${orgA.orgId}/projects/${orgA.projectId}/tasks/${taskId}`,
        )
        .set("Cookie", alice.cookie)
        .send({
          tagIds: [foreignTagId],
          version: 1,
        });

      expect(updateRes.status).toBe(400);
    });
  });

  describe("Due Dates and Overdue Tasks", () => {
    it("sets, updates, and clears due dates properly", async () => {
      const alice = await registerUser("alice@dates.com", "Alice");
      const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

      const futureDate = new Date(Date.now() + 86400000 * 5).toISOString();

      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({
          title: "Due in 5 days",
          dueDate: futureDate,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.task.dueDate).toBeDefined();
      expect(createRes.body.data.task.isOverdue).toBe(false);

      const taskId = createRes.body.data.task.id;

      // Clear due date
      const clearRes = await request(app)
        .patch(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`,
        )
        .set("Cookie", alice.cookie)
        .send({
          dueDate: null,
          version: 1,
        });

      expect(clearRes.status).toBe(200);
      expect(clearRes.body.data.task.dueDate).toBeNull();
      expect(clearRes.body.data.task.isOverdue).toBe(false);
    });

    it("correctly identifies overdue tasks without marking completed tasks overdue", async () => {
      const alice = await registerUser("alice2@dates.com", "Alice");
      const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

      const pastDate = new Date(Date.now() - 86400000 * 2).toISOString(); // 2 days ago

      // Task 1: Past due date, status TODO -> isOverdue: true
      const overdueTask = await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({
          title: "Late Submission",
          status: "TODO",
          dueDate: pastDate,
        });

      expect(overdueTask.status).toBe(201);
      expect(overdueTask.body.data.task.isOverdue).toBe(true);

      // Task 2: Past due date, status DONE -> isOverdue: false (completed tasks are never overdue!)
      const completedTask = await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({
          title: "Completed Before Inspection",
          status: "DONE",
          dueDate: pastDate,
        });

      expect(completedTask.status).toBe(201);
      expect(completedTask.body.data.task.isOverdue).toBe(false);

      // Filter by isOverdue=true -> should return only task 1
      const overdueQuery = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks?isOverdue=true`,
        )
        .set("Cookie", alice.cookie);

      expect(overdueQuery.status).toBe(200);
      expect(overdueQuery.body.data.items.length).toBe(1);
      expect(overdueQuery.body.data.items[0].id).toBe(
        overdueTask.body.data.task.id,
      );
    });
  });

  describe("Task Search & Filtering", () => {
    it("searches across task title and description with case-insensitivity", async () => {
      const alice = await registerUser("alice@search.com", "Alice");
      const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

      await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({
          title: "Setup PostgreSQL Row-Level Security",
          description: "Database security policies",
        });

      await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({
          title: "Design Landing Page Hero",
          description: "Vibrant dark mode aesthetics",
        });

      await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({
          title: "Implement Stripe Webhook",
          description: "Listen for invoice.paid events",
        });

      // Search by title match
      const titleSearch = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks?search=row-level`,
        )
        .set("Cookie", alice.cookie);

      expect(titleSearch.status).toBe(200);
      expect(titleSearch.body.data.items.length).toBe(1);
      expect(titleSearch.body.data.items[0].title).toContain(
        "Row-Level Security",
      );

      // Search by description match
      const descSearch = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks?search=invoice.paid`,
        )
        .set("Cookie", alice.cookie);

      expect(descSearch.status).toBe(200);
      expect(descSearch.body.data.items.length).toBe(1);
      expect(descSearch.body.data.items[0].title).toBe(
        "Implement Stripe Webhook",
      );

      // Empty search returns all tasks safely
      const emptySearch = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks?search=`,
        )
        .set("Cookie", alice.cookie);

      expect(emptySearch.status).toBe(200);
      expect(emptySearch.body.data.items.length).toBe(3);

      // Special characters safe search
      const specialSearch = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks?search=%27%20OR%201=1--`,
        )
        .set("Cookie", alice.cookie);

      expect(specialSearch.status).toBe(200);
      expect(specialSearch.body.data.items.length).toBe(0);
    });

    it("composes filters by status, priority, and tags", async () => {
      const alice = await registerUser("alice@compose.com", "Alice");
      const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

      const tagRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/tags`)
        .set("Cookie", alice.cookie)
        .send({ name: "Bug" });
      const bugTagId = tagRes.body.data.tag.id;

      // Task 1: TODO, HIGH, Bug tag
      await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({
          title: "Critical Bug in Auth",
          status: "TODO",
          priority: "HIGH",
          tagIds: [bugTagId],
        });

      // Task 2: TODO, LOW, Bug tag
      await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({
          title: "Minor UI glitch",
          status: "TODO",
          priority: "LOW",
          tagIds: [bugTagId],
        });

      // Task 3: DONE, HIGH, No tag
      await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({
          title: "Completed High Priority Feature",
          status: "DONE",
          priority: "HIGH",
        });

      // Query: status=TODO & priority=HIGH & tagIds=bugTagId
      const composed = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks?status=TODO&priority=HIGH&tagIds=${bugTagId}`,
        )
        .set("Cookie", alice.cookie);

      expect(composed.status).toBe(200);
      expect(composed.body.data.items.length).toBe(1);
      expect(composed.body.data.items[0].title).toBe("Critical Bug in Auth");
    });

    it("supports deterministic sorting with tie-breaker and allowlisted fields", async () => {
      const alice = await registerUser("alice@sort.com", "Alice");
      const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

      await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({ title: "B Task", position: 2000 });

      await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({ title: "A Task", position: 1000 });

      // Sort by title asc
      const titleSorted = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks?sortBy=title&sortOrder=asc`,
        )
        .set("Cookie", alice.cookie);

      expect(titleSorted.status).toBe(200);
      expect(titleSorted.body.data.items[0].title).toBe("A Task");
      expect(titleSorted.body.data.items[1].title).toBe("B Task");

      // Sort by position desc
      const posSorted = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks?sortBy=position&sortOrder=desc`,
        )
        .set("Cookie", alice.cookie);

      expect(posSorted.status).toBe(200);
      expect(posSorted.body.data.items[0].title).toBe("B Task");
      expect(posSorted.body.data.items[1].title).toBe("A Task");

      // Invalid sort field is rejected with 400
      const invalidSort = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks?sortBy=arbitrarySqlInjection`,
        )
        .set("Cookie", alice.cookie);

      expect(invalidSort.status).toBe(400);
    });

    it("handles pagination boundaries reliably", async () => {
      const alice = await registerUser("alice@page.com", "Alice");
      const { orgId, projectId } = await setupOrgAndProject(alice.cookie);

      for (let i = 1; i <= 5; i++) {
        await request(app)
          .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
          .set("Cookie", alice.cookie)
          .send({ title: `Task ${i}`, position: i * 10 });
      }

      const page1 = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks?page=1&limit=2&sortBy=position&sortOrder=asc`,
        )
        .set("Cookie", alice.cookie);

      expect(page1.status).toBe(200);
      expect(page1.body.data.items.length).toBe(2);
      expect(page1.body.data.total).toBe(5);
      expect(page1.body.data.totalPages).toBe(3);
      expect(page1.body.data.items[0].title).toBe("Task 1");

      const page2 = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks?page=2&limit=2&sortBy=position&sortOrder=asc`,
        )
        .set("Cookie", alice.cookie);

      expect(page2.status).toBe(200);
      expect(page2.body.data.items.length).toBe(2);
      expect(page2.body.data.items[0].title).toBe("Task 3");
    });
  });

  describe("Tenant Isolation for Tasks and Tags", () => {
    it("prevents non-members from accessing tags or tasks across tenants", async () => {
      const alice = await registerUser("alice_tenant@test.com", "Alice");
      const mallory = await registerUser("mallory_tenant@test.com", "Mallory");

      const { orgId, projectId } = await setupOrgAndProject(
        alice.cookie,
        "Secret Org",
        "secret-org",
      );

      // Alice creates a tag
      const tagRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/tags`)
        .set("Cookie", alice.cookie)
        .send({ name: "Classified" });
      const tagId = tagRes.body.data.tag.id;

      // Alice creates a task
      const taskRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .set("Cookie", alice.cookie)
        .send({ title: "Confidential Roadmap", tagIds: [tagId] });
      const taskId = taskRes.body.data.task.id;

      // Mallory (not in org) attempts to list tags -> non-disclosing 404
      const malloryTags = await request(app)
        .get(`/api/v1/organizations/${orgId}/tags`)
        .set("Cookie", mallory.cookie);

      expect(malloryTags.status).toBe(404);

      // Mallory attempts to get the task -> 404
      const malloryTask = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`,
        )
        .set("Cookie", mallory.cookie);

      expect(malloryTask.status).toBe(404);

      // Mallory attempts to delete Alice's tag -> 404
      const malloryDelTag = await request(app)
        .delete(`/api/v1/organizations/${orgId}/tags/${tagId}`)
        .set("Cookie", mallory.cookie);

      expect(malloryDelTag.status).toBe(404);
    });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "@workspace/database";

describe("Projects API", () => {
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

  it("creates a project with auto-generated slug and records activity", async () => {
    const alice = await registerUser("alice@projects.com", "Alice");
    const org = await createTestOrg(alice.cookie);

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects`)
      .set("Cookie", alice.cookie)
      .send({
        name: "Website Redesign",
        description: "Revamp customer-facing marketing site",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.project.name).toBe("Website Redesign");
    expect(res.body.data.project.slug).toBe("website-redesign");
    expect(res.body.data.project.status).toBe("ACTIVE");

    // Verify activity log was recorded
    const activities = await prisma.activityLog.findMany({
      where: { organizationId: org.id, eventType: "PROJECT_CREATED" },
    });
    expect(activities).toHaveLength(1);
    expect(activities[0]?.entityId).toBe(res.body.data.project.id);
  });

  it("enforces organization-scoped slug uniqueness", async () => {
    const alice = await registerUser("alice2@projects.com", "Alice");
    const org = await createTestOrg(alice.cookie);

    // Create first project
    await request(app)
      .post(`/api/v1/organizations/${org.id}/projects`)
      .set("Cookie", alice.cookie)
      .send({ name: "Core Engine", slug: "core-engine" });

    // Attempt duplicate slug in same org
    const dupRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects`)
      .set("Cookie", alice.cookie)
      .send({ name: "Duplicate Core", slug: "core-engine" });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe("CONFLICT");
  });

  it("lists only projects belonging to the organization with task counts", async () => {
    const alice = await registerUser("alice3@projects.com", "Alice");
    const org1 = await createTestOrg(alice.cookie, "Org One", "org-one");

    const bob = await registerUser("bob@projects.com", "Bob");
    const org2 = await createTestOrg(bob.cookie, "Org Two", "org-two");

    // Project in Org 1
    await request(app)
      .post(`/api/v1/organizations/${org1.id}/projects`)
      .set("Cookie", alice.cookie)
      .send({ name: "Project Alpha" });

    // Project in Org 2
    await request(app)
      .post(`/api/v1/organizations/${org2.id}/projects`)
      .set("Cookie", bob.cookie)
      .send({ name: "Project Beta" });

    // Alice lists projects in Org 1
    const res = await request(app)
      .get(`/api/v1/organizations/${org1.id}/projects`)
      .set("Cookie", alice.cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toBe("Project Alpha");

    // Cross-tenant project access rejection
    const crossRes = await request(app)
      .get(`/api/v1/organizations/${org2.id}/projects`)
      .set("Cookie", alice.cookie);

    expect(crossRes.status).toBe(404);
  });

  it("enforces archive and restore permissions (OWNER/ADMIN only)", async () => {
    const owner = await registerUser("owner@projects.com", "Owner");
    const member = await registerUser("member@projects.com", "Member");
    const org = await createTestOrg(owner.cookie);

    // Add member to org
    await prisma.membership.create({
      data: {
        organizationId: org.id,
        userId: member.user.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });

    const createRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects`)
      .set("Cookie", owner.cookie)
      .send({ name: "Mission Critical" });

    const projectId = createRes.body.data.project.id;

    // Member attempts to archive project (403 forbidden)
    const memberArchive = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${projectId}/archive`)
      .set("Cookie", member.cookie);

    expect(memberArchive.status).toBe(403);

    // Owner archives project (succeeds)
    const ownerArchive = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${projectId}/archive`)
      .set("Cookie", owner.cookie);

    expect(ownerArchive.status).toBe(200);
    expect(ownerArchive.body.data.project.status).toBe("ARCHIVED");
    expect(ownerArchive.body.data.project.archivedAt).toBeDefined();

    // Modifying archived project is rejected
    const patchRes = await request(app)
      .patch(`/api/v1/organizations/${org.id}/projects/${projectId}`)
      .set("Cookie", owner.cookie)
      .send({ name: "Renamed While Archived" });

    expect(patchRes.status).toBe(400);

    // Owner restores project
    const restoreRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${projectId}/restore`)
      .set("Cookie", owner.cookie);

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.data.project.status).toBe("ACTIVE");
    expect(restoreRes.body.data.project.archivedAt).toBeNull();
  });
});

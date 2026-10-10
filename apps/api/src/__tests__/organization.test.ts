import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "@workspace/database";

describe("Organizations and Roles API", () => {
  const app = createApp();

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
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

  it("atomically creates an organization and assigns creator as OWNER", async () => {
    const { user, cookie } = await registerUser("alice@example.com", "Alice");

    const res = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", cookie)
      .send({
        name: "Acme Corp",
        slug: "acme-corp",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.organization.name).toBe("Acme Corp");
    expect(res.body.data.organization.slug).toBe("acme-corp");
    expect(res.body.data.organization.role).toBe("OWNER");

    // Verify membership in database
    const orgId = res.body.data.organization.id;
    const membership = await prisma.membership.findFirst({
      where: { organizationId: orgId, userId: user.id },
    });

    expect(membership).toBeDefined();
    expect(membership?.role).toBe("OWNER");
    expect(membership?.status).toBe("ACTIVE");

    // Verify audit log entry was written
    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: orgId, action: "ORGANIZATION_CREATED" },
    });
    expect(audit).toBeDefined();
    expect(audit?.actorId).toBe(user.id);
  });

  it("ensures users see only organizations they belong to", async () => {
    const alice = await registerUser("alice.list@example.com", "Alice");
    const bob = await registerUser("bob.list@example.com", "Bob");

    // Alice creates Org 1
    const org1 = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", alice.cookie)
      .send({ name: "Alice Org", slug: "alice-org" });

    // Bob creates Org 2
    await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", bob.cookie)
      .send({ name: "Bob Org", slug: "bob-org" });

    // Alice lists organizations
    const aliceList = await request(app)
      .get("/api/v1/organizations")
      .set("Cookie", alice.cookie);

    expect(aliceList.status).toBe(200);
    expect(aliceList.body.data.organizations).toHaveLength(1);
    expect(aliceList.body.data.organizations[0].name).toBe("Alice Org");

    // Bob lists organizations
    const bobList = await request(app)
      .get("/api/v1/organizations")
      .set("Cookie", bob.cookie);

    expect(bobList.status).toBe(200);
    expect(bobList.body.data.organizations).toHaveLength(1);
    expect(bobList.body.data.organizations[0].name).toBe("Bob Org");

    // Bob cannot access Alice's organization details (404 non-disclosing)
    const bobProbe = await request(app)
      .get(`/api/v1/organizations/${org1.body.data.organization.id}`)
      .set("Cookie", bob.cookie);

    expect(bobProbe.status).toBe(404);
  });

  it("enforces RBAC permissions: members cannot perform owner/admin actions", async () => {
    const owner = await registerUser("owner@example.com", "Owner");
    const member = await registerUser("member@example.com", "Member");

    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Security Org", slug: "sec-org" });

    const orgId = orgRes.body.data.organization.id;

    // Add member manually with role MEMBER
    await prisma.membership.create({
      data: {
        organizationId: orgId,
        userId: member.user.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });

    // Member attempts to rename organization (forbidden 403)
    const patchRes = await request(app)
      .patch(`/api/v1/organizations/${orgId}`)
      .set("Cookie", member.cookie)
      .send({ name: "Hacked Org" });

    expect(patchRes.status).toBe(403);
    expect(patchRes.body.error.code).toBe("FORBIDDEN");

    // Owner CAN rename organization
    const ownerPatchRes = await request(app)
      .patch(`/api/v1/organizations/${orgId}`)
      .set("Cookie", owner.cookie)
      .send({ name: "Legit Org" });

    expect(ownerPatchRes.status).toBe(200);
    expect(ownerPatchRes.body.data.organization.name).toBe("Legit Org");
  });

  it("prevents demoting or removing the only owner", async () => {
    const owner = await registerUser("soleowner@example.com", "Sole Owner");
    const member = await registerUser("subuser@example.com", "Sub User");

    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Single Owner Corp" });

    const orgId = orgRes.body.data.organization.id;

    // Add member
    await prisma.membership.create({
      data: {
        organizationId: orgId,
        userId: member.user.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });

    // Attempt to demote sole owner to MEMBER
    const demoteRes = await request(app)
      .patch(`/api/v1/organizations/${orgId}/members/${owner.user.id}`)
      .set("Cookie", owner.cookie)
      .send({ role: "MEMBER" });

    expect(demoteRes.status).toBe(400);
    expect(demoteRes.body.error.message).toContain(
      "Cannot demote the only organization owner",
    );

    // Attempt to delete sole owner
    const deleteRes = await request(app)
      .delete(`/api/v1/organizations/${orgId}/members/${owner.user.id}`)
      .set("Cookie", owner.cookie);

    expect(deleteRes.status).toBe(400);
    expect(deleteRes.body.error.message).toContain(
      "Cannot remove the last owner",
    );
  });

  it("immediately revokes organization access when a member is removed", async () => {
    const owner = await registerUser("boss@example.com", "Boss");
    const employee = await registerUser("worker@example.com", "Worker");

    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Startup Inc" });

    const orgId = orgRes.body.data.organization.id;

    await prisma.membership.create({
      data: {
        organizationId: orgId,
        userId: employee.user.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });

    // Worker can access organization
    const accessBefore = await request(app)
      .get(`/api/v1/organizations/${orgId}`)
      .set("Cookie", employee.cookie);

    expect(accessBefore.status).toBe(200);

    // Boss removes worker
    const removeRes = await request(app)
      .delete(`/api/v1/organizations/${orgId}/members/${employee.user.id}`)
      .set("Cookie", owner.cookie);

    expect(removeRes.status).toBe(200);

    // Worker's subsequent access is immediately rejected (404 non-disclosing)
    const accessAfter = await request(app)
      .get(`/api/v1/organizations/${orgId}`)
      .set("Cookie", employee.cookie);

    expect(accessAfter.status).toBe(404);
  });

  it("rejects unauthenticated requests to organization endpoints with 401", async () => {
    const listRes = await request(app).get("/api/v1/organizations");
    expect(listRes.status).toBe(401);

    const createRes = await request(app)
      .post("/api/v1/organizations")
      .send({ name: "Unauthorized Corp" });
    expect(createRes.status).toBe(401);
  });

  it("prevents admins from modifying roles or self-escalating to owner", async () => {
    const owner = await registerUser("owner.admin@example.com", "Owner");
    const admin = await registerUser("admin.user@example.com", "Admin");

    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "RBAC Enterprise" });

    const orgId = orgRes.body.data.organization.id;

    // Add admin
    await prisma.membership.create({
      data: {
        organizationId: orgId,
        userId: admin.user.id,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });

    // Admin attempts to change roles (canManageRoles is OWNER only)
    const promoteRes = await request(app)
      .patch(`/api/v1/organizations/${orgId}/members/${admin.user.id}`)
      .set("Cookie", admin.cookie)
      .send({ role: "ADMIN" });

    expect(promoteRes.status).toBe(403);
    expect(promoteRes.body.error.code).toBe("FORBIDDEN");
  });

  it("lists organization members including user profile metadata", async () => {
    const owner = await registerUser("boss.list@example.com", "Boss");
    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Member List Org" });

    const orgId = orgRes.body.data.organization.id;

    const listRes = await request(app)
      .get(`/api/v1/organizations/${orgId}/members`)
      .set("Cookie", owner.cookie);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.members).toHaveLength(1);
    expect(listRes.body.data.members[0].role).toBe("OWNER");
    expect(listRes.body.data.members[0].user.email).toBe(
      "boss.list@example.com",
    );
  });
});

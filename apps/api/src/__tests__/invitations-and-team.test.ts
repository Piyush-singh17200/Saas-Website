import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";

import { PrismaClient } from "@workspace/database";
import { createApp } from "../app.js";
import { randomUUID } from "node:crypto";
import { createSession } from "../services/session.service.js";
import { env } from "../config/env.js";

describe("Phase 6: Team Management, Invitations, Notifications & Project Lifecycle", () => {
  const app = createApp();
  const db = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_test?schema=public",
      },
    },
  });

  let ownerId: string;
  let adminId: string;
  let memberId: string;
  let outsiderId: string;

  let ownerCookie: string;
  let adminCookie: string;
  let memberCookie: string;
  let outsiderCookie: string;

  let orgId: string;

  beforeAll(async () => {
    // Clean fixtures
    await db.invitation.deleteMany();
    await (db as any).notification.deleteMany();
    await db.comment.deleteMany();
    await db.task.deleteMany();
    await db.project.deleteMany();
    await db.session.deleteMany();
    await db.membership.deleteMany();
    await db.subscription.deleteMany();
    await db.organization.deleteMany();
    await db.user.deleteMany();

    // 1. Create Owner User
    const owner = await db.user.create({
      data: {
        id: randomUUID(),
        email: "team.owner@example.com",
        passwordHash: "hash-owner",
        displayName: "Team Owner",
      },
    });
    ownerId = owner.id;
    const sessionOwner = await createSession(ownerId);
    ownerCookie = `${env.SESSION_COOKIE_NAME}=${sessionOwner.rawToken}`;

    // 2. Create Admin User
    const admin = await db.user.create({
      data: {
        id: randomUUID(),
        email: "team.admin@example.com",
        passwordHash: "hash-admin",
        displayName: "Team Admin",
      },
    });
    adminId = admin.id;
    const sessionAdmin = await createSession(adminId);
    adminCookie = `${env.SESSION_COOKIE_NAME}=${sessionAdmin.rawToken}`;

    // 3. Create Member User
    const member = await db.user.create({
      data: {
        id: randomUUID(),
        email: "team.member@example.com",
        passwordHash: "hash-member",
        displayName: "Team Member",
      },
    });
    memberId = member.id;
    const sessionMember = await createSession(memberId);
    memberCookie = `${env.SESSION_COOKIE_NAME}=${sessionMember.rawToken}`;

    // 4. Create Outsider User
    const outsider = await db.user.create({
      data: {
        id: randomUUID(),
        email: "team.outsider@example.com",
        passwordHash: "hash-outsider",
        displayName: "Team Outsider",
      },
    });
    outsiderId = outsider.id;
    const sessionOutsider = await createSession(outsiderId);
    outsiderCookie = `${env.SESSION_COOKIE_NAME}=${sessionOutsider.rawToken}`;

    // 5. Create Organization
    const org = await db.organization.create({
      data: {
        id: randomUUID(),
        name: "Acme Team Workspace",
        slug: "acme-team-workspace",
        creatorId: ownerId,
      },
    });
    orgId = org.id;

    // Default FREE Subscription
    await db.subscription.create({
      data: {
        organizationId: orgId,
        plan: "FREE",
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
      },
    });

    // 6. Memberships
    await db.membership.createMany({
      data: [
        { organizationId: orgId, userId: ownerId, role: "OWNER", status: "ACTIVE" },
        { organizationId: orgId, userId: adminId, role: "ADMIN", status: "ACTIVE" },
        { organizationId: orgId, userId: memberId, role: "MEMBER", status: "ACTIVE" },
      ],
    });
  });

  afterAll(async () => {
    await db.invitation.deleteMany();
    await (db as any).notification.deleteMany();
    await db.comment.deleteMany();
    await db.task.deleteMany();
    await db.project.deleteMany();
    await db.session.deleteMany();
    await db.membership.deleteMany();
    await db.subscription.deleteMany();
    await db.organization.deleteMany();
    await db.user.deleteMany();
    await db.$disconnect();
  });

  describe("Organization Member Invitations", () => {
    it("allows OWNER to invite a new user as MEMBER or ADMIN", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set("Cookie", ownerCookie)
        .send({
          email: "colleague1@example.com",
          role: "ADMIN",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.invitation.email).toBe("colleague1@example.com");
      expect(res.body.data.invitation.role).toBe("ADMIN");
      expect(res.body.data.invitation.inviter.id).toBe(ownerId);
    });

    it("allows ADMIN to invite a MEMBER but rejects ADMIN inviting another ADMIN", async () => {
      // 1. ADMIN inviting MEMBER -> Success
      const okRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set("Cookie", adminCookie)
        .send({
          email: "colleague2@example.com",
          role: "MEMBER",
        });

      expect(okRes.status).toBe(201);
      expect(okRes.body.data.invitation.email).toBe("colleague2@example.com");
      expect(okRes.body.data.invitation.role).toBe("MEMBER");

      // 2. ADMIN attempting to invite ADMIN -> Forbidden (Role escalation protection)
      const errRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set("Cookie", adminCookie)
        .send({
          email: "escalation@example.com",
          role: "ADMIN",
        });

      expect(errRes.status).toBe(403);
      expect(errRes.body.success).toBe(false);
      expect(errRes.body.error.message).toContain("Only organization owners can invite administrators");
    });

    it("prevents ordinary MEMBER or outsider from inviting members", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set("Cookie", memberCookie)
        .send({
          email: "forbidden@example.com",
          role: "MEMBER",
        });

      expect(res.status).toBe(403);
    });

    it("rejects invitation for an existing active organization member", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set("Cookie", ownerCookie)
        .send({
          email: "team.member@example.com",
          role: "MEMBER",
        });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain("already a member");
    });

    it("rejects duplicate active pending invitation for the same email", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set("Cookie", ownerCookie)
        .send({
          email: "colleague1@example.com",
          role: "MEMBER",
        });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain("pending invitation already exists");
    });

    it("lists active pending invitations and excludes revoked ones", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/invitations`)
        .set("Cookie", ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.invitations.length).toBeGreaterThanOrEqual(2);
    });

    it("allows OWNER/ADMIN to revoke a pending invitation", async () => {
      const invite = await db.invitation.findFirst({
        where: { organizationId: orgId, email: "colleague2@example.com" },
      });
      expect(invite).toBeDefined();

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations/${invite!.id}/revoke`)
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify in DB
      const updated = await db.invitation.findUnique({
        where: { id: invite!.id },
      });
      expect(updated?.revokedAt).not.toBeNull();
    });

    it("allows OWNER/ADMIN to resend an active invitation with refreshed expiry", async () => {
      const invite = await db.invitation.findFirst({
        where: { organizationId: orgId, email: "colleague1@example.com" },
      });
      expect(invite).toBeDefined();

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations/${invite!.id}/resend`)
        .set("Cookie", ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(new Date(res.body.data.invitation.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("Notifications Unread Count & Mark-All-Read", () => {
    it("returns accurate unread notification count on /unread-count", async () => {
      // Create a test notification for owner
      await (db as any).notification.create({
        data: {
          organizationId: orgId,
          userId: ownerId,
          type: "TASK_ASSIGNED",
          title: "New Task",
          body: "You have been assigned a task",
          idempotencyKey: `test-notif-${randomUUID()}`,
        },
      });

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/notifications/unread-count`)
        .set("Cookie", ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.unreadCount).toBeGreaterThanOrEqual(1);
    });

    it("marks all notifications read and resets unread count to 0", async () => {
      const markRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/notifications/read-all`)
        .set("Cookie", ownerCookie);

      expect(markRes.status).toBe(200);
      expect(markRes.body.success).toBe(true);

      const countRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/notifications/unread-count`)
        .set("Cookie", ownerCookie);

      expect(countRes.status).toBe(200);
      expect(countRes.body.data.unreadCount).toBe(0);
    });

    it("prevents cross-tenant notification access (non-member receives 404)", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/notifications/unread-count`)
        .set("Cookie", outsiderCookie);

      expect(res.status).toBe(404);
    });
  });

  describe("Project Settings & Lifecycle (Archive/Restore)", () => {
    let testProjectId: string;

    beforeAll(async () => {
      const proj = await db.project.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          name: "Project Lifecycle Test",
          slug: "project-lifecycle-test",
          status: "ACTIVE",
          createdById: ownerId,
        },
      });
      testProjectId = proj.id;
    });

    it("allows OWNER to update project name and description", async () => {
      const res = await request(app)
        .patch(`/api/v1/organizations/${orgId}/projects/${testProjectId}`)
        .set("Cookie", ownerCookie)
        .send({
          name: "Updated Lifecycle Project",
          description: "Updated description for phase 6",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.project.name).toBe("Updated Lifecycle Project");
      expect(res.body.data.project.description).toBe("Updated description for phase 6");
    });

    it("allows archiving the project and preserves status as ARCHIVED", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${testProjectId}/archive`)
        .set("Cookie", ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.project.status).toBe("ARCHIVED");
    });

    it("allows restoring the project back to ACTIVE", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${testProjectId}/restore`)
        .set("Cookie", ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.project.status).toBe("ACTIVE");
    });

    it("rejects project archiving by ordinary MEMBER without management role", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/projects/${testProjectId}/archive`)
        .set("Cookie", memberCookie);

      expect(res.status).toBe(403);
    });
  });
});

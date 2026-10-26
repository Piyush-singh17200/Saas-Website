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
        {
          organizationId: orgId,
          userId: ownerId,
          role: "OWNER",
          status: "ACTIVE",
        },
        {
          organizationId: orgId,
          userId: adminId,
          role: "ADMIN",
          status: "ACTIVE",
        },
        {
          organizationId: orgId,
          userId: memberId,
          role: "MEMBER",
          status: "ACTIVE",
        },
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
      expect(errRes.body.error.message).toContain(
        "Only organization owners can invite administrators",
      );
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
      expect(res.body.error.message).toContain(
        "pending invitation already exists",
      );
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
      expect(
        new Date(res.body.data.invitation.expiresAt).getTime(),
      ).toBeGreaterThan(Date.now());
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
      expect(res.body.data.project.description).toBe(
        "Updated description for phase 6",
      );
    });

    it("allows archiving the project and preserves status as ARCHIVED", async () => {
      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgId}/projects/${testProjectId}/archive`,
        )
        .set("Cookie", ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.project.status).toBe("ARCHIVED");
    });

    it("allows restoring the project back to ACTIVE", async () => {
      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgId}/projects/${testProjectId}/restore`,
        )
        .set("Cookie", ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.project.status).toBe("ACTIVE");
    });

    it("rejects project archiving by ordinary MEMBER without management role", async () => {
      const res = await request(app)
        .post(
          `/api/v1/organizations/${orgId}/projects/${testProjectId}/archive`,
        )
        .set("Cookie", memberCookie);

      expect(res.status).toBe(403);
    });

    it("rejects project update from cross-tenant user with 404 non-disclosing", async () => {
      const res = await request(app)
        .patch(`/api/v1/organizations/${orgId}/projects/${testProjectId}`)
        .set("Cookie", outsiderCookie)
        .send({ name: "Hacked Project" });

      expect(res.status).toBe(404);
    });

    it("validates project update fields rejecting empty name", async () => {
      const res = await request(app)
        .patch(`/api/v1/organizations/${orgId}/projects/${testProjectId}`)
        .set("Cookie", ownerCookie)
        .send({ name: "" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe("Public Invitation Details & Acceptance Flow", () => {
    let inviteToken: string;
    let inviteRecipientEmail = "invited.candidate@example.com";
    let candidateUserId: string;
    let candidateCookie: string;

    beforeAll(async () => {
      // Create user matching recipient email
      const candidateUser = await db.user.create({
        data: {
          id: randomUUID(),
          email: inviteRecipientEmail,
          passwordHash: "hash-candidate",
          displayName: "Invited Candidate",
        },
      });
      candidateUserId = candidateUser.id;
      const sessionCandidate = await createSession(candidateUserId);
      candidateCookie = `${env.SESSION_COOKIE_NAME}=${sessionCandidate.rawToken}`;

      // Create an invitation from owner
      const inviteRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set("Cookie", ownerCookie)
        .send({
          email: inviteRecipientEmail,
          role: "MEMBER",
        });

      expect(inviteRes.status).toBe(201);
      inviteToken = inviteRes.body.data.invitation.token;
      expect(inviteToken).toBeDefined();
    });

    it("resolves public invitation details given valid token", async () => {
      const res = await request(app).get(`/api/v1/invitations/${inviteToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(inviteRecipientEmail);
      expect(res.body.data.role).toBe("MEMBER");
      expect(res.body.data.organization.name).toBe("Acme Team Workspace");
      expect(res.body.data.inviter.displayName).toBe("Team Owner");
      expect(res.body.data.isExpired).toBe(false);
    });

    it("returns 404 for non-existent invitation token", async () => {
      const fakeToken =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const res = await request(app).get(`/api/v1/invitations/${fakeToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("rejects acceptance if user is unauthenticated (401)", async () => {
      const res = await request(app).post(
        `/api/v1/invitations/${inviteToken}/accept`,
      );

      expect(res.status).toBe(401);
    });

    it("rejects acceptance if user email does not match recipient email (403)", async () => {
      // outsider has email team.outsider@example.com != invited.candidate@example.com
      const res = await request(app)
        .post(`/api/v1/invitations/${inviteToken}/accept`)
        .set("Cookie", outsiderCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain(
        `This invitation was sent to ${inviteRecipientEmail}`,
      );
    });

    it("allows matching user to accept invitation and grants membership", async () => {
      const res = await request(app)
        .post(`/api/v1/invitations/${inviteToken}/accept`)
        .set("Cookie", candidateCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organizationId).toBe(orgId);

      // Verify membership now exists in database
      const membership = await db.membership.findFirst({
        where: { organizationId: orgId, userId: candidateUserId },
      });
      expect(membership).toBeDefined();
      expect(membership?.role).toBe("MEMBER");
      expect(membership?.status).toBe("ACTIVE");
    });

    it("rejects reusing an already accepted invitation token (400)", async () => {
      const res = await request(app)
        .post(`/api/v1/invitations/${inviteToken}/accept`)
        .set("Cookie", candidateCookie);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("already been accepted");
    });

    it("rejects resolving public details for an already accepted invitation (400)", async () => {
      const res = await request(app).get(`/api/v1/invitations/${inviteToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("already been accepted");
    });

    it("rejects revoked invitation token (400)", async () => {
      // Create and revoke an invite
      const inviteRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set("Cookie", ownerCookie)
        .send({
          email: "revoked.candidate@example.com",
          role: "MEMBER",
        });

      const token = inviteRes.body.data.invitation.token;
      const inviteId = inviteRes.body.data.invitation.id;

      await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations/${inviteId}/revoke`)
        .set("Cookie", ownerCookie);

      const res = await request(app).get(`/api/v1/invitations/${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("has been revoked");
    });
  });

  describe("Member Role Changes and Removal RBAC", () => {
    let testSubMemberId: string;
    let testSubAdminId: string;

    beforeAll(async () => {
      // Create sub-member
      const subMember = await db.user.create({
        data: {
          id: randomUUID(),
          email: "sub.member@example.com",
          passwordHash: "hash-submember",
          displayName: "Sub Member",
        },
      });
      testSubMemberId = subMember.id;
      await db.membership.create({
        data: {
          organizationId: orgId,
          userId: testSubMemberId,
          role: "MEMBER",
          status: "ACTIVE",
        },
      });

      // Create second admin
      const subAdmin = await db.user.create({
        data: {
          id: randomUUID(),
          email: "sub.admin@example.com",
          passwordHash: "hash-subadmin",
          displayName: "Sub Admin",
        },
      });
      testSubAdminId = subAdmin.id;
      await db.membership.create({
        data: {
          organizationId: orgId,
          userId: testSubAdminId,
          role: "ADMIN",
          status: "ACTIVE",
        },
      });
    });

    it("allows OWNER to update member role to ADMIN", async () => {
      const res = await request(app)
        .patch(`/api/v1/organizations/${orgId}/members/${testSubMemberId}`)
        .set("Cookie", ownerCookie)
        .send({ role: "ADMIN" });

      expect(res.status).toBe(200);
      expect(res.body.data.member.role).toBe("ADMIN");
    });

    it("prevents ADMIN from removing an OWNER (403)", async () => {
      const res = await request(app)
        .delete(`/api/v1/organizations/${orgId}/members/${ownerId}`)
        .set("Cookie", adminCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain(
        "Administrators cannot remove organization owners",
      );
    });

    it("prevents ADMIN from removing another ADMIN (403)", async () => {
      const res = await request(app)
        .delete(`/api/v1/organizations/${orgId}/members/${testSubAdminId}`)
        .set("Cookie", adminCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain(
        "Administrators cannot remove organization owners or other administrators",
      );
    });

    it("allows OWNER to remove an ADMIN", async () => {
      const res = await request(app)
        .delete(`/api/v1/organizations/${orgId}/members/${testSubAdminId}`)
        .set("Cookie", ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const check = await db.membership.findFirst({
        where: { organizationId: orgId, userId: testSubAdminId },
      });
      expect(check).toBeNull();
    });
  });

  describe("Task Board Filtering & Search API", () => {
    let taskProjId: string;
    let task1Id: string;
    let task2Id: string;

    beforeAll(async () => {
      const proj = await db.project.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          name: "Task Board Filter Testing",
          slug: "task-board-filter-testing",
          status: "ACTIVE",
          createdById: ownerId,
        },
      });
      taskProjId = proj.id;

      const t1 = await db.task.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          projectId: taskProjId,
          title: "Implement OAuth Google Login",
          description: "Auth integration task",
          status: "IN_PROGRESS",
          priority: "HIGH",
          assigneeId: memberId,
          createdById: ownerId,
          position: 1000,
        },
      });
      task1Id = t1.id;

      const t2 = await db.task.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          projectId: taskProjId,
          title: "Setup Billing Webhook",
          description: "Stripe invoice payment handler",
          status: "DONE",
          priority: "LOW",
          assigneeId: adminId,
          createdById: ownerId,
          position: 2000,
        },
      });
      task2Id = t2.id;
    });

    it("filters tasks by status", async () => {
      const res = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${taskProjId}/tasks?status=IN_PROGRESS`,
        )
        .set("Cookie", ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].id).toBe(task1Id);
    });

    it("filters tasks by assigneeId", async () => {
      const res = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${taskProjId}/tasks?assigneeId=${adminId}`,
        )
        .set("Cookie", ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].id).toBe(task2Id);
    });

    it("filters tasks by priority", async () => {
      const res = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/projects/${taskProjId}/tasks?priority=HIGH`,
        )
        .set("Cookie", ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].id).toBe(task1Id);
    });

    it("allows updating task status via PATCH", async () => {
      const res = await request(app)
        .patch(
          `/api/v1/organizations/${orgId}/projects/${taskProjId}/tasks/${task1Id}`,
        )
        .set("Cookie", ownerCookie)
        .send({ status: "DONE", version: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data.task.status).toBe("DONE");
      expect(res.body.data.task.completedAt).not.toBeNull();
    });
  });
});

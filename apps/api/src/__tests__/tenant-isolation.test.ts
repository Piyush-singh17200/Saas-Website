import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@workspace/database";
import { randomUUID } from "node:crypto";
import { testAppDatabaseUrl, testDatabaseUrl } from "./test-env.js";

describe("PostgreSQL Row-Level Security (RLS) Tenant Isolation", () => {
  // Admin client for test fixture setup (table owner / superuser)
  const adminDb = new PrismaClient({
    datasources: {
      db: {
        url: testDatabaseUrl,
      },
    },
  });

  // Unprivileged application client subject to FORCE ROW LEVEL SECURITY (NOBYPASSRLS)
  const appDb = new PrismaClient({
    datasources: {
      db: {
        url: testAppDatabaseUrl,
      },
    },
  });

  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    // Clean tables using admin client
    await adminDb.activityLog.deleteMany();
    await adminDb.comment.deleteMany();
    await adminDb.task.deleteMany();
    await adminDb.project.deleteMany();
    await adminDb.auditLog.deleteMany();
    await adminDb.invitation.deleteMany();
    await adminDb.membership.deleteMany();
    await adminDb.organization.deleteMany();
    await adminDb.user.deleteMany();

    // Create User A and User B
    const userA = await adminDb.user.create({
      data: {
        id: randomUUID(),
        email: "alice.rls@example.com",
        passwordHash: "hash-a",
        displayName: "Alice RLS",
      },
    });
    userAId = userA.id;

    const userB = await adminDb.user.create({
      data: {
        id: randomUUID(),
        email: "bob.rls@example.com",
        passwordHash: "hash-b",
        displayName: "Bob RLS",
      },
    });
    userBId = userB.id;

    // Create Org A with membership and audit log
    orgAId = randomUUID();
    await adminDb.organization.create({
      data: {
        id: orgAId,
        name: "Tenant Alpha",
        slug: "tenant-alpha",
        creatorId: userAId,
      },
    });
    await adminDb.membership.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        userId: userAId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    await adminDb.auditLog.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        actorId: userAId,
        action: "TEST_ACTION_A",
      },
    });
    await adminDb.invitation.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        email: "colleague@alpha.com",
        role: "MEMBER",
        tokenHash: "inv-hash-alpha",
        inviterId: userAId,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Create Project, Task, and Comment in Org A
    const projAId = randomUUID();
    await adminDb.project.create({
      data: {
        id: projAId,
        organizationId: orgAId,
        name: "Alpha Project",
        slug: "alpha-proj",
        createdById: userAId,
      },
    });
    const taskAId = randomUUID();
    await adminDb.task.create({
      data: {
        id: taskAId,
        organizationId: orgAId,
        projectId: projAId,
        title: "Alpha Task",
        createdById: userAId,
      },
    });
    await adminDb.comment.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        taskId: taskAId,
        authorId: userAId,
        body: "Alpha Comment",
      },
    });

    // Create Org B with membership and audit log
    orgBId = randomUUID();
    await adminDb.organization.create({
      data: {
        id: orgBId,
        name: "Tenant Beta",
        slug: "tenant-beta",
        creatorId: userBId,
      },
    });
    await adminDb.membership.create({
      data: {
        id: randomUUID(),
        organizationId: orgBId,
        userId: userBId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    await adminDb.auditLog.create({
      data: {
        id: randomUUID(),
        organizationId: orgBId,
        actorId: userBId,
        action: "TEST_ACTION_B",
      },
    });
  });

  afterAll(async () => {
    await appDb.$disconnect();
    await adminDb.$disconnect();
  });

  it("RLS blocks all queries when tenant context is absent", async () => {
    // When appDb queries without setting app.current_organization_id, RLS policy yields 0 rows
    const orgs = await appDb.organization.findMany();
    expect(orgs).toHaveLength(0);

    const members = await appDb.membership.findMany();
    expect(members).toHaveLength(0);

    const audits = await appDb.auditLog.findMany();
    expect(audits).toHaveLength(0);

    const invites = await appDb.invitation.findMany();
    expect(invites).toHaveLength(0);

    const projects = await appDb.project.findMany();
    expect(projects).toHaveLength(0);

    const tasks = await appDb.task.findMany();
    expect(tasks).toHaveLength(0);

    const comments = await appDb.comment.findMany();
    expect(comments).toHaveLength(0);
  });

  it("RLS isolates data strictly to Tenant Alpha when Org A context is active", async () => {
    await appDb.$transaction(async (tx) => {
      // Set transaction-local tenant context
      await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${orgAId}, true)`;

      // Query organizations
      const orgs = await tx.organization.findMany();
      expect(orgs).toHaveLength(1);
      expect(orgs[0]?.id).toBe(orgAId);
      expect(orgs[0]?.name).toBe("Tenant Alpha");

      // Query memberships
      const memberships = await tx.membership.findMany();
      expect(memberships).toHaveLength(1);
      expect(memberships[0]?.organizationId).toBe(orgAId);

      // Query audit logs
      const audits = await tx.auditLog.findMany();
      expect(audits).toHaveLength(1);
      expect(audits[0]?.organizationId).toBe(orgAId);

      // Query invitations
      const invites = await tx.invitation.findMany();
      expect(invites).toHaveLength(1);
      expect(invites[0]?.organizationId).toBe(orgAId);

      // Projects, tasks, comments under Org A
      const projs = await tx.project.findMany();
      expect(projs).toHaveLength(1);
      expect(projs[0]?.name).toBe("Alpha Project");

      const tasks = await tx.task.findMany();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.title).toBe("Alpha Task");

      const comments = await tx.comment.findMany();
      expect(comments).toHaveLength(1);
      expect(comments[0]?.body).toBe("Alpha Comment");

      // Cross-tenant read by ID: Org B cannot be found even when queried by exact UUID
      const orgBDirect = await tx.organization.findUnique({
        where: { id: orgBId },
      });
      expect(orgBDirect).toBeNull();

      // Cross-tenant update: attempting to rename Org B affects 0 records
      const updateCount = await tx.organization.updateMany({
        where: { id: orgBId },
        data: { name: "Hacked Beta" },
      });
      expect(updateCount.count).toBe(0);

      // Cross-tenant delete: attempting to delete Org B affects 0 records
      const deleteCount = await tx.organization.deleteMany({
        where: { id: orgBId },
      });
      expect(deleteCount.count).toBe(0);
    });
  });

  it("RLS isolates data strictly to Tenant Beta when Org B context is active", async () => {
    await appDb.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${orgBId}, true)`;

      const orgs = await tx.organization.findMany();
      expect(orgs).toHaveLength(1);
      expect(orgs[0]?.id).toBe(orgBId);
      expect(orgs[0]?.name).toBe("Tenant Beta");

      const audits = await tx.auditLog.findMany();
      expect(audits).toHaveLength(1);
      expect(audits[0]?.organizationId).toBe(orgBId);

      // Invitations for Org A must be invisible under Org B context
      const invites = await tx.invitation.findMany();
      expect(invites).toHaveLength(0);

      // Projects, tasks, comments of Org A must be invisible under Org B context
      const projs = await tx.project.findMany();
      expect(projs).toHaveLength(0);

      const tasks = await tx.task.findMany();
      expect(tasks).toHaveLength(0);

      const comments = await tx.comment.findMany();
      expect(comments).toHaveLength(0);

      // Cross-tenant project update: attempting to rename Org A's project affects 0 rows
      const projectUpdate = await tx.project.updateMany({
        where: { organizationId: orgAId },
        data: { name: "Hacked Project" },
      });
      expect(projectUpdate.count).toBe(0);

      // Cross-tenant task delete: attempting to delete Org A's tasks affects 0 rows
      const taskDelete = await tx.task.deleteMany({
        where: { organizationId: orgAId },
      });
      expect(taskDelete.count).toBe(0);

      // Cross-tenant membership manipulation: attempting to modify Org A's membership affects 0 rows
      const memberUpdateCount = await tx.membership.updateMany({
        where: { organizationId: orgAId },
        data: { role: "MEMBER" },
      });
      expect(memberUpdateCount.count).toBe(0);

      // Cross-tenant invitation manipulation: attempting to delete Org A's invitations affects 0 rows
      const inviteDeleteCount = await tx.invitation.deleteMany({
        where: { organizationId: orgAId },
      });
      expect(inviteDeleteCount.count).toBe(0);

      // Cannot see Org A
      const orgADirect = await tx.organization.findUnique({
        where: { id: orgAId },
      });
      expect(orgADirect).toBeNull();
    });
  });

  it("ensures transaction-local tenant context does not leak across connection reuse", async () => {
    // 1. Run transaction with tenant context
    await appDb.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${orgAId}, true)`;
      const count = await tx.organization.count();
      expect(count).toBe(1);
    });

    // 2. Query outside transaction: context must have automatically reset to null
    const countAfter = await appDb.organization.count();
    expect(countAfter).toBe(0);
  });

  it("rolls back partial organization creation on error without leaving orphaned data", async () => {
    const dummyOrgId = randomUUID();

    await expect(
      adminDb.$transaction(async (tx) => {
        await tx.organization.create({
          data: {
            id: dummyOrgId,
            name: "Failed Transaction Org",
            slug: "failed-tx-org",
            creatorId: userAId,
          },
        });

        // Deliberately trigger an error
        throw new Error("Simulation of catastrophic failure midway");
      }),
    ).rejects.toThrow("Simulation of catastrophic failure midway");

    // Verify organization was rolled back completely
    const org = await adminDb.organization.findUnique({
      where: { id: dummyOrgId },
    });
    expect(org).toBeNull();
  });
});

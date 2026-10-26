import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@workspace/database";
import { testAppDatabaseUrl, testDatabaseUrl } from "./test-env.js";

/**
 * End-to-end proof that the API works when DATABASE_URL points at the
 * unprivileged, NOBYPASSRLS application role. Fixtures are created through the
 * public API; the administrative connection is only used for cleanup and
 * assertions that deliberately bypass RLS.
 */
const adminDatabaseUrl = testDatabaseUrl;
const appDatabaseUrl = testAppDatabaseUrl;

// Must be set before the database package and app are imported.
process.env.DATABASE_URL = appDatabaseUrl;
process.env.NODE_ENV = "test";

describe("RLS runtime enforcement (workspace_app role)", () => {
  let app: Express;
  let adminDb: PrismaClient;
  let appDb: PrismaClient;

  beforeAll(async () => {
    const { PrismaClient } = await import("@workspace/database");
    adminDb = new PrismaClient({
      datasources: { db: { url: adminDatabaseUrl } },
    });
    appDb = new PrismaClient({ datasources: { db: { url: appDatabaseUrl } } });

    // Cascades to all tenant-owned tables.
    await adminDb.$executeRawUnsafe(
      'TRUNCATE TABLE "users", "organizations" RESTART IDENTITY CASCADE',
    );

    const { createApp } = await import("../app.js");
    app = createApp();
  });

  afterAll(async () => {
    await adminDb.$executeRawUnsafe(
      'TRUNCATE TABLE "users", "organizations" RESTART IDENTITY CASCADE',
    );
    await Promise.all([adminDb.$disconnect(), appDb.$disconnect()]);
  });

  async function register(email: string, displayName: string) {
    const res = await request(app).post("/api/v1/auth/register").send({
      email,
      password: "Password123!",
      displayName,
    });
    const cookie = res.headers["set-cookie"]?.[0];
    if (res.status !== 201 || !cookie) {
      throw new Error(
        `Registration failed (${res.status}): ${JSON.stringify(res.body)}`,
      );
    }
    return { cookie, user: res.body.data.user as { id: string } };
  }

  async function createOrganization(
    cookie: string,
    name: string,
    slug: string,
  ) {
    const res = await request(app)
      .post("/api/v1/organizations")
      .set("Cookie", cookie)
      .send({ name, slug });
    if (res.status !== 201) {
      throw new Error(
        `Organization creation failed (${res.status}): ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.data.organization as { id: string };
  }

  it("runs the API on a role that cannot bypass RLS", async () => {
    const rows = await appDb.$queryRaw<
      Array<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>
    >`SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.current_user).toBe("workspace_app");
    expect(rows[0]?.rolsuper).toBe(false);
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it("passes the production startup security assertion", async () => {
    process.env.ENFORCE_RLS_RUNTIME = "true";
    const { assertRlsRuntimeRole } = await import("@workspace/database");
    await expect(assertRlsRuntimeRole()).resolves.toBeUndefined();
  });

  it("isolates organizations and projects across tenants", async () => {
    const alice = await register("alice.runtime@example.com", "Alice Runtime");
    const bob = await register("bob.runtime@example.com", "Bob Runtime");

    const orgA = await createOrganization(
      alice.cookie,
      "Runtime Alpha",
      "runtime-alpha",
    );
    const orgB = await createOrganization(
      bob.cookie,
      "Runtime Beta",
      "runtime-beta",
    );

    const projectRes = await request(app)
      .post(`/api/v1/organizations/${orgA.id}/projects`)
      .set("Cookie", alice.cookie)
      .send({ name: "Alpha Project", slug: "alpha-project" });
    expect(projectRes.status).toBe(201);

    // The creator sees their own tenant data.
    const aliceProjects = await request(app)
      .get(`/api/v1/organizations/${orgA.id}/projects`)
      .set("Cookie", alice.cookie);
    expect(aliceProjects.status).toBe(200);
    expect(aliceProjects.body.data.items).toHaveLength(1);
    expect(aliceProjects.body.data.items[0].name).toBe("Alpha Project");

    // Cross-tenant reads fail with the same non-disclosing 404 as a
    // non-existent organization.
    const aliceReadsBeta = await request(app)
      .get(`/api/v1/organizations/${orgB.id}/projects`)
      .set("Cookie", alice.cookie);
    expect(aliceReadsBeta.status).toBe(404);
    expect(aliceReadsBeta.body.error.code).toBe("NOT_FOUND");

    const bobReadsAlpha = await request(app)
      .get(`/api/v1/organizations/${orgA.id}/projects`)
      .set("Cookie", bob.cookie);
    expect(bobReadsAlpha.status).toBe(404);

    // Organization listing is account-scoped and must not leak other tenants.
    const aliceOrgs = await request(app)
      .get("/api/v1/organizations")
      .set("Cookie", alice.cookie);
    expect(aliceOrgs.status).toBe(200);
    expect(aliceOrgs.body.data.organizations.map((o: any) => o.id)).toEqual([
      orgA.id,
    ]);

    const bobOrgs = await request(app)
      .get("/api/v1/organizations")
      .set("Cookie", bob.cookie);
    expect(bobOrgs.status).toBe(200);
    expect(bobOrgs.body.data.organizations.map((o: any) => o.id)).toEqual([
      orgB.id,
    ]);
  });

  it("returns no tenant rows without an RLS transaction context", async () => {
    expect(await appDb.organization.count()).toBe(0);
    expect(await appDb.project.count()).toBe(0);
    expect(await appDb.membership.count()).toBe(0);
  });

  it("scopes a directly executed context to exactly one tenant", async () => {
    const orgs = await adminDb.organization.findMany({
      orderBy: { slug: "asc" },
      select: { id: true, slug: true },
    });
    expect(orgs).toHaveLength(2);
    const [orgA, orgB] = orgs;

    const { prisma, withTenantTransaction } =
      await import("@workspace/database");

    const visible = await withTenantTransaction(orgA!.id, async () => {
      const [a, b] = await Promise.all([
        prisma.project.count({ where: { organizationId: orgA!.id } }),
        prisma.project.count({ where: { organizationId: orgB!.id } }),
      ]);
      return { a, b };
    });

    expect(visible.a).toBe(1);
    expect(visible.b).toBe(0);
  });
});

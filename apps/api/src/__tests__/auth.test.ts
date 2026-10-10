import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "@workspace/database";
import { env } from "../config/env.js";

describe("Authentication API", () => {
  const app = createApp();

  beforeEach(async () => {
    // Clean test tables
    await prisma.session.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  });

  it("registers a new user and sets a secure HttpOnly session cookie", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "Test.User@Example.com",
      password: "Password123!",
      displayName: "Test User",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe("test.user@example.com"); // normalized
    expect(res.body.data.user.displayName).toBe("Test User");
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.token).toBeUndefined(); // raw token never exposed

    // Check cookie
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieList = Array.isArray(cookies) ? cookies : [cookies as string];
    const sessionCookie = cookieList.find((c: string) =>
      c.startsWith(`${env.SESSION_COOKIE_NAME}=`),
    );
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=Lax");
  });

  it("rejects duplicate email registrations with generic conflict error", async () => {
    await request(app).post("/api/v1/auth/register").send({
      email: "duplicate@example.com",
      password: "Password123!",
      displayName: "First User",
    });

    const res = await request(app).post("/api/v1/auth/register").send({
      email: "DUPLICATE@EXAMPLE.COM",
      password: "DifferentPassword123!",
      displayName: "Second User",
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.message).toContain("already registered");
  });

  it("authenticates valid credentials and rejects incorrect passwords", async () => {
    await request(app).post("/api/v1/auth/register").send({
      email: "login.test@example.com",
      password: "CorrectPassword123!",
      displayName: "Login User",
    });

    // Wrong password
    const failRes = await request(app).post("/api/v1/auth/login").send({
      email: "login.test@example.com",
      password: "WrongPassword!",
    });

    expect(failRes.status).toBe(401);
    expect(failRes.body.success).toBe(false);
    expect(failRes.body.error.code).toBe("UNAUTHORIZED");
    expect(failRes.headers["set-cookie"]).toBeUndefined();

    // Correct password
    const successRes = await request(app).post("/api/v1/auth/login").send({
      email: "login.test@example.com",
      password: "CorrectPassword123!",
    });

    expect(successRes.status).toBe(200);
    expect(successRes.body.success).toBe(true);
    expect(successRes.headers["set-cookie"]).toBeDefined();
  });

  it("prevents disabled accounts from logging in", async () => {
    const regRes = await request(app).post("/api/v1/auth/register").send({
      email: "disabled@example.com",
      password: "Password123!",
      displayName: "Disabled User",
    });

    const userId = regRes.body.data.user.id;
    await prisma.user.update({
      where: { id: userId },
      data: { status: "DISABLED", disabledAt: new Date() },
    });

    const res = await request(app).post("/api/v1/auth/login").send({
      email: "disabled@example.com",
      password: "Password123!",
    });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns profile on GET /api/v1/me and rejects expired/revoked sessions", async () => {
    const regRes = await request(app).post("/api/v1/auth/register").send({
      email: "me.test@example.com",
      password: "Password123!",
      displayName: "Me User",
    });

    const cookieHeader = regRes.headers["set-cookie"]?.[0];

    const meRes = await request(app)
      .get("/api/v1/me")
      .set("Cookie", cookieHeader!);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe("me.test@example.com");

    // Logout to revoke session
    const logoutRes = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookieHeader!);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers["set-cookie"]?.[0]).toContain(
      "workspace_session=;",
    );

    // Attempting /me with revoked session must be rejected
    const revokedRes = await request(app)
      .get("/api/v1/me")
      .set("Cookie", cookieHeader!);

    expect(revokedRes.status).toBe(401);
  });

  it("rejects malformed inputs on registration with 400 validation error", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "not-an-email",
      password: "short",
      displayName: "",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects expired sessions with 401 unauthorized", async () => {
    const regRes = await request(app).post("/api/v1/auth/register").send({
      email: "expired.user@example.com",
      password: "Password123!",
      displayName: "Expired User",
    });

    const cookieHeader = regRes.headers["set-cookie"]?.[0];
    const userId = regRes.body.data.user.id;

    // Manually expire sessions for this user in the database
    await prisma.session.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 60000) },
    });

    const res = await request(app)
      .get("/api/v1/me")
      .set("Cookie", cookieHeader!);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma, checkDatabaseConnection } from "@workspace/database";
import {
  generateTotpSecret,
  generateCurrentTotp,
  generateTotpForCounter,
  getCurrentTotpCounter,
  encryptSecret,
  decryptSecret,
} from "../lib/crypto.js";
import { sanitizeMetadata } from "../services/audit.service.js";

describe("Prompt 10: Enterprise Security, MFA, Sessions & Audit Logs", () => {
  const app = createApp();
  let dbAvailable = false;

  function getCookie(res: request.Response): string {
    const cookies = res.headers["set-cookie"];
    if (Array.isArray(cookies) && cookies.length > 0) {
      return cookies[0]!;
    }
    return typeof cookies === "string" ? cookies : "";
  }

  beforeAll(async () => {
    const health = await checkDatabaseConnection();
    dbAvailable = health.ok;
  });

  beforeEach(async (context) => {
    if (!dbAvailable) {
      context.skip();
      return;
    }
    // Clean test data
    await prisma.mfaChallenge.deleteMany();
    await prisma.mfaRecoveryCode.deleteMany();
    await prisma.organizationSecurityPolicy.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  });

  describe("1. Audit Logging & Sanitization", () => {
    it("sanitizes sensitive secrets, passwords, tokens, and MFA codes from metadata", () => {
      const dirtyMetadata = {
        email: "alice@example.com",
        password: "SuperSecretPassword123!",
        password_hash: "$argon2id$v=19$m=65536,t=3,p=4$...",
        token: "session_bearer_token",
        rawToken: "raw_random_32_bytes",
        totp: "123456",
        recoveryCode: "ABCDE-12345",
        apiKey: "ws_live_secret123",
        nested: {
          webhookSecret: "whsec_super_secret",
          safeField: "safe_value",
        },
      };

      const clean = sanitizeMetadata(dirtyMetadata);

      expect(clean.email).toBe("alice@example.com");
      expect(clean.password).toBeUndefined();
      expect(clean.password_hash).toBeUndefined();
      expect(clean.token).toBeUndefined();
      expect(clean.rawToken).toBeUndefined();
      expect(clean.totp).toBeUndefined();
      expect(clean.recoveryCode).toBeUndefined();
      expect(clean.apiKey).toBeUndefined();
      expect((clean.nested as any).webhookSecret).toBeUndefined();
      expect((clean.nested as any).safeField).toBe("safe_value");
    });

    it("records audit logs on successful and failed logins without leaking secrets", async () => {
      // Register user
      const regRes = await request(app).post("/api/v1/auth/register").send({
        email: "security.user@example.com",
        password: "ValidPassword123!",
        displayName: "Security User",
      });
      expect(regRes.status).toBe(201);

      // Failed login attempt
      const failRes = await request(app).post("/api/v1/auth/login").send({
        email: "security.user@example.com",
        password: "WrongPassword999!",
      });
      expect(failRes.status).toBe(401);

      // Check audit log for failed login
      const failedAudit = await prisma.auditLog.findFirst({
        where: {
          action: "auth.login.failure",
          outcome: "FAILURE",
        },
      });
      expect(failedAudit).toBeDefined();
      expect(failedAudit?.outcome).toBe("FAILURE");
      // Must not contain plain password
      expect(JSON.stringify(failedAudit?.metadata)).not.toContain(
        "WrongPassword999!",
      );

      // Successful login
      const successRes = await request(app).post("/api/v1/auth/login").send({
        email: "security.user@example.com",
        password: "ValidPassword123!",
      });
      expect(successRes.status).toBe(200);

      const successAudit = await prisma.auditLog.findFirst({
        where: {
          action: "auth.login.success",
          outcome: "SUCCESS",
        },
      });
      expect(successAudit).toBeDefined();
      expect(JSON.stringify(successAudit?.metadata)).not.toContain(
        "ValidPassword123!",
      );
    });
  });

  describe("2. User Session Management", () => {
    it("lists active sessions with metadata and allows individual and bulk revocation", async () => {
      // 1. Register user (creates first session)
      const regRes = await request(app).post("/api/v1/auth/register").send({
        email: "session.tester@example.com",
        password: "Password123!",
        displayName: "Session Tester",
      });
      const cookie1 = getCookie(regRes);

      // 2. Perform second login from another simulated device
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .set("User-Agent", "Firefox on Linux")
        .send({
          email: "session.tester@example.com",
          password: "Password123!",
        });
      const cookie2 = getCookie(loginRes);

      // 3. List sessions using second device
      const listRes = await request(app)
        .get("/api/v1/auth/sessions")
        .set("Cookie", cookie2);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.sessions.length).toBe(2);
      const current = listRes.body.data.sessions.find((s: any) => s.isCurrent);
      const other = listRes.body.data.sessions.find((s: any) => !s.isCurrent);
      expect(current).toBeDefined();
      expect(current.userAgent).toBe("Firefox on Linux");
      expect(other).toBeDefined();

      // 4. Revoke the first session individually using its ID
      const revokeOneRes = await request(app)
        .delete(`/api/v1/auth/sessions/${other.id}`)
        .set("Cookie", cookie2);
      expect(revokeOneRes.status).toBe(200);

      // Verify that revoked session 1 loses access immediately
      const revokedAccessRes = await request(app)
        .get("/api/v1/auth/sessions")
        .set("Cookie", cookie1);
      expect(revokedAccessRes.status).toBe(401);

      // Verify session 2 still has access
      const activeAccessRes = await request(app)
        .get("/api/v1/auth/sessions")
        .set("Cookie", cookie2);
      expect(activeAccessRes.status).toBe(200);
      expect(activeAccessRes.body.data.sessions.length).toBe(1);

      // 5. Create a 3rd session, then revoke-all-other
      const loginRes3 = await request(app)
        .post("/api/v1/auth/login")
        .set("User-Agent", "Safari on iPhone")
        .send({
          email: "session.tester@example.com",
          password: "Password123!",
        });
      const cookie3 = getCookie(loginRes3);

      const revokeOtherRes = await request(app)
        .delete("/api/v1/auth/sessions/other")
        .set("Cookie", cookie3);
      expect(revokeOtherRes.status).toBe(200);
      expect(revokeOtherRes.body.data.revokedCount).toBe(1);

      // Cookie 2 should now be revoked
      const cookie2Check = await request(app)
        .get("/api/v1/auth/sessions")
        .set("Cookie", cookie2);
      expect(cookie2Check.status).toBe(401);

      // Cookie 3 should remain active
      const cookie3Check = await request(app)
        .get("/api/v1/auth/sessions")
        .set("Cookie", cookie3);
      expect(cookie3Check.status).toBe(200);
    });

    it("prevents revoking sessions belonging to another user", async () => {
      // User A
      const userARes = await request(app).post("/api/v1/auth/register").send({
        email: "user.a@example.com",
        password: "Password123!",
        displayName: "User A",
      });
      const cookieA = getCookie(userARes);

      // User B
      const userBRes = await request(app).post("/api/v1/auth/register").send({
        email: "user.b@example.com",
        password: "Password123!",
        displayName: "User B",
      });
      const cookieB = getCookie(userBRes);

      // Get User B's session ID
      const sessionsB = await request(app)
        .get("/api/v1/auth/sessions")
        .set("Cookie", cookieB);
      const sessionBId = sessionsB.body.data.sessions[0].id;

      // User A attempts to revoke User B's session
      const maliciousRevoke = await request(app)
        .delete(`/api/v1/auth/sessions/${sessionBId}`)
        .set("Cookie", cookieA);

      expect(maliciousRevoke.status).toBe(404);

      // User B's session must still be alive
      const verifyB = await request(app)
        .get("/api/v1/auth/sessions")
        .set("Cookie", cookieB);
      expect(verifyB.status).toBe(200);
    });
  });

  describe("3. Multi-Factor Authentication (TOTP) & Recovery", () => {
    it("handles full lifecycle: setup, activation, challenge, login, replay protection, and disablement", async () => {
      // 1. Register user
      const regRes = await request(app).post("/api/v1/auth/register").send({
        email: "mfa.user@example.com",
        password: "Password123!",
        displayName: "MFA User",
      });
      const cookie = getCookie(regRes);

      // 2. Initiate MFA setup
      const setupRes = await request(app)
        .post("/api/v1/auth/mfa/setup")
        .set("Cookie", cookie);

      expect(setupRes.status).toBe(200);
      expect(setupRes.body.data.secret).toBeDefined();
      expect(setupRes.body.data.qrCodeUri).toContain("otpauth://totp/");
      expect(setupRes.body.data.recoveryCodes.length).toBe(10);

      const secret = setupRes.body.data.secret;
      const recoveryCode1 = setupRes.body.data.recoveryCodes[0];

      // 3. Confirm enrollment with invalid code -> fails
      const invalidEnableRes = await request(app)
        .post("/api/v1/auth/mfa/enable")
        .set("Cookie", cookie)
        .send({ code: "000000" });
      expect(invalidEnableRes.status).toBe(400);

      // 4. Confirm enrollment with valid TOTP code
      const validCode = generateCurrentTotp(secret);
      const enableRes = await request(app)
        .post("/api/v1/auth/mfa/enable")
        .set("Cookie", cookie)
        .send({ code: validCode });

      expect(enableRes.status).toBe(200);

      // Verify user has mfaEnabled = true in DB
      const userInDb = await prisma.user.findUnique({
        where: { email: "mfa.user@example.com" },
      });
      expect(userInDb?.mfaEnabled).toBe(true);

      // 5. Subsequent password login requires MFA challenge
      const loginChallengeRes = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "mfa.user@example.com",
          password: "Password123!",
        });

      expect(loginChallengeRes.status).toBe(200);
      expect(loginChallengeRes.body.data.mfaRequired).toBe(true);
      expect(loginChallengeRes.body.data.challengeToken).toBeDefined();
      expect(loginChallengeRes.headers["set-cookie"]).toBeUndefined(); // NO session cookie!

      const challengeToken = loginChallengeRes.body.data.challengeToken;

      // 6. Verify challenge with TOTP code
      // Try invalid code
      const badChallengeRes = await request(app)
        .post("/api/v1/auth/mfa/challenge/verify")
        .send({
          challengeToken,
          code: "999999",
        });
      expect(badChallengeRes.status).toBe(401);

      // Complete challenge with a valid TOTP code from the next window.
      // The enrollment code is stored as mfaLastUsedCode and intentionally
      // rejected as a replay, so reusing generateCurrentTotp would fail.
      const freshCode = generateTotpForCounter(
        secret,
        getCurrentTotpCounter(Date.now()) + 1,
      );
      const verifyChallengeRes = await request(app)
        .post("/api/v1/auth/mfa/challenge/verify")
        .send({
          challengeToken,
          code: freshCode,
        });

      expect(verifyChallengeRes.status).toBe(200);
      expect(verifyChallengeRes.body.data.user.email).toBe(
        "mfa.user@example.com",
      );
      expect(verifyChallengeRes.headers["set-cookie"]).toBeDefined(); // Now session cookie is set!

      // 7. Verify that consumed challenge token cannot be reused
      const replayChallengeRes = await request(app)
        .post("/api/v1/auth/mfa/challenge/verify")
        .send({
          challengeToken,
          code: freshCode,
        });
      expect(replayChallengeRes.status).toBe(401);

      // 8. Test Login with Single-Use Recovery Code
      const loginChallengeRes2 = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "mfa.user@example.com",
          password: "Password123!",
        });
      const challengeToken2 = loginChallengeRes2.body.data.challengeToken;

      const recoveryLoginRes = await request(app)
        .post("/api/v1/auth/mfa/challenge/recovery")
        .send({
          challengeToken: challengeToken2,
          recoveryCode: recoveryCode1,
        });

      expect(recoveryLoginRes.status).toBe(200);
      expect(recoveryLoginRes.headers["set-cookie"]).toBeDefined();

      // 9. Verify that consumed recovery code CANNOT be reused
      const loginChallengeRes3 = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "mfa.user@example.com",
          password: "Password123!",
        });
      const challengeToken3 = loginChallengeRes3.body.data.challengeToken;

      const reuseRecoveryRes = await request(app)
        .post("/api/v1/auth/mfa/challenge/recovery")
        .send({
          challengeToken: challengeToken3,
          recoveryCode: recoveryCode1,
        });
      expect(reuseRecoveryRes.status).toBe(401);

      // 10. Disable MFA (requires password confirmation)
      const authenticatedCookie = getCookie(recoveryLoginRes);

      // Wrong password fails
      const badDisableRes = await request(app)
        .post("/api/v1/auth/mfa/disable")
        .set("Cookie", authenticatedCookie)
        .send({ password: "WrongPassword!" });
      expect(badDisableRes.status).toBe(401);

      // Correct password succeeds
      const goodDisableRes = await request(app)
        .post("/api/v1/auth/mfa/disable")
        .set("Cookie", authenticatedCookie)
        .send({ password: "Password123!" });
      expect(goodDisableRes.status).toBe(200);

      // DB check: mfa is disabled
      const userAfterDisable = await prisma.user.findUnique({
        where: { email: "mfa.user@example.com" },
      });
      expect(userAfterDisable?.mfaEnabled).toBe(false);
      expect(userAfterDisable?.mfaSecretEncrypted).toBeNull();
    });
  });

  describe("4. Organization Security Policies & Enforcement", () => {
    it("enforces mandatory MFA requirement on organization members", async () => {
      // 1. Create owner with MFA
      const ownerRes = await request(app).post("/api/v1/auth/register").send({
        email: "org.owner@example.com",
        password: "Password123!",
        displayName: "Org Owner",
      });
      const ownerCookie = getCookie(ownerRes);

      // Enable MFA for owner
      const setupRes = await request(app)
        .post("/api/v1/auth/mfa/setup")
        .set("Cookie", ownerCookie);
      const ownerSecret = setupRes.body.data.secret;
      await request(app)
        .post("/api/v1/auth/mfa/enable")
        .set("Cookie", ownerCookie)
        .send({ code: generateCurrentTotp(ownerSecret) });

      // Create organization
      const orgRes = await request(app)
        .post("/api/v1/organizations")
        .set("Cookie", ownerCookie)
        .send({
          name: "Security Focused Corp",
          slug: "sec-corp",
        });
      expect(orgRes.status).toBe(201);
      const organizationId = orgRes.body.data.organization.id;

      // 2. Create member WITHOUT MFA
      const memberRes = await request(app).post("/api/v1/auth/register").send({
        email: "unprotected.member@example.com",
        password: "Password123!",
        displayName: "Unprotected Member",
      });
      const memberCookie = getCookie(memberRes);
      const memberId = memberRes.body.data.user.id;

      // Add member to organization
      await prisma.membership.create({
        data: {
          organizationId,
          userId: memberId,
          role: "MEMBER",
          status: "ACTIVE",
        },
      });

      // Member can access org initially before policy is turned on
      const initialAccess = await request(app)
        .get(`/api/v1/organizations/${organizationId}/projects`)
        .set("Cookie", memberCookie);
      expect(initialAccess.status).toBe(200);

      // 3. Owner configures policy: requireMfa = true
      const policyUpdateRes = await request(app)
        .patch(`/api/v1/organizations/${organizationId}/security/policy`)
        .set("Cookie", ownerCookie)
        .send({
          requireMfa: true,
          sessionMaxAgeMinutes: 60,
        });

      expect(policyUpdateRes.status).toBe(200);
      expect(policyUpdateRes.body.data.policy.requireMfa).toBe(true);

      // 4. Member WITHOUT MFA is now rejected with 403 FORBIDDEN
      const blockedAccess = await request(app)
        .get(`/api/v1/organizations/${organizationId}/projects`)
        .set("Cookie", memberCookie);

      expect(blockedAccess.status).toBe(403);
      expect(blockedAccess.body.error.message).toContain(
        "Multi-Factor Authentication (MFA) is required",
      );

      // 5. Member enrolls in MFA
      const memberSetup = await request(app)
        .post("/api/v1/auth/mfa/setup")
        .set("Cookie", memberCookie);
      const memberSecret = memberSetup.body.data.secret;
      await request(app)
        .post("/api/v1/auth/mfa/enable")
        .set("Cookie", memberCookie)
        .send({ code: generateCurrentTotp(memberSecret) });

      // 6. Member can now access organization successfully
      const unblockedAccess = await request(app)
        .get(`/api/v1/organizations/${organizationId}/projects`)
        .set("Cookie", memberCookie);
      expect(unblockedAccess.status).toBe(200);

      // 7. Non-admin member cannot update organization security policy
      const unauthorizedPolicyChange = await request(app)
        .patch(`/api/v1/organizations/${organizationId}/security/policy`)
        .set("Cookie", memberCookie)
        .send({ requireMfa: false });
      expect(unauthorizedPolicyChange.status).toBe(403);

      // 8. Admin/Owner can view organization audit logs
      const auditLogRes = await request(app)
        .get(`/api/v1/organizations/${organizationId}/security/audit-logs`)
        .set("Cookie", ownerCookie);
      expect(auditLogRes.status).toBe(200);
      expect(auditLogRes.body.data.items).toBeDefined();

      // Ordinary member cannot view audit logs
      const memberAuditRes = await request(app)
        .get(`/api/v1/organizations/${organizationId}/security/audit-logs`)
        .set("Cookie", memberCookie);
      expect(memberAuditRes.status).toBe(403);
    });
  });

  describe("5. Cryptographic Guarantees", () => {
    it("encrypts secrets at rest with AES-256-GCM and fails cleanly on tampering", () => {
      const plainSecret = generateTotpSecret();
      const encrypted = encryptSecret(plainSecret);

      expect(encrypted).not.toBe(plainSecret);
      expect(encrypted.split(":").length).toBe(3); // iv:tag:cipher

      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(plainSecret);

      // Tamper ciphertext
      const parts = encrypted.split(":");
      parts[2] = parts[2]!.slice(0, -2) + "00";
      const tampered = parts.join(":");

      expect(() => decryptSecret(tampered)).toThrow();
    });
  });
});

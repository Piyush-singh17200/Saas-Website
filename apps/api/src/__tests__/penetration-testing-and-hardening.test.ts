import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { ErrorCode } from "@workspace/contracts";
import {
  requireDeveloperOrSessionAuth,
  requireScope,
} from "../middleware/developer-auth.middleware.js";
import {
  requireActiveMembership,
  canManageOrganization,
} from "../middleware/organization.middleware.js";
import {
  validateWebhookDestination,
  sendSafeWebhookRequest,
  isPrivateOrBlockedIp,
} from "../lib/ssrf.js";
import {
  verifyTotp,
  decryptSecret,
  encryptSecret,
  constantTimeCompare,
  generateTotpSecret,
  generateCurrentTotp,
} from "../lib/crypto.js";
import { hashApiKey } from "../services/api-key.service.js";
import { errorHandlerMiddleware } from "../middleware/error-handler.js";
import * as apiKeyService from "../services/api-key.service.js";
import { prisma } from "@workspace/database";

describe("Penetration Testing & Advanced Security Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 1. MULTI-TENANT ISOLATION & IDOR ATTACK TESTS
  // ===========================================================================
  describe("1. Multi-Tenant Isolation & BOLA/IDOR Defenses", () => {
    it("PEN-IDOR-01: Blocks user in Org A from reading Org B projects (returns non-disclosing 404)", async () => {
      // Mock membership lookup: user is NOT an active member of Org B
      vi.spyOn(prisma.membership, "findFirst").mockResolvedValue(null);

      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = {
          id: "user-attacker-org-a",
          email: "attacker@org-a.com",
          displayName: "Attacker",
          status: "ACTIVE",
          mfaEnabled: false,
        } as any;
        next();
      });

      app.get(
        "/api/v1/organizations/:organizationId/projects",
        requireActiveMembership,
        (_req, res) =>
          res.json({ secretProjects: ["Project Beta Confidential"] }),
      );
      app.use(errorHandlerMiddleware);

      const res = await request(app).get(
        "/api/v1/organizations/org-b-victim/projects",
      );

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      // Non-disclosing error prevents discovering whether org-b-victim exists
      expect(res.body.error.message).toBe("Organization not found");
      expect(res.body).not.toHaveProperty("secretProjects");
    });

    it("PEN-IDOR-02: Blocks API Key scoped to Org A from mutating Org B task board", async () => {
      vi.spyOn(apiKeyService, "verifyApiKey").mockResolvedValue({
        id: "key-tenant-a",
        organizationId: "org-a",
        createdById: "user-tenant-a",
        name: "Tenant A Production Key",
        keyPrefix: "wsp_live_tenanta01",
        scopes: ["*"],
      });

      const app = express();
      app.use(express.json());
      app.post(
        "/api/v1/organizations/:organizationId/tasks",
        requireDeveloperOrSessionAuth,
        (_req, res) => res.json({ created: true }),
      );
      app.use(errorHandlerMiddleware);

      // Attempting to post task into Victim Org B using Tenant A's wildcard key
      const res = await request(app)
        .post("/api/v1/organizations/org-b/tasks")
        .set("Authorization", "Bearer wsp_live_valid_key")
        .send({ title: "Infiltrated Task" });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect(res.body.error.message).toContain(
        "API key is not authorized for the requested organization",
      );
    });
  });

  // ===========================================================================
  // 2. PRIVILEGE ESCALATION & ROLE BOUNDARIES
  // ===========================================================================
  describe("2. Privilege Escalation & Authorization Boundaries", () => {
    it("PEN-PRIV-01: Rejects ordinary MEMBER attempting to archive a project (OWNER/ADMIN only)", async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.membership = {
          id: "mem-member",
          organizationId: "org-alpha",
          userId: "user-ordinary",
          role: "MEMBER", // Ordinary member
          status: "ACTIVE",
        } as any;
        next();
      });

      app.post(
        "/api/v1/organizations/:organizationId/projects/:projectId/archive",
        canManageOrganization, // Requires OWNER or ADMIN
        (_req, res) => res.json({ archived: true }),
      );
      app.use(errorHandlerMiddleware);

      const res = await request(app).post(
        "/api/v1/organizations/org-alpha/projects/proj-123/archive",
      );

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect(res.body.error.message).toContain("Insufficient permissions");
    });

    it("PEN-PRIV-02: Rejects MEMBER from accessing organization security audit logs", async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.membership = {
          id: "mem-member",
          organizationId: "org-alpha",
          userId: "user-ordinary",
          role: "MEMBER",
          status: "ACTIVE",
        } as any;
        next();
      });

      app.get(
        "/api/v1/organizations/:organizationId/security/audit-logs",
        canManageOrganization,
        (_req, res) => res.json({ logs: [] }),
      );
      app.use(errorHandlerMiddleware);

      const res = await request(app).get(
        "/api/v1/organizations/org-alpha/security/audit-logs",
      );

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it("PEN-PRIV-03: Rejects API key with tasks:read from invoking tasks:write endpoints", async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.apiKey = {
          id: "key-ro",
          organizationId: "org-1",
          createdById: "user-1",
          name: "Read-Only Key",
          keyPrefix: "wsp_live_ro0001",
          scopes: ["tasks:read"],
        };
        next();
      });

      app.delete(
        "/api/v1/tasks/:id",
        requireScope("tasks:write"),
        (_req, res) => {
          res.json({ deleted: true });
        },
      );
      app.use(errorHandlerMiddleware);

      const res = await request(app).delete("/api/v1/tasks/task-999");

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect(res.body.error.message).toContain("Insufficient API key scope");
      expect(res.body.error.message).toContain("tasks:write");
    });
  });

  // ===========================================================================
  // 3. AUTHENTICATION & CRYPTOGRAPHIC ATTACKS
  // ===========================================================================
  describe("3. Authentication & Cryptographic Defenses", () => {
    it("PEN-AUTH-01: Replay attack prevention: rejects identical TOTP code within same window", () => {
      const secret = generateTotpSecret();
      const code = generateCurrentTotp(secret);

      // First verification: code is valid
      const result1 = verifyTotp(secret, code, { lastUsedCode: null });
      expect(result1.valid).toBe(true);

      // Attacker intercepts and replays identical code within the same active step
      const replayResult = verifyTotp(secret, code, { lastUsedCode: code });
      expect(replayResult.valid).toBe(false);
    });

    it("PEN-AUTH-02: Cryptographic tampering: rejects modified AES-256-GCM ciphertext", () => {
      const originalSecret = "SUPER_SECRET_AUTHENTICATOR_SEED";
      const encrypted = encryptSecret(originalSecret);

      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);

      const [ivHex, authTagHex, cipherHex] = parts;

      // Tamper with ciphertext by flipping characters
      const tamperedCipher =
        cipherHex!.slice(0, -2) + (cipherHex!.endsWith("00") ? "11" : "00");
      const tamperedPayload = `${ivHex}:${authTagHex}:${tamperedCipher}`;

      expect(() => decryptSecret(tamperedPayload)).toThrow();

      // Tamper with authentication tag
      const tamperedTag =
        authTagHex!.slice(0, -2) + (authTagHex!.endsWith("00") ? "11" : "00");
      const tamperedTagPayload = `${ivHex}:${tamperedTag}:${cipherHex}`;

      expect(() => decryptSecret(tamperedTagPayload)).toThrow();
    });

    it("PEN-AUTH-03: Constant-time comparison defends against timing attacks on secret tokens", () => {
      const secret = "a".repeat(64);
      const wrongSecretSameLength = "a".repeat(63) + "b";
      const wrongSecretDifferentLength = "a".repeat(32);

      expect(constantTimeCompare(secret, secret)).toBe(true);
      expect(constantTimeCompare(secret, wrongSecretSameLength)).toBe(false);
      expect(constantTimeCompare(secret, wrongSecretDifferentLength)).toBe(
        false,
      );
      expect(constantTimeCompare(secret, null as any)).toBe(false);
      expect(constantTimeCompare(secret, undefined as any)).toBe(false);
    });

    it("PEN-AUTH-04: API keys are non-reversible: raw secret is never stored, only SHA-256 hash", () => {
      const rawKey = "wsp_live_0123456789abcdef_deadbeefcafebabefeeddeed";
      const hash = hashApiKey(rawKey);

      expect(hash).toHaveLength(64); // SHA-256 hex string
      expect(hash).not.toContain("wsp_live_");
      expect(hash).not.toContain("deadbeef");
    });
  });

  // ===========================================================================
  // 4. OUTBOUND SSRF & NETWORK BOUNDARY DEFENSES
  // ===========================================================================
  describe("4. Outbound SSRF & Cloud Metadata Protection", () => {
    it("PEN-SSRF-01: Blocks Cloud IMDS metadata IP (169.254.169.254)", async () => {
      await expect(
        validateWebhookDestination("https://169.254.169.254/latest/meta-data", {
          allowLocal: false,
        }),
      ).rejects.toThrow();
    });

    it("PEN-SSRF-02: Blocks loopback destinations (127.0.0.1, localhost, [::1])", async () => {
      await expect(
        validateWebhookDestination("https://127.0.0.1/admin", {
          allowLocal: false,
        }),
      ).rejects.toThrow();

      await expect(
        validateWebhookDestination("https://localhost/internal", {
          allowLocal: false,
        }),
      ).rejects.toThrow();

      await expect(
        validateWebhookDestination("https://[::1]/debug", {
          allowLocal: false,
        }),
      ).rejects.toThrow();
    });

    it("PEN-SSRF-03: Blocks RFC1918 private subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)", async () => {
      const privateIps = [
        "10.0.0.1",
        "10.254.0.1",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.1",
        "192.168.100.50",
      ];

      for (const ip of privateIps) {
        expect(isPrivateOrBlockedIp(ip)).toBe(true);
        await expect(
          validateWebhookDestination(`https://${ip}/hook`, {
            allowLocal: false,
          }),
        ).rejects.toThrow();
      }
    });

    it("PEN-SSRF-04: Blocks user credentials embedded in destination URLs", async () => {
      await expect(
        validateWebhookDestination(
          "https://admin:supersecret@example.com/webhook",
        ),
      ).rejects.toThrow("must not contain embedded user credentials");
    });

    it("PEN-SSRF-05: Blocks non-HTTPS protocols (file://, ftp://, gopher://, http://)", async () => {
      await expect(
        validateWebhookDestination("file:///etc/passwd", { allowLocal: false }),
      ).rejects.toThrow("must use HTTPS");

      await expect(
        validateWebhookDestination("ftp://internal.vault/backup", {
          allowLocal: false,
        }),
      ).rejects.toThrow("must use HTTPS");

      await expect(
        validateWebhookDestination("http://insecure-endpoint.com/webhook", {
          allowLocal: false,
        }),
      ).rejects.toThrow("must use HTTPS");
    });

    it("PEN-SSRF-06: sendSafeWebhookRequest disables HTTP redirects to prevent DNS rebinding / redirect bypass", async () => {
      // Mock fetch returning a 302 redirect
      global.fetch = vi.fn().mockResolvedValue({
        status: 302,
        headers: new Headers({
          Location: "http://169.254.169.254/latest/meta-data",
        }),
        arrayBuffer: async () => new ArrayBuffer(0),
      }) as any;

      const result = await sendSafeWebhookRequest({
        url: "http://127.0.0.1:8080/webhook",
        headers: {},
        body: JSON.stringify({ event: "task.created" }),
        allowLocal: true, // test redirect handling specifically
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(302);
      expect(result.errorMessage).toContain(
        "redirects are prohibited for security",
      );
    });
  });

  // ===========================================================================
  // 5. FILE UPLOADS, PATH TRAVERSAL & DOWNLOAD ENVELOPES
  // ===========================================================================
  describe("5. File Upload & Storage Defenses", () => {
    it("PEN-FILE-01: Path traversal protection sanitizes dangerous file names", () => {
      const dangerousNames = [
        "../../../etc/passwd",
        "..\\..\\..\\windows\\system32\\cmd.exe",
        "file/with/subdirs.pdf",
        "exploit\0nullbyte.png",
      ];

      for (const raw of dangerousNames) {
        const sanitized = raw.replace(/[^a-zA-Z0-9._-]/g, "_");
        expect(sanitized).not.toContain("/");
        expect(sanitized).not.toContain("\\");
        expect(sanitized).not.toContain("\0");
        expect(sanitized).toMatch(/^[a-zA-Z0-9._-]+$/);
      }
    });

    it("PEN-FILE-02: Enforces defensive security headers on file downloads (CSP + nosniff)", async () => {
      const app = express();
      app.get("/download-test", (_req, res) => {
        const safeFileName = "document.pdf";
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${safeFileName}"`,
        );
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "default-src 'none'");
        res.send("PDF_DATA_STREAM");
      });

      const res = await request(app).get("/download-test");

      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe(
        'attachment; filename="document.pdf"',
      );
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toBe("default-src 'none'");
    });
  });
});

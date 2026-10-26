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
  requireRole,
} from "../middleware/organization.middleware.js";
import { validateWebhookDestination } from "../lib/ssrf.js";
import {
  errorHandlerMiddleware,
  AppError,
} from "../middleware/error-handler.js";
import * as apiKeyService from "../services/api-key.service.js";
import { prisma } from "@workspace/database";

describe("Security, Tenant Isolation & Reliability Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("1. Route Protection & Authorization Boundaries", () => {
    it("rejects unauthenticated requests with 401 UNAUTHORIZED", async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.id = "req-unauth-test";
        next();
      });
      app.get("/api/protected", requireDeveloperOrSessionAuth, (_req, res) => {
        res.json({ ok: true });
      });
      app.use(errorHandlerMiddleware);

      const res = await request(app).get("/api/protected");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(res.body.meta.requestId).toBe("req-unauth-test");
    });

    it("rejects invalid, expired, or revoked API keys with 401 UNAUTHORIZED", async () => {
      vi.spyOn(apiKeyService, "verifyApiKey").mockResolvedValue(null);

      const app = express();
      app.use(express.json());
      app.get("/api/protected", requireDeveloperOrSessionAuth, (_req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app)
        .get("/api/protected")
        .set("Authorization", "Bearer wsp_live_invalidtoken123");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(res.body.error.message).toContain(
        "Invalid, expired, or revoked API key",
      );
    });
  });

  describe("2. Cross-Tenant Isolation Enforcement", () => {
    it("strictly blocks cross-tenant API key access when route organization does not match key tenant", async () => {
      vi.spyOn(apiKeyService, "verifyApiKey").mockResolvedValue({
        id: "key-123",
        organizationId: "org-alpha-real",
        createdById: "user-creator-123",
        name: "Alpha CI Key",
        keyPrefix: "wsp_live_a1b2",
        scopes: ["tasks:read", "tasks:write"],
      });

      const app = express();
      app.use(express.json());
      app.get(
        "/api/organizations/:organizationId/tasks",
        requireDeveloperOrSessionAuth,
        (_req, res) => res.json({ ok: true }),
      );

      // Attempting to access org-beta using org-alpha's key
      const res = await request(app)
        .get("/api/organizations/org-beta-other/tasks")
        .set("Authorization", "Bearer wsp_live_validtoken");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect(res.body.error.message).toContain(
        "not authorized for the requested organization",
      );
    });

    it("blocks cross-tenant session access when user is not an active member of target organization (non-disclosing 404)", async () => {
      vi.spyOn(prisma.membership, "findFirst").mockResolvedValue(null);

      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = {
          id: "user-bob",
          email: "bob@example.com",
          displayName: "Bob",
          status: "ACTIVE",
          mfaEnabled: false,
        } as any;
        next();
      });

      app.get(
        "/api/organizations/:organizationId/projects",
        requireActiveMembership,
        (_req, res) => res.json({ ok: true }),
      );
      app.use(errorHandlerMiddleware);

      // Bob tries to access org-alpha
      const res = await request(app).get(
        "/api/organizations/org-alpha/projects",
      );

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(res.body.error.message).toContain("Organization not found");
    });

    it("enforces role-based boundaries: rejects non-admin member from performing admin actions", async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.membership = {
          id: "mem-charlie",
          organizationId: "org-alpha",
          userId: "user-charlie",
          role: "MEMBER", // Ordinary member
          status: "ACTIVE",
        } as any;
        next();
      });

      app.delete(
        "/api/organizations/:organizationId/settings",
        requireRole(["OWNER", "ADMIN"]),
        (_req, res) => res.json({ ok: true }),
      );
      app.use(errorHandlerMiddleware);

      const res = await request(app).delete(
        "/api/organizations/org-alpha/settings",
      );

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect(res.body.error.message).toContain("Insufficient permissions");
    });
  });

  describe("3. API Key Scope Enforcement", () => {
    it("enforces granular scopes: allows read with tasks:read but rejects write operations", async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.apiKey = {
          id: "key-readonly",
          organizationId: "org-1",
          createdById: "user-creator-1",
          name: "Read Only Key",
          keyPrefix: "wsp_live_r0a1",
          scopes: ["tasks:read"], // Read-only scope
        };
        next();
      });

      app.post("/api/v1/tasks", requireScope("tasks:write"), (_req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app)
        .post("/api/v1/tasks")
        .send({ title: "New Task" });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect(res.body.error.message).toContain("Insufficient API key scope");
      expect(res.body.error.message).toContain("tasks:write");
    });

    it("allows full access when API key has wildcard * scope", async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.apiKey = {
          id: "key-admin",
          organizationId: "org-1",
          createdById: "user-creator-1",
          name: "Admin Key",
          keyPrefix: "wsp_live_adm1",
          scopes: ["*"], // Wildcard scope
        };
        next();
      });

      app.post("/api/v1/tasks", requireScope("tasks:write"), (_req, res) => {
        res.json({ success: true, created: true });
      });

      const res = await request(app)
        .post("/api/v1/tasks")
        .send({ title: "Admin Task" });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(true);
    });
  });

  describe("4. SSRF & Malicious Target Protection", () => {
    it("rejects loopback and private IPv4 addresses for webhook delivery", async () => {
      const loopbackUrls = [
        "https://127.0.0.1:8080/webhook",
        "https://10.0.0.15/receiver",
        "https://192.168.1.1/webhook",
        "https://169.254.169.254/latest/meta-data/", // AWS metadata service
      ];

      for (const url of loopbackUrls) {
        await expect(
          validateWebhookDestination(url, { allowLocal: false }),
        ).rejects.toThrow();
      }
    });

    it("rejects non-HTTP/HTTPS protocols like file:// and gopher://", async () => {
      await expect(
        validateWebhookDestination("file:///etc/passwd", { allowLocal: false }),
      ).rejects.toThrow();
      await expect(
        validateWebhookDestination("gopher://127.0.0.1:70/", {
          allowLocal: false,
        }),
      ).rejects.toThrow();
    });

    it("approves valid public HTTPS URLs", async () => {
      await expect(
        validateWebhookDestination("https://webhook.site/test-endpoint", {
          allowLocal: false,
        }),
      ).resolves.toBeInstanceOf(URL);
    });
  });

  describe("5. Organization Security Policy Enforcement", () => {
    it("blocks access with 403 when organization requires MFA but user has not enrolled", async () => {
      vi.spyOn(prisma.membership, "findFirst").mockResolvedValue({
        id: "mem-1",
        organizationId: "org-strict",
        userId: "user-no-mfa",
        role: "MEMBER",
        status: "ACTIVE",
        organization: {
          id: "org-strict",
          name: "Strict Corp",
          slug: "strict-corp",
        },
      } as any);

      vi.spyOn(
        prisma.organizationSecurityPolicy,
        "findUnique",
      ).mockResolvedValue({
        id: "pol-1",
        organizationId: "org-strict",
        requireMfa: true, // MFA is required!
        sessionMaxAgeMinutes: 10080,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = {
          id: "user-no-mfa",
          email: "nomfa@example.com",
          displayName: "No MFA User",
          status: "ACTIVE",
          mfaEnabled: false, // NOT Enrolled!
        } as any;
        next();
      });

      app.get(
        "/api/organizations/:organizationId/tasks",
        requireActiveMembership,
        (_req, res) => res.json({ ok: true }),
      );
      app.use(errorHandlerMiddleware);

      const res = await request(app).get("/api/organizations/org-strict/tasks");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect(res.body.error.message).toContain(
        "Multi-Factor Authentication (MFA) is required",
      );
    });

    it("allows access when organization requires MFA and user has MFA enabled", async () => {
      vi.spyOn(prisma.membership, "findFirst").mockResolvedValue({
        id: "mem-2",
        organizationId: "org-strict",
        userId: "user-with-mfa",
        role: "MEMBER",
        status: "ACTIVE",
        organization: {
          id: "org-strict",
          name: "Strict Corp",
          slug: "strict-corp",
        },
      } as any);

      vi.spyOn(
        prisma.organizationSecurityPolicy,
        "findUnique",
      ).mockResolvedValue({
        id: "pol-1",
        organizationId: "org-strict",
        requireMfa: true,
        sessionMaxAgeMinutes: 10080,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = {
          id: "user-with-mfa",
          email: "withmfa@example.com",
          displayName: "With MFA User",
          status: "ACTIVE",
          mfaEnabled: true, // Enrolled!
        } as any;
        next();
      });

      app.get(
        "/api/organizations/:organizationId/tasks",
        requireActiveMembership,
        (_req, res) => res.json({ success: true, authorized: true }),
      );
      app.use(errorHandlerMiddleware);

      const res = await request(app).get("/api/organizations/org-strict/tasks");

      expect(res.status).toBe(200);
      expect(res.body.authorized).toBe(true);
    });
  });

  describe("6. Error Format & Correlation Integrity", () => {
    it("ensures operational AppError returns standard JSON error with correlation requestId", async () => {
      const app = express();
      app.use((req, _res, next) => {
        req.id = "corr-test-id-99";
        next();
      });
      app.get("/error-test", () => {
        throw new AppError(
          "Malformed query parameters",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      });
      app.use(errorHandlerMiddleware);

      const res = await request(app).get("/error-test");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(res.body.error.message).toBe("Malformed query parameters");
      expect(res.body.meta.requestId).toBe("corr-test-id-99");
    });
  });
});

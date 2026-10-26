import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  computeWebhookSignature,
  verifyWebhookSignature,
} from "../services/webhook.service.js";
import { hasScope } from "../services/api-key.service.js";
import {
  isPrivateOrBlockedIp,
  validateWebhookDestination,
} from "../lib/ssrf.js";
import { ApiKeyScope } from "@workspace/contracts";

describe("Developer Platform & Webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("API Key Scope Authorization", () => {
    it("grants access to any scope when wildcard '*' is present", () => {
      const scopes = [ApiKeyScope.ALL];
      expect(hasScope(scopes, ApiKeyScope.PROJECTS_READ)).toBe(true);
      expect(hasScope(scopes, ApiKeyScope.PROJECTS_WRITE)).toBe(true);
      expect(hasScope(scopes, ApiKeyScope.TASKS_READ)).toBe(true);
      expect(hasScope(scopes, ApiKeyScope.TASKS_WRITE)).toBe(true);
      expect(hasScope(scopes, ApiKeyScope.WEBHOOKS_READ)).toBe(true);
      expect(hasScope(scopes, ApiKeyScope.WEBHOOKS_WRITE)).toBe(true);
    });

    it("grants access when exact scope is present", () => {
      const scopes = [ApiKeyScope.PROJECTS_READ, ApiKeyScope.TASKS_READ];
      expect(hasScope(scopes, ApiKeyScope.PROJECTS_READ)).toBe(true);
      expect(hasScope(scopes, ApiKeyScope.TASKS_READ)).toBe(true);
    });

    it("denies access when requested scope is missing", () => {
      const scopes = [ApiKeyScope.PROJECTS_READ];
      expect(hasScope(scopes, ApiKeyScope.PROJECTS_WRITE)).toBe(false);
      expect(hasScope(scopes, ApiKeyScope.TASKS_READ)).toBe(false);
      expect(hasScope(scopes, ApiKeyScope.TASKS_WRITE)).toBe(false);
    });

    it("allows read access if corresponding write scope is granted", () => {
      const scopes = [ApiKeyScope.PROJECTS_WRITE];
      expect(hasScope(scopes, ApiKeyScope.PROJECTS_READ)).toBe(true);

      const taskScopes = [ApiKeyScope.TASKS_WRITE];
      expect(hasScope(taskScopes, ApiKeyScope.TASKS_READ)).toBe(true);
    });
  });

  describe("SSRF Protection & Destination URL Validation", () => {
    it("identifies private IPv4 ranges as blocked", () => {
      expect(isPrivateOrBlockedIp("10.0.0.1")).toBe(true);
      expect(isPrivateOrBlockedIp("10.255.255.255")).toBe(true);
      expect(isPrivateOrBlockedIp("172.16.0.1")).toBe(true);
      expect(isPrivateOrBlockedIp("172.31.255.255")).toBe(true);
      expect(isPrivateOrBlockedIp("192.168.1.1")).toBe(true);
      expect(isPrivateOrBlockedIp("192.168.254.254")).toBe(true);
    });

    it("identifies loopback, link-local, and cloud metadata IPs as blocked", () => {
      expect(isPrivateOrBlockedIp("127.0.0.1")).toBe(true);
      expect(isPrivateOrBlockedIp("127.255.255.255")).toBe(true);
      // AWS / GCP / Azure Instance Metadata Service (IMDS)
      expect(isPrivateOrBlockedIp("169.254.169.254")).toBe(true);
      expect(isPrivateOrBlockedIp("169.254.1.1")).toBe(true);
    });

    it("identifies IPv6 loopback, link-local, and unique local as blocked", () => {
      expect(isPrivateOrBlockedIp("::1")).toBe(true);
      expect(isPrivateOrBlockedIp("::")).toBe(true);
      expect(isPrivateOrBlockedIp("fe80::1")).toBe(true);
      expect(isPrivateOrBlockedIp("fc00::1")).toBe(true);
      expect(isPrivateOrBlockedIp("fd12:3456:789a::1")).toBe(true);
      expect(isPrivateOrBlockedIp("::ffff:192.168.1.1")).toBe(true);
    });

    it("allows public routable IP addresses", () => {
      expect(isPrivateOrBlockedIp("8.8.8.8")).toBe(false);
      expect(isPrivateOrBlockedIp("1.1.1.1")).toBe(false);
      expect(isPrivateOrBlockedIp("93.184.216.34")).toBe(false);
    });

    it("rejects non-HTTPS destinations outside local testing", async () => {
      await expect(
        validateWebhookDestination("http://example.com/webhook", {
          allowLocal: false,
        }),
      ).rejects.toThrow("Webhook destination URL must use HTTPS");
    });

    it("rejects destination URLs with embedded credentials", async () => {
      await expect(
        validateWebhookDestination("https://user:password@example.com/webhook"),
      ).rejects.toThrow(
        "Destination URL must not contain embedded user credentials",
      );
    });

    it("rejects destination URLs targeting loopback hostname localhost", async () => {
      await expect(
        validateWebhookDestination("https://localhost:8080/webhook", {
          allowLocal: false,
        }),
      ).rejects.toThrow("Internal and loopback hostnames are blocked");
    });
  });

  describe("Webhook Signing & Verification", () => {
    const testSecret = "whsec_0123456789abcdef0123456789abcdef";
    const testPayload = JSON.stringify({
      id: "evt_123",
      type: "task.created",
      resourceId: "tsk_456",
      payload: { title: "Complete Prompt 9" },
    });

    it("computes signature and successfully verifies valid signature header", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = computeWebhookSignature(
        testPayload,
        testSecret,
        timestamp,
      );
      const header = `t=${timestamp},v1=${signature}`;

      const isValid = verifyWebhookSignature(testPayload, header, testSecret);
      expect(isValid).toBe(true);
    });

    it("rejects signature when payload was modified (integrity check)", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = computeWebhookSignature(
        testPayload,
        testSecret,
        timestamp,
      );
      const header = `t=${timestamp},v1=${signature}`;

      const tamperedPayload = JSON.stringify({
        id: "evt_123",
        type: "task.created",
        resourceId: "tsk_456",
        payload: { title: "Tampered Title" },
      });

      const isValid = verifyWebhookSignature(
        tamperedPayload,
        header,
        testSecret,
      );
      expect(isValid).toBe(false);
    });

    it("rejects signature signed with different secret", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = computeWebhookSignature(
        testPayload,
        "whsec_wrong_secret",
        timestamp,
      );
      const header = `t=${timestamp},v1=${signature}`;

      const isValid = verifyWebhookSignature(testPayload, header, testSecret);
      expect(isValid).toBe(false);
    });

    it("rejects signature when timestamp exceeds tolerance window (replay attack prevention)", () => {
      // 10 minutes ago (exceeds default 300s window)
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
      const signature = computeWebhookSignature(
        testPayload,
        testSecret,
        oldTimestamp,
      );
      const header = `t=${oldTimestamp},v1=${signature}`;

      const isValid = verifyWebhookSignature(
        testPayload,
        header,
        testSecret,
        300,
      );
      expect(isValid).toBe(false);
    });

    it("handles malformed header gracefully without crashing", () => {
      expect(
        verifyWebhookSignature(testPayload, "malformed-header", testSecret),
      ).toBe(false);
      expect(
        verifyWebhookSignature(testPayload, "t=invalid,v1=123", testSecret),
      ).toBe(false);
      expect(verifyWebhookSignature(testPayload, "", testSecret)).toBe(false);
    });
  });

  describe("API Key Hashing & Verification Logic", () => {
    it("hashes keys with SHA-256 and preserves constant-time equality", () => {
      const secret =
        "wsp_live_0123456789abcdef_abcdef0123456789abcdef0123456789";
      const hash1 = crypto.createHash("sha256").update(secret).digest("hex");
      const hash2 = crypto.createHash("sha256").update(secret).digest("hex");

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);

      const buf1 = Buffer.from(hash1, "utf8");
      const buf2 = Buffer.from(hash2, "utf8");
      expect(crypto.timingSafeEqual(buf1, buf2)).toBe(true);
    });

    it("fails constant-time verification when hash differs", () => {
      const secret1 =
        "wsp_live_0123456789abcdef_abcdef0123456789abcdef0123456789";
      const secret2 =
        "wsp_live_0123456789abcdef_wrongsecret0123456789abcdef01234";

      const hash1 = crypto.createHash("sha256").update(secret1).digest("hex");
      const hash2 = crypto.createHash("sha256").update(secret2).digest("hex");

      const buf1 = Buffer.from(hash1, "utf8");
      const buf2 = Buffer.from(hash2, "utf8");
      expect(crypto.timingSafeEqual(buf1, buf2)).toBe(false);
    });
  });
});

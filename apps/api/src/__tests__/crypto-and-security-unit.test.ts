import { describe, it, expect } from "vitest";
import {
  generateTotpSecret,
  generateCurrentTotp,
  verifyTotp,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  constantTimeCompare,
  toBase32,
  fromBase32,
  generateOtpAuthUri,
} from "../lib/crypto.js";
import { sanitizeMetadata } from "../services/audit.service.js";

describe("Enterprise Security & Cryptographic Unit Tests", () => {
  describe("Base32 RFC 4648 Encoding & Decoding", () => {
    it("round-trips arbitrary buffers correctly", () => {
      const buffer = Buffer.from("WorkSpace SaaS Multi-Tenant Security");
      const encoded = toBase32(buffer);
      expect(typeof encoded).toBe("string");
      const decoded = fromBase32(encoded);
      expect(decoded.toString("utf8")).toBe(buffer.toString("utf8"));
    });

    it("handles whitespace and padding gracefully", () => {
      const original = "JBSWY3DPEHPK3PXP";
      const cleaned = fromBase32("  jbswy3dpehpk3pxp=== ");
      expect(toBase32(cleaned)).toBe(original);
    });
  });

  describe("AES-256-GCM Secret Encryption at Rest", () => {
    it("encrypts secrets and produces valid iv:tag:ciphertext format", () => {
      const secret = generateTotpSecret();
      const encrypted = encryptSecret(secret);

      expect(encrypted).not.toBe(secret);
      const parts = encrypted.split(":");
      expect(parts.length).toBe(3);
      expect(parts[0]!.length).toBe(24); // 12-byte IV in hex
      expect(parts[1]!.length).toBe(32); // 16-byte tag in hex
    });

    it("decrypts accurately and fails immediately if ciphertext or tag is tampered", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const encrypted = encryptSecret(secret);
      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(secret);

      // Tampered tag
      const [iv, tag, cipher] = encrypted.split(":");
      const badTag = (tag!.slice(0, -2) + "ff").slice(0, 32);
      expect(() => decryptSecret(`${iv}:${badTag}:${cipher}`)).toThrow();

      // Tampered ciphertext
      const badCipher = cipher!.slice(0, -2) + "aa";
      expect(() => decryptSecret(`${iv}:${tag}:${badCipher}`)).toThrow();
    });
  });

  describe("RFC 6238 TOTP Generation & Verification", () => {
    it("generates 6-digit numeric codes and verifies valid window", () => {
      const secret = generateTotpSecret();
      const now = Date.now();
      const code = generateCurrentTotp(secret, now);

      expect(code.length).toBe(6);
      expect(/^\d{6}$/.test(code)).toBe(true);

      const verification = verifyTotp(secret, code, { timeMs: now });
      expect(verification.valid).toBe(true);
    });

    it("accepts codes within clock skew window (+/- 30s) and rejects outside", () => {
      const secret = generateTotpSecret();
      const now = Date.now();
      const currentCode = generateCurrentTotp(secret, now);

      // Verify at +25 seconds (within same or adjacent 30s step)
      const skewResult = verifyTotp(secret, currentCode, {
        timeMs: now + 25000,
        window: 1,
      });
      expect(skewResult.valid).toBe(true);

      // Verify at +120 seconds (beyond +/- 1 step window)
      const expiredResult = verifyTotp(secret, currentCode, {
        timeMs: now + 120000,
        window: 1,
      });
      expect(expiredResult.valid).toBe(false);
    });

    it("prevents replay of an identical code if marked as last-used", () => {
      const secret = generateTotpSecret();
      const code = generateCurrentTotp(secret);

      // Replay attempt passing lastUsedCode
      const replayed = verifyTotp(secret, code, { lastUsedCode: code });
      expect(replayed.valid).toBe(false);
    });
  });

  describe("Single-Use Recovery Codes & Constant-Time Comparison", () => {
    it("generates formatted recovery codes and hashes them with SHA-256", () => {
      const codes = generateRecoveryCodes(10);
      expect(codes.length).toBe(10);

      const sample = codes[0]!;
      expect(sample).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);

      const hash1 = hashRecoveryCode(sample);
      const hash2 = hashRecoveryCode(sample.toLowerCase().replace("-", ""));
      expect(hash1).toBe(hash2); // Normalization handles lowercased and un-hyphenated codes
    });

    it("performs timing-safe string comparison", () => {
      expect(constantTimeCompare("secret123", "secret123")).toBe(true);
      expect(constantTimeCompare("secret123", "secret124")).toBe(false);
      expect(constantTimeCompare("secret123", "short")).toBe(false);
    });

    it("generates standard otpauth URI", () => {
      const uri = generateOtpAuthUri(
        "user@example.com",
        "WorkSpace",
        "JBSWY3DPEHPK3PXP",
      );
      expect(uri).toContain("otpauth://totp/WorkSpace:user%40example.com");
      expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
      expect(uri).toContain("issuer=WorkSpace");
    });
  });

  describe("Audit Log Metadata Sanitization", () => {
    it("recursively removes all passwords, tokens, MFA codes, recovery codes, and secrets", () => {
      const input = {
        action: "login",
        user: {
          id: "123",
          password: "my-password",
          password_hash: "$2b$10$...",
          rawToken: "bearer-token-123",
          tokenHash: "abcde",
        },
        mfa: {
          totp: "654321",
          mfa_code: "654321",
          recovery_code: "ABC-123",
          recoveryCodes: ["CODE1", "CODE2"],
          challengeToken: "token-abc",
        },
        keys: {
          apiKey: "ws_live_xxx",
          webhookSecret: "whsec_yyy",
        },
        safeData: {
          ip: "192.168.1.1",
          userAgent: "Mozilla/5.0",
        },
      };

      const sanitized = sanitizeMetadata(input);

      expect(sanitized.action).toBe("login");
      expect((sanitized.user as any).password).toBeUndefined();
      expect((sanitized.user as any).password_hash).toBeUndefined();
      expect((sanitized.user as any).rawToken).toBeUndefined();
      expect((sanitized.user as any).tokenHash).toBeUndefined();
      expect((sanitized.user as any).id).toBe("123");

      expect((sanitized.mfa as any).totp).toBeUndefined();
      expect((sanitized.mfa as any).mfa_code).toBeUndefined();
      expect((sanitized.mfa as any).recovery_code).toBeUndefined();
      expect((sanitized.mfa as any).recoveryCodes).toBeUndefined();
      expect((sanitized.mfa as any).challengeToken).toBeUndefined();

      expect((sanitized.keys as any).apiKey).toBeUndefined();
      expect((sanitized.keys as any).webhookSecret).toBeUndefined();

      expect((sanitized.safeData as any).ip).toBe("192.168.1.1");
      expect((sanitized.safeData as any).userAgent).toBe("Mozilla/5.0");
    });
  });
});

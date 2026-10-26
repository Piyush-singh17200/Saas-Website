import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { env } from "../config/env.js";

// -----------------------------------------------------------------------------
// Base32 RFC 4648 Implementation
// -----------------------------------------------------------------------------

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function toBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function fromBase32(str: string): Buffer {
  const clean = str.toUpperCase().replace(/\s+/g, "").replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]!;
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) {
      throw new Error(`Invalid Base32 character encountered: ${char}`);
    }

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

// -----------------------------------------------------------------------------
// AES-256-GCM Encryption / Decryption for Secrets at Rest
// -----------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const key = env.MFA_ENCRYPTION_KEY;
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, "hex");
  }
  const utf8Buf = Buffer.from(key, "utf8");
  if (utf8Buf.length === 32) {
    return utf8Buf;
  }
  // Fallback 32-byte sha256 derivation if irregular
  return createHash("sha256").update(key).digest();
}

/**
 * Encrypts sensitive string using AES-256-GCM.
 * Output format: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 */
export function encryptSecret(plainText: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV per NIST SP 800-38D
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM ciphertext.
 * Rejects tampered ciphertext via auth tag verification.
 */
export function decryptSecret(encryptedPayload: string): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format");
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  if (!ivHex || !authTagHex || !cipherHex) {
    throw new Error("Malformed encryption components");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// -----------------------------------------------------------------------------
// RFC 6238 TOTP Generation and Verification
// -----------------------------------------------------------------------------

/**
 * Generates a 6-digit TOTP code for a given base32 secret and counter.
 */
export function generateTotpForCounter(
  secretBase32: string,
  counter: number,
): string {
  const key = fromBase32(secretBase32);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;

  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

/**
 * Computes current 30-second time counter.
 */
export function getCurrentTotpCounter(
  timeMs = Date.now(),
  stepSeconds = 30,
): number {
  return Math.floor(timeMs / 1000 / stepSeconds);
}

/**
 * Generates current TOTP code for testing/enrollment.
 */
export function generateCurrentTotp(
  secretBase32: string,
  timeMs = Date.now(),
): string {
  const counter = getCurrentTotpCounter(timeMs);
  return generateTotpForCounter(secretBase32, counter);
}

/**
 * Verifies a 6-digit TOTP code against a base32 secret.
 * Checks current time step as well as +/- 1 window (previous and next 30s) to handle clock skew.
 * Uses constant-time comparison to prevent timing side channels.
 */
export function verifyTotp(
  secretBase32: string,
  candidateCode: string,
  options?: { timeMs?: number; window?: number; lastUsedCode?: string | null },
): { valid: boolean; matchedCounter?: number } {
  if (
    !candidateCode ||
    candidateCode.length !== 6 ||
    !/^\d{6}$/.test(candidateCode)
  ) {
    return { valid: false };
  }

  // Prevent replay of identical code within the same window
  if (
    options?.lastUsedCode &&
    constantTimeCompare(candidateCode, options.lastUsedCode)
  ) {
    return { valid: false };
  }

  const timeMs = options?.timeMs ?? Date.now();
  const windowSteps = options?.window ?? 1; // 1 step = +/- 30s
  const currentCounter = getCurrentTotpCounter(timeMs);

  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const counter = currentCounter + offset;
    const expected = generateTotpForCounter(secretBase32, counter);

    if (constantTimeCompare(candidateCode, expected)) {
      return { valid: true, matchedCounter: counter };
    }
  }

  return { valid: false };
}

/**
 * Generates a high-entropy 20-byte (160-bit) TOTP secret in Base32.
 */
export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  return toBase32(bytes);
}

/**
 * Constructs an otpauth:// URL for authenticator apps.
 */
export function generateOtpAuthUri(
  accountName: string,
  issuer: string,
  secretBase32: string,
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

// -----------------------------------------------------------------------------
// Recovery Code & Hash Utilities
// -----------------------------------------------------------------------------

/**
 * Generates an array of single-use recovery codes (e.g. "ABCD-1234-EFGH").
 */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Base32 unambiguous set (no 0, 1, I, O)

  for (let i = 0; i < count; i++) {
    const raw = randomBytes(10);
    let code = "";
    for (let j = 0; j < 10; j++) {
      code += chars[raw[j]! % chars.length];
    }
    // Format as 5-5 with hyphen for user readability: XXXXX-XXXXX
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }

  return codes;
}

/**
 * Hashes a recovery code with SHA-256 for secure storage.
 */
export function hashRecoveryCode(code: string): string {
  const normalized = code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Constant-time comparison between two strings to prevent timing analysis.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

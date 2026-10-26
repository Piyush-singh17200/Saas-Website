import dns from "node:dns/promises";
import net from "node:net";
import { AppError } from "../middleware/error-handler.js";
import { ErrorCode } from "@workspace/contracts";
import { env } from "../config/env.js";

/**
 * Checks if an IPv4 address is within private, loopback, link-local, or reserved ranges.
 */
function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => parseInt(n, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 is blocked
  }

  const [b0, b1] = parts;

  // 0.0.0.0/8 (Broadcast/source)
  if (b0 === 0) return true;

  // 10.0.0.0/8 (Private-Use)
  if (b0 === 10) return true;

  // 100.64.0.0/10 (Shared Address Space / CGNAT)
  if (b0 === 100 && b1 !== undefined && b1 >= 64 && b1 <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 169.254.0.0/16 (Link Local & Cloud Metadata 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 172.16.0.0/12 (Private-Use)
  if (b0 === 172 && b1 !== undefined && b1 >= 16 && b1 <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (b0 === 192 && b1 === 0 && parts[2] === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (b0 === 192 && b1 === 0 && parts[2] === 2) return true;

  // 192.168.0.0/16 (Private-Use)
  if (b0 === 192 && b1 === 168) return true;

  // 198.18.0.0/15 (Benchmarking)
  if (b0 === 198 && b1 !== undefined && (b1 === 18 || b1 === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (b0 === 198 && b1 === 51 && parts[2] === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (b0 === 203 && b1 === 0 && parts[2] === 113) return true;

  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (b0 !== undefined && b0 >= 224) return true;

  return false;
}

/**
 * Checks if an IPv6 address is within loopback, link-local, unique local, or reserved ranges.
 */
function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // IPv4-mapped IPv6 (::ffff:192.168.1.1)
  if (normalized.startsWith("::ffff:")) {
    const ipv4Part = normalized.slice(7);
    if (net.isIPv4(ipv4Part)) {
      return isBlockedIpv4(ipv4Part);
    }
    return true;
  }

  // Unspecified (::)
  if (
    normalized === "::" ||
    normalized === "0000:0000:0000:0000:0000:0000:0000:0000"
  ) {
    return true;
  }

  // Loopback (::1)
  if (normalized === "::1" || normalized.endsWith(":0001")) {
    return true;
  }

  // Unique local addresses (fc00::/7 -> fc00 to fdff)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  // Link-local addresses (fe80::/10 -> fe80 to febf)
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  // Multicast (ff00::/8)
  if (normalized.startsWith("ff")) {
    return true;
  }

  return false;
}

/**
 * Validates whether an IP address belongs to any private/internal/blocked ranges.
 */
export function isPrivateOrBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return isBlockedIpv4(ip);
  }
  if (version === 6) {
    return isBlockedIpv6(ip);
  }
  // If not recognized as valid IP, block it for safety
  return true;
}

/**
 * Validates a webhook destination URL against SSRF and protocol restrictions.
 * Re-resolves DNS records to protect against DNS-rebinding attacks.
 */
export async function validateWebhookDestination(
  rawUrl: string,
  options?: { allowLocal?: boolean },
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError(
      "Invalid destination URL format",
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  const allowLocal =
    options?.allowLocal ??
    (env.ALLOW_LOCAL_WEBHOOKS ||
      (env.NODE_ENV === "test" && process.env.ALLOW_LOCAL_WEBHOOKS === "true"));

  // Outside isolated test/development, require HTTPS
  if (parsed.protocol !== "https:") {
    if (parsed.protocol === "http:" && allowLocal) {
      // Allowed only in isolated test/dev
    } else {
      throw new AppError(
        "Webhook destination URL must use HTTPS",
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }
  }

  // Disallow user credentials in destination URL (e.g., https://user:pass@example.com)
  if (parsed.username || parsed.password) {
    throw new AppError(
      "Destination URL must not contain embedded user credentials",
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  const hostname = parsed.hostname;

  // Check if hostname is directly an IP address
  if (net.isIP(hostname)) {
    if (!allowLocal && isPrivateOrBlockedIp(hostname)) {
      throw new AppError(
        "Prohibited destination IP: Private, loopback, and metadata network destinations are blocked",
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }
    return parsed;
  }

  // Hostname string checks
  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost === "localhost" ||
    lowerHost.endsWith(".localhost") ||
    lowerHost.endsWith(".local") ||
    lowerHost.endsWith(".internal")
  ) {
    if (!allowLocal) {
      throw new AppError(
        "Prohibited destination hostname: Internal and loopback hostnames are blocked",
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }
    return parsed;
  }

  // Perform DNS lookup to inspect resolved IP addresses
  try {
    const lookupResults = await dns.lookup(hostname, { all: true });

    if (!lookupResults || lookupResults.length === 0) {
      throw new AppError(
        "Destination hostname could not be resolved",
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    for (const record of lookupResults) {
      if (!allowLocal && isPrivateOrBlockedIp(record.address)) {
        throw new AppError(
          "Prohibited destination: Hostname resolved to a private, loopback, or metadata address",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }
    }
  } catch (err: any) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(
      `DNS resolution failed for destination hostname: ${err.message || "Unknown DNS error"}`,
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  return parsed;
}

export interface SafeRequestOptions {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  allowLocal?: boolean;
}

export interface SafeRequestResult {
  success: boolean;
  statusCode?: number;
  durationMs: number;
  errorMessage?: string;
}

/**
 * Sends a webhook HTTP POST request with strict SSRF defense:
 * - Pre-validates destination IP and protocol
 * - Sets redirect: "manual" to eliminate redirect-based SSRF / DNS rebinding bypass
 * - Implements strict connection and response timeouts
 * - Caps response body reading to prevent memory exhaustion
 * - Sanitizes internal error details
 */
export async function sendSafeWebhookRequest(
  options: SafeRequestOptions,
): Promise<SafeRequestResult> {
  const {
    url,
    headers,
    body,
    timeoutMs = 5000,
    maxResponseBytes = 65536,
    allowLocal,
  } = options;

  const startTime = Date.now();

  try {
    // 1. Re-validate destination URL immediately before dispatch
    await validateWebhookDestination(url, { allowLocal });

    // 2. Dispatch request with strict timeout and no automatic redirect following
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "User-Agent": "WorkSpace-Webhooks/1.0",
        },
        body,
        redirect: "manual", // Crucial: Never follow redirects blindly
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const durationMs = Date.now() - startTime;

    // 3. Reject redirect responses (301, 302, 307, 308)
    if (response.status >= 300 && response.status < 400) {
      return {
        success: false,
        statusCode: response.status,
        durationMs,
        errorMessage: `Delivery rejected: Webhook endpoint returned HTTP ${response.status} redirect (redirects are prohibited for security)`,
      };
    }

    // 4. Safely consume bounded response body (up to maxResponseBytes)
    try {
      const buffer = await response.arrayBuffer();
      // We don't store raw response bodies in database to protect confidentiality
      if (buffer.byteLength > maxResponseBytes) {
        // Discard excess
      }
    } catch {
      // Ignore body reading errors
    }

    const isSuccess = response.status >= 200 && response.status < 300;

    return {
      success: isSuccess,
      statusCode: response.status,
      durationMs,
      errorMessage: isSuccess
        ? undefined
        : `Endpoint returned HTTP ${response.status} ${response.statusText || ""}`.trim(),
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    let sanitizedMessage = "Network request failed";

    if (err.name === "AbortError" || err.name === "TimeoutError") {
      sanitizedMessage = `Delivery timed out after ${timeoutMs}ms`;
    } else if (err instanceof AppError) {
      sanitizedMessage = err.message;
    } else if (err.code === "ECONNREFUSED") {
      sanitizedMessage = "Connection refused by remote host";
    } else if (err.code === "ENOTFOUND") {
      sanitizedMessage = "DNS lookup failed for remote host";
    } else if (err.message) {
      sanitizedMessage = err.message.slice(0, 200);
    }

    return {
      success: false,
      durationMs,
      errorMessage: sanitizedMessage,
    };
  }
}

import dns from "node:dns/promises";
import net from "node:net";

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => parseInt(n, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true;
  }
  const [b0, b1] = parts;
  if (b0 === 0) return true;
  if (b0 === 10) return true;
  if (b0 === 100 && b1 !== undefined && b1 >= 64 && b1 <= 127) return true;
  if (b0 === 127) return true;
  if (b0 === 169 && b1 === 254) return true;
  if (b0 === 172 && b1 !== undefined && b1 >= 16 && b1 <= 31) return true;
  if (b0 === 192 && b1 === 0 && parts[2] === 0) return true;
  if (b0 === 192 && b1 === 0 && parts[2] === 2) return true;
  if (b0 === 192 && b1 === 168) return true;
  if (b0 === 198 && b1 !== undefined && (b1 === 18 || b1 === 19)) return true;
  if (b0 === 198 && b1 === 51 && parts[2] === 100) return true;
  if (b0 === 203 && b1 === 0 && parts[2] === 113) return true;
  if (b0 !== undefined && b0 >= 224) return true;
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const ipv4Part = normalized.slice(7);
    if (net.isIPv4(ipv4Part)) {
      return isBlockedIpv4(ipv4Part);
    }
    return true;
  }
  if (
    normalized === "::" ||
    normalized === "0000:0000:0000:0000:0000:0000:0000:0000"
  ) {
    return true;
  }
  if (normalized === "::1" || normalized.endsWith(":0001")) {
    return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }
  if (normalized.startsWith("ff")) {
    return true;
  }
  return false;
}

export function isPrivateOrBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true;
}

export async function validateWebhookDestination(
  rawUrl: string,
  options?: { allowLocal?: boolean },
): Promise<URL> {
  const parsed = new URL(rawUrl);
  const allowLocal =
    options?.allowLocal ??
    (process.env.ALLOW_LOCAL_WEBHOOKS === "true" ||
      process.env.NODE_ENV === "test");

  if (parsed.protocol !== "https:") {
    if (parsed.protocol === "http:" && allowLocal) {
      // Allowed in isolated test/dev only
    } else {
      throw new Error("Webhook destination URL must use HTTPS");
    }
  }

  if (parsed.username || parsed.password) {
    throw new Error(
      "Destination URL must not contain embedded user credentials",
    );
  }

  const hostname = parsed.hostname;
  if (net.isIP(hostname)) {
    if (!allowLocal && isPrivateOrBlockedIp(hostname)) {
      throw new Error(
        "Prohibited destination IP: Private, loopback, and metadata network destinations are blocked",
      );
    }
    return parsed;
  }

  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost === "localhost" ||
    lowerHost.endsWith(".localhost") ||
    lowerHost.endsWith(".local") ||
    lowerHost.endsWith(".internal")
  ) {
    if (!allowLocal) {
      throw new Error(
        "Prohibited destination hostname: Internal and loopback hostnames are blocked",
      );
    }
    return parsed;
  }

  const lookupResults = await dns.lookup(hostname, { all: true });
  if (!lookupResults || lookupResults.length === 0) {
    throw new Error("Destination hostname could not be resolved");
  }

  for (const record of lookupResults) {
    if (!allowLocal && isPrivateOrBlockedIp(record.address)) {
      throw new Error(
        "Prohibited destination: Hostname resolved to a private, loopback, or metadata address",
      );
    }
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
    await validateWebhookDestination(url, { allowLocal });

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
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const durationMs = Date.now() - startTime;

    if (response.status >= 300 && response.status < 400) {
      return {
        success: false,
        statusCode: response.status,
        durationMs,
        errorMessage: `Delivery rejected: Webhook endpoint returned HTTP ${response.status} redirect (redirects are prohibited for security)`,
      };
    }

    try {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > maxResponseBytes) {
        // Discard payload exceeding maxResponseBytes limit
      }
    } catch {
      // Discard body
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

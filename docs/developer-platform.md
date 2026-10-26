# WorkSpace SaaS: Developer Platform & Webhooks Documentation

## Overview

The WorkSpace Developer Platform enables programmatic integration with the SaaS ecosystem through:

1. **Organization-Scoped API Keys**: Authenticated with cryptographically random secrets hashed at rest.
2. **Versioned Public REST API (`/api/v1`)**: Exposing core project, task, and tenant resources with deterministic filtering, pagination, and least-privilege scoping.
3. **Reliable Webhook Event Dispatch**: Asynchronous event publishing via BullMQ workers with exponential backoff retries, persistent delivery audit telemetry, and auto-deactivation for permanently failing destinations.
4. **Hardened SSRF Defense**: Strict destination validation against private networks, loopbacks, link-local metadata endpoints (e.g. AWS/GCP 169.254.169.254), IPv6 transition addresses, and redirect-based attacks.

---

## 1. Authentication & API Keys

### Key Format

API keys follow an identifiable format enabling indexed lookups without exposing secrets:

```
wsp_live_{keyPrefix}_{secret}
```

- `prefix`: Constant `wsp_live_` indicating a live WorkSpace API key.
- `keyPrefix`: 16 hexadecimal characters (8 random bytes) stored in plaintext to index the key record.
- `secret`: 32 hexadecimal characters (16 random bytes).
- **Hashed at Rest**: The entire key string is hashed using SHA-256 (`keyHash`) before storing in PostgreSQL. The plaintext secret is revealed **strictly once** at creation time.
- **Verification**: Evaluated using `crypto.timingSafeEqual` to eliminate timing side-channel attacks.

### Headers

Pass your API key in the HTTP `Authorization` header:

```http
Authorization: Bearer wsp_live_8f3a1b2c4d5e6f70_9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d
```

### Granular Scopes

API keys support least-privilege permission scoping:

| Scope            | Description                                                             |
| ---------------- | ----------------------------------------------------------------------- |
| `*`              | Full administrative access to all developer resources within the tenant |
| `projects:read`  | List and view projects in the organization                              |
| `projects:write` | Create, update, and archive projects                                    |
| `tasks:read`     | List, search, filter, and view task details                             |
| `tasks:write`    | Create, edit, and delete tasks                                          |
| `webhooks:read`  | Inspect webhook subscriptions and delivery logs                         |
| `webhooks:write` | Create, update, rotate secrets, and delete webhook subscriptions        |

---

## 2. Webhook Event System & Signing

### Event Types

WorkSpace emits stable, versioned event envelopes:

- `task.created`
- `task.updated`
- `task.deleted`
- `project.created`
- `project.updated`
- `project.deleted`
- `ping` (Manual diagnostic test)

### Event Envelope Format

```json
{
  "id": "e9a0c71a-2895-4eb8-b982-8bc6028a2a19",
  "type": "task.created",
  "version": "2026-10-11",
  "createdAt": "2026-10-11T20:45:00.000Z",
  "organizationId": "3845b467-33e3-4ca2-881a-6df5b9e07567",
  "resourceId": "416ad1cf-e564-4bf8-beee-dfc199ad7e59",
  "payload": {
    "id": "416ad1cf-e564-4bf8-beee-dfc199ad7e59",
    "title": "Implement Webhook Verification",
    "status": "TODO",
    "priority": "HIGH",
    "projectId": "893c52a3-f09b-449e-ba61-82e75eefd7b4"
  }
}
```

### Webhook Headers & HMAC-SHA256 Signing

Every outbound webhook delivery includes authentication and integrity headers:

- `WorkSpace-Signature`: `t={timestamp},v1={hmac_sha256}`
- `WorkSpace-Event-Id`: Unique event UUID for consumer deduplication
- `WorkSpace-Event-Type`: Dot-notated event name

#### Signature Verification (Node.js Example)

```javascript
import crypto from "node:crypto";

export function verifyWebhook(
  rawPayloadString,
  signatureHeader,
  signingSecret,
) {
  const parts = signatureHeader.split(",").reduce((acc, curr) => {
    const [k, v] = curr.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const timestamp = parseInt(parts["t"], 10);
  const signature = parts["v1"];

  if (!timestamp || !signature) return false;

  // Protect against replay attacks (300 second threshold)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return false;
  }

  // Calculate HMAC-SHA256 over timestamp.payload
  const signedPayload = `${timestamp}.${rawPayloadString}`;
  const expectedSig = crypto
    .createHmac("sha256", signingSecret)
    .update(signedPayload)
    .digest("hex");

  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");

  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}
```

---

## 3. Security & SSRF Protection

WorkSpace guarantees security against Server-Side Request Forgery (SSRF) and DNS rebinding:

1. **HTTPS Enforcement**: Webhook URLs must use HTTPS (except in explicitly isolated test environments).
2. **DNS Resolution Inspection**: The destination hostname is resolved to IPv4 and IPv6 addresses prior to dispatch.
3. **Prohibited Address Ranges**:
   - Loopback: `127.0.0.0/8`, `::1`
   - RFC 1918 Private: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
   - Link-Local & Cloud Metadata: `169.254.0.0/16` (protecting AWS/GCP/Azure instance metadata endpoints like `169.254.169.254`), `fe80::/10`
   - Carrier-Grade NAT: `100.64.0.0/10`
   - IPv6 ULA: `fc00::/7`
   - Multicast & Reserved: `224.0.0.0/4`, `240.0.0.0/4`, `ff00::/8`
4. **Redirect Prohibition**: The HTTP client executes with `redirect: "manual"`. Any HTTP `3xx` redirect response fails the delivery attempt without following the redirect, eliminating redirect-based SSRF.
5. **Bounded Timeouts & Payloads**: Requests timeout after 5,000ms; response bodies are capped at 64KB.

---

## 4. Delivery Semantics & Retries

- **Delivery Guarantee**: **At-least-once delivery**. Consumers must use `WorkSpace-Event-Id` to deduplicate incoming messages idempotently.
- **Retry Schedule**: Transient errors (e.g. 5xx, connection timeouts) are retried with exponential backoff and jitter up to 5 attempts (3s, 6s, 12s, 24s, 48s).
- **Auto-Deactivation**: If an endpoint suffers **10 consecutive delivery failures**, WorkSpace automatically deactivates the subscription (`isActive: false`) to conserve resources and avoid retry storms.
- **Manual Retry**: Organization administrators can trigger manual retries on failed delivery records from the Developer Portal or API.

---

## 5. Rate Limiting

- **Developer API Limits**: 1,000 requests per 15-minute window per API key (with fallback to client IP).
- **Headers Returned**: Standard Draft-7 rate limiting headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`).
- **Response Format**: HTTP 429 with error code `RATE_LIMITED`.

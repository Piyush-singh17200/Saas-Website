# Enterprise Security & Account Protection Architecture

## 1. Executive Summary

WorkSpace implements enterprise-grade account protection, multi-factor authentication (MFA), active session management, organization-level security policies, and organization-aware audit logging.

All features are natively built on top of the existing multi-tenant architecture, preserving Row-Level Security (RLS) tenant isolation, session authentication, billing, API keys, and webhooks.

---

## 2. Multi-Factor Authentication (MFA / 2FA)

### 2.1 Standard & Protocol

- **Specification**: RFC 6238 Time-based One-Time Password (TOTP) and RFC 4226 HMAC-based One-Time Password (HOTP).
- **Time Step**: 30 seconds (`X = 30`).
- **Algorithm**: HMAC-SHA1 with dynamic truncation to 6 numeric digits.
- **Clock Skew Tolerance**: Window of $\pm 1$ time step (tolerates 30-second clock drift).
- **Replay Protection**: The application records `mfaLastUsedCode` and `mfaLastUsedAt`. Identical codes cannot be reused within the active time window.

### 2.2 Cryptographic Storage of TOTP Secrets

- TOTP secrets are generated using high-entropy random bytes (`crypto.randomBytes(20)`, 160 bits).
- **Encryption at Rest**: Stored in `users.mfa_secret_encrypted` using **AES-256-GCM** with a unique 96-bit Initialization Vector (`IV`) per record and a 128-bit authentication tag (`authTag`).
- Secret format at rest: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
- Any tampering with the ciphertext or authentication tag fails immediately with a cryptographic validation error.
- **Secret Display Policy**: The plaintext Base32 secret and `otpauth://` QR URI are strictly returned **once** during enrollment initialization (`POST /api/v1/auth/mfa/setup`). Plaintext secrets are never logged or returned on subsequent requests.

### 2.3 Single-Use Backup Recovery Codes

- 10 alphanumeric recovery codes are generated during enrollment formatted as `XXXXX-XXXXX` (e.g. `ABC12-DEF34`).
- **Hashed at Rest**: Stored in `mfa_recovery_codes` hashed with **SHA-256**. The raw codes are only shown to the user upon initial generation or deliberate regeneration.
- **Single-Use Enforcement**: When a recovery code is used to resolve an MFA login challenge, its `used_at` timestamp is committed within an atomic transaction. A consumed recovery code cannot be reused.

### 2.4 Login Challenge Flow

```
User enters email & password
            │
            ▼
Password verified successfully?
            │
      ┌─────┴────────────────────────┐
      │ No                           │ Yes
      ▼                              ▼
Return 401 Unauthorized         Has MFA enabled?
Record auth.login.failure            │
                               ┌─────┴───────────────────────┐
                               │ No                          │ Yes
                               ▼                             ▼
                        Issue Session Cookie         Issue 5-Minute Challenge Token
                        Return user profile          (mfaRequired: true)
                        Record auth.login.success    NO session cookie set
                                                             │
                                                             ▼
                                                    Client calls /mfa/challenge/verify
                                                    or /mfa/challenge/recovery
                                                             │
                                                             ▼
                                                    Challenge & code valid?
                                                             │
                                                       ┌─────┴─────┐
                                                       │ Yes       │ No
                                                       ▼           ▼
                                                Consume Challenge  Return 401
                                                Issue Session      Record failure
                                                Set Cookie
```

- MFA challenge tokens are cryptographically random 32-byte tokens hashed with SHA-256 in `mfa_challenges`.
- Challenges expire strictly after **5 minutes** (`expiresAt < now`).
- Challenge tokens cannot be reused (`usedAt !== null`).
- Challenge tokens carry zero ambient session privileges; they cannot access protected endpoints.

---

## 3. Session Management

### 3.1 Active Device & Session Tracking

- Every active session is stored in the PostgreSQL `sessions` table.
- Raw bearer tokens are generated using 32 bytes of cryptographic randomness (`randomBytes(32).toString('base64url')`) and hashed with SHA-256 (`tokenHash`) at rest.
- Each session record stores client metadata:
  - `userAgent`: Sanitized browser / device user agent.
  - `ipAddress`: Client IP address (with proxy validation).
  - `createdAt`: Session creation timestamp.
  - `lastUsedAt`: Lazily updated last activity timestamp.
  - `expiresAt`: Configurable expiration date.

### 3.2 Revocation Guarantees

- **Individual Revocation**: `DELETE /api/v1/auth/sessions/:sessionId` sets `revokedAt = now()`. The database check in `validateSession` rejects any session where `revokedAt !== null` on the very next request.
- **Revoke All Other Sessions**: `DELETE /api/v1/auth/sessions/other` revokes every session for the authenticated user except `currentSessionId`.
- **Tenant & User Boundary**: Revocation queries strictly enforce `WHERE userId = req.user.id`, preventing any user from revoking another user's session.
- **Cookie Clearing**: Revoking one's own current session immediately clears the `HttpOnly` session cookie on the client response.

---

## 4. Organization Security Policies

Organizations can configure tenant-level security baselines via `PATCH /api/v1/organizations/:organizationId/security/policy`:

| Policy Setting         | Default           | Range / Type        | Description                                                                              |
| ---------------------- | ----------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `requireMfa`           | `false`           | `boolean`           | Requires all members to have active MFA before accessing organization projects and data. |
| `sessionMaxAgeMinutes` | `43200` (30 days) | `15` to `43200` min | Sets maximum session age allowed for organization operations.                            |

### 4.1 Enforcement Mechanics

- `requireActiveMembership` checks the organization's `OrganizationSecurityPolicy`.
- If `requireMfa = true` and `user.mfaEnabled = false`, the request is rejected with `403 FORBIDDEN` (`ErrorCode.FORBIDDEN`).
- No security bypass is permitted: the member must enroll in MFA in their account settings before accessing the tenant.
- If `sessionMaxAgeMinutes` is exceeded, the request is rejected with `401 UNAUTHORIZED`, requiring re-authentication.
- Only organization `OWNER` or `ADMIN` roles can modify security policy.

---

## 5. Security Audit Logging

### 5.1 Recorded Events

Standardized actions recorded in `audit_logs`:

- `auth.login.success` / `auth.login.failure`
- `auth.logout`
- `auth.password.change`
- `auth.mfa.setup.initiated`
- `auth.mfa.enabled`
- `auth.mfa.disabled`
- `auth.mfa.login.success`
- `auth.mfa.recovery.login.success`
- `auth.mfa.recovery_codes.regenerated`
- `auth.session.revoked`
- `auth.sessions.all_revoked`
- `organization.security_policy.updated`
- `api_key.created` / `api_key.revoked`
- `webhook.created` / `webhook.secret_rotated` / `webhook.deleted`
- `member.invited` / `member.role.updated` / `member.removed`

### 5.2 Metadata Sanitization & Secret Redaction

All metadata passed to `recordAuditLog` is recursively filtered through `sanitizeMetadata`. The following sensitive keys and substrings are strictly stripped:

- `password`, `password_hash`, `passwordhash`
- `token`, `rawtoken`, `tokenhash`, `token_hash`
- `totp`, `code`, `mfacode`, `mfa_code`
- `recoverycode`, `recovery_code`, `recoverycodes`
- `challenge`, `challengetoken`, `challenge_token`
- `apikey`, `api_key`, `secret`, `secretkey`, `webhooksecret`
- `authorization`, `cookie`

### 5.3 Immutability & Access Control

- Audit logs are append-only. There are no API endpoints to modify or delete audit log entries.
- Audit logs are scoped to `organization_id` with Row-Level Security (RLS) enforcement.
- Querying audit logs (`GET /api/v1/organizations/:organizationId/security/audit-logs`) is strictly restricted to organization `OWNER` and `ADMIN` roles. Ordinary members are denied access with `403 FORBIDDEN`.

---

## 6. Environment Configuration & Secret Management

### 6.1 Required Variables

- `MFA_ENCRYPTION_KEY`: A 32-byte cryptographic key (either 64 hex characters or 32 raw UTF-8 characters).
- Development fallback: A standard test key is provided for local development and test suites.
- **Production Guard**: In `NODE_ENV === "production"`, the API validates that `MFA_ENCRYPTION_KEY` is set and does not match the default development fallback key. If the default key is detected in production, the application fails to start immediately (`[FATAL] Configuration validation failed`).

### 6.2 Key Generation Command

To generate a secure 32-byte key for production:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

# WorkSpace Authentication & Session Architecture

This document describes the authentication, session lifecycle, password management, and browser security policies implemented in **WorkSpace**.

---

## 1. Authentication Strategy: Stateful Sessions via HttpOnly Cookies

WorkSpace uses server-side, cryptographically random sessions stored in PostgreSQL rather than stateless JWTs:

- **Instant Revocation**: When an employee is offboarded, their membership is removed, or a user logs out, sessions are revoked immediately in the database without waiting for a token expiration window.
- **XSS Protection**: Session tokens are delivered solely via `HttpOnly` browser cookies. JavaScript cannot access the token via `document.cookie` or `localStorage`.
- **Hashed Token Storage**: The raw session token generated on the server is a 32-byte (256-bit) cryptographically secure random hexadecimal string (`crypto.randomBytes(32)`). Only the SHA-256 hash of the token is stored in the PostgreSQL `sessions` table. If the database is compromised, the attacker cannot forge valid session cookies.

---

## 2. Cookie Security Attributes

The session cookie (`workspace_session`) is set with the following security flags:

| Attribute  | Local Development | Production     | Purpose                                                                    |
| ---------- | ----------------- | -------------- | -------------------------------------------------------------------------- |
| `HttpOnly` | `true`            | `true`         | Prevents script-based access via XSS                                       |
| `SameSite` | `Lax`             | `Lax`          | Prevents CSRF on cross-site requests while permitting top-level navigation |
| `Secure`   | `false` (HTTP)    | `true` (HTTPS) | Enforces transmission exclusively over TLS/HTTPS in production             |
| `Path`     | `/`               | `/`            | Scopes cookie across API and web frontends                                 |
| `MaxAge`   | 7 days            | 7 days         | Matches server-side expiration TTL                                         |

---

## 3. CSRF Mitigation

State-changing cookie-authenticated endpoints (`POST`, `PATCH`, `DELETE`, `PUT`) are protected using:

1. **`SameSite=Lax` Cookie Policy**: Browsers suppress cookie attachment on cross-site subresource requests.
2. **Origin & Referer Verification Middleware**: Express middleware verifies that incoming mutating requests originate from trusted origins (configured via `CORS_ORIGIN`). If an unrecognized cross-site request attempts mutation, it is rejected with `403 FORBIDDEN`.

---

## 4. Password Security

- **Hashing Algorithm**: Bcrypt with **12 salt rounds** (or Argon2id).
- **Validation**: Enforced via Zod schema:
  - Minimum length: 8 characters
  - Maximum length: 100 characters (mitigates DoS via oversized bcrypt hash inputs)
- **Email Normalization**: Emails are trimmed and converted to lowercase prior to database lookup or creation to ensure consistent identity resolution.
- **Timing & Enumeration Resistance**: Generic error message (`"Invalid email or password"`) is returned regardless of whether the email exists or the password failed, preventing account enumeration attacks.

---

## 5. Rate Limiting

Authentication endpoints (`/api/v1/auth/register` and `/api/v1/auth/login`) are protected with IP-based rate limiting via `express-rate-limit`:

- Enforces a 15-minute sliding window.
- Protects against brute-force credential stuffing and resource exhaustion attacks.
- Returns `429 RATE_LIMITED` when exceeded.

---

## 6. Endpoints Overview

| Method | Path                    | Auth Required | Description                                               |
| ------ | ----------------------- | ------------- | --------------------------------------------------------- |
| `POST` | `/api/v1/auth/register` | No            | Registers user, hashes password, sets session cookie      |
| `POST` | `/api/v1/auth/login`    | No            | Validates credentials, rotates session, sets cookie       |
| `POST` | `/api/v1/auth/logout`   | No / Yes      | Revokes session in database, clears cookie                |
| `GET`  | `/api/v1/me`            | Yes           | Returns authenticated user profile (no secrets or hashes) |

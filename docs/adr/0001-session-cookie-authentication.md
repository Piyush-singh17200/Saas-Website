# ADR 0001: Session-Based Cookie Authentication with Hashed Tokens

## Status

Accepted

## Context

WorkSpace is a multi-tenant B2B SaaS application handling sensitive project management data. Authentication requires:

1. Immediate revocation upon member termination, account suspension, or session logout.
2. Protection against XSS credential theft.
3. Resistance against database credential compromise.
4. Seamless integration with web browsers without manual token management in client-side storage (`localStorage` / `sessionStorage`).

We evaluated two primary architectures:

- **Stateless JWTs in LocalStorage**: Fast and decoupled, but impossible to revoke instantaneously without maintaining a distributed revocation blocklist (which converts it back into stateful verification), and susceptible to XSS token exfiltration.
- **Stateful Database Sessions in HttpOnly Cookies**: Immediate revocation capabilities, resilient against XSS token exfiltration, supported natively by browser cookie handling.

## Decision

We adopted **stateful database sessions** stored in PostgreSQL, conveyed to the browser via **`HttpOnly`, `SameSite=Lax`, `Secure` cookies**:

1. When a session is created, a cryptographically secure 256-bit token is generated.
2. The raw token is sent to the client in the `Set-Cookie` header and **never** returned in JSON response bodies or stored in plaintext in the database.
3. The server stores only the SHA-256 hash of the token in the `sessions` table.
4. Revocation is instantaneous: updating `revokedAt` immediately invalidates the session for all subsequent requests.
5. In development over HTTP, `Secure=false` is supported, while production strictly enforces `Secure=true`.

## Consequences

### Positive

- Revocation takes effect in milliseconds across all application nodes.
- XSS scripts cannot read the session token from `document.cookie` or `localStorage`.
- A database read replica or backup breach does not leak valid session tokens.

### Negative

- Requires a database query or cache lookup per authenticated request to resolve user identity. This is mitigated with indexes on `token_hash` and low query overhead.

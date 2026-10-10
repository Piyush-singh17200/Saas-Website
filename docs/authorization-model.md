# WorkSpace Authorization Model

WorkSpace implements defense-in-depth authorization across two layers:

1. **Application Layer**: Express middleware verifying session identity and organization role-based access control (RBAC).
2. **Database Layer**: PostgreSQL Row-Level Security (RLS) enforcing tenant isolation at the SQL query level using session context parameters.

---

## 1. Roles & Permissions Hierarchy

Organizations maintain three membership roles: `OWNER`, `ADMIN`, and `MEMBER`.

| Resource         | Operation                 | Allowed Roles               | Additional Invariants                      |
| :--------------- | :------------------------ | :-------------------------- | :----------------------------------------- |
| **Organization** | Update name / metadata    | `OWNER`, `ADMIN`            | —                                          |
| **Organization** | Invite / Remove Members   | `OWNER`, `ADMIN`            | Cannot remove last OWNER                   |
| **Organization** | Update Member Roles       | `OWNER` only                | Cannot demote last OWNER                   |
| **Project**      | Create project            | `OWNER`, `ADMIN`, `MEMBER`  | Must be active org member                  |
| **Project**      | View / list projects      | `OWNER`, `ADMIN`, `MEMBER`  | Only active org projects returned          |
| **Project**      | Update name / description | `OWNER`, `ADMIN`, `MEMBER`  | —                                          |
| **Project**      | Archive project           | `OWNER`, `ADMIN` only       | Sets `archivedAt` timestamp                |
| **Project**      | Restore project           | `OWNER`, `ADMIN` only       | Clears `archivedAt` timestamp              |
| **Task**         | Create task               | `OWNER`, `ADMIN`, `MEMBER`  | Project must be `ACTIVE` (not archived)    |
| **Task**         | View / list tasks         | `OWNER`, `ADMIN`, `MEMBER`  | Project must belong to caller's org        |
| **Task**         | Update / Move / Reorder   | `OWNER`, `ADMIN`, `MEMBER`  | Requires matching OCC `version`            |
| **Task**         | Assign / Reassign         | `OWNER`, `ADMIN`, `MEMBER`  | Assignee must be active member in same org |
| **Task**         | Delete task               | `OWNER`, `ADMIN`, `MEMBER`  | Hard deletes task and associated comments  |
| **Comment**      | Create comment            | `OWNER`, `ADMIN`, `MEMBER`  | Task must belong to active project         |
| **Comment**      | Edit comment              | Author only                 | Non-authors rejected with HTTP 403         |
| **Comment**      | Soft-delete comment       | Author, `OWNER`, or `ADMIN` | Sets `deletedAt` timestamp                 |
| **Activity Log** | Query audit stream        | `OWNER`, `ADMIN`, `MEMBER`  | Scoped to caller's organization            |

---

## 2. Server-Side Enforcement Rules

1. **Authentication Required**: Every protected route requires a verified `workspace_session` cookie. Unauthenticated requests are rejected immediately with HTTP 401.
2. **Untrusted Client Parameters**: An organization ID in the URL path (`:organizationId`) or request body is never proof of authorization. The server queries `memberships` table using the authenticated user's ID and target organization ID.
3. **Cross-Tenant Guard**: If a user attempts to access an organization they do not belong to, the server returns **HTTP 404 Not Found** (to prevent tenant existence enumeration) or **HTTP 403 Forbidden**.
4. **Archived Projects**: Tasks cannot be created or modified within archived projects. Requests attempting mutations on archived projects return HTTP 400 Bad Request with a clear message: `"Cannot modify tasks in an archived project"`.
5. **Assignee Validation**: When assigning a task, the backend queries the `memberships` table to verify that `assigneeId` is an active member of `organizationId`. If an unrelated or external user ID is passed, the request is rejected.
6. **Optimistic Concurrency Control (OCC)**: Every task mutation verifies `version = clientVersion`. If a conflict occurs, HTTP 409 is returned with the error code `CONCURRENCY_CONFLICT`.
7. **Information Leakage Prevention**: Database errors, stack traces, and internal IDs are filtered by centralized error-handling middleware. Client error payloads contain only structured application codes (`VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `CONCURRENCY_CONFLICT`).

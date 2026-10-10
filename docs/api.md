# WorkSpace API Reference

All requests and responses use JSON. Authenticated endpoints require an active session cookie (`workspace_session`) established via `/api/v1/auth/login` or `/api/v1/auth/register`.

Cross-tenant isolation is enforced on every organization-scoped route through both application authorization middleware and PostgreSQL Row-Level Security (RLS).

---

## Response Envelopes

### Success Envelope

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-10-10T12:00:00.000Z",
    "requestId": "d2a013f9-7f32-4cc7-b67e-1ff53457193e"
  }
}
```

### Error Envelope

```json
{
  "success": false,
  "error": {
    "code": "CONCURRENCY_CONFLICT",
    "message": "Task has been updated by another user. Reload and try again."
  },
  "meta": {
    "timestamp": "2026-10-10T12:00:00.000Z",
    "requestId": "d2a013f9-7f32-4cc7-b67e-1ff53457193e"
  }
}
```

---

## Projects API

Base Path: `/api/v1/organizations/:organizationId/projects`

### 1. Create Project

- **Method**: `POST`
- **Path**: `/api/v1/organizations/:organizationId/projects`
- **Authorization**: `OWNER`, `ADMIN`, or `MEMBER`
- **Request Body**:
  ```json
  {
    "name": "Q4 Platform Launch",
    "slug": "q4-platform-launch",
    "description": "Cross-functional product roadmap and milestones"
  }
  ```
- **Rules**:
  - `name`: 2–100 characters (trimmed, non-empty).
  - `slug`: optional. Auto-slugified from name if omitted. Must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` and be unique within the organization.
- **Response**: `201 Created` returning the project object and auto-incremented activity record.

### 2. List Projects

- **Method**: `GET`
- **Path**: `/api/v1/organizations/:organizationId/projects`
- **Query Parameters**:
  - `status`: `ACTIVE` | `ARCHIVED` (optional)
  - `search`: string (filters name or description)
  - `page`: integer >= 1 (default `1`)
  - `limit`: integer 1–100 (default `20`)
- **Response**: `200 OK` with paginated envelope (`items`, `total`, `page`, `limit`, `totalPages`). Each project includes `taskCount`.

### 3. Get Project by ID

- **Method**: `GET`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId`
- **Response**: `200 OK` returning project details. Returns `404` if project does not belong to the organization.

### 4. Update Project

- **Method**: `PATCH`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId`
- **Authorization**: `OWNER`, `ADMIN`, or `MEMBER`
- **Request Body**:
  ```json
  {
    "name": "Updated Platform Launch",
    "description": "Revised deliverables"
  }
  ```
- **Response**: `200 OK` with updated project.

### 5. Archive Project

- **Method**: `POST`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId/archive`
- **Authorization**: `OWNER` or `ADMIN` only.
- **Response**: `200 OK`. Sets `status = 'ARCHIVED'` and records `archivedAt` timestamp. Disallows non-admin members.

### 6. Restore Project

- **Method**: `POST`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId/restore`
- **Authorization**: `OWNER` or `ADMIN` only.
- **Response**: `200 OK`. Restores `status = 'ACTIVE'` and clears `archivedAt`.

---

## Tasks API & Optimistic Concurrency Control

Base Path: `/api/v1/organizations/:organizationId/projects/:projectId/tasks`

### Optimistic Concurrency Control (OCC)

To prevent silent overwrites when two users edit the same task concurrently:

1. Every task contains an integer `version` field (starts at `1`).
2. Every mutation (`PATCH`, `/assign`, `/move`) requires the caller to send `version: clientVersion`.
3. The database executes an atomic conditional update:
   ```sql
   UPDATE tasks
   SET title = $1, ..., version = version + 1
   WHERE id = $taskId AND organization_id = $orgId AND version = $clientVersion;
   ```
4. If zero rows are modified and the task exists, the server rejects the request with **HTTP 409 Conflict** (`CONCURRENCY_CONFLICT`).
5. The client notifies the user with a conflict banner and provides a one-click reload button.

### 1. Create Task

- **Method**: `POST`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId/tasks`
- **Request Body**:
  ```json
  {
    "title": "Configure Row Level Security",
    "description": "Write policies for tasks and comments",
    "status": "TODO",
    "priority": "HIGH",
    "assigneeId": "c9b29cb2-9fd6-4f4a-9cb8-c5ce32915001",
    "dueDate": "2026-10-31T23:59:59.000Z",
    "position": 1000
  }
  ```
- **Rules**:
  - `status`: `TODO` | `IN_PROGRESS` | `IN_REVIEW` | `DONE`.
  - `priority`: `LOW` | `MEDIUM` | `HIGH` | `URGENT`.
  - `assigneeId`: must be an active member of the project's organization. Unrelated users are rejected with `400 Bad Request`.
  - Cannot create tasks in archived projects.
- **Response**: `201 Created` returning the task object. Sets `completedAt` if initial status is `DONE`.

### 2. List Tasks

- **Method**: `GET`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId/tasks`
- **Query Parameters**:
  - `status`: `TODO` | `IN_PROGRESS` | `IN_REVIEW` | `DONE`
  - `priority`: `LOW` | `MEDIUM` | `HIGH` | `URGENT`
  - `assigneeId`: UUID
  - `search`: string (matches title)
  - `sortBy`: `position` | `createdAt` | `dueDate` | `priority` (default `position`)
  - `sortOrder`: `asc` | `desc` (default `asc`)
  - `page`: integer >= 1 (default `1`)
  - `limit`: integer 1–100 (default `50`)
- **Response**: `200 OK` with paginated task envelope. Each item includes populated `assignee` preview, `createdBy` preview, and `commentCount`.

### 3. Get Task by ID

- **Method**: `GET`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId`
- **Response**: `200 OK` returning task with assignee, creator, and current `version`.

### 4. Update Task (OCC Protected)

- **Method**: `PATCH`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId`
- **Request Body**:
  ```json
  {
    "title": "Updated Task Title",
    "status": "DONE",
    "priority": "URGENT",
    "version": 1
  }
  ```
- **Status Transition Rules**:
  - Transitioning to `DONE` automatically sets `completedAt = now()`.
  - Reopening a task (`DONE` -> `TODO`, `IN_PROGRESS`, `IN_REVIEW`) automatically clears `completedAt = null`.
- **Response**:
  - `200 OK`: Task updated, `version` incremented to `2`.
  - `409 Conflict`: Stale update detected (`CONCURRENCY_CONFLICT`).

### 5. Move Task Status & Position

- **Method**: `POST`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/move`
- **Request Body**:
  ```json
  {
    "status": "IN_PROGRESS",
    "position": 2500,
    "version": 1
  }
  ```
- **Response**: `200 OK` or `409 Conflict`.

### 6. Assign / Reassign Task

- **Method**: `POST`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/assign`
- **Request Body**:
  ```json
  {
    "assigneeId": "c9b29cb2-9fd6-4f4a-9cb8-c5ce32915001",
    "version": 1
  }
  ```
  _(Pass `assigneeId: null` to unassign)_
- **Response**: `200 OK` or `409 Conflict`.

### 7. Delete Task

- **Method**: `DELETE`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId`
- **Response**: `200 OK` with `{ "success": true, "message": "Task deleted successfully" }`.

---

## Comments API

Base Path: `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments`

### 1. Create Comment

- **Method**: `POST`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments`
- **Request Body**:
  ```json
  {
    "body": "PR has been approved and ready for staging deployment."
  }
  ```
- **Rules**:
  - `body`: 1–10,000 characters (trimmed). Whitespace-only strings rejected with `400 Bad Request`.
  - Content rendered safely in frontend to prevent XSS.
- **Response**: `201 Created` returning comment with `author` preview.

### 2. List Comments

- **Method**: `GET`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments`
- **Query Parameters**: `page` (default 1), `limit` (default 50)
- **Response**: `200 OK` with paginated comment list. Soft-deleted comments (`deletedAt != null`) are excluded.

### 3. Update Comment

- **Method**: `PATCH`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments/:commentId`
- **Authorization**: Author only. Other members receive `403 Forbidden`.
- **Request Body**:
  ```json
  {
    "body": "Updated comment content"
  }
  ```
- **Response**: `200 OK`.

### 4. Soft-Delete Comment

- **Method**: `DELETE`
- **Path**: `/api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments/:commentId`
- **Authorization**: Author, or organization `OWNER` / `ADMIN`.
- **Response**: `200 OK`. Sets `deletedAt = now()` and excludes from subsequent queries.

---

## Activity Log API

Base Path: `/api/v1/organizations/:organizationId/activity`

### 1. Query Tenant Activity

- **Method**: `GET`
- **Path**: `/api/v1/organizations/:organizationId/activity`
- **Query Parameters**:
  - `projectId`: UUID (optional)
  - `taskId`: UUID (optional)
  - `actorId`: UUID (optional)
  - `eventType`: string e.g. `task.created`, `task.completed`, `comment.created` (optional)
  - `page`: integer >= 1 (default `1`)
  - `limit`: integer 1–100 (default `50`)
- **Security & Privacy**:
  - Enforces tenant isolation. Users can only query their active organization.
  - Metadata payloads strip sensitive fields (passwords, tokens, keys).
  - Append-only audit stream.
- **Response**: `200 OK` with paginated activity stream ordered chronologically (`createdAt DESC`).

---

## Billing & Subscription API

Base Path: `/api/v1/organizations/:organizationId/billing`

### 1. Get Billing Summary & Entitlements

- **Method**: `GET`
- **Path**: `/api/v1/organizations/:organizationId/billing`
- **Authorization**: Any active organization member (`OWNER`, `ADMIN`, `MEMBER`).
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "subscription": {
        "id": "uuid",
        "organizationId": "uuid",
        "plan": "FREE",
        "status": "ACTIVE",
        "stripeCustomerId": null,
        "stripeSubscriptionId": null,
        "stripePriceId": null,
        "currentPeriodStart": null,
        "currentPeriodEnd": null,
        "cancelAtPeriodEnd": false,
        "canceledAt": null
      },
      "limits": {
        "maxActiveProjects": 3,
        "maxMembers": 5,
        "premiumFeatures": false,
        "activityRetentionDays": 30
      },
      "usage": {
        "activeProjects": 1,
        "totalProjects": 2,
        "members": 1
      },
      "isEligibleForPro": false
    }
  }
  ```

### 2. Create Stripe Checkout Session

- **Method**: `POST`
- **Path**: `/api/v1/organizations/:organizationId/billing/checkout`
- **Authorization**: `OWNER` or `ADMIN` only. Ordinary members receive `403 Forbidden`.
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_..."
    }
  }
  ```

### 3. Open Stripe Customer Portal

- **Method**: `POST`
- **Path**: `/api/v1/organizations/:organizationId/billing/portal`
- **Authorization**: `OWNER` or `ADMIN` only.
- **Precondition**: Organization must have an existing Stripe Customer ID.
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "portalUrl": "https://billing.stripe.com/p/session/..."
    }
  }
  ```

---

## Stripe Webhook API

- **Method**: `POST`
- **Path**: `/api/v1/billing/webhook`
- **Security**: Requires `stripe-signature` header verified against raw request buffer and `STRIPE_WEBHOOK_SECRET`.
- **Idempotency**: Duplicate event delivery returns `{ "received": true, "duplicate": true }` with `200 OK`.
- **Events Supported**:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

# Advanced Task Management and Search

This document outlines the advanced task management architecture introduced in Phase 8 of **WorkSpace**, covering priority handling, tags and labels, due date calculation, composable filtering, deterministic sorting, search capabilities, and multi-tenant security guarantees.

---

## 1. Task Priorities

Every task has an explicit priority:

- `LOW`: Minor tasks or backlogged items.
- `MEDIUM`: Standard operational tasks (**Default** on task creation).
- `HIGH`: Time-sensitive or core sprint objectives.
- `URGENT`: Blocker issues and critical escalations.

### Validation & Schema

- Priority values are validated server-side against an enum allowlist (`TaskPrioritySchema`).
- Invalid priorities are rejected with HTTP 400 (`VALIDATION_ERROR`).
- Priorities are indexed via compound index `[projectId, priority]` for fast querying.

---

## 2. Tags and Labels

Tags are organization-scoped categorization metadata that can be attached to tasks within the same tenant.

### Relational Model

- **`Tag` (`tags` table)**:
  - `id`: UUID (Primary Key)
  - `organizationId`: UUID (Foreign Key to `organizations`)
  - `name`: String (Normalized, unique per organization)
  - `color`: Hex color string (e.g., `#3B82F6`)
  - `createdAt`, `updatedAt`
  - Constraint: `@@unique([organizationId, name])`
- **`TaskTag` (`task_tags` table)**:
  - `id`: UUID (Primary Key)
  - `organizationId`: UUID (Foreign Key, tenant boundary)
  - `taskId`: UUID (Foreign Key to `tasks`)
  - `tagId`: UUID (Foreign Key to `tags`)
  - Constraint: `@@unique([taskId, tagId])`
  - Indexes: `[organizationId, tagId]`, `[taskId]`

### Duplicate Prevention & Normalization

- Tag names are normalized (`trim()`).
- Tag creation and renaming performs case-insensitive duplicate checks within the organization. Conflicting names return HTTP 409 (`CONFLICT`).

### Cross-Tenant Protection

- When assigning tags via `POST .../tasks/:taskId/tags` or `PATCH .../tasks/:taskId`:
  - Every provided `tagId` is verified against the database to confirm it belongs to the target `organizationId`.
  - Associating a tag from another organization fails with HTTP 400 (`BAD_REQUEST`).

---

## 3. Due Dates and Overdue Tasks

### Due Date Representation

- Due dates are stored in UTC as PostgreSQL `TIMESTAMP WITH TIME ZONE` (`DateTime` in Prisma).
- Input dates accept standard ISO-8601 strings and are validated using Zod datetime parsing.

### Overdue Calculation Rules

A task is dynamically calculated as **overdue** if and only if:

1. `task.dueDate !== null`
2. `new Date(task.dueDate) < new Date()` (due date in the past)
3. `task.status !== "DONE"`

> [!NOTE]
> Completed tasks (`DONE`) are **never** marked overdue, even if their due date was in the past.

---

## 4. Search and Composable Filtering

The task query endpoint (`GET /api/v1/organizations/:organizationId/projects/:projectId/tasks`) accepts parameterized query parameters:

| Parameter     | Type                 | Description                                                                          |
| :------------ | :------------------- | :----------------------------------------------------------------------------------- |
| `status`      | Enum                 | `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`                                           |
| `priority`    | Enum                 | `LOW`, `MEDIUM`, `HIGH`, `URGENT`                                                    |
| `assigneeId`  | String / UUID        | User UUID, or `"unassigned"` for unassigned tasks                                    |
| `tagIds`      | Array / Comma string | List of tag UUIDs; matches tasks with any specified tag                              |
| `isOverdue`   | Boolean              | When `true`, filters for tasks where `dueDate < NOW()` and `status != DONE`          |
| `dueDateFrom` | ISO Date String      | Lower bound for due date filter                                                      |
| `dueDateTo`   | ISO Date String      | Upper bound for due date filter                                                      |
| `search`      | String               | Safe, case-insensitive substring search across `title`, `description`, or exact `id` |
| `sortBy`      | Enum                 | `position`, `dueDate`, `priority`, `title`, `createdAt`, `updatedAt`                 |
| `sortOrder`   | Enum                 | `asc`, `desc` (Default: `asc`)                                                       |
| `page`        | Integer              | Page number (Default: `1`)                                                           |
| `limit`       | Integer              | Items per page (Default: `50`, Max: `100`)                                           |

### Deterministic Sorting & Pagination

Sorting uses a strict allowlist. When sorting by fields with potential ties (such as `priority`, `dueDate`, or `title`), queries append `{ id: "asc" }` as a secondary tie-breaker, guaranteeing deterministic pagination ordering across pages.

---

## 5. API Endpoints

### Organization Tags

- `GET /api/v1/organizations/:organizationId/tags` — List organization tags
- `POST /api/v1/organizations/:organizationId/tags` — Create tag (`name`, `color`)
- `PATCH /api/v1/organizations/:organizationId/tags/:tagId` — Update tag (`name`, `color`)
- `DELETE /api/v1/organizations/:organizationId/tags/:tagId` — Delete tag

### Task Tag Associations

- `POST /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/tags` — Assign tags (`{ tagIds: string[] }`)
- `DELETE /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/tags/:tagId` — Remove tag

---

## 6. Database Migrations

Migration file:
`packages/database/prisma/migrations/20261011100000_add_tags_and_task_tags/migration.sql`

To apply in development or production:

```bash
pnpm --filter @workspace/database db:migrate
```

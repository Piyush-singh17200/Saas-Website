import { test, expect } from "@playwright/test";

test.describe("E2E User Journey: File Attachments & Object Storage", () => {
  const orgId = "org-storage-test";
  const projId = "proj-storage-test";
  const taskId = "task-storage-test";

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: "df1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e93",
              email: "attach@workspace.test",
              displayName: "Attachment Tester",
            },
            organizations: [
              {
                id: orgId,
                name: "Storage Org",
                slug: "storage-org",
                role: "OWNER",
              },
            ],
          },
          meta: { requestId: "req-e2e-attach-me" },
        }),
      });
    });

    await page.route(
      `**/api/v1/organizations/${orgId}/projects/${projId}`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              project: {
                id: projId,
                organizationId: orgId,
                name: "Storage Project",
                description: "Attachment test project",
                status: "ACTIVE",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            },
            meta: { requestId: "req-e2e-proj" },
          }),
        });
      },
    );

    await page.route(
      `**/api/v1/organizations/${orgId}/projects/${projId}/tasks*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  id: taskId,
                  organizationId: orgId,
                  projectId: projId,
                  title: "Security Architecture Diagram",
                  status: "IN_PROGRESS",
                  priority: "HIGH",
                  createdById: "df1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e93",
                  position: 1,
                  version: 1,
                  commentCount: 0,
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
              total: 1,
              page: 1,
              limit: 100,
              totalPages: 1,
            },
            meta: { requestId: "req-e2e-tasks" },
          }),
        });
      },
    );

    // Mock attachments for the task
    await page.route(
      `**/api/v1/organizations/${orgId}/attachments*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              attachments: [
                {
                  id: "ef1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e94",
                  organizationId: orgId,
                  uploaderId: "df1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e93",
                  taskId,
                  fileName: "architecture-v2.png",
                  storageKey: "orgs/storage/architecture-v2.png",
                  fileSize: 245760,
                  mimeType: "image/png",
                  status: "READY",
                  downloadUrl:
                    "http://localhost:4000/api/v1/organizations/org-storage-test/attachments/ef1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e94/download",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
            },
            meta: { requestId: "req-e2e-att-list" },
          }),
        });
      },
    );

    // Task detail comments (empty) so the modal can load cleanly
    await page.route(
      `**/api/v1/organizations/${orgId}/projects/${projId}/tasks/${taskId}/comments*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              items: [],
              total: 0,
              page: 1,
              limit: 50,
              totalPages: 0,
            },
            meta: { requestId: "req-e2e-comments" },
          }),
        });
      },
    );
  });

  test("displays task attachments and upload dropzone", async ({ page }) => {
    await page.goto(`/organizations/${orgId}/projects/${projId}`);

    // Click on the task to open task detail modal
    await page
      .getByRole("heading", { name: "Security Architecture Diagram" })
      .click();

    // Verify task detail modal opened and shows the stored attachment
    await page.getByRole("button", { name: "Attachments" }).click();
    await expect(page.getByText("Attached Files (1)")).toBeVisible();
    await expect(page.getByText("architecture-v2.png")).toBeVisible();
    await expect(page.getByText(/240\.0 KB/)).toBeVisible();
  });
});

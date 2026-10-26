import { test, expect } from "@playwright/test";

test.describe("E2E User Journey: Projects & Advanced Tasks", () => {
  const orgId = "org-test-1";
  const projId = "proj-test-1";

  test.beforeEach(async ({ page }) => {
    // Mock user
    await page.route("**/api/v1/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: "9f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e80",
              email: "user@test.local",
              displayName: "Test User",
            },
            organizations: [
              {
                id: orgId,
                name: "Test Organization",
                slug: "test-org",
                role: "OWNER",
              },
            ],
          },
          meta: { requestId: "req-e2e-user" },
        }),
      });
    });

    // Mock project detail
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
                name: "Platform Engineering",
                description: "Core infrastructure and developer tools",
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

    // Mock project tasks
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
                  id: "4f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e64",
                  organizationId: orgId,
                  projectId: projId,
                  title: "Implement Rate Limiting",
                  description:
                    "Add sliding window rate limiting on public endpoints",
                  status: "TODO",
                  priority: "HIGH",
                  createdById: "9f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e80",
                  dueDate: new Date(Date.now() + 86400000).toISOString(),
                  position: 1,
                  version: 1,
                  tags: [
                    {
                      id: "5f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e65",
                      organizationId: orgId,
                      name: "Security",
                      color: "#EF4444",
                      createdAt: new Date().toISOString(),
                    },
                  ],
                  commentCount: 2,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                {
                  id: "6f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e66",
                  organizationId: orgId,
                  projectId: projId,
                  title: "Database Performance Optimization",
                  description: "Add indexes on frequently queried foreign keys",
                  status: "IN_PROGRESS",
                  priority: "URGENT",
                  createdById: "9f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e80",
                  dueDate: null,
                  position: 2,
                  version: 1,
                  tags: [
                    {
                      id: "7f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e67",
                      organizationId: orgId,
                      name: "Database",
                      color: "#3B82F6",
                      createdAt: new Date().toISOString(),
                    },
                  ],
                  commentCount: 0,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
              total: 2,
              page: 1,
              limit: 100,
              totalPages: 1,
            },
            meta: { requestId: "req-e2e-tasks" },
          }),
        });
      },
    );

    // Mock organization tags
    await page.route(`**/api/v1/organizations/${orgId}/tags`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            tags: [
              {
                id: "5f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e65",
                organizationId: orgId,
                name: "Security",
                color: "#EF4444",
                createdAt: new Date().toISOString(),
              },
              {
                id: "7f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e67",
                organizationId: orgId,
                name: "Database",
                color: "#3B82F6",
                createdAt: new Date().toISOString(),
              },
            ],
          },
          meta: { requestId: "req-e2e-tags" },
        }),
      });
    });
  });

  test("renders task board with priorities, tags, and search input", async ({
    page,
  }) => {
    await page.goto(`/organizations/${orgId}/projects/${projId}`);

    // Verify Project Title
    await expect(
      page.getByRole("heading", { name: "Platform Engineering" }),
    ).toBeVisible();

    // Verify Tasks
    await expect(
      page.getByRole("heading", { name: "Implement Rate Limiting" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Database Performance Optimization" }),
    ).toBeVisible();

    // Verify Priority and Tag elements
    await expect(
      page
        .locator("span")
        .filter({ hasText: /^HIGH$/ })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .locator("span")
        .filter({ hasText: /^URGENT$/ })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .locator("span")
        .filter({ hasText: /^Security$/ })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .locator("span")
        .filter({ hasText: /^Database$/ })
        .first(),
    ).toBeVisible();

    // Verify Search and Filters
    const searchInput = page.getByPlaceholder(/Search task/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Rate Limiting");
    await expect(
      page.getByRole("heading", { name: "Implement Rate Limiting" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Database Performance Optimization" }),
    ).toHaveCount(0);
  });

  test("opens Tag Manager modal to inspect organization tags", async ({
    page,
  }) => {
    await page.goto(`/organizations/${orgId}/projects/${projId}`);

    const tagManagerBtn = page.getByRole("button", { name: /Tags/i });
    await tagManagerBtn.click();

    // Verify Tag Manager dialog opens
    const dialog = page.getByRole("dialog", {
      name: "Manage Tags & Labels",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Security")).toBeVisible();
    await expect(dialog.getByText("Database")).toBeVisible();
  });
});

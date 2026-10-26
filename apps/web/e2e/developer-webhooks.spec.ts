import { test, expect } from "@playwright/test";

test.describe("E2E User Journey: Developer Platform & Webhooks", () => {
  const orgId = "org-dev-test";

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: "af1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e90",
              email: "dev@workspace.test",
              displayName: "Dev Lead",
            },
            organizations: [
              {
                id: orgId,
                name: "Developer Hub",
                slug: "developer-hub",
                role: "OWNER",
              },
            ],
          },
          meta: { requestId: "req-e2e-dev-me" },
        }),
      });
    });

    // Mock API keys
    await page.route(
      `**/api/v1/organizations/${orgId}/developer/api-keys*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              keys: [
                {
                  id: "bf1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e91",
                  organizationId: orgId,
                  name: "CI/CD Deployment Key",
                  keyPrefix: "c1a2",
                  scopes: ["tasks:read", "tasks:write"],
                  createdAt: new Date().toISOString(),
                  lastUsedAt: new Date().toISOString(),
                  expiresAt: null,
                  revokedAt: null,
                },
              ],
              total: 1,
              page: 1,
              limit: 50,
            },
            meta: { requestId: "req-e2e-keys" },
          }),
        });
      },
    );

    // Mock Webhook subscriptions
    await page.route(
      `**/api/v1/organizations/${orgId}/developer/webhooks`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              subscriptions: [
                {
                  id: "cf1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e92",
                  organizationId: orgId,
                  url: "https://api.external-service.com/events",
                  description: "Slack Integration Bot",
                  eventTypes: ["task.created", "task.updated"],
                  isActive: true,
                  consecutiveFailures: 0,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
            },
            meta: { requestId: "req-e2e-wh" },
          }),
        });
      },
    );

    // Mock webhook delivery log (loaded alongside keys and subscriptions)
    await page.route(
      `**/api/v1/organizations/${orgId}/developer/webhooks/deliveries*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              deliveries: [],
              total: 0,
              page: 1,
              limit: 20,
            },
            meta: { requestId: "req-e2e-deliveries" },
          }),
        });
      },
    );
  });

  test("renders Developer Platform with API Keys and Webhooks", async ({
    page,
  }) => {
    await page.goto(`/organizations/${orgId}/developer`);

    // Verify Title and API key table
    await expect(
      page.getByRole("heading", { name: "Developer Settings" }),
    ).toBeVisible();
    await expect(page.getByText("CI/CD Deployment Key")).toBeVisible();
    await expect(page.getByText(/wsp_live_c1a2/)).toBeVisible();
    await expect(
      page.getByText("tasks:read", { exact: true }),
    ).toBeVisible();

    // Verify Create API Key button exists
    await expect(
      page.getByRole("button", { name: /Create API Key/i }),
    ).toBeVisible();

    // Verify Webhooks tab content
    await page.getByRole("button", { name: /Webhooks \(1\)/ }).click();
    await expect(page.getByText("Slack Integration Bot")).toBeVisible();
    await expect(
      page.getByText("https://api.external-service.com/events"),
    ).toBeVisible();
    await expect(page.getByText("task.created")).toBeVisible();
  });
});

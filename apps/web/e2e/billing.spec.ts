import { test, expect } from "@playwright/test";

test.describe("E2E User Journey: Billing, Plans & Entitlements", () => {
  const orgId = "org-billing-test";

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: "user-owner-1",
              email: "owner@workspace.test",
              displayName: "Org Owner",
            },
            organizations: [
              {
                id: orgId,
                name: "Billing Org",
                slug: "billing-org",
                role: "OWNER",
              },
            ],
          },
          meta: { requestId: "req-e2e-billing-me" },
        }),
      });
    });

    // Organization details (used in the page header)
    await page.route(`**/api/v1/organizations/${orgId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            organization: {
              id: orgId,
              name: "Billing Org",
              slug: "billing-org",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
          meta: { requestId: "req-e2e-billing-org" },
        }),
      });
    });

    // Mock billing status
    await page.route(
      `**/api/v1/organizations/${orgId}/billing`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              subscription: {
                id: "sub-billing-1",
                organizationId: orgId,
                plan: "FREE",
                status: "ACTIVE",
                cancelAtPeriodEnd: false,
                stripeCustomerId: null,
                stripeSubscriptionId: null,
                stripePriceId: null,
                currentPeriodStart: null,
                currentPeriodEnd: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              limits: {
                maxActiveProjects: 3,
                maxMembers: 5,
                premiumFeatures: false,
                activityRetentionDays: 30,
              },
              usage: {
                activeProjects: 2,
                totalProjects: 2,
                members: 1,
              },
              isEligibleForPro: true,
            },
            meta: { requestId: "req-e2e-billing-status" },
          }),
        });
      },
    );
  });

  test("displays current plan, usage bars, and upgrade options", async ({
    page,
  }) => {
    await page.goto(`/organizations/${orgId}/billing`);

    // Verify Billing page content
    await expect(
      page.getByRole("heading", { name: "Billing & Plans" }),
    ).toBeVisible();
    await expect(page.getByText("WorkSpace Free")).toBeVisible();
    await expect(page.getByText("max 3 active")).toBeVisible();
    await expect(page.getByText("max 5 members")).toBeVisible();

    // Verify Upgrade CTA
    await expect(
      page.getByRole("button", { name: /Upgrade to Pro \(\$29\/mo\)/ }),
    ).toBeVisible();
  });
});

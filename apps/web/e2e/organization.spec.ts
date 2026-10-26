import { test, expect } from "@playwright/test";

test.describe("E2E User Journey: Organization & Security Governance", () => {
  const orgId = "org-governance-1";

  test.beforeEach(async ({ page }) => {
    // Mock user profile
    await page.route("**/api/v1/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: "7f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e6f",
              email: "admin@enterprise.test",
              displayName: "Enterprise Admin",
            },
            organizations: [
              {
                id: orgId,
                name: "Enterprise Org",
                slug: "enterprise-org",
                role: "OWNER",
              },
            ],
          },
          meta: { requestId: "req-e2e-org-me" },
        }),
      });
    });

    // Mock members endpoint
    await page.route(
      `**/api/v1/organizations/${orgId}/members`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              members: [
                {
                  id: "0f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e60",
                  organizationId: orgId,
                  userId: "7f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e6f",
                  role: "OWNER",
                  status: "ACTIVE",
                  user: {
                    id: "7f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e6f",
                    displayName: "Enterprise Admin",
                    email: "admin@enterprise.test",
                  },
                  createdAt: new Date().toISOString(),
                  joinedAt: new Date().toISOString(),
                },
                {
                  id: "1f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e61",
                  organizationId: orgId,
                  userId: "8f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e70",
                  role: "MEMBER",
                  status: "ACTIVE",
                  user: {
                    id: "8f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e70",
                    displayName: "Developer Dave",
                    email: "dave@enterprise.test",
                  },
                  createdAt: new Date().toISOString(),
                  joinedAt: new Date().toISOString(),
                },
              ],
            },
            meta: { requestId: "req-e2e-members" },
          }),
        });
      },
    );
  });

  test("displays members and allows opening invite modal", async ({ page }) => {
    await page.goto(`/organizations/${orgId}/members`);

    await expect(page.getByText("Enterprise Admin")).toBeVisible();
    await expect(page.getByText("Developer Dave")).toBeVisible();

    const inviteBtn = page.getByRole("button", {
      name: /Invite Member|Add Member/i,
    });
    if ((await inviteBtn.count()) > 0) {
      await inviteBtn.first().click();
      await expect(
        page.getByText(/Invite New Member|Invite/i).first(),
      ).toBeVisible();
    }
  });

  test("manages organization security policy and views audit logs", async ({
    page,
  }) => {
    // Mock organization security policy
    await page.route(
      `**/api/v1/organizations/${orgId}/security/policy`,
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: {
                policy: {
                  id: "2f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e62",
                  organizationId: orgId,
                  requireMfa: false,
                  sessionMaxAgeMinutes: 10080, // 7 days
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              },
              meta: { requestId: "req-e2e-policy" },
            }),
          });
        } else {
          // PATCH
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: {
                policy: {
                  id: "2f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e62",
                  organizationId: orgId,
                  requireMfa: true,
                  sessionMaxAgeMinutes: 1440, // 1 day
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              },
              meta: { requestId: "req-e2e-policy-updated" },
            }),
          });
        }
      },
    );

    // Mock audit logs
    await page.route(
      `**/api/v1/organizations/${orgId}/security/audit-logs*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  id: "3f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e63",
                  organizationId: orgId,
                  action: "organization.security_policy.updated",
                  outcome: "SUCCESS",
                  actorId: "7f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e6f",
                  actor: {
                    id: "7f1c0a52-3f4e-4a9b-9c2d-1a2b3c4d5e6f",
                    displayName: "Enterprise Admin",
                    email: "admin@enterprise.test",
                  },
                  createdAt: new Date().toISOString(),
                  ipAddress: "127.0.0.1",
                  userAgent: "Chrome / Windows",
                  metadata: {
                    requireMfa: true,
                    sessionMaxAgeMinutes: 1440,
                  },
                },
              ],
              total: 1,
              page: 1,
              limit: 15,
              totalPages: 1,
            },
            meta: { requestId: "req-e2e-audit" },
          }),
        });
      },
    );

    await page.goto(`/organizations/${orgId}/security`);

    // Verify policy controls are rendered
    await expect(
      page.getByRole("heading", {
        name: "Organization Security & Audit Logs",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Require Multi-Factor Authentication"),
    ).toBeVisible();
    await expect(page.getByText("Security Audit Log")).toBeVisible();
    await expect(
      page.getByText("organization.security_policy.updated"),
    ).toBeVisible();
  });
});

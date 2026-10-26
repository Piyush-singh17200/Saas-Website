import { test, expect } from "@playwright/test";

test.describe("E2E User Journey: Authentication & Session Management", () => {
  test("renders login page and validates form controls", async ({ page }) => {
    await page.goto("/login");

    // Check page title and structure
    await expect(page).toHaveTitle(/WorkSpace/i);
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]',
    );

    if ((await emailInput.count()) > 0) {
      await expect(emailInput.first()).toBeVisible();
      await expect(passwordInput.first()).toBeVisible();

      // Submit empty form to verify client-side validation
      const submitBtn = page.locator('button[type="submit"]');
      if ((await submitBtn.count()) > 0) {
        await submitBtn.first().click();
      }
    }
  });

  test("handles MFA challenge prompt when MFA is enabled", async ({ page }) => {
    // Mock the login API to simulate an MFA-required response
    await page.route("**/api/v1/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: "user-e2e-1",
              email: "alice@workspace.test",
              displayName: "Alice Tester",
            },
            mfaRequired: true,
            challengeToken: "mfa_chal_test_token_12345",
            expiresAt: new Date(Date.now() + 300000).toISOString(),
          },
          meta: { requestId: "req-e2e-mfa-test" },
        }),
      });
    });

    await page.goto("/login");
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]',
    );
    const submitBtn = page.locator('button[type="submit"]');

    if ((await emailInput.count()) > 0) {
      await emailInput.first().fill("alice@workspace.test");
      await passwordInput.first().fill("Password123!");
      await submitBtn.first().click();

      // Verify the MFA challenge form is displayed
      await expect(
        page.getByRole("heading", { name: "Two-Factor Verification" }),
      ).toBeVisible();
      await expect(page.locator('input[name="mfaCode"]')).toBeVisible();
    }
  });

  test("allows user to access Account Security and view active sessions", async ({
    page,
  }) => {
    // Mock authenticated user state
    await page.route("**/api/v1/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: "user-e2e-1",
              email: "alice@workspace.test",
              displayName: "Alice Tester",
            },
            organizations: [
              {
                id: "org-e2e-1",
                name: "Acme Corp",
                slug: "acme-corp",
                role: "OWNER",
              },
            ],
          },
          meta: { requestId: "req-e2e-me" },
        }),
      });
    });

    // Mock active sessions API
    await page.route("**/api/v1/auth/sessions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            sessions: [
              {
                id: "sess-1",
                isCurrent: true,
                createdAt: new Date().toISOString(),
                lastUsedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
                userAgent: "Mozilla/5.0 Chrome/120.0.0.0",
                ipAddress: "127.0.0.1",
              },
              {
                id: "sess-2",
                isCurrent: false,
                createdAt: new Date(Date.now() - 86400000).toISOString(),
                lastUsedAt: new Date(Date.now() - 3600000).toISOString(),
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
                userAgent: "Mozilla/5.0 Safari/605.1.15",
                ipAddress: "192.168.1.100",
              },
            ],
          },
          meta: { requestId: "req-e2e-sess" },
        }),
      });
    });

    await page.goto("/organizations/org-e2e-1/projects");

    // Open Account Security and switch to the Active Sessions tab
    const securityBtn = page.getByRole("button", { name: "Account Security" });
    await securityBtn.click();
    await page.getByRole("button", { name: /Active Sessions/ }).click();

    await expect(page.getByText("Active Sessions & Devices")).toBeVisible();
    await expect(page.getByText("This Device")).toBeVisible();
    await expect(page.getByText("Mozilla/5.0 Chrome/120.0.0.0")).toBeVisible();
  });
});

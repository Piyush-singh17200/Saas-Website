import { test, expect, type Page } from "@playwright/test";

const INVITE_TOKEN = "0123456789abcdef".repeat(4);
const INVITED_EMAIL = "invited@example.com";
const ORG_ID = "org-ui-regression";
const USER_ID = "user-ui-regression";
const PROJECT_ID = "project-ui-regression";

function jsonRoute(
  status: number,
  body: Record<string, unknown>,
): Parameters<Page["route"]>[1] {
  return async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  };
}

function errorBody(code: string, message: string) {
  return {
    success: false,
    error: { code, message },
    meta: { requestId: "req-ui-regression" },
  };
}

function successBody(data: Record<string, unknown>) {
  return {
    success: true,
    data,
    meta: { requestId: "req-ui-regression" },
  };
}

async function mockInvitationApis(
  page: Page,
  options: { authenticatedEmail?: string | null } = {},
) {
  let authenticatedEmail = options.authenticatedEmail ?? null;

  await page.route(`**/api/v1/invitations/${INVITE_TOKEN}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        successBody({
          id: "invitation-ui-regression",
          email: INVITED_EMAIL,
          role: "MEMBER",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          isExpired: false,
          organization: {
            id: ORG_ID,
            name: "Regression Workspace",
            slug: "regression-workspace",
          },
          inviter: { displayName: "Workspace Owner" },
        }),
      ),
    });
  });

  await page.route("**/api/v1/me", async (route) => {
    if (!authenticatedEmail) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify(
          errorBody("UNAUTHORIZED", "Authentication required"),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        successBody({
          user: {
            id: USER_ID,
            email: authenticatedEmail,
            displayName: "Invited User",
          },
          organizations: [
            {
              id: ORG_ID,
              name: "Regression Workspace",
              slug: "regression-workspace",
              role: "MEMBER",
            },
          ],
        }),
      ),
    });
  });

  await page.route("**/api/v1/auth/login", async (route) => {
    authenticatedEmail = INVITED_EMAIL;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        successBody({
          user: {
            id: USER_ID,
            email: INVITED_EMAIL,
            displayName: "Invited User",
          },
        }),
      ),
    });
  });

  await page.route("**/api/v1/auth/register", async (route) => {
    authenticatedEmail = INVITED_EMAIL;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(
        successBody({
          user: {
            id: USER_ID,
            email: INVITED_EMAIL,
            displayName: "Invited User",
          },
          mfaRequired: false,
        }),
      ),
    });
  });

  await page.route("**/api/v1/organizations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        successBody({
          organizations: [
            {
              id: ORG_ID,
              name: "Regression Workspace",
              slug: "regression-workspace",
              role: "MEMBER",
            },
          ],
        }),
      ),
    });
  });
}

async function mockProjectListPage(page: Page, role: "MEMBER" | "OWNER") {
  await page.route(
    "**/api/v1/me",
    jsonRoute(
      200,
      successBody({
        user: {
          id: USER_ID,
          email: "member@example.com",
          displayName: "Workspace Member",
        },
        organizations: [],
      }),
    ),
  );

  await page.route(
    `**/api/v1/organizations/${ORG_ID}`,
    jsonRoute(
      200,
      successBody({
        organization: {
          id: ORG_ID,
          name: "Regression Workspace",
          slug: "regression-workspace",
        },
      }),
    ),
  );

  await page.route(
    `**/api/v1/organizations/${ORG_ID}/members`,
    jsonRoute(
      200,
      successBody({
        members: [
          {
            id: "membership-ui-regression",
            organizationId: ORG_ID,
            userId: USER_ID,
            role,
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
            joinedAt: new Date().toISOString(),
            user: {
              id: USER_ID,
              email: "member@example.com",
              displayName: "Workspace Member",
            },
          },
        ],
      }),
    ),
  );

  await page.route(
    `**/api/v1/organizations/${ORG_ID}/notifications/unread-count`,
    jsonRoute(200, successBody({ unreadCount: 0 })),
  );

  await page.route(
    `**/api/v1/organizations/${ORG_ID}/projects*`,
    jsonRoute(
      200,
      successBody({
        items: [
          {
            id: PROJECT_ID,
            organizationId: ORG_ID,
            name: "Regression Project",
            slug: "regression-project",
            description: "Used to verify lifecycle control visibility",
            status: "ACTIVE",
            taskCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      }),
    ),
  );
}

test.describe("Verified UI defect regressions", () => {
  test("login page never exposes the demo credential shortcut", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: "Sign in to your account" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Fill Demo Credentials/i }),
    ).toHaveCount(0);
    await expect(page.getByText("alice@workspace.test")).toHaveCount(0);
    await expect(page.getByText("Password123!")).toHaveCount(0);
  });

  test("preserves email and redirect through sign-in for an invited user", async ({
    page,
  }) => {
    await mockInvitationApis(page);
    await page.goto(`/invitations/${INVITE_TOKEN}`);

    await expect(
      page.getByRole("heading", { name: "Organization Invitation" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Sign In to Accept" }).click();

    await expect(page).toHaveURL(/\/login\?/);
    const loginUrl = new URL(page.url());
    expect(loginUrl.searchParams.get("email")).toBe(INVITED_EMAIL);
    expect(loginUrl.searchParams.get("redirect")).toBe(
      `/invitations/${INVITE_TOKEN}`,
    );

    await expect(page.locator('input[name="email"]')).toHaveValue(
      INVITED_EMAIL,
    );
    await page.locator('input[name="password"]').fill("Password123!");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(new RegExp(`/invitations/${INVITE_TOKEN}$`));
    await expect(
      page.getByRole("button", {
        name: /Accept Invitation & Join Organization/,
      }),
    ).toBeVisible();
  });

  test("preserves email and redirect through registration for an invited user", async ({
    page,
  }) => {
    await mockInvitationApis(page);
    await page.goto(`/invitations/${INVITE_TOKEN}`);

    await page.getByRole("link", { name: "Create an Account" }).click();

    await expect(page).toHaveURL(/\/register\?/);
    const registerUrl = new URL(page.url());
    expect(registerUrl.searchParams.get("email")).toBe(INVITED_EMAIL);
    expect(registerUrl.searchParams.get("redirect")).toBe(
      `/invitations/${INVITE_TOKEN}`,
    );

    await expect(page.locator('input[name="email"]')).toHaveValue(
      INVITED_EMAIL,
    );
    await page.locator('input[name="displayName"]').fill("Invited User");
    await page.locator('input[name="password"]').fill("Password123!");
    await page.getByRole("button", { name: "Create Free Account" }).click();

    await expect(page).toHaveURL(new RegExp(`/invitations/${INVITE_TOKEN}$`));
    await expect(
      page.getByRole("button", {
        name: /Accept Invitation & Join Organization/,
      }),
    ).toBeVisible();
  });

  test("legacy landing-page invitation links hand off to sign-in with context", async ({
    page,
  }) => {
    const legacyLandingUrl = `/?email=${encodeURIComponent(INVITED_EMAIL)}&redirect=${encodeURIComponent(`/invitations/${INVITE_TOKEN}`)}`;

    await page.goto(legacyLandingUrl);
    await expect(page).toHaveURL(/\/login\?/);

    const loginUrl = new URL(page.url());
    expect(loginUrl.searchParams.get("email")).toBe(INVITED_EMAIL);
    expect(loginUrl.searchParams.get("redirect")).toBe(
      `/invitations/${INVITE_TOKEN}`,
    );
  });

  test("hides archive lifecycle controls from organization members", async ({
    page,
  }) => {
    await mockProjectListPage(page, "MEMBER");
    await page.goto(`/organizations/${ORG_ID}/projects`);

    await expect(
      page.getByRole("heading", { name: "Regression Project" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Archive project" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Restore project" }),
    ).toHaveCount(0);
  });

  test("shows archive lifecycle controls to organization owners", async ({
    page,
  }) => {
    await mockProjectListPage(page, "OWNER");
    await page.goto(`/organizations/${ORG_ID}/projects`);

    await expect(
      page.getByRole("heading", { name: "Regression Project" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Archive project" }),
    ).toBeVisible();
  });

  test("maps a cross-tenant project-list 404 to a non-disclosing state", async ({
    page,
  }) => {
    await page.route(
      "**/api/v1/me",
      jsonRoute(
        200,
        successBody({
          user: {
            id: USER_ID,
            email: "member@example.com",
            displayName: "Workspace Member",
          },
          organizations: [],
        }),
      ),
    );
    await page.route(
      `**/api/v1/organizations/${ORG_ID}/projects*`,
      jsonRoute(404, errorBody("NOT_FOUND", "Organization not found")),
    );

    await page.goto(`/organizations/${ORG_ID}/projects`);

    await expect(
      page.getByRole("heading", { name: "Access Restricted" }),
    ).toBeVisible();
    await expect(
      page.getByText(/may not exist, or you may not have access/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "New Project" })).toHaveCount(
      0,
    );
  });

  test("maps a cross-tenant project-detail 404 to a non-disclosing state", async ({
    page,
  }) => {
    await page.route(
      "**/api/v1/me",
      jsonRoute(
        200,
        successBody({
          user: {
            id: USER_ID,
            email: "member@example.com",
            displayName: "Workspace Member",
          },
          organizations: [],
        }),
      ),
    );
    await page.route(
      `**/api/v1/organizations/${ORG_ID}/projects/${PROJECT_ID}`,
      jsonRoute(404, errorBody("NOT_FOUND", "Project not found")),
    );

    await page.goto(`/organizations/${ORG_ID}/projects/${PROJECT_ID}`);

    await expect(
      page.getByRole("heading", { name: "Access Restricted" }),
    ).toBeVisible();
    await expect(
      page.getByText(/may not exist, or you may not have access/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Task" })).toHaveCount(
      0,
    );
  });
});

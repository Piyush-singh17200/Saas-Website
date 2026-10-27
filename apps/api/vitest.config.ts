import { defineConfig } from "vitest/config";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_test?schema=public";

const testAppDatabaseUrl =
  process.env.TEST_APP_DATABASE_URL ??
  (() => {
    const appUrl = new URL(testDatabaseUrl);
    appUrl.username = "workspace_app";
    appUrl.password = "workspace_app_pass";
    return appUrl.toString();
  })();

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // All API tests share one PostgreSQL database and several suites truncate
    // tables. Never run them concurrently in one process.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      TEST_APP_DATABASE_URL: testAppDatabaseUrl,
      SESSION_COOKIE_NAME: "workspace_session",
      SESSION_TTL_DAYS: "7",
      COOKIE_SECURE: "false",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});

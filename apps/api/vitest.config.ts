import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_test?schema=public",
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

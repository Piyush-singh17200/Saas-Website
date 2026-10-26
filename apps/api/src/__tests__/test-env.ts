/**
 * Database URLs used by API integration tests.
 *
 * CI provides TEST_DATABASE_URL (owner/migration role) and
 * TEST_APP_DATABASE_URL (unprivileged runtime role). Local defaults keep the
 * standalone PostgreSQL test cluster working without extra setup.
 */
export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_test?schema=public";

export const testAppDatabaseUrl =
  process.env.TEST_APP_DATABASE_URL ??
  "postgresql://workspace_app:workspace_app_pass@127.0.0.1:5433/workspace_test?schema=public";

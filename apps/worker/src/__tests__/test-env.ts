/**
 * Database URL used by worker integration tests. CI supplies TEST_DATABASE_URL
 * with the owner/migration role; local defaults target the standalone test
 * PostgreSQL cluster on port 5433.
 */
export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_test?schema=public";

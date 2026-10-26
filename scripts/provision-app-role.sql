-- =============================================================================
-- Provision the unprivileged application role used by the API and worker.
--
-- Run as a database owner / migration role against the target database:
--
--   psql -h <host> -U <owner> -d <database> \
--     -v app_user=workspace_app \
--     -v app_password='<strong-password>' \
--     -v db_name=<database> \
--     -f scripts/provision-app-role.sql
--
-- The script is idempotent. It intentionally does NOT grant BYPASSRLS or
-- SUPERUSER: those attributes would silently disable tenant isolation.
-- =============================================================================

\set ON_ERROR_STOP on

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
  :'app_user',
  :'app_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user')
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
  :'app_user',
  :'app_password'
)
\gexec

GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";

-- The app schema is created by the first Prisma migration. This script is run
-- both before migrations (role creation only) and after migrations (grants), so
-- the schema-specific statements must tolerate its absence.
SELECT format('GRANT USAGE ON SCHEMA app TO %I', :'app_user')
WHERE EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
\gexec

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";

-- Prisma's migration ledger is owned by the migration role and must never be
-- writable by the runtime role. It may not exist before the first migration.
SELECT format(
  'REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM %I',
  :'app_user'
)
WHERE to_regclass('public._prisma_migrations') IS NOT NULL
\gexec

SELECT format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO %I', :'app_user')
WHERE EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
\gexec

-- Future migrations run by this owner will automatically be usable by the
-- runtime role without a separate grant step.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";

SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO %I',
  :'app_user'
)
WHERE EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
\gexec

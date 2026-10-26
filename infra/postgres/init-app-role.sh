#!/bin/sh
# Runs only on first initialization of an empty PostgreSQL data directory.
# For existing databases run scripts/provision-app-role.sql manually.
set -eu

: "${POSTGRES_APP_USER:?POSTGRES_APP_USER must be set}"
: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v app_user="$POSTGRES_APP_USER" \
  -v app_password="$POSTGRES_APP_PASSWORD" \
  -v db_name="$POSTGRES_DB" \
  -f /opt/workspace/provision-app-role.sql

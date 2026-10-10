# Docker Infrastructure — WorkSpace SaaS

This directory contains container configurations and documentation for local infrastructure services.

## Services Overview

- **PostgreSQL 16 (`postgres`)**:
  - Image: `postgres:16-alpine`
  - Container Port: `5432`
  - Persistent Volume: `postgres_data`
  - Healthcheck: `pg_isready -U <user> -d <db>`

- **Redis 7 (`redis`)**:
  - Image: `redis:7-alpine`
  - Container Port: `6379`
  - Persistent Volume: `redis_data`
  - Healthcheck: `redis-cli ping`

## Lifecycle Commands

From the repository root:

```bash
# Start background services in detached mode
docker compose up -d

# Verify service health status
docker compose ps

# View real-time logs
docker compose logs -f

# Stop services preserving data volumes
docker compose stop

# Destroy containers and networks (preserves volumes)
docker compose down

# Destroy containers and erase persistent volumes
docker compose down -v
```

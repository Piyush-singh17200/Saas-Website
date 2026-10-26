# WorkSpace SaaS - Disaster Recovery & Backup Plan

## 1. Objectives & Targets

| Metric                             | Target       | Rationale                                                                                                                       |
| :--------------------------------- | :----------- | :------------------------------------------------------------------------------------------------------------------------------ |
| **Recovery Point Objective (RPO)** | < 1 hour     | Maximum tolerable data loss. Achieved via hourly automated database snapshots / continuous WAL archiving in managed PostgreSQL. |
| **Recovery Time Objective (RTO)**  | < 30 minutes | Target time to restore service after catastrophic failure or corruption.                                                        |

> **Note**: These targets are operational objectives, not marketing guarantees. Regular drills and automated verification are required to ensure SLA compliance.

---

## 2. Data Classifications & Backup Strategy

### A. Primary Relational Store: PostgreSQL

- **Nature of Data**: Multi-tenant organizations, memberships, user credentials, MFA secrets, projects, tasks, comments, billing state, developer API keys, audit logs.
- **Backup Method**:
  1. **Continuous WAL Archiving**: Managed cloud PostgreSQL (AWS RDS / Neon) provides point-in-time recovery (PITR) up to 35 days.
  2. **Automated Logical Dumps**: Executed via `./scripts/backup-db.sh` using `pg_dump -Fc` (custom binary format).
- **Schedule**:
  - Daily snapshot at 02:00 UTC.
  - Pre-deployment manual snapshot prior to applying database migrations.
- **Off-Site Storage**: Backups are uploaded to a secondary region private S3 bucket (`BACKUP_S3_BUCKET`) encrypted with AWS KMS (`aws:kms`).
- **Retention**: Local dumps retained for 7 days; off-site snapshots retained for 30 days with S3 Glacier transition after 90 days.

### B. Object Storage: File Attachments (S3)

- **Nature of Data**: Uploaded user attachments (PDFs, images, archives).
- **Backup & Durability**:
  - S3 Cross-Region Replication (CRR) or versioned buckets.
  - S3 Versioning enabled to protect against accidental deletion or ransomware overwrite.
- **Consistency with Database**:
  - The database stores metadata (`Attachment` records with storage keys and checksums).
  - Deletions are soft-deleted or scheduled via background workers to avoid orphaned references.

### C. Queue Broker & Ephemeral State: Redis

- **Nature of Data**: Active BullMQ job queues, rate limiting counters, session blacklist/cache.
- **Durability Strategy**:
  - Rate limits are ephemeral and re-initialize gracefully without business impact.
  - In-flight background jobs are idempotent; interrupted jobs are retried by BullMQ with backoff.
  - Redis persistence (`RDB` snapshot every 15 minutes, `AOF` every second) enabled in self-hosted mode; managed Redis handles node failover automatically.

---

## 3. Database Restoration Procedure

### Step-by-Step Restoration Runbook

1. **Isolate Affected Environment**:
   - Put public ingress in maintenance mode or redirect traffic to a static maintenance page:
     ```bash
     # In nginx or CDN edge: return 503 Maintenance
     ```

2. **Retrieve Backup Artifact**:
   - Locate the most recent valid backup dump from local `/backups` or the S3 disaster recovery bucket:
     ```bash
     aws s3 cp s3://${BACKUP_S3_BUCKET}/backups/workspace_db_YYYYMMDD_HHMMSS.dump /tmp/restore_target.dump
     ```

3. **Validate Database Connectivity & Target URL**:
   - Confirm target database credentials:
     ```bash
     export TARGET_DATABASE_URL="postgresql://user:pass@host:5432/workspace_recovery?sslmode=require"
     ```

4. **Execute Restoration**:
   - Run the automated restore script:
     ```bash
     # Using shell script:
     FORCE_RESTORE=1 ./scripts/restore-db.sh /tmp/restore_target.dump "${TARGET_DATABASE_URL}"

     # Or using TypeScript utility:
     tsx scripts/restore-db.ts /tmp/restore_target.dump "${TARGET_DATABASE_URL}"
     ```

5. **Verify Database Integrity**:
   - Check Prisma migration status:
     ```bash
     pnpm --filter @workspace/database exec prisma migrate status
     ```
   - Verify table counts and tenant isolation:
     ```sql
     SELECT count(*) FROM "Organization";
     SELECT count(*) FROM "User";
     SELECT count(*) FROM "Task";
     ```

6. **Resume Service**:
   - Restart the API and Worker containers pointing to the restored database.
   - Run health check:
     ```bash
     curl -f https://api.yourdomain.com/health/ready
     ```
   - Disable maintenance mode.

---

## 4. Disaster Recovery Testing & Validation

### Drills & Verification Schedule

- **Automated Validation**: CI verifies `prisma migrate deploy` against a clean database on every commit.
- **Quarterly Drill**:
  - Spin up an isolated staging database.
  - Restore the latest production backup using `restore-db.sh`.
  - Run the API test suite against the restored database to confirm schema and relation integrity.
  - Document drill duration and any anomalies in the engineering incident log.

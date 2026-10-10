import { PrismaClient, type Prisma } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

const defaultDbUrl =
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV === "test"
    ? "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_test?schema=public"
    : "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_dev?schema=public");

export const prisma: PrismaClient =
  globalThis.__prismaClient ??
  new PrismaClient({
    datasources: {
      db: {
        url: defaultDbUrl,
      },
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaClient = prisma;
}

export interface DatabaseHealthResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Checks database connectivity by executing a low-overhead query.
 */
export async function checkDatabaseConnection(): Promise<DatabaseHealthResult> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      ok: true,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Database ping failed",
    };
  }
}

export type TenantTransactionCallback<T> = (
  tx: Prisma.TransactionClient,
) => Promise<T>;

/**
 * Executes operations within a transaction scoped to a specific organization.
 * Uses PostgreSQL transaction-local setting `set_config('app.current_organization_id', orgId, true)`
 * which guarantees zero tenant context leakage across pooled database connections.
 */
export async function withTenantTransaction<T>(
  organizationId: string,
  callback: TenantTransactionCallback<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
    return callback(tx);
  });
}

/**
 * Executes operations with administrative bypass explicitly enabled.
 * Used for system-level migrations, tenant setup, or cross-tenant reporting.
 */
export async function withAdminBypassTransaction<T>(
  callback: TenantTransactionCallback<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.admin_bypass', 'true', true)`;
    return callback(tx);
  });
}

export * from "@prisma/client";

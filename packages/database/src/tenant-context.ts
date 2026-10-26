import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import { basePrisma } from "./client.js";

/**
 * Request/job scoped database context. All queries performed through the
 * exported `prisma` proxy are routed to `tx` while a context is active, so
 * application code cannot accidentally escape row-level security.
 */
export interface DatabaseContext {
  tx: Prisma.TransactionClient;
  userId?: string;
  organizationId?: string;
  adminBypass?: boolean;
}

const storage = new AsyncLocalStorage<DatabaseContext>();

function transactionOptions(): { maxWait: number; timeout: number } {
  const timeout = Number(process.env.TENANT_TRANSACTION_TIMEOUT_MS ?? 60_000);
  return {
    maxWait: 10_000,
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 60_000,
  };
}

export function getDatabaseContext(): DatabaseContext | undefined {
  return storage.getStore();
}

export type TenantTransactionCallback<T> = (
  tx: Prisma.TransactionClient,
) => Promise<T>;

/**
 * Runs an operation inside a transaction with `app.current_organization_id`
 * set for the duration of the transaction only. Re-entrant calls for the same
 * organization reuse the surrounding transaction.
 */
export async function withTenantTransaction<T>(
  organizationId: string,
  callback: TenantTransactionCallback<T>,
): Promise<T> {
  const existing = storage.getStore();

  if (existing) {
    if (
      existing.organizationId !== undefined &&
      existing.organizationId !== organizationId
    ) {
      throw new Error(
        "Nested tenant context cannot change the active organization",
      );
    }

    if (existing.organizationId === undefined) {
      await existing.tx
        .$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
      existing.organizationId = organizationId;
    }

    return callback(existing.tx);
  }

  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
    const context: DatabaseContext = { tx, organizationId };
    return storage.run(context, () => callback(tx));
  }, transactionOptions());
}

/**
 * Runs an operation in a fresh tenant transaction even when another database
 * context is already active. Used for fire-and-forget work that may outlive the
 * request-scoped transaction (for example webhook fan-out).
 */
export async function withDetachedTenantTransaction<T>(
  organizationId: string,
  callback: TenantTransactionCallback<T>,
): Promise<T> {
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
    const context: DatabaseContext = { tx, organizationId };
    return storage.run(context, () => callback(tx));
  }, transactionOptions());
}

/**
 * Runs an operation with `app.current_user_id` set. Used for account-level
 * operations that legitimately span organizations (for example, listing the
 * organizations a user belongs to, or writing a personal security audit row).
 */
export async function withUserTransaction<T>(
  userId: string,
  callback: TenantTransactionCallback<T>,
): Promise<T> {
  const existing = storage.getStore();

  if (existing) {
    if (existing.userId !== undefined && existing.userId !== userId) {
      throw new Error("Nested user context cannot change the active user");
    }

    if (existing.userId === undefined) {
      await existing.tx
        .$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
      existing.userId = userId;
    }

    return callback(existing.tx);
  }

  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    const context: DatabaseContext = { tx, userId };
    return storage.run(context, () => callback(tx));
  }, transactionOptions());
}

/**
 * Runs an operation with the administrative RLS bypass flag. Reserved for
 * narrowly scoped trusted operations such as API-key lookup, invitation token
 * resolution, Stripe webhook processing, and maintenance sweeps.
 *
 * A new transaction is always opened so that the bypass cannot leak into an
 * enclosing tenant transaction. The bypass context is restored on return.
 */
export async function withAdminBypassTransaction<T>(
  callback: TenantTransactionCallback<T>,
): Promise<T> {
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.admin_bypass', 'true', true)`;
    const context: DatabaseContext = { tx, adminBypass: true };
    return storage.run(context, () => callback(tx));
  }, transactionOptions());
}

export interface RlsRuntimeStatus {
  currentUser: string;
  isSuperuser: boolean;
  bypassRls: boolean;
}

/**
 * Reads the effective PostgreSQL role attributes for the runtime connection.
 */
export async function getRlsRuntimeStatus(): Promise<RlsRuntimeStatus> {
  const rows = await basePrisma.$queryRaw<
    Array<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>
  >`SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;

  const row = rows[0];
  if (!row) {
    throw new Error("Unable to read PostgreSQL role attributes");
  }

  return {
    currentUser: row.current_user,
    isSuperuser: row.rolsuper,
    bypassRls: row.rolbypassrls,
  };
}

/**
 * Fails fast in production when the API/worker connects with a role that
 * bypasses row-level security. Controlled by ENFORCE_RLS_RUNTIME (defaults to
 * true when NODE_ENV=production).
 */
export async function assertRlsRuntimeRole(): Promise<void> {
  const enforce =
    process.env.ENFORCE_RLS_RUNTIME === "true" ||
    (process.env.ENFORCE_RLS_RUNTIME !== "false" &&
      process.env.NODE_ENV === "production");

  if (!enforce) {
    return;
  }

  const status = await getRlsRuntimeStatus();
  if (status.isSuperuser || status.bypassRls) {
    throw new Error(
      `Refusing to start: database role "${status.currentUser}" bypasses row-level security (superuser=${status.isSuperuser}, bypassrls=${status.bypassRls}). Point DATABASE_URL at the unprivileged workspace_app role.`,
    );
  }
}

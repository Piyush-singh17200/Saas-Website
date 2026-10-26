import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

const defaultDbUrl =
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV === "test"
    ? "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_test?schema=public"
    : "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_dev?schema=public");

/**
 * The underlying Prisma client. Application code should import `prisma`
 * (the context-aware proxy) instead of using this client directly unless it
 * is deliberately opening a transaction outside the request context.
 */
export const basePrisma: PrismaClient =
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
  globalThis.__prismaClient = basePrisma;
}

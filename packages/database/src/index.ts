import type { PrismaClient } from "@prisma/client";
import { basePrisma } from "./client.js";
import { getDatabaseContext } from "./tenant-context.js";

export { basePrisma } from "./client.js";
export * from "./tenant-context.js";

type Delegate = Record<string, unknown>;

const delegateCache = new Map<string, Delegate>();
const clientFunctionCache = new Map<
  string | symbol,
  (...args: unknown[]) => unknown
>();
const clientOverrides = new Map<string | symbol, unknown>();

const BASE_ONLY_CLIENT_METHODS = new Set<string | symbol>([
  "$transaction",
  "$connect",
  "$disconnect",
  "$on",
  "$use",
  "$extends",
]);

function getStableClientFunction(
  property: string | symbol,
): (...args: unknown[]) => unknown {
  const cached = clientFunctionCache.get(property);
  if (cached) {
    return cached;
  }

  const stable = (...args: unknown[]): unknown => {
    const client = BASE_ONLY_CLIENT_METHODS.has(property)
      ? basePrisma
      : (getDatabaseContext()?.tx ?? basePrisma);
    const method = Reflect.get(client, property);
    if (typeof method !== "function") {
      throw new Error(
        `Prisma client method ${String(property)} is not callable`,
      );
    }
    return Reflect.apply(method, client, args);
  };

  clientFunctionCache.set(property, stable);
  return stable;
}

/**
 * Prisma model delegates are ordinary objects with one method per operation.
 * We expose stable delegate objects whose methods resolve the active
 * transaction at call time. This keeps the API/mocking surface identical
 * (`prisma.membership.findFirst`) while ensuring the actual query executes on
 * the request-scoped transaction.
 */
function getStableDelegate(modelName: string): Delegate {
  const cached = delegateCache.get(modelName);
  if (cached) {
    return cached;
  }

  const source = Reflect.get(basePrisma, modelName) as Delegate | undefined;
  if (!source) {
    throw new Error(`Unknown Prisma model: ${modelName}`);
  }

  const stable: Delegate = {};

  for (const key of Object.getOwnPropertyNames(source)) {
    const value = Reflect.get(source, key);

    if (typeof value === "function") {
      stable[key] = (...args: unknown[]): unknown => {
        const client = getDatabaseContext()?.tx ?? basePrisma;
        const delegate = Reflect.get(client, modelName) as Delegate;
        const method = Reflect.get(delegate, key);
        if (typeof method !== "function") {
          throw new Error(`Prisma model ${modelName}.${key} is not callable`);
        }
        return Reflect.apply(method, delegate, args);
      };
    } else {
      stable[key] = value;
    }
  }

  delegateCache.set(modelName, stable);
  return stable;
}

function isModelDelegate(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Delegate).findFirst === "function"
  );
}

/**
 * Context-aware Prisma client.
 *
 * Outside a database context this forwards to the underlying client. Inside
 * `withTenantTransaction`, `withUserTransaction`, or
 * `withAdminBypassTransaction`, every query is routed through the active
 * transaction so PostgreSQL row-level security settings always apply.
 */
export const prisma: PrismaClient = new Proxy(basePrisma, {
  get(target, property) {
    if (property === "then") {
      return undefined;
    }

    if (clientOverrides.has(property)) {
      return clientOverrides.get(property);
    }

    const raw = Reflect.get(target, property, target);

    if (typeof property === "string" && isModelDelegate(raw)) {
      return getStableDelegate(property);
    }

    if (typeof raw === "function") {
      return getStableClientFunction(property);
    }

    return raw;
  },

  set(_target, property, value) {
    clientOverrides.set(property, value);
    return true;
  },

  defineProperty(_target, property, descriptor) {
    clientOverrides.set(
      property,
      "value" in descriptor
        ? descriptor.value
        : Reflect.get(basePrisma, property, basePrisma),
    );
    return true;
  },

  deleteProperty(_target, property) {
    clientOverrides.delete(property);
    return true;
  },

  has(target, property) {
    return clientOverrides.has(property) || Reflect.has(target, property);
  },

  getOwnPropertyDescriptor(target, property) {
    if (clientOverrides.has(property)) {
      return {
        value: clientOverrides.get(property),
        writable: true,
        enumerable: true,
        configurable: true,
      };
    }

    const raw = Reflect.get(target, property, target);
    if (typeof raw === "function") {
      return {
        value: getStableClientFunction(property),
        writable: true,
        enumerable: false,
        configurable: true,
      };
    }
    return Reflect.getOwnPropertyDescriptor(target, property);
  },
}) as PrismaClient;

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
    await basePrisma.$queryRaw`SELECT 1`;
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

export * from "@prisma/client";

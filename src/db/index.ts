import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Lazy database handles.
//
// The previous version threw at import time when DATABASE_URL was
// missing, which killed `next build` ("Failed to collect page data")
// on any project where the variable is not present during the build —
// even though the app only needs the database when a request actually
// touches it. These proxies create the real pool/db on FIRST USE, so
// builds always succeed. If the variable is still missing at request
// time, that request (not the build) fails, and /api/health reports
// { ok: false } honestly.

type Db = ReturnType<typeof drizzle>;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __novaDb?: Db;
};

function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({
      connectionString: databaseUrl,
    });
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

function createDb(): Db {
  if (!globalForDb.__novaDb) {
    globalForDb.__novaDb = drizzle(createPool());
  }
  return globalForDb.__novaDb;
}

function lazy<T extends object>(create: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const real = create() as unknown as Record<string | symbol, unknown>;
      const val = real[prop];
      return typeof val === "function"
        ? (val as (...args: unknown[]) => unknown).bind(real)
        : val;
    },
  });
}

export const pool: Pool = lazy<Pool>(createPool);
export const db: Db = lazy<Db>(createDb);

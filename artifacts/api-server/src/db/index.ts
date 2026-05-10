import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Item 2.7 #4 — handle transient idle-client errors (Neon serverless idles
// connections after ~5 min; pg auto-reconnects on next acquire). Without this
// handler, the recoverable error surfaces to Sentry as an uncaught exception.
// Logged via console.warn — real fatal pool errors still propagate via query
// failures and are not silenced here.
pool.on("error", (err) => {
  console.warn("[pg] idle client error (recoverable):", err.message);
});

export const db = drizzle(pool, { schema });

// Item 3.0 sub-task 1 — read-only pool for least-privilege queries.
//
// When DATABASE_URL_READONLY is set, dbReadOnly uses a separate pool backed by
// the eej_readonly Neon role (SELECT-only on all 75 public tables; future
// tables auto-grant SELECT via ALTER DEFAULT PRIVILEGES). Postgres rejects any
// INSERT/UPDATE/DELETE with `permission denied` at the role level — defense
// at infrastructure layer, not just code convention.
//
// When DATABASE_URL_READONLY is unset, dbReadOnly falls back to the writable
// pool with a startup warning. This is fail-soft: deploys won't break if the
// secret hasn't landed yet, but the RO protection is INACTIVE until it does.
// Callers should still prefer dbReadOnly for read-only queries — the
// protection activates without code change once the secret is set.
//
// See docs/READ_ONLY_DB_PATTERN.md for full convention + verification.
let readOnlyPool: pg.Pool;
if (process.env.DATABASE_URL_READONLY) {
  readOnlyPool = new pg.Pool({ connectionString: process.env.DATABASE_URL_READONLY });
  readOnlyPool.on("error", (err) => {
    console.warn("[pg-ro] idle client error (recoverable):", err.message);
  });
  console.log("[db] dbReadOnly using DATABASE_URL_READONLY (eej_readonly Neon role)");
} else {
  readOnlyPool = pool;
  console.warn("[db] DATABASE_URL_READONLY not set — dbReadOnly falls back to writable pool. Set the secret to activate least-privilege protection (Item 3.0 sub-task 1).");
}

export const dbReadOnly = drizzle(readOnlyPool, { schema });

export { schema };
export type Database = typeof db;

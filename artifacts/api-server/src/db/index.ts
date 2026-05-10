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
export { schema };
export type Database = typeof db;

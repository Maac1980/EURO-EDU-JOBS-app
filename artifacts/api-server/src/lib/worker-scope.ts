/**
 * Per-worker authorization scope check — Tier 1 #3 hardening.
 *
 * Several worker-facing read routes accept a `:workerId` URL parameter
 * (UPO records, Schengen status, etc.). Pre-Tier-1 those routes verified
 * `authenticateToken` but did NOT verify that the requesting user owns the
 * worker row — any authenticated user could enumerate any worker's
 * compliance data by passing a different workerId in the URL.
 *
 * `assertWorkerReadable(req, workerId)` enforces:
 *  (a) staff roles (admin / coordinator / executive / operations / legal /
 *      manager) can read any worker's data — they act on behalf of workers
 *  (b) a worker can read only their own row — match by authenticated email
 *      against workers.email
 *  (c) everyone else gets 403
 *
 * Returns `{ ok: true }` on success, or `{ ok: false, status, error }` so
 * the caller can `return res.status(g.status).json({ error: g.error })`.
 *
 * Role names accepted: both dashboard ("admin"/"coordinator"/"manager")
 * and mobile ("executive"/"operations"/"legal"/"candidate") forms. The
 * role-translation cleanup is queued as Tier 2 — this helper accepts both
 * shapes so worker-portal reads stay compatible until that lands.
 */

import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

type DbRow = Record<string, unknown>;

const STAFF_ROLES = new Set([
  "admin",
  "coordinator",
  "executive",
  "operations",
  "legal",
  "manager",
]);

export async function assertWorkerReadable(
  req: { user?: { email?: string; role?: string } },
  workerId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const user = req.user;
  if (!user) return { ok: false, status: 401, error: "Not authenticated." };

  if (user.role && STAFF_ROLES.has(String(user.role).toLowerCase())) {
    return { ok: true };
  }

  if (!user.email) {
    return { ok: false, status: 403, error: "Access denied." };
  }

  const rows = await db.execute(sql`
    SELECT email FROM workers WHERE id = ${workerId} LIMIT 1
  `);
  if (rows.rows.length === 0) {
    return { ok: false, status: 404, error: "Worker not found." };
  }
  const ownerEmail = (rows.rows[0] as DbRow).email as string | null;
  if (!ownerEmail || ownerEmail.toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, status: 403, error: "Access denied." };
  }
  return { ok: true };
}

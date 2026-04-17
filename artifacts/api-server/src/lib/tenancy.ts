import type { Request } from "express";
import { eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

export const DEFAULT_TENANT = "production";
export const TEST_TENANT = "test";

/**
 * Tenant resolution cache. Maps slug -> id. Populated lazily.
 * Tenants are stable once created, so infinite TTL is safe within a process.
 */
const slugToIdCache = new Map<string, string>();

/**
 * Resolve a tenant slug to its UUID. Cached. Falls back to inserting the
 * tenant row on first use if it does not exist (idempotent, safe under race).
 */
export async function resolveTenantId(rawSlug: string | undefined | null): Promise<string> {
  const slug = (rawSlug ?? DEFAULT_TENANT).toString().trim() || DEFAULT_TENANT;
  const cached = slugToIdCache.get(slug);
  if (cached) return cached;
  const rows = await db.execute(sql`SELECT id FROM tenants WHERE slug = ${slug} LIMIT 1`);
  const first = rows.rows[0] as { id: string } | undefined;
  if (first?.id) {
    slugToIdCache.set(slug, first.id);
    return first.id;
  }
  // Auto-create a missing tenant record (idempotent via ON CONFLICT).
  const ins = await db.execute(sql`
    INSERT INTO tenants (slug, name)
    VALUES (${slug}, ${slug})
    ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
    RETURNING id
  `);
  const created = ins.rows[0] as { id: string } | undefined;
  if (!created?.id) throw new Error(`[tenancy] Failed to resolve tenant '${slug}'`);
  slugToIdCache.set(slug, created.id);
  return created.id;
}

export async function getDefaultTenantId(): Promise<string> {
  return resolveTenantId(DEFAULT_TENANT);
}

/**
 * Returns the slug used for row-level filtering. Stays synchronous and keeps
 * existing string semantics (tenant_id column is TEXT + FK to tenants.slug).
 * Legacy JWT tokens without tenantId default to "production".
 */
export function requireTenant(req: Request): string {
  return req.user?.tenantId ?? DEFAULT_TENANT;
}

export function scopedWhere(tenantId: string, col: PgColumn): SQL {
  return eq(col, tenantId);
}

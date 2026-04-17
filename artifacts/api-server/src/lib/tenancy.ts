import type { Request } from "express";
import { eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export const DEFAULT_TENANT = "production";

export function requireTenant(req: Request): string {
  return req.user?.tenantId ?? DEFAULT_TENANT;
}

export function scopedWhere(tenantId: string, col: PgColumn): SQL {
  return eq(col, tenantId);
}

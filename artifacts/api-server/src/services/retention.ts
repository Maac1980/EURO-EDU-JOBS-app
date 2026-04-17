import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

/**
 * Data retention policy:
 *  - gps_checkins: 12 months
 *  - notifications: 6 months
 *  - regulatory_updates: 24 months
 *  - audit_entries: never deleted (compliance requirement)
 */
export async function runRetentionSweep(): Promise<{
  gpsDeleted: number;
  notificationsDeleted: number;
  regulatoryDeleted: number;
}> {
  const gps = await db.execute(sql`
    DELETE FROM gps_checkins WHERE timestamp < NOW() - INTERVAL '12 months'
  `);
  const notif = await db.execute(sql`
    DELETE FROM notifications WHERE sent_at < NOW() - INTERVAL '6 months'
  `);
  const regs = await db.execute(sql`
    DELETE FROM regulatory_updates WHERE fetched_at < NOW() - INTERVAL '24 months'
  `);

  const gpsDeleted = (gps as any).rowCount ?? 0;
  const notificationsDeleted = (notif as any).rowCount ?? 0;
  const regulatoryDeleted = (regs as any).rowCount ?? 0;

  console.log(
    `[retention] sweep done — gps_checkins: ${gpsDeleted}, notifications: ${notificationsDeleted}, regulatory_updates: ${regulatoryDeleted} (audit_entries: kept)`
  );

  return { gpsDeleted, notificationsDeleted, regulatoryDeleted };
}

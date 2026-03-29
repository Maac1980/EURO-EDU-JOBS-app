import { db, schema } from "../db/index.js";
import { desc } from "drizzle-orm";

export interface NotificationEntry {
  id: string;
  workerId: string;
  workerName: string;
  channel: string;
  message: string;
  actor: string;
  sentAt: string;
}

export function appendNotification(
  workerId: string, workerName: string, channel: string, message: string, actor: string
): void {
  db.insert(schema.notifications).values({ workerId, workerName, channel, message, actor })
    .catch(e => console.error("[notification] write error:", e));
}

export async function getNotifications(limit = 100): Promise<NotificationEntry[]> {
  const rows = await db.select().from(schema.notifications).orderBy(desc(schema.notifications.sentAt)).limit(limit);
  return rows.map(r => ({
    id: r.id, workerId: r.workerId ?? "", workerName: r.workerName ?? "",
    channel: r.channel, message: r.message, actor: r.actor,
    sentAt: r.sentAt?.toISOString() ?? new Date().toISOString(),
  }));
}

export async function clearNotifications(): Promise<void> {
  await db.delete(schema.notifications);
}

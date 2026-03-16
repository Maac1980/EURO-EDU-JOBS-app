import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const LOG_PATH = path.resolve("data/notifications.json");
const MAX_ENTRIES = 500;

export interface NotificationEntry {
  id: string;
  workerId: string;
  workerName: string;
  channel: string;
  message: string;
  actor: string;
  sentAt: string;
}

function readLog(): NotificationEntry[] {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    return JSON.parse(fs.readFileSync(LOG_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeLog(entries: NotificationEntry[]): void {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2));
}

export function appendNotification(
  workerId: string,
  workerName: string,
  channel: string,
  message: string,
  actor: string
): NotificationEntry {
  const entry: NotificationEntry = {
    id: randomUUID(),
    workerId,
    workerName,
    channel,
    message,
    actor,
    sentAt: new Date().toISOString(),
  };
  const existing = readLog();
  const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
  writeLog(updated);
  return entry;
}

export function getNotifications(limit = 100): NotificationEntry[] {
  return readLog().slice(0, limit);
}

export function clearNotifications(): void {
  writeLog([]);
}

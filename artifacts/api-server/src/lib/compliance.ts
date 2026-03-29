import { type InferSelectModel } from "drizzle-orm";
import type { workers as workersTable } from "../db/schema.js";

// Worker type directly from DB schema
export type WorkerRow = InferSelectModel<typeof workersTable>;

// Extended worker type with computed compliance fields
export interface Worker extends WorkerRow {
  complianceStatus: "critical" | "warning" | "compliant" | "non-compliant";
  daysUntilNextExpiry: number | null;
  passportAttachments: Attachment[];
  contractAttachments: Attachment[];
}

export interface Attachment {
  id: string;
  url: string;
  filename: string;
  size?: number | null;
  type?: string | null;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const expiry = new Date(dateStr);
  if (isNaN(expiry.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function computeStatus(worker: WorkerRow): {
  status: "critical" | "warning" | "compliant" | "non-compliant";
  daysUntilNextExpiry: number | null;
} {
  const bhp = worker.bhpStatus?.toLowerCase();
  if (bhp === "expired") {
    return { status: "non-compliant", daysUntilNextExpiry: null };
  }

  const expiryDays = [
    daysUntil(worker.trcExpiry),
    daysUntil(worker.workPermitExpiry),
    daysUntil(worker.contractEndDate),
    daysUntil(worker.badaniaLekExpiry),
    daysUntil(worker.oswiadczenieExpiry),
    daysUntil(worker.udtCertExpiry),
  ].filter((d): d is number => d !== null);

  if (expiryDays.length === 0) {
    return { status: "compliant", daysUntilNextExpiry: null };
  }

  const minDays = Math.min(...expiryDays);
  if (minDays < 0) return { status: "non-compliant", daysUntilNextExpiry: minDays };
  if (minDays < 30) return { status: "critical", daysUntilNextExpiry: minDays };
  if (minDays < 60) return { status: "warning", daysUntilNextExpiry: minDays };
  return { status: "compliant", daysUntilNextExpiry: minDays };
}

export function toWorker(row: WorkerRow, attachments?: Attachment[]): Worker {
  const { status, daysUntilNextExpiry } = computeStatus(row);
  const passportAttachments = (attachments ?? []).filter(a => a.type === "passport");
  const contractAttachments = (attachments ?? []).filter(a => a.type === "contract");
  return {
    ...row,
    complianceStatus: status,
    daysUntilNextExpiry,
    passportAttachments,
    contractAttachments,
  };
}

export function filterWorkers(
  workers: Worker[],
  search?: string,
  specialization?: string,
  status?: string
): Worker[] {
  return workers.filter((w) => {
    if (search && !w.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (specialization && specialization !== "all" && w.jobRole !== specialization) return false;
    if (status && status !== "all" && w.complianceStatus !== status) return false;
    return true;
  });
}

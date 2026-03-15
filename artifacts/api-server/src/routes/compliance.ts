import { Router } from "express";
import { fetchAllRecords } from "../lib/airtable.js";
import { mapRecordToWorker } from "../lib/compliance.js";
import { MOCK_WORKERS, isMockMode } from "../lib/mockData.js";

const router = Router();

export interface DocumentRecord {
  id: string;
  workerId: string;
  workerName: string;
  documentType: string;
  expiryDate: string;
  daysRemaining: number;
  zone: "green" | "yellow" | "red" | "expired";
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

function toZone(days: number): "green" | "yellow" | "red" | "expired" {
  if (days < 0) return "expired";
  if (days < 30) return "red";
  if (days < 60) return "yellow";
  return "green";
}

router.get("/compliance/documents", async (_req, res) => {
  try {
    let workers;

    if (isMockMode()) {
      workers = MOCK_WORKERS;
    } else {
      const records = await fetchAllRecords();
      workers = records.map(mapRecordToWorker);
    }

    const documents: DocumentRecord[] = [];
    let idCounter = 0;

    for (const w of workers) {
      const docs: Array<{ type: string; date: string | null }> = [
        { type: "TRC Residence Card", date: w.trcExpiry },
        { type: "Work Permit", date: w.workPermitExpiry },
        { type: "Contract End Date", date: w.contractEndDate },
      ];

      // BHP — only include if it looks like a date (not "Active" / "Expired" text)
      if (w.bhpStatus && /\d{4}/.test(w.bhpStatus)) {
        docs.push({ type: "BHP Certificate", date: w.bhpStatus });
      }

      for (const doc of docs) {
        if (!doc.date) continue;
        const days = daysUntil(doc.date);
        if (days === null) continue;

        documents.push({
          id: `${w.id}-${idCounter++}`,
          workerId: w.id,
          workerName: w.name,
          documentType: doc.type,
          expiryDate: doc.date,
          daysRemaining: days,
          zone: toZone(days),
        });
      }
    }

    // Sort: expired first, then red, yellow, green; within each zone by days asc
    const zoneOrder = { expired: 0, red: 1, yellow: 2, green: 3 };
    documents.sort((a, b) => {
      const zo = zoneOrder[a.zone] - zoneOrder[b.zone];
      if (zo !== 0) return zo;
      return a.daysRemaining - b.daysRemaining;
    });

    return res.json({
      documents,
      summary: {
        total: documents.length,
        expired: documents.filter((d) => d.zone === "expired").length,
        red: documents.filter((d) => d.zone === "red").length,
        yellow: documents.filter((d) => d.zone === "yellow").length,
        green: documents.filter((d) => d.zone === "green").length,
      },
    });
  } catch (err) {
    console.error("[compliance] Error fetching documents:", err);
    return res.status(500).json({ error: "Failed to load compliance data." });
  }
});

export default router;

import { Router, type IRouter } from "express";
import { fetchAllRecords, fetchRecord, updateRecord } from "../lib/airtable.js";
import { mapRecordToWorker, filterWorkers, type Worker } from "../lib/compliance.js";

const router: IRouter = Router();

// GET /workers
router.get("/workers", async (req, res) => {
  try {
    const { search, specialization, status } = req.query as Record<string, string>;
    const records = await fetchAllRecords();
    const allWorkers = records.map(mapRecordToWorker);
    const filtered = filterWorkers(allWorkers, search, specialization, status);
    res.json({ workers: filtered, total: filtered.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /workers/stats
router.get("/workers/stats", async (_req, res) => {
  try {
    const records = await fetchAllRecords();
    const workers = records.map(mapRecordToWorker);

    const stats = {
      total: workers.length,
      critical: workers.filter((w) => w.complianceStatus === "critical").length,
      warning: workers.filter((w) => w.complianceStatus === "warning").length,
      compliant: workers.filter((w) => w.complianceStatus === "compliant").length,
      nonCompliant: workers.filter((w) => w.complianceStatus === "non-compliant").length,
    };

    res.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /workers/report
router.get("/workers/report", async (_req, res) => {
  try {
    const records = await fetchAllRecords();
    const workers = records.map(mapRecordToWorker);

    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    interface ExpiringDocument {
      workerId: string;
      workerName: string;
      specialization: string;
      documentType: string;
      expiryDate: string;
      daysUntilExpiry: number;
      status: string;
    }

    function checkDoc(
      worker: Worker,
      docType: string,
      expiry: string | null
    ): ExpiringDocument | null {
      if (!expiry) return null;
      const expiryDate = new Date(expiry);
      const days = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        workerId: worker.id,
        workerName: worker.name,
        specialization: worker.specialization,
        documentType: docType,
        expiryDate: expiry,
        daysUntilExpiry: days,
        status:
          days < 0
            ? "expired"
            : days < 30
              ? "critical"
              : days < 60
                ? "warning"
                : "safe",
      };
    }

    const allExpiring: ExpiringDocument[] = [];

    for (const worker of workers) {
      const docs = [
        checkDoc(worker, "TRC", worker.trcExpiry),
        checkDoc(worker, "Work Permit", worker.workPermitExpiry),
        checkDoc(worker, "Contract", worker.contractEndDate),
      ];

      for (const doc of docs) {
        if (doc && doc.daysUntilExpiry < 60) {
          allExpiring.push(doc);
        }
      }
    }

    const expiringThisWeek = allExpiring.filter((d) => {
      const expiryDate = new Date(d.expiryDate);
      return expiryDate >= now && expiryDate <= oneWeekFromNow;
    });

    const critical = allExpiring.filter(
      (d) => d.status === "critical" || d.status === "expired"
    );
    const warning = allExpiring.filter((d) => d.status === "warning");

    const summary =
      `As of ${now.toLocaleDateString()}, there are ${workers.length} workers on record. ` +
      `${critical.length} documents are critically expiring within 30 days (or already expired). ` +
      `${warning.length} documents are expiring within 30-60 days. ` +
      `${expiringThisWeek.length} documents expire within the next 7 days. ` +
      `Immediate action is required for ${critical.length} document(s).`;

    res.json({
      generatedAt: now.toISOString(),
      totalWorkers: workers.length,
      expiringThisWeek,
      critical,
      warning,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /workers/:id
router.get("/workers/:id", async (req, res) => {
  try {
    const record = await fetchRecord(req.params.id);
    res.json(mapRecordToWorker(record));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("404") || message.includes("NOT_FOUND")) {
      res.status(404).json({ error: "Worker not found" });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// PATCH /workers/:id
router.patch("/workers/:id", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;

    // Map our schema field names to Airtable field names
    const airtableFields: Record<string, unknown> = {};

    if (body.trcExpiry !== undefined) airtableFields["TRC Expiry"] = body.trcExpiry;
    if (body.workPermitExpiry !== undefined)
      airtableFields["Work Permit Expiry"] = body.workPermitExpiry;
    if (body.bhpStatus !== undefined) airtableFields["BHP Status"] = body.bhpStatus;
    if (body.contractEndDate !== undefined)
      airtableFields["Contract End Date"] = body.contractEndDate;
    if (body.email !== undefined) airtableFields["Email"] = body.email;
    if (body.phone !== undefined) airtableFields["Phone"] = body.phone;

    const updated = await updateRecord(req.params.id, airtableFields);
    res.json(mapRecordToWorker(updated));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /workers/:id/notify
router.post("/workers/:id/notify", async (req, res) => {
  try {
    const record = await fetchRecord(req.params.id);
    const worker = mapRecordToWorker(record);
    const body = req.body as { message?: string; channel?: string };

    // In a production system, this would send an email/SMS
    // For now, we log and return success
    console.log(
      `[Notify] Worker: ${worker.name} | Channel: ${body.channel ?? "email"} | Message: ${body.message}`
    );

    res.json({
      success: true,
      message: `Notification queued for ${worker.name} via ${body.channel ?? "email"}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;

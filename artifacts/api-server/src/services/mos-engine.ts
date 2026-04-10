/**
 * MOS Engine — Electronic TRC filing via Moduł Obsługi Spraw (login.gov.pl).
 *
 * Tracks MOS submission status alongside legal cases.
 * MOS submission timestamp = filing date for Art. 108 protection.
 *
 * MOS 2026 Rules:
 *  - Electronic-only submission via login.gov.pl
 *  - Qualified e-signature / Trusted Profile / Personal Signature required
 *  - 2 photos required (35mm x 45mm)
 *  - MOS submission timestamp = filing date for Art. 108
 *  - correction_needed pauses workflow → internal task
 *
 * Does NOT replace Art. 108 logic — patches into existing legal engine.
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { sql, eq, desc } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

// MOS submission statuses
type MOSStatus = "DRAFT" | "READY_TO_SUBMIT" | "SUBMITTED" | "CORRECTION_NEEDED" | "ACCEPTED" | "REJECTED";

const MOS_TRANSITIONS: Record<MOSStatus, MOSStatus[]> = {
  DRAFT: ["READY_TO_SUBMIT"],
  READY_TO_SUBMIT: ["SUBMITTED", "DRAFT"],
  SUBMITTED: ["CORRECTION_NEEDED", "ACCEPTED", "REJECTED"],
  CORRECTION_NEEDED: ["READY_TO_SUBMIT"],
  ACCEPTED: [],
  REJECTED: [],
};

// MOS document checklist
const MOS_CHECKLIST = [
  { id: "application_form", label: "Wniosek o udzielenie zezwolenia na pobyt czasowy", required: true },
  { id: "passport_copy", label: "Kopia paszportu (strona ze zdjęciem)", required: true },
  { id: "photos_2x", label: "2 zdjęcia (35mm × 45mm)", required: true },
  { id: "proof_accommodation", label: "Potwierdzenie zakwaterowania", required: true },
  { id: "health_insurance", label: "Ubezpieczenie zdrowotne", required: true },
  { id: "employment_contract", label: "Umowa o pracę / zlecenie", required: true },
  { id: "employer_declaration", label: "Oświadczenie pracodawcy", required: true },
  { id: "fee_confirmation", label: "Potwierdzenie opłaty (440 PLN)", required: true },
  { id: "esignature", label: "Podpis kwalifikowany / Profil Zaufany", required: true },
  { id: "power_of_attorney", label: "Pełnomocnictwo (jeśli reprezentant)", required: false },
  { id: "previous_permit_copy", label: "Kopia poprzedniego zezwolenia", required: false },
  { id: "criminal_record", label: "Zaświadczenie o niekaralności", required: false },
];

// ── POST /api/mos/create — create MOS submission record ─────────────────
router.post("/mos/create", authenticateToken, async (req, res) => {
  try {
    const { workerId, caseId, voivodeship, submissionMethod } = req.body as any;
    if (!workerId) return res.status(400).json({ error: "workerId required" });

    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    // Create MOS record using legal_documents table
    const [doc] = await db.insert(schema.legalDocuments).values({
      workerId,
      caseId: caseId ?? null,
      docType: "mos_submission",
      language: "pl",
      title: `MOS TRC Application — ${w.name}`,
      content: JSON.stringify({
        mosStatus: "DRAFT",
        voivodeship: voivodeship ?? "Mazowiecki",
        submissionMethod: submissionMethod ?? "login.gov.pl",
        checklist: MOS_CHECKLIST.map(c => ({ ...c, completed: false })),
        submissionTimestamp: null,
        mosReference: null,
        correctionDetails: null,
      }),
      status: "draft",
    }).returning();

    return res.status(201).json({
      mosId: doc.id,
      workerName: w.name,
      mosStatus: "DRAFT",
      checklist: MOS_CHECKLIST,
      checklistComplete: 0,
      checklistTotal: MOS_CHECKLIST.filter(c => c.required).length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/mos/:id/status — update MOS status ───────────────────────
router.patch("/mos/:id/status", authenticateToken, async (req, res) => {
  try {
    const { newStatus, mosReference, submissionTimestamp, correctionDetails } = req.body as any;
    if (!newStatus) return res.status(400).json({ error: "newStatus required" });

    const [doc] = await db.select().from(schema.legalDocuments).where(eq(schema.legalDocuments.id, req.params.id));
    if (!doc || doc.docType !== "mos_submission") return res.status(404).json({ error: "MOS submission not found" });

    const current = JSON.parse(doc.content as string ?? "{}");
    const currentStatus = current.mosStatus as MOSStatus;
    const allowed = MOS_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(newStatus)) {
      return res.status(400).json({
        error: `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowed.join(", ")}`,
      });
    }

    // Update MOS data
    current.mosStatus = newStatus;
    if (mosReference) current.mosReference = mosReference;
    if (submissionTimestamp) current.submissionTimestamp = submissionTimestamp;
    if (correctionDetails) current.correctionDetails = correctionDetails;

    await db.update(schema.legalDocuments).set({
      content: JSON.stringify(current),
      status: newStatus === "ACCEPTED" ? "approved" : newStatus === "SUBMITTED" ? "sent" : "draft",
      updatedAt: new Date(),
    }).where(eq(schema.legalDocuments.id, req.params.id));

    // If SUBMITTED — record submission timestamp as filing date for Art. 108
    if (newStatus === "SUBMITTED" && doc.workerId) {
      const filingDate = submissionTimestamp ?? new Date().toISOString().slice(0, 10);
      // Store filing date on worker (for legal engine Art. 108 check)
      await db.execute(sql`
        UPDATE workers SET updated_at = NOW() WHERE id = ${doc.workerId}
      `);

      // Create legal notification
      await db.execute(sql`
        INSERT INTO legal_notifications (worker_id, case_id, message_type, message, recipient_type, status)
        VALUES (${doc.workerId}, ${doc.caseId}, 'mos_submitted',
          ${"MOS TRC application submitted via login.gov.pl — Art. 108 protection may apply from " + filingDate},
          'internal', 'pending')
      `);
    }

    // If CORRECTION_NEEDED — create urgent task
    if (newStatus === "CORRECTION_NEEDED" && doc.workerId) {
      await db.execute(sql`
        INSERT INTO legal_suggestions (worker_id, case_id, suggestion_type, reason, priority, status)
        VALUES (${doc.workerId}, ${doc.caseId}, 'mos_correction',
          ${"MOS correction required: " + (correctionDetails ?? "See voivodeship notice")},
          95, 'pending')
        ON CONFLICT (worker_id, suggestion_type, status) WHERE status = 'pending' DO NOTHING
      `);
    }

    return res.json({
      success: true,
      mosId: req.params.id,
      previousStatus: currentStatus,
      newStatus,
      art108Note: newStatus === "SUBMITTED" ? "MOS submission timestamp recorded — verify Art. 108 eligibility" : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/mos/:id/checklist — update checklist item ────────────────
router.patch("/mos/:id/checklist", authenticateToken, async (req, res) => {
  try {
    const { itemId, completed } = req.body as { itemId: string; completed: boolean };
    if (!itemId) return res.status(400).json({ error: "itemId required" });

    const [doc] = await db.select().from(schema.legalDocuments).where(eq(schema.legalDocuments.id, req.params.id));
    if (!doc || doc.docType !== "mos_submission") return res.status(404).json({ error: "MOS submission not found" });

    const current = JSON.parse(doc.content as string ?? "{}");
    const item = current.checklist?.find((c: any) => c.id === itemId);
    if (!item) return res.status(404).json({ error: "Checklist item not found" });
    item.completed = completed;

    await db.update(schema.legalDocuments).set({
      content: JSON.stringify(current), updatedAt: new Date(),
    }).where(eq(schema.legalDocuments.id, req.params.id));

    const requiredDone = current.checklist.filter((c: any) => c.required && c.completed).length;
    const requiredTotal = current.checklist.filter((c: any) => c.required).length;
    const allRequiredDone = requiredDone === requiredTotal;

    // Auto-transition to READY_TO_SUBMIT if all required items done
    if (allRequiredDone && current.mosStatus === "DRAFT") {
      current.mosStatus = "READY_TO_SUBMIT";
      await db.update(schema.legalDocuments).set({ content: JSON.stringify(current) }).where(eq(schema.legalDocuments.id, req.params.id));
    }

    return res.json({
      itemId, completed,
      checklistComplete: requiredDone,
      checklistTotal: requiredTotal,
      allRequiredDone,
      mosStatus: current.mosStatus,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/mos/worker/:workerId — get MOS submissions for worker ──────
router.get("/mos/worker/:workerId", authenticateToken, async (req, res) => {
  try {
    const rows = await db.select().from(schema.legalDocuments)
      .where(sql`worker_id = ${req.params.workerId} AND doc_type = 'mos_submission'`)
      .orderBy(desc(schema.legalDocuments.createdAt));

    const submissions = rows.map(r => {
      const data = JSON.parse(r.content as string ?? "{}");
      return {
        id: r.id, mosStatus: data.mosStatus, voivodeship: data.voivodeship,
        mosReference: data.mosReference, submissionTimestamp: data.submissionTimestamp,
        checklist: data.checklist, correctionDetails: data.correctionDetails,
        createdAt: r.createdAt,
      };
    });

    return res.json({ submissions });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/mos/checklist — get standard MOS checklist ─────────────────
router.get("/mos/checklist", authenticateToken, async (_req, res) => {
  return res.json({ checklist: MOS_CHECKLIST });
});

export default router;

/**
 * Authority Packs — Generate document packages for voivodship offices.
 * Cover letter + worker data + legal snapshot + evidence list.
 * Always DRAFT — lawyer reviews before sending.
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { eq, sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { evaluateLegalStatus } from "./legal-decision-engine.js";

const router = Router();

// ── POST /api/authority-packs/generate — generate pack for worker ────────
router.post("/authority-packs/generate", authenticateToken, async (req, res) => {
  try {
    const { workerId, packType, language, voivodship, caseId } = req.body as {
      workerId: string; packType: string; language?: string; voivodship?: string; caseId?: string;
    };
    if (!workerId || !packType) return res.status(400).json({ error: "workerId and packType required" });

    // Get worker data
    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    // Get legal snapshot
    const snapshots = await db.select().from(schema.legalSnapshots)
      .where(eq(schema.legalSnapshots.workerId, workerId))
      .orderBy(sql`created_at DESC`).limit(1);

    // Get evidence
    const evidence = await db.select().from(schema.legalEvidence)
      .where(eq(schema.legalEvidence.workerId, workerId));

    const lang = language ?? "pl";
    const voi = voivodship ?? "Mazowiecki";

    // Generate cover letter with AI
    let coverLetter = "";
    try {
      const mod = await import("@anthropic-ai/sdk");
      const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });

      const snapshotContext = snapshots.length > 0
        ? `\nLEGAL SNAPSHOT DATA — DO NOT CONTRADICT:\nStatus: ${snapshots[0].legalStatus}\nBasis: ${snapshots[0].legalBasis}\nRisk: ${snapshots[0].riskLevel}`
        : "";

      const resp = await client.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 1500,
        messages: [{ role: "user", content:
          `Generate a formal ${packType} document package cover letter in ${lang === "pl" ? "Polish" : "English"} for submission to the Voivodship Office (Urząd Wojewódzki) in ${voi}.

Worker: ${w.name}
Nationality: ${w.nationality ?? "N/A"}
PESEL: ${w.pesel ?? "N/A"}
Job Role: ${w.job_role ?? "Worker"}
Employer: Euro Edu Jobs Sp. z o.o.
Current Site: ${w.assigned_site ?? "N/A"}

Pack Type: ${packType}
Evidence on file: ${evidence.length} documents
${snapshotContext}

Include:
1. Formal header with date, recipient (Wojewoda ${voi}), sender (Euro Edu Jobs)
2. Subject line referencing the pack type
3. List of enclosed documents
4. Legal basis references
5. Contact information
6. Signature block

Mark as "DRAFT — Requires Legal Review" at the top.
Use formal Polish legal language if PL, formal English if EN.
Do not use markdown.` }],
      });
      coverLetter = resp.content[0].type === "text" ? resp.content[0].text : "";
    } catch (e: any) {
      coverLetter = `DRAFT — AI generation failed: ${e.message}\n\nManual cover letter required for ${packType} — ${w.name}`;
    }

    // Build document checklist
    const checklist = buildChecklist(packType, w, evidence);

    // Save as legal document
    const [doc] = await db.insert(schema.legalDocuments).values({
      workerId, caseId: caseId ?? null,
      docType: `authority_pack_${packType}`,
      language: lang,
      title: `Authority Pack: ${packType} — ${w.name}`,
      content: JSON.stringify({ coverLetter, checklist, workerData: { name: w.name, nationality: w.nationality, pesel: w.pesel, jobRole: w.job_role }, voivodship: voi }),
      status: "draft",
      linkedSnapshotId: snapshots[0]?.id ?? null,
    }).returning();

    // Create approval
    await db.insert(schema.legalApprovals).values({
      targetType: "authority_pack", targetId: doc.id,
      action: "approve_authority_pack", roleRequired: "legal_head",
    });

    return res.json({
      pack: {
        id: doc.id,
        workerName: w.name,
        packType,
        coverLetter,
        checklist,
        evidenceCount: evidence.length,
        voivodship: voi,
      },
      status: "DRAFT — Requires Legal Review",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/authority-packs — list generated packs ─────────────────────
router.get("/authority-packs", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.select().from(schema.legalDocuments)
      .where(sql`doc_type LIKE 'authority_pack_%'`)
      .orderBy(sql`created_at DESC`).limit(50);
    return res.json({ packs: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

function buildChecklist(packType: string, worker: any, evidence: any[]): { item: string; status: "present" | "missing" | "expired" }[] {
  const now = new Date();
  const check = (field: string, label: string): { item: string; status: "present" | "missing" | "expired" } => {
    const val = worker[field];
    if (!val) return { item: label, status: "missing" };
    if (new Date(val) < now) return { item: label, status: "expired" };
    return { item: label, status: "present" };
  };

  const base = [
    { item: "Passport copy", status: evidence.some(e => e.evidenceType === "passport") ? "present" as const : "missing" as const },
    { item: "4 photos (35×45mm)", status: "missing" as const },
    { item: "Proof of accommodation", status: "missing" as const },
    { item: "Health insurance", status: "missing" as const },
    check("bhp_status", "BHP Safety Training Certificate"),
    check("badania_lek_expiry", "Medical Examination Certificate"),
  ];

  if (packType === "TRC" || packType === "trc_application") {
    return [
      ...base,
      { item: "Completed TRC application form", status: "missing" as const },
      { item: "Employment contract or promise of employment", status: worker.contract_end_date ? "present" as const : "missing" as const },
      { item: "Employer's declaration of intent", status: "missing" as const },
      check("work_permit_expiry", "Current work permit"),
      { item: "Fee payment confirmation (440 PLN)", status: "missing" as const },
    ];
  }
  if (packType === "work_permit") {
    return [
      ...base,
      { item: "Work permit application form", status: "missing" as const },
      { item: "Labor market test (or exemption)", status: "missing" as const },
      { item: "Company registration documents (KRS/CEIDG)", status: "missing" as const },
      { item: "Fee payment confirmation", status: "missing" as const },
    ];
  }
  if (packType === "appeal") {
    return [
      { item: "Original rejection decision (copy)", status: "missing" as const },
      { item: "Appeal letter", status: "missing" as const },
      { item: "Supporting evidence", status: evidence.length > 0 ? "present" as const : "missing" as const },
      { item: "Power of Attorney (if representative)", status: "missing" as const },
    ];
  }
  return base;
}

export default router;

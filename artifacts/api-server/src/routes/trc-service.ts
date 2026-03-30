import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { sendEmail } from "../lib/alerter.js";
import { analyzeText } from "../lib/ai.js";

const router = Router();

// ── Ensure TRC tables exist ─────────────────────────────────────────────────
async function ensureTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS trc_cases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID REFERENCES workers(id),
      worker_name TEXT NOT NULL,
      nationality TEXT,
      employer TEXT,
      permit_type TEXT NOT NULL DEFAULT 'TRC',
      status TEXT NOT NULL DEFAULT 'documents_gathering',
      application_date DATE,
      submission_date DATE,
      expected_decision_date DATE,
      actual_decision_date DATE,
      voivodeship TEXT,
      appointment_date DATE,
      renewal_deadline DATE,
      service_fee NUMERIC(10,2) DEFAULT 0,
      payment_status TEXT DEFAULT 'unpaid',
      esspass_status TEXT DEFAULT 'not_applicable',
      notes TEXT DEFAULT '',
      ai_checklist JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trc_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id UUID REFERENCES trc_cases(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      document_name TEXT NOT NULL,
      is_required BOOLEAN DEFAULT true,
      is_uploaded BOOLEAN DEFAULT false,
      is_verified BOOLEAN DEFAULT false,
      uploaded_at TIMESTAMPTZ,
      verified_by TEXT,
      storage_key TEXT,
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trc_case_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id UUID REFERENCES trc_cases(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

let tablesReady = false;
async function initTables(): Promise<void> {
  if (!tablesReady) {
    await ensureTables();
    tablesReady = true;
  }
}

// ── 1. GET /api/trc/cases — List all TRC cases ─────────────────────────────
router.get("/trc/cases", authenticateToken, async (_req, res) => {
  try {
    await initTables();
    const result = await db.execute(sql`
      SELECT c.*,
        (SELECT COUNT(*)::int FROM trc_documents d WHERE d.case_id = c.id) AS total_documents,
        (SELECT COUNT(*)::int FROM trc_documents d WHERE d.case_id = c.id AND d.is_uploaded = true) AS uploaded_documents,
        (SELECT COUNT(*)::int FROM trc_documents d WHERE d.case_id = c.id AND d.is_required = true AND d.is_uploaded = false) AS missing_documents
      FROM trc_cases c
      ORDER BY c.created_at DESC
    `);
    return res.json({ cases: result.rows });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load TRC cases" });
  }
});

// ── 2. POST /api/trc/cases — Create new TRC case ───────────────────────────
router.post("/trc/cases", authenticateToken, async (req, res) => {
  try {
    await initTables();
    const {
      worker_id, worker_name, nationality, employer, permit_type,
      application_date, voivodeship, service_fee, notes,
    } = req.body;

    if (!worker_name) {
      return res.status(400).json({ error: "worker_name is required" });
    }

    const result = await db.execute(sql`
      INSERT INTO trc_cases (worker_id, worker_name, nationality, employer, permit_type,
        application_date, voivodeship, service_fee, notes)
      VALUES (${worker_id || null}, ${worker_name}, ${nationality || null},
        ${employer || null}, ${permit_type || "TRC"},
        ${application_date || null}, ${voivodeship || null},
        ${service_fee || 0}, ${notes || ""})
      RETURNING *
    `);

    const newCase = result.rows[0];

    // Auto-generate AI checklist in the background
    generateChecklistForCase(newCase).catch((e) =>
      console.error("[trc] Auto-checklist generation failed:", e)
    );

    return res.status(201).json({ case: newCase });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create TRC case" });
  }
});

// ── 3. GET /api/trc/cases/:id — Get single case with documents and notes ───
router.get("/trc/cases/:id", authenticateToken, async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;

    const caseResult = await db.execute(sql`SELECT * FROM trc_cases WHERE id = ${id}`);
    if (!caseResult.rows.length) {
      return res.status(404).json({ error: "TRC case not found" });
    }

    const docs = await db.execute(sql`
      SELECT * FROM trc_documents WHERE case_id = ${id} ORDER BY created_at ASC
    `);
    const notes = await db.execute(sql`
      SELECT * FROM trc_case_notes WHERE case_id = ${id} ORDER BY created_at DESC
    `);

    return res.json({
      case: caseResult.rows[0],
      documents: docs.rows,
      notes: notes.rows,
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load TRC case" });
  }
});

// ── 4. PATCH /api/trc/cases/:id — Update case ──────────────────────────────
router.patch("/trc/cases/:id", authenticateToken, async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const {
      status, application_date, submission_date, expected_decision_date,
      actual_decision_date, voivodeship, appointment_date, renewal_deadline,
      service_fee, payment_status, esspass_status, notes, employer,
      nationality, permit_type, worker_name,
    } = req.body;

    const result = await db.execute(sql`
      UPDATE trc_cases SET
        status = COALESCE(${status ?? null}, status),
        application_date = COALESCE(${application_date ?? null}, application_date),
        submission_date = COALESCE(${submission_date ?? null}, submission_date),
        expected_decision_date = COALESCE(${expected_decision_date ?? null}, expected_decision_date),
        actual_decision_date = COALESCE(${actual_decision_date ?? null}, actual_decision_date),
        voivodeship = COALESCE(${voivodeship ?? null}, voivodeship),
        appointment_date = COALESCE(${appointment_date ?? null}, appointment_date),
        renewal_deadline = COALESCE(${renewal_deadline ?? null}, renewal_deadline),
        service_fee = COALESCE(${service_fee ?? null}, service_fee),
        payment_status = COALESCE(${payment_status ?? null}, payment_status),
        esspass_status = COALESCE(${esspass_status ?? null}, esspass_status),
        notes = COALESCE(${notes ?? null}, notes),
        employer = COALESCE(${employer ?? null}, employer),
        nationality = COALESCE(${nationality ?? null}, nationality),
        permit_type = COALESCE(${permit_type ?? null}, permit_type),
        worker_name = COALESCE(${worker_name ?? null}, worker_name),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `);

    if (!result.rows.length) {
      return res.status(404).json({ error: "TRC case not found" });
    }
    return res.json({ case: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update TRC case" });
  }
});

// ── 5. DELETE /api/trc/cases/:id — Delete case ─────────────────────────────
router.delete("/trc/cases/:id", authenticateToken, async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const result = await db.execute(sql`DELETE FROM trc_cases WHERE id = ${id} RETURNING id`);
    if (!result.rows.length) {
      return res.status(404).json({ error: "TRC case not found" });
    }
    return res.json({ deleted: true, id });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete TRC case" });
  }
});

// ── 6. GET /api/trc/cases/:id/documents — List documents for a case ────────
router.get("/trc/cases/:id/documents", authenticateToken, async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const result = await db.execute(sql`
      SELECT * FROM trc_documents WHERE case_id = ${id} ORDER BY created_at ASC
    `);
    return res.json({ documents: result.rows });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load documents" });
  }
});

// ── 7. POST /api/trc/cases/:id/documents — Add document to case ────────────
router.post("/trc/cases/:id/documents", authenticateToken, async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const { document_type, document_name, is_required, storage_key, notes } = req.body;

    if (!document_type || !document_name) {
      return res.status(400).json({ error: "document_type and document_name are required" });
    }

    const result = await db.execute(sql`
      INSERT INTO trc_documents (case_id, document_type, document_name, is_required, storage_key, notes)
      VALUES (${id}, ${document_type}, ${document_name},
        ${is_required !== false}, ${storage_key || null}, ${notes || ""})
      RETURNING *
    `);

    return res.status(201).json({ document: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to add document" });
  }
});

// ── 8. PATCH /api/trc/documents/:docId — Update document status ─────────────
router.patch("/trc/documents/:docId", authenticateToken, async (req, res) => {
  try {
    await initTables();
    const { docId } = req.params;
    const { is_uploaded, is_verified, verified_by, storage_key, notes } = req.body;

    const result = await db.execute(sql`
      UPDATE trc_documents SET
        is_uploaded = COALESCE(${is_uploaded ?? null}, is_uploaded),
        is_verified = COALESCE(${is_verified ?? null}, is_verified),
        verified_by = COALESCE(${verified_by ?? null}, verified_by),
        storage_key = COALESCE(${storage_key ?? null}, storage_key),
        notes = COALESCE(${notes ?? null}, notes),
        uploaded_at = CASE WHEN ${is_uploaded ?? null}::boolean = true AND uploaded_at IS NULL THEN NOW() ELSE uploaded_at END
      WHERE id = ${docId}
      RETURNING *
    `);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Document not found" });
    }
    return res.json({ document: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update document" });
  }
});

// ── 9. GET /api/trc/cases/:id/notes — Get case notes ───────────────────────
router.get("/trc/cases/:id/notes", authenticateToken, async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const result = await db.execute(sql`
      SELECT * FROM trc_case_notes WHERE case_id = ${id} ORDER BY created_at DESC
    `);
    return res.json({ notes: result.rows });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load notes" });
  }
});

// ── 10. POST /api/trc/cases/:id/notes — Add note to case ───────────────────
router.post("/trc/cases/:id/notes", authenticateToken, async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const { author, content } = req.body;

    if (!author || !content) {
      return res.status(400).json({ error: "author and content are required" });
    }

    const result = await db.execute(sql`
      INSERT INTO trc_case_notes (case_id, author, content)
      VALUES (${id}, ${author}, ${content})
      RETURNING *
    `);

    return res.status(201).json({ note: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to add note" });
  }
});

// ── Helper: generate AI checklist for a case ────────────────────────────────
async function generateChecklistForCase(trcCase: Record<string, unknown>): Promise<unknown[] | null> {
  const systemPrompt =
    "You are a Polish immigration law expert. Generate a document checklist for a TRC (Temporary Residence Card) application. Return ONLY a JSON array of objects with: { name: string, description: string, required: boolean, category: string }. Consider the applicant's nationality and permit type for country-specific requirements.";

  const userMessage = `Generate a TRC document checklist for:
- Nationality: ${trcCase.nationality || "Unknown"}
- Permit type: ${trcCase.permit_type || "TRC"}
- Employer: ${trcCase.employer || "Unknown"}`;

  const result = await analyzeText(userMessage, systemPrompt);
  if (!result) return null;

  try {
    const match = result.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const checklist = JSON.parse(match[0]);

    // Save checklist to the case
    await db.execute(sql`
      UPDATE trc_cases SET ai_checklist = ${JSON.stringify(checklist)}::jsonb, updated_at = NOW()
      WHERE id = ${trcCase.id as string}
    `);

    return checklist;
  } catch {
    return null;
  }
}

// ── 11. POST /api/trc/cases/:id/generate-checklist — AI document checklist ──
router.post("/trc/cases/:id/generate-checklist", authenticateToken, async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;

    const caseResult = await db.execute(sql`SELECT * FROM trc_cases WHERE id = ${id}`);
    if (!caseResult.rows.length) {
      return res.status(404).json({ error: "TRC case not found" });
    }

    const trcCase = caseResult.rows[0] as Record<string, unknown>;
    const checklist = await generateChecklistForCase(trcCase);

    if (!checklist) {
      return res.status(502).json({ error: "AI checklist generation failed. Ensure ANTHROPIC_API_KEY is set." });
    }

    // Auto-create document records from checklist
    for (const item of checklist as Array<{ name: string; description: string; required: boolean; category: string }>) {
      await db.execute(sql`
        INSERT INTO trc_documents (case_id, document_type, document_name, is_required, notes)
        VALUES (${id}, ${item.category || "general"}, ${item.name}, ${item.required !== false}, ${item.description || ""})
        ON CONFLICT DO NOTHING
      `);
    }

    return res.json({ checklist });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate checklist" });
  }
});

// ── 12. POST /api/trc/cases/:id/send-checklist — Email checklist to worker ──
router.post("/trc/cases/:id/send-checklist", authenticateToken, async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const { recipient_email } = req.body;

    if (!recipient_email) {
      return res.status(400).json({ error: "recipient_email is required" });
    }

    const caseResult = await db.execute(sql`SELECT * FROM trc_cases WHERE id = ${id}`);
    if (!caseResult.rows.length) {
      return res.status(404).json({ error: "TRC case not found" });
    }

    const trcCase = caseResult.rows[0] as Record<string, unknown>;
    const checklist = (trcCase.ai_checklist as Array<{ name: string; description: string; required: boolean; category: string }>) || [];

    if (!checklist.length) {
      return res.status(400).json({ error: "No checklist generated yet. Call generate-checklist first." });
    }

    const checklistHtml = checklist
      .map(
        (item) =>
          `<tr>
            <td style="padding:8px;border:1px solid #ddd;">${item.name}</td>
            <td style="padding:8px;border:1px solid #ddd;">${item.description || ""}</td>
            <td style="padding:8px;border:1px solid #ddd;">${item.required ? "Yes" : "No"}</td>
            <td style="padding:8px;border:1px solid #ddd;">${item.category || ""}</td>
          </tr>`
      )
      .join("\n");

    const html = `
      <h2>TRC Document Checklist</h2>
      <p>Dear ${trcCase.worker_name},</p>
      <p>Please prepare the following documents for your TRC (Temporary Residence Card) application:</p>
      <table style="border-collapse:collapse;width:100%;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="padding:8px;border:1px solid #ddd;">Document</th>
            <th style="padding:8px;border:1px solid #ddd;">Description</th>
            <th style="padding:8px;border:1px solid #ddd;">Required</th>
            <th style="padding:8px;border:1px solid #ddd;">Category</th>
          </tr>
        </thead>
        <tbody>${checklistHtml}</tbody>
      </table>
      <p>Please submit these documents as soon as possible.</p>
      <p>Best regards,<br>EEJ Immigration Services</p>
    `;

    await sendEmail({
      from: process.env.EMAIL_FROM || "noreply@eej.app",
      to: recipient_email,
      subject: `TRC Document Checklist — ${trcCase.worker_name}`,
      html,
    });

    return res.json({ sent: true, recipient: recipient_email });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send checklist" });
  }
});

// ── 13. GET /api/trc/summary — Dashboard stats ─────────────────────────────
router.get("/trc/summary", authenticateToken, async (_req, res) => {
  try {
    await initTables();

    const totalResult = await db.execute(sql`SELECT COUNT(*)::int AS total FROM trc_cases`);
    const byStatusResult = await db.execute(sql`
      SELECT status, COUNT(*)::int AS count FROM trc_cases GROUP BY status ORDER BY count DESC
    `);
    const missingDocsResult = await db.execute(sql`
      SELECT COUNT(DISTINCT d.case_id)::int AS cases_with_missing_docs
      FROM trc_documents d
      WHERE d.is_required = true AND d.is_uploaded = false
    `);
    const upcomingDeadlines = await db.execute(sql`
      SELECT id, worker_name, renewal_deadline, appointment_date, status
      FROM trc_cases
      WHERE (renewal_deadline IS NOT NULL AND renewal_deadline <= CURRENT_DATE + INTERVAL '30 days')
         OR (appointment_date IS NOT NULL AND appointment_date <= CURRENT_DATE + INTERVAL '14 days')
      ORDER BY COALESCE(renewal_deadline, appointment_date) ASC
      LIMIT 20
    `);
    const revenueResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(service_fee)::numeric, 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN service_fee ELSE 0 END)::numeric, 0) AS paid,
        COALESCE(SUM(CASE WHEN payment_status != 'paid' THEN service_fee ELSE 0 END)::numeric, 0) AS unpaid
      FROM trc_cases
    `);

    return res.json({
      total: (totalResult.rows[0] as { total: number }).total,
      by_status: byStatusResult.rows,
      missing_docs_cases: (missingDocsResult.rows[0] as { cases_with_missing_docs: number }).cases_with_missing_docs,
      upcoming_deadlines: upcomingDeadlines.rows,
      revenue: revenueResult.rows[0],
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load TRC summary" });
  }
});

// ── 14. POST /api/trc/cases/:id/invoice — Generate invoice data ─────────────
router.post("/trc/cases/:id/invoice", authenticateToken, async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;

    const caseResult = await db.execute(sql`SELECT * FROM trc_cases WHERE id = ${id}`);
    if (!caseResult.rows.length) {
      return res.status(404).json({ error: "TRC case not found" });
    }

    const trcCase = caseResult.rows[0] as Record<string, unknown>;
    const serviceFee = Number(trcCase.service_fee) || 0;
    const vatRate = 0.23;
    const netAmount = serviceFee;
    const vatAmount = +(netAmount * vatRate).toFixed(2);
    const grossAmount = +(netAmount + vatAmount).toFixed(2);

    const invoice = {
      invoice_number: `TRC-${Date.now().toString(36).toUpperCase()}`,
      case_id: id,
      worker_name: trcCase.worker_name,
      employer: trcCase.employer,
      permit_type: trcCase.permit_type,
      issued_date: new Date().toISOString().split("T")[0],
      due_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      items: [
        {
          description: `TRC Application Service — ${trcCase.permit_type}`,
          quantity: 1,
          unit_price: netAmount,
          total: netAmount,
        },
      ],
      net_amount: netAmount,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      gross_amount: grossAmount,
      currency: "PLN",
      payment_status: trcCase.payment_status,
    };

    return res.json({ invoice });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate invoice" });
  }
});

// ── 15. POST /api/trc/cases/:id/notify — Send status update email ───────────
router.post("/trc/cases/:id/notify", authenticateToken, async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const { recipient_email, message } = req.body;

    if (!recipient_email) {
      return res.status(400).json({ error: "recipient_email is required" });
    }

    const caseResult = await db.execute(sql`SELECT * FROM trc_cases WHERE id = ${id}`);
    if (!caseResult.rows.length) {
      return res.status(404).json({ error: "TRC case not found" });
    }

    const trcCase = caseResult.rows[0] as Record<string, unknown>;

    const statusLabels: Record<string, string> = {
      documents_gathering: "Documents Gathering",
      documents_review: "Documents Under Review",
      submitted: "Application Submitted",
      appointment_scheduled: "Appointment Scheduled",
      pending_decision: "Pending Decision",
      approved: "Approved",
      rejected: "Rejected",
      appeal: "Under Appeal",
    };

    const html = `
      <h2>TRC Application Status Update</h2>
      <p>Dear ${trcCase.worker_name},</p>
      <p>Here is an update on your TRC (Temporary Residence Card) application:</p>
      <table style="border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 12px;font-weight:bold;">Status:</td><td style="padding:6px 12px;">${statusLabels[trcCase.status as string] || trcCase.status}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Permit Type:</td><td style="padding:6px 12px;">${trcCase.permit_type}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Voivodeship:</td><td style="padding:6px 12px;">${trcCase.voivodeship || "N/A"}</td></tr>
        ${trcCase.appointment_date ? `<tr><td style="padding:6px 12px;font-weight:bold;">Appointment:</td><td style="padding:6px 12px;">${trcCase.appointment_date}</td></tr>` : ""}
        ${trcCase.expected_decision_date ? `<tr><td style="padding:6px 12px;font-weight:bold;">Expected Decision:</td><td style="padding:6px 12px;">${trcCase.expected_decision_date}</td></tr>` : ""}
      </table>
      ${message ? `<p><strong>Additional note:</strong> ${message}</p>` : ""}
      <p>If you have any questions, please contact your coordinator.</p>
      <p>Best regards,<br>EEJ Immigration Services</p>
    `;

    await sendEmail({
      from: process.env.EMAIL_FROM || "noreply@eej.app",
      to: recipient_email,
      subject: `TRC Status Update — ${trcCase.worker_name} — ${statusLabels[trcCase.status as string] || trcCase.status}`,
      html,
    });

    return res.json({ sent: true, recipient: recipient_email, status: trcCase.status });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send notification" });
  }
});

export default router;

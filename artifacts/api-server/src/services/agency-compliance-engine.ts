/**
 * EEJ Agency Compliance Engine
 *
 * Polish staffing agency legal compliance automation.
 * Every feature maps to a real law article with real fines.
 *
 * P1: 18/36 Month Assignment Limiter (Art. 20 Temporary Workers Act)
 *     Fine: 1,000-30,000 PLN per violation
 *
 * P2: KRAZ Registry Tracker (Art. 305-329, Act of 20 March 2025)
 *     Fine: 100,000 PLN for operating without KRAZ
 *
 * P2: Annual Marshal Report Generator (Art. 323)
 *     Penalty: miss 2 years = KRAZ deletion = business closure
 *
 * P2: 7/14/15-Day Notification Calendar (multiple articles)
 *     Fine: 1,000-10,000 PLN per missed notification
 *
 * P3: Document Retention Engine (GDPR Art. 17, Labour Code)
 *     Fine: up to 4% of annual revenue (GDPR)
 *
 * P3: PIP Inspection Pack Generator
 *     Must produce all docs within hours of unannounced inspection
 *
 * P3: Contract Reclassification Risk Scanner (PIP powers Jan 2026)
 *     PIP can reclassify Zlecenie → Prace with 7-day appeal window
 *
 * org_context: EEJ. No shared data with external platforms.
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { safeError } from "../lib/security.js";

const router = Router();

// ═══ TABLE SETUP ════════════════════════════════════════════════════════════

async function ensureComplianceTables() {
  // Worker-Client assignments (18/36 month tracking)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS eej_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      worker_name TEXT,
      client_id TEXT,
      client_name TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE,
      days_worked INT DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      alert_15m BOOLEAN DEFAULT false,
      alert_17m BOOLEAN DEFAULT false,
      blocked_18m BOOLEAN DEFAULT false,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_assign_worker ON eej_assignments(worker_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_assign_client ON eej_assignments(client_name)`);

  // KRAZ registry
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS eej_kraz (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kraz_number TEXT NOT NULL,
      registered_at DATE NOT NULL,
      valid_until DATE,
      marshal_office TEXT,
      voivodeship TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      last_annual_report DATE,
      next_annual_report DATE,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Notification deadlines
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS eej_compliance_deadlines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      worker_name TEXT,
      deadline_type TEXT NOT NULL,
      deadline_date DATE NOT NULL,
      reference_event TEXT,
      reference_date DATE,
      status TEXT NOT NULL DEFAULT 'PENDING',
      completed_at TIMESTAMPTZ,
      completed_by TEXT,
      legal_basis TEXT,
      fine_risk TEXT,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_deadlines_worker ON eej_compliance_deadlines(worker_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_deadlines_date ON eej_compliance_deadlines(deadline_date)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_deadlines_status ON eej_compliance_deadlines(status)`);

  // Document retention schedule
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS eej_retention_schedule (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT,
      document_type TEXT NOT NULL,
      document_id TEXT,
      document_name TEXT,
      retention_category TEXT NOT NULL,
      retention_years INT NOT NULL,
      employment_end_date DATE,
      delete_after DATE,
      status TEXT NOT NULL DEFAULT 'RETAINED',
      deleted_at TIMESTAMPTZ,
      legal_basis TEXT,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_retention_delete ON eej_retention_schedule(delete_after)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_retention_status ON eej_retention_schedule(status)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// P1: 18/36 MONTH ASSIGNMENT LIMITER
// Art. 20 Temporary Workers Act — max 18 months in 36-month rolling window
// Fine: 1,000-30,000 PLN per violation
// ═══════════════════════════════════════════════════════════════════════════

// Calculate cumulative days for a worker-client pair in 36-month window
async function getAssignmentDays(workerId: string, clientName: string): Promise<{ totalDays: number; assignments: any[] }> {
  const windowStart = new Date(Date.now() - 36 * 30 * 86400000).toISOString().slice(0, 10);
  const rows = await db.execute(sql`
    SELECT * FROM eej_assignments
    WHERE worker_id = ${workerId} AND client_name = ${clientName} AND org_context = 'EEJ'
      AND (start_date >= ${windowStart}::DATE OR (end_date IS NULL OR end_date >= ${windowStart}::DATE))
    ORDER BY start_date ASC
  `);

  let totalDays = 0;
  for (const r of rows.rows as any[]) {
    const start = new Date(r.start_date);
    const end = r.end_date ? new Date(r.end_date) : new Date();
    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    totalDays += Math.max(0, days);
  }

  return { totalDays, assignments: rows.rows as any[] };
}

// POST create/update assignment
router.post("/v1/agency/assignments", authenticateToken, async (req, res) => {
  try {
    await ensureComplianceTables();
    const { workerId, workerName, clientName, clientId, startDate, endDate } = req.body as {
      workerId: string; workerName?: string; clientName: string; clientId?: string;
      startDate: string; endDate?: string;
    };

    if (!workerId || !clientName || !startDate) {
      return res.status(400).json({ error: "workerId, clientName, and startDate required" });
    }

    // Check 18/36 limit before creating
    const { totalDays } = await getAssignmentDays(workerId, clientName);
    const totalMonths = totalDays / 30;

    if (totalMonths >= 18) {
      return res.status(400).json({
        error: "PLACEMENT BLOCKED — 18-month limit reached",
        legal_basis: "Art. 20 Ustawa o zatrudnianiu pracowników tymczasowych",
        fine_risk: "1,000-30,000 PLN",
        totalDays,
        totalMonths: Math.round(totalMonths * 10) / 10,
        limit: 18,
        nextEligible: new Date(Date.now() + (36 * 30 - totalDays) * 86400000).toISOString().slice(0, 10),
      });
    }

    const rows = await db.execute(sql`
      INSERT INTO eej_assignments (worker_id, worker_name, client_id, client_name, start_date, end_date, days_worked,
        alert_15m, alert_17m, blocked_18m, org_context)
      VALUES (${workerId}, ${workerName ?? null}, ${clientId ?? null}, ${clientName}, ${startDate},
        ${endDate ?? null}, 0, ${totalMonths >= 15}, ${totalMonths >= 17}, false, 'EEJ')
      RETURNING *
    `);

    return res.json({
      assignment: rows.rows[0],
      compliance: {
        totalDays,
        totalMonths: Math.round(totalMonths * 10) / 10,
        limit: 18,
        remainingDays: Math.max(0, 18 * 30 - totalDays),
        status: totalMonths >= 17 ? "CRITICAL" : totalMonths >= 15 ? "WARNING" : "OK",
        legal_basis: "Art. 20 Ustawa o zatrudnianiu pracowników tymczasowych",
      },
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET check assignment limits for a worker
router.get("/v1/agency/assignments/check", authenticateToken, async (req, res) => {
  try {
    await ensureComplianceTables();
    const { workerId, clientName } = req.query as { workerId?: string; clientName?: string };

    if (!workerId || !clientName) return res.status(400).json({ error: "workerId and clientName required" });

    const { totalDays, assignments } = await getAssignmentDays(workerId, clientName);
    const totalMonths = totalDays / 30;

    return res.json({
      workerId, clientName, totalDays,
      totalMonths: Math.round(totalMonths * 10) / 10,
      limit: 18,
      remainingDays: Math.max(0, 18 * 30 - totalDays),
      remainingMonths: Math.round(Math.max(0, 18 - totalMonths) * 10) / 10,
      status: totalMonths >= 18 ? "BLOCKED" : totalMonths >= 17 ? "CRITICAL" : totalMonths >= 15 ? "WARNING" : "OK",
      blocked: totalMonths >= 18,
      nextEligible: totalMonths >= 18 ? new Date(Date.now() + (36 * 30 - totalDays) * 86400000).toISOString().slice(0, 10) : null,
      assignments,
      legal_basis: "Art. 20 Ustawa o zatrudnianiu pracowników tymczasowych",
      fine_risk: totalMonths >= 18 ? "1,000-30,000 PLN" : null,
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET scan all workers for assignment limit breaches
router.get("/v1/agency/assignments/scan", authenticateToken, async (req, res) => {
  try {
    await ensureComplianceTables();

    const rows = await db.execute(sql`
      SELECT worker_id, worker_name, client_name,
        SUM(CASE WHEN end_date IS NOT NULL
          THEN GREATEST(0, end_date - start_date)
          ELSE GREATEST(0, CURRENT_DATE - start_date)
        END)::INT as total_days
      FROM eej_assignments
      WHERE org_context = 'EEJ' AND status = 'ACTIVE'
      GROUP BY worker_id, worker_name, client_name
      HAVING SUM(CASE WHEN end_date IS NOT NULL
        THEN GREATEST(0, end_date - start_date)
        ELSE GREATEST(0, CURRENT_DATE - start_date)
      END) > 450
      ORDER BY total_days DESC
    `);

    const alerts = (rows.rows as any[]).map(r => {
      const months = r.total_days / 30;
      return {
        ...r,
        totalMonths: Math.round(months * 10) / 10,
        status: months >= 18 ? "BLOCKED" : months >= 17 ? "CRITICAL" : "WARNING",
        remainingDays: Math.max(0, 18 * 30 - r.total_days),
      };
    });

    return res.json({
      alerts,
      blocked: alerts.filter(a => a.status === "BLOCKED").length,
      critical: alerts.filter(a => a.status === "CRITICAL").length,
      warning: alerts.filter(a => a.status === "WARNING").length,
      legal_basis: "Art. 20 Ustawa o zatrudnianiu pracowników tymczasowych",
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// P2: KRAZ TRACKER + MARSHAL REPORT + NOTIFICATION CALENDAR
// ═══════════════════════════════════════════════════════════════════════════

// POST register/update KRAZ info
router.post("/v1/agency/kraz", authenticateToken, async (req, res) => {
  try {
    await ensureComplianceTables();
    const { krazNumber, registeredAt, validUntil, marshalOffice, voivodeship } = req.body as {
      krazNumber: string; registeredAt: string; validUntil?: string; marshalOffice?: string; voivodeship?: string;
    };

    if (!krazNumber || !registeredAt) return res.status(400).json({ error: "krazNumber and registeredAt required" });

    // Calculate next annual report deadline (Jan 31)
    const now = new Date();
    const nextReportYear = now.getMonth() === 0 && now.getDate() <= 31 ? now.getFullYear() : now.getFullYear() + 1;
    const nextReport = `${nextReportYear}-01-31`;

    const rows = await db.execute(sql`
      INSERT INTO eej_kraz (kraz_number, registered_at, valid_until, marshal_office, voivodeship, next_annual_report, org_context)
      VALUES (${krazNumber}, ${registeredAt}, ${validUntil ?? null}, ${marshalOffice ?? null}, ${voivodeship ?? null}, ${nextReport}, 'EEJ')
      RETURNING *
    `);

    return res.json({ kraz: rows.rows[0] });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET KRAZ status
router.get("/v1/agency/kraz", authenticateToken, async (req, res) => {
  try {
    await ensureComplianceTables();
    const rows = await db.execute(sql`SELECT * FROM eej_kraz WHERE org_context = 'EEJ' ORDER BY created_at DESC LIMIT 1`);
    if (rows.rows.length === 0) return res.json({ kraz: null, warning: "No KRAZ registration on file — operating without KRAZ = 100,000 PLN fine" });

    const kraz = rows.rows[0] as any;
    const nextReport = kraz.next_annual_report ? new Date(kraz.next_annual_report) : null;
    const daysUntilReport = nextReport ? Math.ceil((nextReport.getTime() - Date.now()) / 86400000) : null;

    return res.json({
      kraz,
      reportStatus: {
        nextDeadline: kraz.next_annual_report,
        daysRemaining: daysUntilReport,
        urgent: daysUntilReport !== null && daysUntilReport <= 30,
        overdue: daysUntilReport !== null && daysUntilReport < 0,
        legal_basis: "Art. 323 Ustawa o rynku pracy i służbach zatrudnienia",
        penalty: "Miss 2 consecutive years = automatic KRAZ deletion",
      },
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET generate annual marshal report data
router.get("/v1/agency/marshal-report", authenticateToken, async (req, res) => {
  try {
    await ensureComplianceTables();
    const { year } = req.query as { year?: string };
    const reportYear = year ?? String(new Date().getFullYear() - 1);

    // Workers placed, by nationality
    const byNationality = await db.execute(sql`
      SELECT nationality, COUNT(*)::INT as count
      FROM workers
      WHERE pipeline_stage IN ('Placed', 'Active') AND nationality IS NOT NULL
      GROUP BY nationality ORDER BY count DESC
    `);

    // Workers placed, by job role (occupation group)
    const byRole = await db.execute(sql`
      SELECT job_role, COUNT(*)::INT as count
      FROM workers
      WHERE pipeline_stage IN ('Placed', 'Active') AND job_role IS NOT NULL
      GROUP BY job_role ORDER BY count DESC
    `);

    // Total employers served (unique assigned_site)
    const employers = await db.execute(sql`
      SELECT COUNT(DISTINCT assigned_site)::INT as count FROM workers
      WHERE assigned_site IS NOT NULL AND pipeline_stage IN ('Placed', 'Active')
    `);

    // Temp workers directed
    const tempWorkers = await db.execute(sql`
      SELECT COUNT(*)::INT as count FROM workers WHERE pipeline_stage IN ('Placed', 'Active')
    `);

    // Total candidates processed
    const totalProcessed = await db.execute(sql`
      SELECT COUNT(*)::INT as count FROM workers
    `);

    return res.json({
      report: {
        reportYear,
        deadline: `${parseInt(reportYear) + 1}-01-31`,
        legal_basis: "Art. 323 Ustawa o rynku pracy i służbach zatrudnienia",
        data: {
          workersByNationality: byNationality.rows,
          workersByOccupation: byRole.rows,
          employersServed: (employers.rows[0] as any)?.count ?? 0,
          tempWorkersDirected: (tempWorkers.rows[0] as any)?.count ?? 0,
          totalCandidatesProcessed: (totalProcessed.rows[0] as any)?.count ?? 0,
        },
        submissionMethod: "Electronic via https://stor.praca.gov.pl/portal/#/kraz",
        submissionFormat: "Qualified electronic signature or ePUAP trusted profile",
      },
      org_context: "EEJ",
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// POST generate notification deadlines when a worker starts/ends work
router.post("/v1/agency/notifications/generate", authenticateToken, async (req, res) => {
  try {
    await ensureComplianceTables();
    const { workerId, workerName, eventType, eventDate } = req.body as {
      workerId: string; workerName?: string; eventType: "WORK_START" | "WORK_END" | "NON_COMMENCEMENT"; eventDate: string;
    };

    if (!workerId || !eventType || !eventDate) return res.status(400).json({ error: "workerId, eventType, eventDate required" });

    const deadlines: any[] = [];
    const event = new Date(eventDate);

    if (eventType === "WORK_START") {
      // 7 days: report commencement to labour office
      const d7 = new Date(event.getTime() + 7 * 86400000).toISOString().slice(0, 10);
      deadlines.push({ type: "REPORT_COMMENCEMENT", date: d7, basis: "Art. 88i ust. 1 Ustawa o promocji zatrudnienia", fine: "1,000-10,000 PLN" });

      // Contract submission: before work starts (should already be done)
      deadlines.push({ type: "CONTRACT_SUBMISSION", date: eventDate, basis: "New foreigners act Aug 2025", fine: "1,000-3,000 PLN per worker" });
    }

    if (eventType === "NON_COMMENCEMENT") {
      // 14 days: report non-commencement
      const d14 = new Date(event.getTime() + 14 * 86400000).toISOString().slice(0, 10);
      deadlines.push({ type: "REPORT_NON_COMMENCEMENT", date: d14, basis: "Art. 88i ust. 2", fine: "1,000-10,000 PLN" });
    }

    if (eventType === "WORK_END") {
      // 15 business days: notify voivode of termination
      const d15biz = new Date(event.getTime() + 21 * 86400000).toISOString().slice(0, 10); // ~15 business days
      deadlines.push({ type: "NOTIFY_VOIVODE_TERMINATION", date: d15biz, basis: "Art. 88i ust. 7", fine: "1,000-10,000 PLN" });
    }

    // Insert all deadlines
    for (const d of deadlines) {
      await db.execute(sql`
        INSERT INTO eej_compliance_deadlines (worker_id, worker_name, deadline_type, deadline_date, reference_event, reference_date, legal_basis, fine_risk, org_context)
        VALUES (${workerId}, ${workerName ?? null}, ${d.type}, ${d.date}, ${eventType}, ${eventDate}, ${d.basis}, ${d.fine}, 'EEJ')
      `);
    }

    return res.json({ generated: deadlines.length, deadlines });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET upcoming deadlines (sorted by urgency)
router.get("/v1/agency/deadlines", authenticateToken, async (req, res) => {
  try {
    await ensureComplianceTables();
    const { status: filterStatus } = req.query as { status?: string };

    const overdueRows = await db.execute(sql`
      SELECT * FROM eej_compliance_deadlines WHERE org_context = 'EEJ' AND status = 'PENDING' AND deadline_date < CURRENT_DATE
      ORDER BY deadline_date ASC
    `);

    const upcomingRows = await db.execute(sql`
      SELECT * FROM eej_compliance_deadlines WHERE org_context = 'EEJ' AND status = 'PENDING' AND deadline_date >= CURRENT_DATE
      ORDER BY deadline_date ASC LIMIT 50
    `);

    const completedRows = await db.execute(sql`
      SELECT * FROM eej_compliance_deadlines WHERE org_context = 'EEJ' AND status = 'COMPLETED'
      ORDER BY completed_at DESC LIMIT 20
    `);

    return res.json({
      overdue: overdueRows.rows,
      upcoming: upcomingRows.rows,
      completed: completedRows.rows,
      counts: {
        overdue: overdueRows.rows.length,
        upcoming: upcomingRows.rows.length,
      },
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// PATCH mark deadline as completed
router.patch("/v1/agency/deadlines/:id/complete", authenticateToken, async (req, res) => {
  try {
    const did = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await db.execute(sql`
      UPDATE eej_compliance_deadlines SET status = 'COMPLETED', completed_at = NOW(),
        completed_by = ${(req as any).user?.name ?? "system"}
      WHERE id = ${did} AND org_context = 'EEJ'
    `);
    return res.json({ success: true });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// P3: DOCUMENT RETENTION + PIP INSPECTION PACK + RECLASSIFICATION SCANNER
// ═══════════════════════════════════════════════════════════════════════════

const RETENTION_RULES: Record<string, { years: number; basis: string }> = {
  PERSONNEL_FILE:       { years: 10, basis: "Kodeks Pracy Art. 94(9a)" },
  PAYROLL_RECORD:       { years: 5,  basis: "Ustawa o rachunkowości" },
  FOREIGN_WORKER_DOCS:  { years: 2,  basis: "Ustawa o warunkach dopuszczalności (post-employment)" },
  CANDIDATE_CV:         { years: 0,  basis: "GDPR Art. 17 — delete within 3 months if no consent" },
  CONTRACT:             { years: 10, basis: "Kodeks Pracy Art. 94(9a)" },
  BHP_CERT:             { years: 10, basis: "Kodeks Pracy Art. 94(9a)" },
  MEDICAL_CERT:         { years: 10, basis: "Kodeks Pracy Art. 94(9a)" },
  ASSIGNMENT_RECORD:    { years: 3,  basis: "Art. 14a Ustawa o pracownikach tymczasowych (36 months)" },
  ZUS_DECLARATION:      { years: 5,  basis: "Ustawa o systemie ubezpieczeń społecznych" },
  TAX_RECORD:           { years: 5,  basis: "Ordynacja podatkowa" },
};

// POST schedule retention for a document
router.post("/v1/agency/retention", authenticateToken, async (req, res) => {
  try {
    await ensureComplianceTables();
    const { workerId, documentType, documentId, documentName, employmentEndDate } = req.body as {
      workerId?: string; documentType: string; documentId?: string; documentName?: string; employmentEndDate?: string;
    };

    if (!documentType) return res.status(400).json({ error: "documentType required" });

    const rule = RETENTION_RULES[documentType];
    if (!rule) return res.status(400).json({ error: `Unknown document type. Valid: ${Object.keys(RETENTION_RULES).join(", ")}` });

    const endDate = employmentEndDate ? new Date(employmentEndDate) : new Date();
    const deleteAfter = new Date(endDate.getTime() + rule.years * 365.25 * 86400000).toISOString().slice(0, 10);

    const rows = await db.execute(sql`
      INSERT INTO eej_retention_schedule (worker_id, document_type, document_id, document_name, retention_category, retention_years, employment_end_date, delete_after, legal_basis, org_context)
      VALUES (${workerId ?? null}, ${documentType}, ${documentId ?? null}, ${documentName ?? null}, ${documentType}, ${rule.years}, ${employmentEndDate ?? null}, ${deleteAfter}, ${rule.basis}, 'EEJ')
      RETURNING *
    `);

    return res.json({ retention: rows.rows[0] });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET documents due for deletion
router.get("/v1/agency/retention/due", authenticateToken, async (req, res) => {
  try {
    await ensureComplianceTables();
    const rows = await db.execute(sql`
      SELECT * FROM eej_retention_schedule WHERE org_context = 'EEJ' AND status = 'RETAINED' AND delete_after <= CURRENT_DATE
      ORDER BY delete_after ASC
    `);
    return res.json({ dueForDeletion: rows.rows, total: rows.rows.length });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET PIP inspection pack for a worker
router.get("/v1/agency/pip-pack/:workerId", authenticateToken, async (req, res) => {
  try {
    await ensureComplianceTables();
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;

    // Fetch worker
    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${wid}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    // Fetch documents
    const docsRows = await db.execute(sql`
      SELECT doc_type, confidence, status, created_at FROM smart_documents WHERE worker_id = ${wid} ORDER BY created_at DESC LIMIT 20
    `).catch(() => ({ rows: [] }));

    // Fetch assignments
    const assignRows = await db.execute(sql`
      SELECT * FROM eej_assignments WHERE worker_id = ${wid} AND org_context = 'EEJ' ORDER BY start_date DESC
    `).catch(() => ({ rows: [] }));

    // Fetch payroll
    const payrollRows = await db.execute(sql`
      SELECT month_year, hours, gross, net, final_payout FROM eej_payroll_ledger WHERE worker_id = ${wid} AND org_context = 'EEJ' ORDER BY month_year DESC LIMIT 12
    `).catch(() => ({ rows: [] }));

    // Fetch legal cases
    const caseRows = await db.execute(sql`
      SELECT id, case_type, status, voivodeship, created_at FROM eej_legal_cases WHERE worker_id = ${wid} AND org_context = 'EEJ' ORDER BY created_at DESC
    `).catch(() => ({ rows: [] }));

    // Build compliance checklist
    const checklist = [
      { item: "Employment contract on file", status: w.contract_type ? "YES" : "MISSING", required: true },
      { item: "Valid residence document", status: (w.trc_expiry || w.work_permit_expiry) ? "YES" : "MISSING", required: true },
      { item: "Residence doc copy retained", status: docsRows.rows.length > 0 ? "YES" : "CHECK", required: true },
      { item: "KRAZ number displayed", status: "CHECK", required: true },
      { item: "BHP training current", status: w.bhp_status ? "YES" : "MISSING", required: true },
      { item: "Medical exam current", status: w.badania_lek_expiry ? "YES" : "MISSING", required: true },
      { item: "PESEL on file", status: w.pesel ? "YES" : "MISSING", required: true },
      { item: "ZUS registered", status: w.zus_status === "Registered" ? "YES" : "MISSING", required: true },
      { item: "Payroll records (5yr)", status: payrollRows.rows.length > 0 ? `${payrollRows.rows.length} months` : "NONE", required: true },
      { item: "Assignment within 18/36 limit", status: "CHECK", required: true },
    ];

    const missing = checklist.filter(c => c.status === "MISSING").length;

    return res.json({
      pipPack: {
        worker: {
          id: w.id, name: w.name, nationality: w.nationality, pesel: w.pesel,
          contractType: w.contract_type, pipeline: w.pipeline_stage,
          trcExpiry: w.trc_expiry, workPermitExpiry: w.work_permit_expiry,
          bhp: w.bhp_status, medical: w.badania_lek_expiry,
        },
        documents: docsRows.rows,
        assignments: assignRows.rows,
        payroll: payrollRows.rows,
        legalCases: caseRows.rows,
        checklist,
        readiness: {
          total: checklist.length,
          passed: checklist.filter(c => c.status === "YES").length,
          missing,
          score: Math.round(((checklist.length - missing) / checklist.length) * 100),
          status: missing === 0 ? "READY" : missing <= 2 ? "ALMOST_READY" : "NOT_READY",
        },
      },
      org_context: "EEJ",
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET contract reclassification risk scan
router.get("/v1/agency/reclassification-scan", authenticateToken, async (req, res) => {
  try {
    // Find workers on civil contracts (Zlecenie, B2B) with reclassification risk indicators
    const rows = await db.execute(sql`
      SELECT id, name, contract_type, assigned_site, job_role, hourly_netto_rate, total_hours, pipeline_stage
      FROM workers
      WHERE contract_type IN ('umowa_zlecenie', 'umowa_o_dzielo', 'B2B')
        AND pipeline_stage IN ('Placed', 'Active')
    `);

    const risks = (rows.rows as any[]).map(w => {
      const flags: string[] = [];
      let riskScore = 0;

      // Single client assignment (supervision indicator)
      if (w.assigned_site) { flags.push("Single client assignment — may indicate direct supervision"); riskScore += 30; }

      // Regular hours pattern (employment indicator)
      const hours = parseFloat(w.total_hours ?? "0");
      if (hours >= 140 && hours <= 176) { flags.push("Regular full-time hours pattern (140-176h/month)"); riskScore += 25; }

      // Long-term engagement
      if (w.pipeline_stage === "Active") { flags.push("Long-term active status — ongoing relationship"); riskScore += 20; }

      // Fixed hourly rate (vs project-based)
      if (w.hourly_netto_rate && parseFloat(w.hourly_netto_rate) > 0) { flags.push("Fixed hourly rate — employment characteristic"); riskScore += 15; }

      // Specific role (not project-based)
      if (w.job_role) { flags.push(`Assigned specific role: ${w.job_role}`); riskScore += 10; }

      return {
        workerId: w.id,
        name: w.name,
        contractType: w.contract_type,
        client: w.assigned_site ?? "N/A",
        riskScore: Math.min(100, riskScore),
        riskLevel: riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : "LOW",
        flags,
      };
    });

    const highRisk = risks.filter(r => r.riskLevel === "HIGH");

    return res.json({
      scan: risks,
      summary: {
        total: risks.length,
        high: highRisk.length,
        medium: risks.filter(r => r.riskLevel === "MEDIUM").length,
        low: risks.filter(r => r.riskLevel === "LOW").length,
      },
      legal_basis: "PIP reclassification powers effective Jan 1, 2026 — 7-day appeal window",
      recommendation: highRisk.length > 0
        ? `${highRisk.length} worker(s) at HIGH reclassification risk. Review contract terms and consider converting to Umowa o Pracę.`
        : "No high-risk reclassification cases detected.",
      org_context: "EEJ",
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

export default router;

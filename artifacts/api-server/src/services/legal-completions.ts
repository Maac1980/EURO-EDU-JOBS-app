/**
 * Parts 8, 10, 11, 16 — Action Engine, Predictive Risk,
 * Cross-Worker Intelligence, Silent Failure Visibility
 *
 * NO AI decisions. Deterministic logic only.
 * AI used only for explanation text (always DRAFT).
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { sql, eq, desc } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { evaluateLegalStatus, type LegalInput, type LegalOutput } from "./legal-decision-engine.js";

const router = Router();

// ══ PART 8 — ACTION ENGINE ══════════════════════════════════════════════════
// For each worker: what must be done, what's blocked, what can be generated

interface ActionItem {
  action: string;
  status: "ready" | "blocked" | "review_required" | "done";
  blockReason?: string;
  canGenerate: boolean;
}

interface ActionPackage {
  workerId: string;
  workerName: string;
  packageType: "trc_renewal" | "appeal" | "compliance_fix" | "onboarding" | "permit_renewal";
  packageLabel: string;
  status: "READY_TO_GENERATE" | "BLOCKED" | "PARTIALLY_READY" | "COMPLETE";
  items: ActionItem[];
  blockedBy: string[];
  nextAction: string;
  priority: number;
}

function workerToInput(w: any): LegalInput {
  return {
    workerId: w.id, workerName: w.name ?? "", nationality: w.nationality ?? "",
    permitExpiry: w.work_permit_expiry ?? null, trcExpiry: w.trc_expiry ?? null,
    trcFilingDate: null, trcApplicationPending: false,
    employerContinuity: true, roleContinuity: true, formalDefect: false,
    contractEndDate: w.contract_end_date ?? null, bhpExpiry: w.bhp_status ?? null,
    medicalExpiry: w.badania_lek_expiry ?? null, oswiadczenieExpiry: w.oswiadczenie_expiry ?? null,
    hasValidPassport: true, evidenceSubmitted: [],
  };
}

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function buildPackages(w: any, legal: LegalOutput): ActionPackage[] {
  const packages: ActionPackage[] = [];
  const now = new Date();

  const bhpDays = daysUntil(w.bhp_status);
  const medDays = daysUntil(w.badania_lek_expiry);
  const trcDays = daysUntil(w.trc_expiry);
  const permitDays = daysUntil(w.work_permit_expiry);
  const contractDays = daysUntil(w.contract_end_date);

  const bhpOk = bhpDays === null || bhpDays > 0;
  const medOk = medDays === null || medDays > 0;
  const contractOk = contractDays === null || contractDays > 0;

  // TRC Renewal Package
  if (trcDays !== null && trcDays <= 60) {
    const items: ActionItem[] = [
      { action: "Cover letter for voivodship", status: bhpOk && medOk ? "ready" : "blocked", canGenerate: bhpOk && medOk, blockReason: !bhpOk ? "BHP expired" : !medOk ? "Medical expired" : undefined },
      { action: "Document checklist", status: "ready", canGenerate: true },
      { action: "Medical examination", status: medOk ? (medDays !== null && medDays < 30 ? "review_required" : "done") : "blocked", canGenerate: false, blockReason: !medOk ? "Schedule medical exam first" : undefined },
      { action: "BHP safety training", status: bhpOk ? (bhpDays !== null && bhpDays < 30 ? "review_required" : "done") : "blocked", canGenerate: false, blockReason: !bhpOk ? "Schedule BHP training first" : undefined },
      { action: "Employment contract", status: contractOk ? "done" : "blocked", canGenerate: !contractOk, blockReason: !contractOk ? "Contract expired — renew first" : undefined },
    ];
    const blockedBy = items.filter(i => i.status === "blocked").map(i => i.blockReason!).filter(Boolean);
    const readyCount = items.filter(i => i.status === "ready" || i.status === "done").length;
    packages.push({
      workerId: w.id, workerName: w.name,
      packageType: "trc_renewal", packageLabel: "TRC Renewal Package",
      status: blockedBy.length > 0 ? (readyCount > 0 ? "PARTIALLY_READY" : "BLOCKED") : "READY_TO_GENERATE",
      items, blockedBy,
      nextAction: blockedBy.length > 0 ? blockedBy[0] : "Generate cover letter and submit to voivodship",
      priority: trcDays < 0 ? 100 : trcDays < 14 ? 95 : trcDays < 30 ? 80 : 60,
    });
  }

  // Compliance Fix Package
  if (legal.riskLevel === "CRITICAL" || legal.riskLevel === "HIGH") {
    const items: ActionItem[] = [];
    if (!bhpOk) items.push({ action: "Schedule BHP training", status: "blocked", canGenerate: false, blockReason: "Expired — worker cannot legally work on site" });
    if (!medOk) items.push({ action: "Schedule medical examination", status: "blocked", canGenerate: false, blockReason: "Art. 229 KP violation" });
    if (!contractOk) items.push({ action: "Issue new contract", status: "ready", canGenerate: true });
    if (legal.legalStatus === "EXPIRED_NOT_PROTECTED" || legal.legalStatus === "NO_PERMIT")
      items.push({ action: "Obtain work authorization", status: "blocked", canGenerate: false, blockReason: "Worker cannot legally work" });

    if (items.length > 0) {
      const blockedBy = items.filter(i => i.status === "blocked").map(i => i.action);
      packages.push({
        workerId: w.id, workerName: w.name,
        packageType: "compliance_fix", packageLabel: "Compliance Fix Package",
        status: blockedBy.length === items.length ? "BLOCKED" : "PARTIALLY_READY",
        items, blockedBy,
        nextAction: items[0].action,
        priority: legal.riskLevel === "CRITICAL" ? 100 : 85,
      });
    }
  }

  // Permit Renewal Package
  if (permitDays !== null && permitDays <= 60 && permitDays > -90) {
    packages.push({
      workerId: w.id, workerName: w.name,
      packageType: "permit_renewal", packageLabel: "Work Permit Renewal",
      status: "READY_TO_GENERATE",
      items: [
        { action: "Work permit renewal application", status: "ready", canGenerate: true },
        { action: "Labor market test", status: "review_required", canGenerate: false },
        { action: "Company documents (KRS)", status: "review_required", canGenerate: false },
      ],
      blockedBy: [],
      nextAction: "File work permit renewal at voivodship",
      priority: permitDays < 0 ? 100 : permitDays < 14 ? 90 : 70,
    });
  }

  return packages;
}

router.get("/actions/worker/:workerId", authenticateToken, async (req, res) => {
  try {
    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${req.params.workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;
    const legal = evaluateLegalStatus(workerToInput(w));
    const packages = buildPackages(w, legal);
    return res.json({ worker: { id: w.id, name: w.name }, legalStatus: legal.legalStatus, riskLevel: legal.riskLevel, packages });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/actions/all", authenticateToken, async (_req, res) => {
  try {
    const workers = await db.execute(sql`
      SELECT * FROM workers WHERE pipeline_stage IN ('Active','Placed','Screening')
        AND (tenant_id IS NULL OR tenant_id != 'test')
    `);
    const allPackages: ActionPackage[] = [];
    for (const w of workers.rows as any[]) {
      const legal = evaluateLegalStatus(workerToInput(w));
      allPackages.push(...buildPackages(w, legal));
    }
    allPackages.sort((a, b) => b.priority - a.priority);
    return res.json({
      totalWorkers: (workers.rows as any[]).length,
      totalPackages: allPackages.length,
      readyCount: allPackages.filter(p => p.status === "READY_TO_GENERATE").length,
      blockedCount: allPackages.filter(p => p.status === "BLOCKED").length,
      packages: allPackages.slice(0, 50),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ PART 10 — PREDICTIVE RISK (READ-ONLY) ═══════════════════════════════════
// Forecast expiry clusters, filing deadlines, evidence gaps. No actions generated.

router.get("/risk/forecast", authenticateToken, async (_req, res) => {
  try {
    const workers = await db.execute(sql`
      SELECT * FROM workers WHERE pipeline_stage IN ('Active','Placed')
        AND (tenant_id IS NULL OR tenant_id != 'test')
    `);

    const windows = [7, 14, 30, 60, 90];
    const expiryForecast: Record<string, Record<number, number>> = {
      trc: {}, permit: {}, bhp: {}, medical: {}, contract: {},
    };
    for (const win of windows) {
      for (const key of Object.keys(expiryForecast)) expiryForecast[key][win] = 0;
    }

    const atRisk: any[] = [];

    for (const w of workers.rows as any[]) {
      const checks = [
        { key: "trc", date: w.trc_expiry },
        { key: "permit", date: w.work_permit_expiry },
        { key: "bhp", date: w.bhp_status },
        { key: "medical", date: w.badania_lek_expiry },
        { key: "contract", date: w.contract_end_date },
      ];

      let worstDays = Infinity;
      let worstField = "";

      for (const c of checks) {
        const days = daysUntil(c.date);
        if (days === null) continue;
        if (days < worstDays) { worstDays = days; worstField = c.key; }
        for (const win of windows) {
          if (days >= 0 && days <= win) expiryForecast[c.key][win]++;
          if (days < 0) expiryForecast[c.key][win]++; // already expired counts in all windows
        }
      }

      if (worstDays <= 30) {
        atRisk.push({ id: w.id, name: w.name, site: w.assigned_site, field: worstField, daysLeft: worstDays });
      }
    }

    atRisk.sort((a, b) => a.daysLeft - b.daysLeft);

    // Evidence gaps
    const evidenceCount = await db.execute(sql`
      SELECT worker_id, COUNT(*)::int as cnt FROM legal_evidence GROUP BY worker_id
    `);
    const evidenceMap = new Map((evidenceCount.rows as any[]).map(r => [r.worker_id, r.cnt]));
    const workersWithoutEvidence = (workers.rows as any[]).filter(w => !evidenceMap.has(w.id)).length;

    // Stale scans
    const lastScan = await db.execute(sql`SELECT MAX(created_at) as last FROM legal_snapshots`);
    const lastScanDate = (lastScan.rows[0] as any)?.last;
    const scanAgeDays = lastScanDate ? Math.ceil((Date.now() - new Date(lastScanDate).getTime()) / 86400000) : null;

    return res.json({
      expiryForecast,
      atRiskWorkers: atRisk.slice(0, 30),
      totalAtRisk: atRisk.length,
      evidenceGaps: { workersWithoutEvidence, total: (workers.rows as any[]).length },
      scanAge: { lastScan: lastScanDate, ageDays: scanAgeDays, stale: scanAgeDays !== null && scanAgeDays > 7 },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ PART 11 — CROSS-WORKER INTELLIGENCE ═════════════════════════════════════
// Batch patterns — clusters, common issues, systemic failures

router.get("/intelligence/patterns", authenticateToken, async (_req, res) => {
  try {
    // Expiry clusters by month
    const expiryClusters = await db.execute(sql`
      SELECT TO_CHAR(trc_expiry::date, 'YYYY-MM') as month, COUNT(*)::int as cnt
      FROM workers WHERE trc_expiry IS NOT NULL AND pipeline_stage IN ('Active','Placed')
        AND (tenant_id IS NULL OR tenant_id != 'test')
      GROUP BY month ORDER BY month LIMIT 12
    `);

    // BHP expiry clusters by site
    const bhpBySite = await db.execute(sql`
      SELECT assigned_site as site, COUNT(*)::int as cnt
      FROM workers WHERE bhp_status IS NOT NULL AND bhp_status::date < NOW()::date
        AND pipeline_stage IN ('Active','Placed')
        AND (tenant_id IS NULL OR tenant_id != 'test')
      GROUP BY assigned_site ORDER BY cnt DESC LIMIT 10
    `);

    // Nationality distribution
    const nationalities = await db.execute(sql`
      SELECT nationality, COUNT(*)::int as cnt
      FROM workers WHERE pipeline_stage IN ('Active','Placed')
        AND (tenant_id IS NULL OR tenant_id != 'test')
      GROUP BY nationality ORDER BY cnt DESC LIMIT 10
    `);

    // Rejection patterns (if any cases exist)
    const rejectionPatterns = await db.execute(sql`
      SELECT
        (rejection_classification->0->>'category') as category,
        COUNT(*)::int as cnt
      FROM legal_cases
      WHERE rejection_classification IS NOT NULL AND status = 'REJECTED'
      GROUP BY category ORDER BY cnt DESC LIMIT 5
    `);

    // Site concentration risk
    const siteConcentration = await db.execute(sql`
      SELECT assigned_site as site, COUNT(*)::int as workers,
        COUNT(CASE WHEN trc_expiry::date < (NOW() + INTERVAL '30 days')::date THEN 1 END)::int as expiring_soon
      FROM workers WHERE pipeline_stage IN ('Active','Placed')
        AND (tenant_id IS NULL OR tenant_id != 'test')
        AND assigned_site IS NOT NULL
      GROUP BY assigned_site ORDER BY workers DESC LIMIT 10
    `);

    return res.json({
      expiryClusters: expiryClusters.rows,
      bhpExpiredBySite: bhpBySite.rows,
      nationalityDistribution: nationalities.rows,
      rejectionPatterns: rejectionPatterns.rows,
      siteConcentration: siteConcentration.rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ PART 16 — SILENT FAILURE VISIBILITY ═════════════════════════════════════
// Track and surface system failures

interface SystemHealth {
  component: string;
  status: "ok" | "warning" | "error" | "stale";
  detail: string;
  lastChecked: string;
}

router.get("/system/health-report", authenticateToken, async (_req, res) => {
  try {
    const checks: SystemHealth[] = [];

    // Legal scan freshness
    const lastScan = await db.execute(sql`SELECT MAX(created_at) as last FROM legal_snapshots`);
    const scanDate = (lastScan.rows[0] as any)?.last;
    const scanAge = scanDate ? Math.ceil((Date.now() - new Date(scanDate).getTime()) / 86400000) : null;
    checks.push({
      component: "Legal Scan",
      status: scanAge === null ? "error" : scanAge > 7 ? "stale" : scanAge > 1 ? "warning" : "ok",
      detail: scanAge === null ? "Never run" : `Last run ${scanAge} days ago`,
      lastChecked: scanDate ?? "never",
    });

    // AI service
    const aiCheck = await db.execute(sql`SELECT MAX(created_at) as last FROM legal_approvals WHERE target_type IN ('copilot','rejection_ocr','rejection_analysis')`);
    const aiDate = (aiCheck.rows[0] as any)?.last;
    checks.push({
      component: "AI Service (Claude)",
      status: process.env.ANTHROPIC_API_KEY ? "ok" : "error",
      detail: process.env.ANTHROPIC_API_KEY ? `Key configured, last used: ${aiDate ?? "never"}` : "ANTHROPIC_API_KEY not set",
      lastChecked: new Date().toISOString(),
    });

    // Perplexity
    checks.push({
      component: "Immigration Search (Perplexity)",
      status: process.env.PERPLEXITY_API_KEY ? "ok" : "warning",
      detail: process.env.PERPLEXITY_API_KEY ? "Key configured" : "PERPLEXITY_API_KEY not set — immigration search disabled",
      lastChecked: new Date().toISOString(),
    });

    // OCR failures
    const ocrFails = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM legal_evidence WHERE ocr_confidence IS NOT NULL AND ocr_confidence < 30`);
    const ocrFailCount = (ocrFails.rows[0] as any)?.cnt ?? 0;
    checks.push({
      component: "Document OCR",
      status: ocrFailCount > 5 ? "warning" : "ok",
      detail: `${ocrFailCount} low-confidence extractions`,
      lastChecked: new Date().toISOString(),
    });

    // Pending approvals (might be stuck)
    const stuckApprovals = await db.execute(sql`
      SELECT COUNT(*)::int as cnt FROM legal_approvals
      WHERE status = 'pending' AND created_at < NOW() - INTERVAL '3 days'
    `);
    const stuckCount = (stuckApprovals.rows[0] as any)?.cnt ?? 0;
    checks.push({
      component: "Approval Queue",
      status: stuckCount > 10 ? "warning" : "ok",
      detail: `${stuckCount} approvals pending > 3 days`,
      lastChecked: new Date().toISOString(),
    });

    // Database
    const workerCount = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM workers WHERE tenant_id IS NULL OR tenant_id != 'test'`);
    checks.push({
      component: "Database",
      status: "ok",
      detail: `${(workerCount.rows[0] as any)?.cnt ?? 0} production workers`,
      lastChecked: new Date().toISOString(),
    });

    // Email/SMTP
    checks.push({
      component: "Email (Brevo SMTP)",
      status: process.env.BREVO_SMTP_USER ? "ok" : "warning",
      detail: process.env.BREVO_SMTP_USER ? "SMTP configured" : "SMTP not configured — email alerts disabled",
      lastChecked: new Date().toISOString(),
    });

    // WhatsApp/Twilio
    checks.push({
      component: "WhatsApp (Twilio)",
      status: process.env.TWILIO_ACCOUNT_SID ? "ok" : "warning",
      detail: process.env.TWILIO_ACCOUNT_SID ? "Twilio configured" : "Twilio not configured — WhatsApp disabled",
      lastChecked: new Date().toISOString(),
    });

    const overallStatus = checks.some(c => c.status === "error") ? "error"
      : checks.some(c => c.status === "stale") ? "stale"
      : checks.some(c => c.status === "warning") ? "warning" : "ok";

    return res.json({
      overall: overallStatus,
      components: checks,
      errorCount: checks.filter(c => c.status === "error").length,
      warningCount: checks.filter(c => c.status === "warning").length,
      staleCount: checks.filter(c => c.status === "stale").length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

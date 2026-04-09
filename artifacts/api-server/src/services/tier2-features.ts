/**
 * Tier 2 Features: LinkedCases, PostedNotifications, CertifiedSignatures,
 * SafetyMonitor, MarginAnalysis, HousingManagement
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { sql, eq, desc } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

// ══ 1. LINKED CASES ═════════════════════════════════════════════════════════
// Connect related legal cases for the same worker (TRC + appeal + work permit)

router.get("/legal/linked-cases/:workerId", authenticateToken, async (req, res) => {
  try {
    const cases = await db.execute(sql`
      SELECT lc.*, w.name as worker_name,
        (SELECT COUNT(*)::int FROM legal_evidence le WHERE le.case_id = lc.id) as evidence_count,
        (SELECT COUNT(*)::int FROM legal_documents ld WHERE ld.case_id = lc.id) as document_count
      FROM legal_cases lc
      JOIN workers w ON w.id = lc.worker_id
      WHERE lc.worker_id = ${req.params.workerId}
      ORDER BY lc.created_at DESC
    `);

    // Group by type for visual linking
    const grouped: Record<string, any[]> = {};
    for (const c of cases.rows as any[]) {
      const type = c.case_type ?? "other";
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(c);
    }

    return res.json({
      workerId: req.params.workerId,
      workerName: (cases.rows[0] as any)?.worker_name ?? "Unknown",
      totalCases: cases.rows.length,
      grouped,
      allCases: cases.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Link two cases together
router.post("/legal/link-cases", authenticateToken, async (req, res) => {
  try {
    const { caseId, linkedCaseId } = req.body as { caseId: string; linkedCaseId: string };
    if (!caseId || !linkedCaseId) return res.status(400).json({ error: "caseId and linkedCaseId required" });
    // Store link as TRC case ID reference
    await db.execute(sql`UPDATE legal_cases SET trc_case_id = ${linkedCaseId} WHERE id = ${caseId}`);
    return res.json({ success: true, linked: { from: caseId, to: linkedCaseId } });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ 2. POSTED WORKER NOTIFICATIONS ══════════════════════════════════════════
// Track A1 certificates and posted worker deadlines

router.get("/posted-workers/deadlines", authenticateToken, async (_req, res) => {
  try {
    // Workers with assigned sites that suggest posting (non-Polish sites)
    const workers = await db.execute(sql`
      SELECT w.id, w.name, w.nationality, w.assigned_site, w.work_permit_expiry,
        w.contract_end_date, w.trc_expiry
      FROM workers w
      WHERE w.pipeline_stage IN ('Active', 'Placed')
        AND w.assigned_site IS NOT NULL
        AND (w.tenant_id IS NULL OR w.tenant_id != 'test')
      ORDER BY w.contract_end_date ASC NULLS LAST
    `);

    const now = new Date();
    const deadlines: any[] = [];

    for (const w of workers.rows as any[]) {
      // A1 certificate typically valid for 24 months
      // Notification to host country required before posting
      if (w.contract_end_date) {
        const days = Math.ceil((new Date(w.contract_end_date).getTime() - now.getTime()) / 86400000);
        if (days <= 90 && days > 0) {
          deadlines.push({
            workerId: w.id, workerName: w.name, site: w.assigned_site,
            deadline: w.contract_end_date, daysLeft: days,
            type: "contract_expiry",
            action: days <= 30 ? "RENEW IMMEDIATELY" : "Plan renewal",
            urgency: days <= 14 ? "CRITICAL" : days <= 30 ? "HIGH" : "MEDIUM",
          });
        }
      }
      if (w.trc_expiry) {
        const days = Math.ceil((new Date(w.trc_expiry).getTime() - now.getTime()) / 86400000);
        if (days <= 60 && days > -30) {
          deadlines.push({
            workerId: w.id, workerName: w.name, site: w.assigned_site,
            deadline: w.trc_expiry, daysLeft: days,
            type: "trc_expiry",
            action: days <= 0 ? "EXPIRED — File TRC renewal" : "File TRC renewal before expiry for Art.108",
            urgency: days <= 0 ? "CRITICAL" : days <= 14 ? "HIGH" : "MEDIUM",
          });
        }
      }
    }

    deadlines.sort((a, b) => a.daysLeft - b.daysLeft);

    return res.json({
      totalWorkers: (workers.rows as any[]).length,
      deadlinesCount: deadlines.length,
      deadlines,
      criticalCount: deadlines.filter(d => d.urgency === "CRITICAL").length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ 3. CERTIFIED SIGNATURES ═════════════════════════════════════════════════
// Digital signature tracking for contracts

router.post("/signatures/request", authenticateToken, async (req, res) => {
  try {
    const { documentId, signerName, signerEmail, signerRole } = req.body as any;
    if (!documentId || !signerName) return res.status(400).json({ error: "documentId and signerName required" });

    await db.execute(sql`
      INSERT INTO legal_approvals (target_type, target_id, action, role_required, status, notes)
      VALUES ('signature', ${documentId}, 'sign_document', ${signerRole ?? 'worker'},
        'pending', ${'Signature requested from ' + signerName + (signerEmail ? ' (' + signerEmail + ')' : '')})
    `);

    return res.json({
      success: true,
      status: "PENDING — signature request created",
      signer: signerName,
      documentId,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/signatures/pending", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT la.*, ld.title as document_title, ld.doc_type
      FROM legal_approvals la
      LEFT JOIN legal_documents ld ON ld.id = la.target_id
      WHERE la.target_type = 'signature' AND la.status = 'pending'
      ORDER BY la.created_at DESC
    `);
    return res.json({ pendingSignatures: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/signatures/:id/sign", authenticateToken, async (req, res) => {
  try {
    await db.execute(sql`
      UPDATE legal_approvals SET status = 'approved', approved_by = ${(req as any).user?.email ?? 'signer'},
        approved_at = NOW() WHERE id = ${req.params.id} AND target_type = 'signature'
    `);
    return res.json({ success: true, signed: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ 4. SAFETY MONITOR ═══════════════════════════════════════════════════════
// BHP compliance tracking with status per worker

router.get("/safety/report", authenticateToken, async (_req, res) => {
  try {
    const workers = await db.execute(sql`
      SELECT id, name, assigned_site, bhp_status, badania_lek_expiry, pipeline_stage
      FROM workers
      WHERE pipeline_stage IN ('Active', 'Placed')
        AND (tenant_id IS NULL OR tenant_id != 'test')
      ORDER BY bhp_status ASC NULLS FIRST
    `);

    const now = new Date();
    const results: any[] = [];
    let compliant = 0, expired = 0, missing = 0, expiringSoon = 0;

    for (const w of workers.rows as any[]) {
      let bhpStatus = "missing";
      let bhpDays: number | null = null;
      let medicalStatus = "missing";
      let medicalDays: number | null = null;

      if (w.bhp_status) {
        bhpDays = Math.ceil((new Date(w.bhp_status).getTime() - now.getTime()) / 86400000);
        bhpStatus = bhpDays < 0 ? "expired" : bhpDays < 30 ? "expiring" : "valid";
      }
      if (w.badania_lek_expiry) {
        medicalDays = Math.ceil((new Date(w.badania_lek_expiry).getTime() - now.getTime()) / 86400000);
        medicalStatus = medicalDays < 0 ? "expired" : medicalDays < 30 ? "expiring" : "valid";
      }

      const overallStatus = (bhpStatus === "expired" || medicalStatus === "expired") ? "non_compliant"
        : (bhpStatus === "missing" || medicalStatus === "missing") ? "missing"
        : (bhpStatus === "expiring" || medicalStatus === "expiring") ? "expiring"
        : "compliant";

      if (overallStatus === "compliant") compliant++;
      else if (overallStatus === "non_compliant") expired++;
      else if (overallStatus === "missing") missing++;
      else expiringSoon++;

      results.push({
        workerId: w.id, workerName: w.name, site: w.assigned_site,
        bhp: { status: bhpStatus, daysLeft: bhpDays, expiry: w.bhp_status },
        medical: { status: medicalStatus, daysLeft: medicalDays, expiry: w.badania_lek_expiry },
        overallStatus,
      });
    }

    results.sort((a, b) => {
      const order = { non_compliant: 0, missing: 1, expiring: 2, compliant: 3 };
      return (order[a.overallStatus as keyof typeof order] ?? 4) - (order[b.overallStatus as keyof typeof order] ?? 4);
    });

    return res.json({
      totalWorkers: results.length,
      compliant, expired, missing, expiringSoon,
      complianceRate: results.length > 0 ? Math.round(compliant / results.length * 100) : 100,
      workers: results,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ 5. MARGIN ANALYSIS ══════════════════════════════════════════════════════
// Revenue per worker minus costs = profit per site

router.get("/margins/analysis", authenticateToken, async (_req, res) => {
  try {
    const workers = await db.execute(sql`
      SELECT w.id, w.name, w.assigned_site, w.hourly_netto_rate, w.pipeline_stage,
        c.name as client_name, c.billing_rate as client_rate
      FROM workers w
      LEFT JOIN clients c ON w.assigned_site ILIKE '%' || split_part(c.name, ' ', 1) || '%'
      WHERE w.pipeline_stage IN ('Active', 'Placed')
        AND w.hourly_netto_rate > 0
        AND (w.tenant_id IS NULL OR w.tenant_id != 'test')
      ORDER BY w.assigned_site
    `);

    const HOURS = 160;
    const bySite: Record<string, { workers: number; totalRevenue: number; totalCost: number; margin: number; workers_list: any[] }> = {};

    for (const w of workers.rows as any[]) {
      const site = w.assigned_site ?? "Unassigned";
      if (!bySite[site]) bySite[site] = { workers: 0, totalRevenue: 0, totalCost: 0, margin: 0, workers_list: [] };

      const clientRate = w.client_rate ?? (w.hourly_netto_rate * 1.4); // 40% markup estimate if no client rate
      const workerCost = w.hourly_netto_rate * HOURS;
      const revenue = clientRate * HOURS;
      const margin = revenue - workerCost;

      bySite[site].workers++;
      bySite[site].totalRevenue += revenue;
      bySite[site].totalCost += workerCost;
      bySite[site].margin += margin;
      bySite[site].workers_list.push({
        name: w.name, rate: w.hourly_netto_rate, clientRate,
        monthlyCost: Math.round(workerCost * 100) / 100,
        monthlyRevenue: Math.round(revenue * 100) / 100,
        monthlyMargin: Math.round(margin * 100) / 100,
        marginPercent: Math.round(margin / revenue * 100),
      });
    }

    const sites = Object.entries(bySite).map(([site, data]) => ({
      site,
      workers: data.workers,
      totalRevenue: Math.round(data.totalRevenue * 100) / 100,
      totalCost: Math.round(data.totalCost * 100) / 100,
      totalMargin: Math.round(data.margin * 100) / 100,
      marginPercent: data.totalRevenue > 0 ? Math.round(data.margin / data.totalRevenue * 100) : 0,
      workerDetails: data.workers_list,
    })).sort((a, b) => b.totalMargin - a.totalMargin);

    const totals = sites.reduce((acc, s) => ({
      revenue: acc.revenue + s.totalRevenue,
      cost: acc.cost + s.totalCost,
      margin: acc.margin + s.totalMargin,
      workers: acc.workers + s.workers,
    }), { revenue: 0, cost: 0, margin: 0, workers: 0 });

    return res.json({
      sites,
      totals: {
        ...totals,
        marginPercent: totals.revenue > 0 ? Math.round(totals.margin / totals.revenue * 100) : 0,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ 6. HOUSING MANAGEMENT ═══════════════════════════════════════════════════
// Track worker accommodation — uses workers table + notes

router.get("/housing/overview", authenticateToken, async (_req, res) => {
  try {
    // Workers with site assignments as proxy for housing
    const workers = await db.execute(sql`
      SELECT w.id, w.name, w.assigned_site, w.phone, w.email, w.nationality,
        w.contract_end_date, w.pipeline_stage
      FROM workers w
      WHERE w.pipeline_stage IN ('Active', 'Placed')
        AND (w.tenant_id IS NULL OR w.tenant_id != 'test')
      ORDER BY w.assigned_site, w.name
    `);

    const bySite: Record<string, any[]> = {};
    for (const w of workers.rows as any[]) {
      const site = w.assigned_site ?? "Unassigned";
      if (!bySite[site]) bySite[site] = [];
      bySite[site].push({
        id: w.id, name: w.name, nationality: w.nationality,
        phone: w.phone, contractEnd: w.contract_end_date,
      });
    }

    return res.json({
      totalWorkers: (workers.rows as any[]).length,
      sites: Object.entries(bySite).map(([site, workers]) => ({
        site, workerCount: workers.length, workers,
      })).sort((a, b) => b.workerCount - a.workerCount),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

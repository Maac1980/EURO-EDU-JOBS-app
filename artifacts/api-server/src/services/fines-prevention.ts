/**
 * Fines Prevention — converts compliance issues into PLN amounts.
 * Shows which workers would cause PIP fines and how much.
 * Deterministic — no AI. Based on published PIP fine schedules.
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { evaluateLegalStatus, type LegalInput } from "./legal-decision-engine.js";

const router = Router();

// PIP fine schedule 2026 (published rates)
const FINES = {
  illegal_employment: { min: 3000, max: 30000, label: "Illegal employment of foreigner (Art. 120 Ustawa o promocji zatrudnienia)" },
  no_work_permit: { min: 3000, max: 5000, label: "Employing foreigner without work permit" },
  expired_bhp: { min: 1000, max: 30000, label: "Worker without valid BHP training (Art. 283 KP)" },
  expired_medical: { min: 1000, max: 30000, label: "Worker without valid medical exam (Art. 283 KP)" },
  no_contract: { min: 2000, max: 30000, label: "Employment without written contract (Art. 281 KP)" },
  no_zus_registration: { min: 5000, max: 5000, label: "Failure to register with ZUS within 7 days" },
  missing_rodo: { min: 10000, max: 20000000, label: "GDPR/RODO violation (UODO)" }, // max is theoretical
  no_7day_notification: { min: 500, max: 5000, label: "Failure to notify voivodship within 7 days of work start/stop" },
};

interface FineRisk {
  workerId: string;
  workerName: string;
  site: string;
  violation: string;
  fineLabel: string;
  fineMin: number;
  fineMax: number;
  daysOverdue: number;
  urgency: "IMMEDIATE" | "THIS_WEEK" | "THIS_MONTH";
}

router.get("/fines/risk-report", authenticateToken, async (_req, res) => {
  try {
    const workers = await db.execute(sql`
      SELECT * FROM workers
      WHERE pipeline_stage IN ('Active','Placed')
        AND (tenant_id IS NULL OR tenant_id != 'test')
    `);

    const risks: FineRisk[] = [];
    let totalMinExposure = 0;
    let totalMaxExposure = 0;

    for (const w of workers.rows as any[]) {
      const now = new Date();

      // Check work permit / TRC
      const permitExpiry = w.work_permit_expiry ?? w.trc_expiry;
      if (permitExpiry) {
        const days = Math.ceil((new Date(permitExpiry).getTime() - now.getTime()) / 86400000);
        if (days < 0) {
          const fine = w.nationality && ["Polish", "German", "French", "Italian", "Spanish", "Dutch", "Czech", "Slovak", "Romanian", "Bulgarian", "Croatian", "Hungarian"].includes(w.nationality)
            ? null : FINES.no_work_permit;
          if (fine) {
            risks.push({
              workerId: w.id, workerName: w.name, site: w.assigned_site ?? "Unknown",
              violation: "expired_work_authorization", fineLabel: fine.label,
              fineMin: fine.min, fineMax: fine.max, daysOverdue: Math.abs(days),
              urgency: "IMMEDIATE",
            });
            totalMinExposure += fine.min;
            totalMaxExposure += fine.max;
          }
        }
      } else if (w.nationality && !["Polish", "German", "French", "Romanian", "Bulgarian", "Croatian", "Hungarian", "Czech", "Slovak", "Italian", "Spanish", "Dutch"].includes(w.nationality)) {
        risks.push({
          workerId: w.id, workerName: w.name, site: w.assigned_site ?? "Unknown",
          violation: "no_work_permit_on_file", fineLabel: FINES.no_work_permit.label,
          fineMin: FINES.no_work_permit.min, fineMax: FINES.no_work_permit.max, daysOverdue: 0,
          urgency: "IMMEDIATE",
        });
        totalMinExposure += FINES.no_work_permit.min;
        totalMaxExposure += FINES.no_work_permit.max;
      }

      // Check BHP
      if (w.bhp_status) {
        const days = Math.ceil((new Date(w.bhp_status).getTime() - now.getTime()) / 86400000);
        if (days < 0) {
          risks.push({
            workerId: w.id, workerName: w.name, site: w.assigned_site ?? "Unknown",
            violation: "expired_bhp", fineLabel: FINES.expired_bhp.label,
            fineMin: FINES.expired_bhp.min, fineMax: FINES.expired_bhp.max, daysOverdue: Math.abs(days),
            urgency: Math.abs(days) > 30 ? "IMMEDIATE" : "THIS_WEEK",
          });
          totalMinExposure += FINES.expired_bhp.min;
          totalMaxExposure += FINES.expired_bhp.max;
        }
      }

      // Check medical
      if (w.badania_lek_expiry) {
        const days = Math.ceil((new Date(w.badania_lek_expiry).getTime() - now.getTime()) / 86400000);
        if (days < 0) {
          risks.push({
            workerId: w.id, workerName: w.name, site: w.assigned_site ?? "Unknown",
            violation: "expired_medical", fineLabel: FINES.expired_medical.label,
            fineMin: FINES.expired_medical.min, fineMax: FINES.expired_medical.max, daysOverdue: Math.abs(days),
            urgency: Math.abs(days) > 30 ? "IMMEDIATE" : "THIS_WEEK",
          });
          totalMinExposure += FINES.expired_medical.min;
          totalMaxExposure += FINES.expired_medical.max;
        }
      }

      // Check contract
      if (w.contract_end_date) {
        const days = Math.ceil((new Date(w.contract_end_date).getTime() - now.getTime()) / 86400000);
        if (days < 0 && (w.pipeline_stage === "Active" || w.pipeline_stage === "Placed")) {
          risks.push({
            workerId: w.id, workerName: w.name, site: w.assigned_site ?? "Unknown",
            violation: "no_valid_contract", fineLabel: FINES.no_contract.label,
            fineMin: FINES.no_contract.min, fineMax: FINES.no_contract.max, daysOverdue: Math.abs(days),
            urgency: "THIS_WEEK",
          });
          totalMinExposure += FINES.no_contract.min;
          totalMaxExposure += FINES.no_contract.max;
        }
      }
    }

    // Sort by urgency then fine amount
    risks.sort((a, b) => {
      const urgOrder = { IMMEDIATE: 0, THIS_WEEK: 1, THIS_MONTH: 2 };
      return (urgOrder[a.urgency] - urgOrder[b.urgency]) || (b.fineMax - a.fineMax);
    });

    // Group by site
    const bySite: Record<string, { count: number; minExposure: number; maxExposure: number }> = {};
    for (const r of risks) {
      if (!bySite[r.site]) bySite[r.site] = { count: 0, minExposure: 0, maxExposure: 0 };
      bySite[r.site].count++;
      bySite[r.site].minExposure += r.fineMin;
      bySite[r.site].maxExposure += r.fineMax;
    }

    return res.json({
      totalWorkers: (workers.rows as any[]).length,
      totalViolations: risks.length,
      totalMinExposure,
      totalMaxExposure,
      immediateCount: risks.filter(r => r.urgency === "IMMEDIATE").length,
      risks: risks.slice(0, 50),
      bySite: Object.entries(bySite).map(([site, data]) => ({ site, ...data })).sort((a, b) => b.maxExposure - a.maxExposure),
      fineSchedule: FINES,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

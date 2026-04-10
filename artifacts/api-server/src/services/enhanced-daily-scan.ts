/**
 * Enhanced Daily Scan — detects STATUS CHANGES, not just current problems.
 *
 * Old scan: "these workers have issues" (static list)
 * New scan: "these 3 workers CHANGED status since yesterday" (actionable)
 *
 * Compares previous snapshot with fresh calculation.
 * Creates alerts only for meaningful transitions:
 *   VALID → EXPIRING_SOON (new risk)
 *   EXPIRING_SOON → EXPIRED_NOT_PROTECTED (critical)
 *   anything → PROTECTED_PENDING (Art.108 activated)
 *   PROTECTED_PENDING → VALID (TRC approved)
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { sql, eq, desc } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { evaluateLegalStatus, type LegalInput, type LegalOutput } from "./legal-decision-engine.js";
import { isTestWorker } from "./test-safety.js";

const router = Router();

interface StatusTransition {
  workerId: string;
  workerName: string;
  site: string;
  previousStatus: string;
  newStatus: string;
  previousRisk: string;
  newRisk: string;
  changeType: "ESCALATION" | "IMPROVEMENT" | "LATERAL" | "NEW";
  urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  requiredActions: string[];
}

const RISK_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function classifyChange(prev: string | null, curr: string, prevRisk: string | null, currRisk: string): StatusTransition["changeType"] {
  if (!prev) return "NEW";
  if ((RISK_ORDER[currRisk] ?? 3) < (RISK_ORDER[prevRisk ?? "LOW"] ?? 3)) return "ESCALATION";
  if ((RISK_ORDER[currRisk] ?? 3) > (RISK_ORDER[prevRisk ?? "LOW"] ?? 3)) return "IMPROVEMENT";
  return "LATERAL";
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

export async function runEnhancedScan(): Promise<{
  scanned: number;
  transitions: StatusTransition[];
  escalations: number;
  improvements: number;
  unchanged: number;
}> {
  console.log("[enhanced-scan] Starting...");

  const workers = await db.execute(sql`
    SELECT * FROM workers WHERE pipeline_stage IN ('Active','Placed','Screening')
      AND (tenant_id IS NULL OR tenant_id != 'test')
  `);

  const transitions: StatusTransition[] = [];
  let unchanged = 0;

  for (const w of workers.rows as any[]) {
    // Get previous snapshot
    const prevSnap = await db.select().from(schema.legalSnapshots)
      .where(eq(schema.legalSnapshots.workerId, w.id))
      .orderBy(desc(schema.legalSnapshots.createdAt)).limit(1);

    const prevStatus = prevSnap[0]?.legalStatus ?? null;
    const prevRisk = prevSnap[0]?.riskLevel ?? null;

    // Calculate fresh
    const input = workerToInput(w);
    const result = evaluateLegalStatus(input);

    // Store new snapshot
    await db.insert(schema.legalSnapshots).values({
      workerId: w.id,
      legalStatus: result.legalStatus,
      legalBasis: result.legalBasis,
      riskLevel: result.riskLevel,
      conditions: result.conditions,
      warnings: result.warnings,
      requiredActions: result.requiredActions,
      nationality: w.nationality,
      snapshotData: { input, result, scanType: "enhanced_daily" },
      createdBy: "enhanced-daily-scan",
    });

    // Detect change
    if (prevStatus && prevStatus === result.legalStatus && prevRisk === result.riskLevel) {
      unchanged++;
      continue;
    }

    const changeType = classifyChange(prevStatus, result.legalStatus, prevRisk, result.riskLevel);
    const urgency = changeType === "ESCALATION" && result.riskLevel === "CRITICAL" ? "CRITICAL"
      : changeType === "ESCALATION" ? "HIGH"
      : changeType === "NEW" && result.riskLevel !== "LOW" ? "MEDIUM"
      : "LOW";

    const descriptions: Record<string, string> = {
      "VALID→EXPIRING_SOON": `Documents expiring soon — begin renewal process`,
      "EXPIRING_SOON→EXPIRED_NOT_PROTECTED": `CRITICAL: Authorization expired without Art.108 protection — worker must stop work`,
      "EXPIRING_SOON→PROTECTED_PENDING": `Art.108 protection activated — TRC application filed before expiry`,
      "PROTECTED_PENDING→VALID": `TRC approved — worker now has valid residence permit`,
      "EXPIRED_NOT_PROTECTED→PROTECTED_PENDING": `Art.108 protection restored — new application filed`,
    };

    const transKey = `${prevStatus ?? "NEW"}→${result.legalStatus}`;

    transitions.push({
      workerId: w.id,
      workerName: w.name,
      site: w.assigned_site ?? "Unknown",
      previousStatus: prevStatus ?? "NONE",
      newStatus: result.legalStatus,
      previousRisk: prevRisk ?? "NONE",
      newRisk: result.riskLevel,
      changeType,
      urgency,
      description: descriptions[transKey] ?? `Status changed: ${prevStatus ?? "new"} → ${result.legalStatus}`,
      requiredActions: result.requiredActions,
    });

    // Create alert for escalations
    if (changeType === "ESCALATION" && !isTestWorker(w)) {
      await db.execute(sql`
        INSERT INTO legal_notifications (worker_id, message_type, message, recipient_type, status)
        VALUES (${w.id}, 'status_change',
          ${`STATUS CHANGE: ${w.name} — ${prevStatus} → ${result.legalStatus} (${result.riskLevel})`},
          'internal', 'pending')
      `).catch(() => {});
    }
  }

  transitions.sort((a, b) => (RISK_ORDER[a.urgency] ?? 4) - (RISK_ORDER[b.urgency] ?? 4));

  console.log(`[enhanced-scan] Done: ${workers.rows.length} scanned, ${transitions.length} changes, ${unchanged} unchanged`);

  return {
    scanned: (workers.rows as any[]).length,
    transitions,
    escalations: transitions.filter(t => t.changeType === "ESCALATION").length,
    improvements: transitions.filter(t => t.changeType === "IMPROVEMENT").length,
    unchanged,
  };
}

// ── POST /api/scan/enhanced — manual trigger ────────────────────────────
router.post("/scan/enhanced", authenticateToken, async (_req, res) => {
  try {
    const result = await runEnhancedScan();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/scan/transitions — recent transitions ──────────────────────
router.get("/scan/transitions", authenticateToken, async (_req, res) => {
  try {
    // Get workers with multiple snapshots to find transitions
    const recent = await db.execute(sql`
      SELECT ls1.worker_id, w.name as worker_name, w.assigned_site,
        ls1.legal_status as current_status, ls1.risk_level as current_risk,
        ls1.created_at as current_date,
        ls2.legal_status as previous_status, ls2.risk_level as previous_risk,
        ls2.created_at as previous_date
      FROM legal_snapshots ls1
      JOIN workers w ON w.id = ls1.worker_id
      LEFT JOIN LATERAL (
        SELECT legal_status, risk_level, created_at
        FROM legal_snapshots
        WHERE worker_id = ls1.worker_id AND created_at < ls1.created_at
        ORDER BY created_at DESC LIMIT 1
      ) ls2 ON TRUE
      WHERE ls1.created_at > NOW() - INTERVAL '7 days'
        AND ls2.legal_status IS NOT NULL
        AND ls2.legal_status != ls1.legal_status
        AND (w.tenant_id IS NULL OR w.tenant_id != 'test')
      ORDER BY ls1.created_at DESC
      LIMIT 30
    `);

    return res.json({ transitions: recent.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

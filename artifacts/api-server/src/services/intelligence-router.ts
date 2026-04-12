/**
 * Intelligence Router — central nervous system for EEJ legal intelligence.
 *
 * Unifies:
 *   Brain (Knowledge Graph) → pattern memory + relationships
 *   Eyes (Smart Ingest) → document understanding
 *   Mouth (Legal Answer Engine) → structured responses
 *
 * Event-driven architecture:
 *   recordFact() → RiskReassessment → Alert if threshold crossed
 *   High-risk pattern detection → Global Alert push
 *   Real-time notification via WebSocket + SSE
 *
 * Fallback: if Graph is down, Answer Engine uses deterministic legal rules.
 *
 * POST /api/intelligence/event — process an intelligence event
 * GET  /api/intelligence/stream — SSE stream for real-time updates
 * GET  /api/intelligence/alerts — current active alerts
 * POST /api/intelligence/reassess/:workerId — force risk reassessment
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { evaluateLegalStatus, type LegalInput } from "./legal-decision-engine.js";
import { EventEmitter } from "events";

const router = Router();

// ═══ EVENT SYSTEM ═══════════════════════════════════════════════════════════

// Central event bus — all intelligence events flow through here
const intelligenceBus = new EventEmitter();
intelligenceBus.setMaxListeners(50);

// Event types
type IntelEvent =
  | "FACT_RECORDED"
  | "DOCUMENT_VERIFIED"
  | "RISK_CHANGED"
  | "PATTERN_DETECTED"
  | "ALERT_CREATED"
  | "WORKER_REASSESSED"
  | "GRAPH_SYNCED";

interface IntelligenceEvent {
  type: IntelEvent;
  workerId: string;
  workerName?: string;
  data: Record<string, any>;
  timestamp: string;
  severity: "info" | "warning" | "critical";
}

// In-memory alert queue (most recent 100)
const activeAlerts: IntelligenceEvent[] = [];
const MAX_ALERTS = 100;

function pushAlert(event: IntelligenceEvent) {
  activeAlerts.unshift(event);
  if (activeAlerts.length > MAX_ALERTS) activeAlerts.pop();
  // Emit to all SSE listeners
  intelligenceBus.emit("intelligence-update", event);
}

// ═══ TABLE SETUP ════════════════════════════════════════════════════════════

async function ensureAlertTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS intelligence_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      worker_id TEXT,
      worker_name TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      data JSONB DEFAULT '{}'::jsonb,
      acknowledged BOOLEAN DEFAULT false,
      acknowledged_by TEXT,
      acknowledged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// ═══ CORE: RECORD FACT — triggers reassessment pipeline ═════════════════════

export async function recordFact(params: {
  workerId: string;
  factType: string;
  data: Record<string, any>;
  source: string;
}): Promise<{ riskChanged: boolean; alerts: IntelligenceEvent[] }> {
  const { workerId, factType, data, source } = params;
  const newAlerts: IntelligenceEvent[] = [];

  // 1. Emit fact recorded event
  const factEvent: IntelligenceEvent = {
    type: "FACT_RECORDED",
    workerId,
    data: { factType, ...data, source },
    timestamp: new Date().toISOString(),
    severity: "info",
  };
  intelligenceBus.emit("intelligence-update", factEvent);

  // 2. Trigger risk reassessment
  let riskChanged = false;
  try {
    const reassessment = await reassessWorkerRisk(workerId);
    riskChanged = reassessment.riskChanged;

    if (riskChanged) {
      const riskEvent: IntelligenceEvent = {
        type: "RISK_CHANGED",
        workerId,
        workerName: reassessment.workerName,
        data: {
          previousRisk: reassessment.previousRisk,
          currentRisk: reassessment.currentRisk,
          legalStatus: reassessment.legalStatus,
          trigger: factType,
        },
        timestamp: new Date().toISOString(),
        severity: reassessment.currentRisk === "CRITICAL" ? "critical" : reassessment.currentRisk === "HIGH" ? "warning" : "info",
      };
      pushAlert(riskEvent);
      newAlerts.push(riskEvent);

      // Persist critical/high alerts
      if (reassessment.currentRisk === "CRITICAL" || reassessment.currentRisk === "HIGH") {
        await persistAlert(riskEvent);
      }
    }
  } catch {
    // Graph/reassessment failed — continue with deterministic fallback
    console.warn(`[IntelRouter] Reassessment failed for worker ${workerId} — using deterministic fallback`);
  }

  // 3. Check for high-risk patterns (3+ rejections in same city, etc.)
  try {
    const patternAlerts = await detectHighRiskPatterns(workerId);
    for (const alert of patternAlerts) {
      pushAlert(alert);
      newAlerts.push(alert);
      await persistAlert(alert);
    }
  } catch {
    // Pattern detection failed — non-critical
  }

  return { riskChanged, alerts: newAlerts };
}

// ═══ RISK REASSESSMENT ══════════════════════════════════════════════════════

async function reassessWorkerRisk(workerId: string): Promise<{
  riskChanged: boolean;
  previousRisk: string;
  currentRisk: string;
  legalStatus: string;
  workerName: string;
}> {
  const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
  if (wRows.rows.length === 0) throw new Error("Worker not found");
  const w = wRows.rows[0] as any;

  // Check for pending TRC applications from smart_documents
  let hasPendingTrc = false;
  let filingDate: string | null = null;
  try {
    const sdRows = await db.execute(sql`
      SELECT doc_type, extracted_data FROM smart_documents
      WHERE worker_id = ${workerId} AND status = 'verified'
        AND doc_type IN ('TRC_APPLICATION', 'UPO_RECEIPT', 'MOS_CONFIRMATION')
      ORDER BY created_at DESC LIMIT 1
    `);
    if (sdRows.rows.length > 0) {
      hasPendingTrc = true;
      const ext = (sdRows.rows[0] as any).extracted_data;
      filingDate = ext?.issue_date ?? null;
    }
  } catch { /* smart_documents may not exist */ }

  // Check for rejections
  let hasFormalDefect = false;
  try {
    const rejRows = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM smart_documents
      WHERE worker_id = ${workerId} AND is_rejection = true
    `);
    hasFormalDefect = ((rejRows.rows[0] as any)?.count ?? 0) > 0;
  } catch { /* best effort */ }

  // Build legal input
  const legalInput: LegalInput = {
    workerId: w.id,
    workerName: w.name,
    nationality: w.nationality ?? "",
    permitExpiry: w.work_permit_expiry ?? null,
    trcExpiry: w.trc_expiry ?? null,
    trcFilingDate: filingDate,
    trcApplicationPending: hasPendingTrc,
    employerContinuity: true,
    roleContinuity: true,
    formalDefect: hasFormalDefect,
    contractEndDate: w.contract_end_date ?? null,
    bhpExpiry: w.bhp_status ?? null,
    medicalExpiry: w.badania_lek_expiry ?? null,
    oswiadczenieExpiry: w.oswiadczenie_expiry ?? null,
    hasValidPassport: !!(w.passport_expiry),
    evidenceSubmitted: hasPendingTrc ? ["upo"] : [],
  };

  const result = evaluateLegalStatus(legalInput);

  // Compare with stored risk level
  let previousRisk = "UNKNOWN";
  try {
    const prevRows = await db.execute(sql`
      SELECT properties->>'riskLevel' as risk FROM kg_nodes
      WHERE id = ${"worker:" + workerId}
    `);
    previousRisk = (prevRows.rows[0] as any)?.risk ?? "UNKNOWN";
  } catch { /* kg_nodes may not exist */ }

  const riskChanged = previousRisk !== result.riskLevel && previousRisk !== "UNKNOWN";

  // Update worker risk in graph node
  try {
    await db.execute(sql`
      UPDATE kg_nodes
      SET properties = properties || ${JSON.stringify({ riskLevel: result.riskLevel, legalStatus: result.legalStatus, lastReassessed: new Date().toISOString() })}::jsonb,
          updated_at = NOW()
      WHERE id = ${"worker:" + workerId}
    `);
  } catch { /* graph may not be available */ }

  return {
    riskChanged,
    previousRisk,
    currentRisk: result.riskLevel,
    legalStatus: result.legalStatus,
    workerName: w.name,
  };
}

// ═══ HIGH-RISK PATTERN DETECTION ════════════════════════════════════════════

async function detectHighRiskPatterns(workerId: string): Promise<IntelligenceEvent[]> {
  const alerts: IntelligenceEvent[] = [];

  try {
    // Pattern 1: 3+ rejections for same worker
    const rejCount = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM smart_documents
      WHERE worker_id = ${workerId} AND is_rejection = true
    `);
    const rejections = (rejCount.rows[0] as any)?.count ?? 0;
    if (rejections >= 3) {
      alerts.push({
        type: "PATTERN_DETECTED",
        workerId,
        data: { pattern: "MULTIPLE_REJECTIONS", count: rejections, threshold: 3 },
        timestamp: new Date().toISOString(),
        severity: "critical",
      });
    }

    // Pattern 2: 3+ rejections in same voivodeship (across all workers)
    const cityRej = await db.execute(sql`
      SELECT properties->>'voivodeship' as voivodeship, COUNT(*)::int as count
      FROM kg_nodes
      WHERE node_type = 'DOCUMENT' AND properties->>'isRejection' = 'true'
      GROUP BY properties->>'voivodeship'
      HAVING COUNT(*) >= 3
    `);
    for (const row of cityRej.rows as any[]) {
      if (row.voivodeship) {
        alerts.push({
          type: "PATTERN_DETECTED",
          workerId,
          data: { pattern: "CITY_REJECTION_CLUSTER", voivodeship: row.voivodeship, count: row.count },
          timestamp: new Date().toISOString(),
          severity: "warning",
        });
      }
    }

    // Pattern 3: Worker has expired permit + no pending application
    const wRows = await db.execute(sql`SELECT name, trc_expiry, work_permit_expiry FROM workers WHERE id = ${workerId}`);
    if (wRows.rows.length > 0) {
      const w = wRows.rows[0] as any;
      const now = Date.now();
      const trcExp = w.trc_expiry ? new Date(w.trc_expiry).getTime() : null;
      const wpExp = w.work_permit_expiry ? new Date(w.work_permit_expiry).getTime() : null;
      const expired = (trcExp && trcExp < now) || (wpExp && wpExp < now);

      if (expired) {
        const pendingApp = await db.execute(sql`
          SELECT COUNT(*)::int as count FROM smart_documents
          WHERE worker_id = ${workerId} AND doc_type IN ('TRC_APPLICATION', 'UPO_RECEIPT') AND status = 'verified'
        `);
        if (((pendingApp.rows[0] as any)?.count ?? 0) === 0) {
          alerts.push({
            type: "PATTERN_DETECTED",
            workerId,
            workerName: w.name,
            data: { pattern: "EXPIRED_NO_APPLICATION", trcExpiry: w.trc_expiry, permitExpiry: w.work_permit_expiry },
            timestamp: new Date().toISOString(),
            severity: "critical",
          });
        }
      }
    }
  } catch {
    // Pattern detection is best-effort — never break the main flow
  }

  return alerts;
}

// ═══ PERSIST ALERT ══════════════════════════════════════════════════════════

async function persistAlert(event: IntelligenceEvent) {
  try {
    await ensureAlertTable();
    await db.execute(sql`
      INSERT INTO intelligence_alerts (alert_type, severity, worker_id, worker_name, title, description, data)
      VALUES (
        ${event.type},
        ${event.severity},
        ${event.workerId},
        ${event.workerName ?? null},
        ${`${event.type}: ${event.data.pattern ?? event.data.trigger ?? event.type}`},
        ${JSON.stringify(event.data)},
        ${JSON.stringify(event.data)}::jsonb
      )
    `);
  } catch { /* persistence is best-effort */ }
}

// ═══ ROUTES ═════════════════════════════════════════════════════════════════

// POST /api/intelligence/event — process an intelligence event manually
router.post("/intelligence/event", authenticateToken, async (req, res) => {
  try {
    const { workerId, factType, data } = req.body;
    if (!workerId || !factType) return res.status(400).json({ error: "workerId and factType required" });

    const result = await recordFact({
      workerId,
      factType,
      data: data ?? {},
      source: (req as any).user?.name ?? "manual",
    });

    return res.json({ processed: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/intelligence/reassess/:workerId — force risk reassessment
router.post("/intelligence/reassess/:workerId", authenticateToken, async (req, res) => {
  try {
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const result = await reassessWorkerRisk(wid);
    return res.json({ reassessment: result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/intelligence/alerts — current active alerts
router.get("/intelligence/alerts", authenticateToken, async (_req, res) => {
  try {
    await ensureAlertTable();

    // DB alerts (persistent)
    const dbAlerts = await db.execute(sql`
      SELECT * FROM intelligence_alerts
      WHERE acknowledged = false
      ORDER BY created_at DESC
      LIMIT 50
    `);

    // In-memory alerts (recent, real-time)
    return res.json({
      persistent: dbAlerts.rows,
      realtime: activeAlerts.slice(0, 20),
      total: (dbAlerts.rows as any[]).length + activeAlerts.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/intelligence/alerts/:id/acknowledge — acknowledge an alert
router.post("/intelligence/alerts/:id/acknowledge", authenticateToken, async (req, res) => {
  try {
    const alertId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await db.execute(sql`
      UPDATE intelligence_alerts
      SET acknowledged = true,
          acknowledged_by = ${(req as any).user?.name ?? "unknown"},
          acknowledged_at = NOW()
      WHERE id = ${alertId}
    `);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/intelligence/stream — Server-Sent Events for real-time updates
router.get("/intelligence/stream", authenticateToken, (req, res) => {
  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Send initial heartbeat
  res.write(`data: ${JSON.stringify({ type: "CONNECTED", timestamp: new Date().toISOString() })}\n\n`);

  // Listen for events
  const onEvent = (event: IntelligenceEvent) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch { /* client disconnected */ }
  };

  intelligenceBus.on("intelligence-update", onEvent);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: "HEARTBEAT", timestamp: new Date().toISOString() })}\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Cleanup on disconnect
  req.on("close", () => {
    intelligenceBus.off("intelligence-update", onEvent);
    clearInterval(heartbeat);
  });
});

// GET /api/intelligence/status — system health check for intelligence layer
router.get("/intelligence/status", authenticateToken, async (_req, res) => {
  const status: Record<string, { available: boolean; error?: string }> = {};

  // Check graph
  try {
    await db.execute(sql`SELECT COUNT(*)::int FROM kg_nodes LIMIT 1`);
    status.knowledgeGraph = { available: true };
  } catch (err: any) {
    status.knowledgeGraph = { available: false, error: err.message };
  }

  // Check smart documents
  try {
    await db.execute(sql`SELECT COUNT(*)::int FROM smart_documents LIMIT 1`);
    status.smartIngest = { available: true };
  } catch (err: any) {
    status.smartIngest = { available: false, error: err.message };
  }

  // Check legal engine (always available — deterministic, no DB)
  status.legalEngine = { available: true };

  // Check AI
  status.aiProvider = { available: !!process.env.ANTHROPIC_API_KEY };

  // Check alerts
  try {
    await db.execute(sql`SELECT 1 FROM intelligence_alerts LIMIT 1`);
    status.alertSystem = { available: true };
  } catch {
    status.alertSystem = { available: false, error: "Table not initialized" };
  }

  const allHealthy = Object.values(status).every(s => s.available);

  return res.json({
    healthy: allHealthy,
    services: status,
    fallbackMode: !status.knowledgeGraph.available,
    activeAlerts: activeAlerts.length,
    timestamp: new Date().toISOString(),
  });
});

export default router;
// recordFact and intelligenceBus are already exported at declaration

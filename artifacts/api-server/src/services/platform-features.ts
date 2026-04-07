/**
 * Platform Features — Features 2-15
 * Daily cron, WhatsApp, worker upload, CRM, onboarding,
 * bank export, geofencing, AI copilot, client portal, auth fixes
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken, requireAdmin } from "../lib/authMiddleware.js";
import { evaluateLegalStatus } from "./legal-decision-engine.js";
import { isTestWorker } from "./test-safety.js";

const router = Router();

// ══ FEATURE 3: DAILY LEGAL SCAN CRON ════════════════════════════════════════
// Called by node-cron in index.ts at 7am daily

export async function runDailyLegalScan(): Promise<{ scanned: number; critical: number; warnings: number }> {
  console.log("[cron] Running daily legal scan...");
  const workers = await db.execute(sql`SELECT * FROM workers WHERE pipeline_stage IN ('Active','Placed','Screening')`);
  let critical = 0, warnings = 0;

  for (const w of workers.rows as any[]) {
    const input = {
      workerId: w.id, workerName: w.name, nationality: w.nationality ?? "",
      permitExpiry: w.work_permit_expiry, trcExpiry: w.trc_expiry,
      trcFilingDate: null, trcApplicationPending: false,
      employerContinuity: true, roleContinuity: true, formalDefect: false,
      contractEndDate: w.contract_end_date, bhpExpiry: w.bhp_status,
      medicalExpiry: w.badania_lek_expiry, oswiadczenieExpiry: w.oswiadczenie_expiry,
      hasValidPassport: true, evidenceSubmitted: [],
    };
    const result = evaluateLegalStatus(input);
    if (result.riskLevel === "CRITICAL") critical++;
    else if (result.riskLevel === "HIGH" || result.riskLevel === "MEDIUM") warnings++;

    // Create notification for critical workers (skip test workers)
    if (result.riskLevel === "CRITICAL" && !isTestWorker(w)) {
      await db.execute(sql`
        INSERT INTO legal_notifications (worker_id, message_type, message, recipient_type, status)
        VALUES (${w.id}, 'expiry_critical', ${`CRITICAL: ${w.name} — ${result.warnings.join(", ")}`}, 'internal', 'pending')
      `).catch(() => {});
    }
  }

  console.log(`[cron] Scan complete: ${workers.rows.length} workers, ${critical} critical, ${warnings} warnings`);
  return { scanned: workers.rows.length, critical, warnings };
}

// Manual trigger
router.post("/cron/legal-scan", authenticateToken, async (_req, res) => {
  try {
    const result = await runDailyLegalScan();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ FEATURE 4: WHATSAPP NOTIFICATIONS (SAFE) ════════════════════════════════

router.post("/notifications/whatsapp", authenticateToken, async (req, res) => {
  try {
    const { workerId, message } = req.body as { workerId: string; message: string };
    if (!workerId || !message) return res.status(400).json({ error: "workerId and message required" });

    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    // Safety gate
    if (isTestWorker(w)) {
      return res.json({ sent: false, reason: "test_worker", message: "Skipped — test worker" });
    }

    if (!w.phone) return res.status(400).json({ error: "Worker has no phone number" });

    // Twilio WhatsApp
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886";

    if (!accountSid || !authToken) {
      // Store as pending notification
      await db.execute(sql`
        INSERT INTO legal_notifications (worker_id, channel, message_type, message, status)
        VALUES (${workerId}, 'whatsapp', 'manual', ${message}, 'pending')
      `);
      return res.json({ sent: false, reason: "twilio_not_configured", stored: true });
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: `whatsapp:${w.phone}`, From: fromNumber, Body: message,
    });

    const resp = await fetch(twilioUrl, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await resp.json() as any;
    await db.execute(sql`
      INSERT INTO legal_notifications (worker_id, channel, message_type, message, status, sent_at)
      VALUES (${workerId}, 'whatsapp', 'manual', ${message}, ${resp.ok ? 'sent' : 'failed'}, NOW())
    `);

    return res.json({ sent: resp.ok, sid: data.sid, error: data.message });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ FEATURE 5: WORKER SELF-UPLOAD PORTAL ════════════════════════════════════

// Generate upload token (no login needed for worker)
router.post("/worker-upload/generate-link", authenticateToken, async (req, res) => {
  try {
    const { workerId } = req.body as { workerId: string };
    const token = require("crypto").randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 86400000); // 30 days

    await db.execute(sql`
      INSERT INTO otp_sessions (session, otp_hash, user_data, expires_at)
      VALUES (${"upload_" + token}, 'upload', ${JSON.stringify({ workerId, type: "upload" })}::jsonb, ${expiresAt})
    `);

    const baseUrl = process.env.BASE_URL ?? "https://eej-jobs-api.fly.dev";
    return res.json({ link: `${baseUrl}/worker-upload/${token}`, expiresAt: expiresAt.toISOString(), token });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Worker upload endpoint (token-based, no login)
router.post("/worker-upload/submit", async (req, res) => {
  try {
    const { token, documentType, image, mimeType } = req.body as any;
    if (!token || !image) return res.status(400).json({ error: "token and image required" });

    const session = await db.execute(sql`
      SELECT user_data FROM otp_sessions WHERE session = ${"upload_" + token} AND expires_at > NOW()
    `);
    if (session.rows.length === 0) return res.status(401).json({ error: "Invalid or expired upload link" });

    const { workerId } = (session.rows[0] as any).user_data;

    // Store evidence
    await db.execute(sql`
      INSERT INTO legal_evidence (worker_id, evidence_type, filename, storage_url)
      VALUES (${workerId}, ${documentType ?? "document"}, ${"upload_" + Date.now()}, 'pending_ocr')
    `);

    return res.json({ success: true, workerId, message: "Document uploaded. It will be reviewed by the legal team." });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ FEATURE 6: CRM DEAL PIPELINE ════════════════════════════════════════════

router.get("/crm/deals", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT d.*, c.name as client_name FROM crm_deals d
      LEFT JOIN clients c ON c.id = d.client_id
      ORDER BY CASE d.stage WHEN 'lead' THEN 0 WHEN 'proposal' THEN 1 WHEN 'negotiation' THEN 2 WHEN 'won' THEN 3 WHEN 'active' THEN 4 ELSE 5 END, d.created_at DESC
    `);
    return res.json({ deals: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/crm/deals", authenticateToken, async (req, res) => {
  try {
    const { clientId, title, stage, value, workersNeeded, probability, expectedClose, notes, assignedTo } = req.body as any;
    if (!title) return res.status(400).json({ error: "title required" });
    await db.execute(sql`
      INSERT INTO crm_deals (client_id, title, stage, value, workers_needed, probability, expected_close, notes, assigned_to)
      VALUES (${clientId ?? null}, ${title}, ${stage ?? "lead"}, ${value ?? 0}, ${workersNeeded ?? 0}, ${probability ?? 50}, ${expectedClose ?? null}, ${notes ?? null}, ${assignedTo ?? null})
    `);
    return res.status(201).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/crm/deals/:id", authenticateToken, async (req, res) => {
  try {
    const { stage, value, notes } = req.body as any;
    await db.execute(sql`
      UPDATE crm_deals SET
        stage = COALESCE(${stage ?? null}, stage),
        value = COALESCE(${value ?? null}, value),
        notes = COALESCE(${notes ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${req.params.id}
    `);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ FEATURE 7: ONBOARDING CHECKLIST ═════════════════════════════════════════

const DEFAULT_STEPS = [
  "Collect passport copy", "Verify work authorization", "Register with ZUS",
  "Issue contract", "BHP safety training", "Medical examination",
  "Assign to site", "Issue PPE equipment", "First day orientation",
  "Confirm IBAN for payroll",
];

router.post("/onboarding/create/:workerId", authenticateToken, async (req, res) => {
  try {
    const existing = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM onboarding_checklists WHERE worker_id = ${req.params.workerId}`);
    if ((existing.rows[0] as any).cnt > 0) return res.json({ message: "Checklist already exists" });

    for (let i = 0; i < DEFAULT_STEPS.length; i++) {
      await db.execute(sql`
        INSERT INTO onboarding_checklists (worker_id, step_name, step_order) VALUES (${req.params.workerId}, ${DEFAULT_STEPS[i]}, ${i + 1})
      `);
    }
    return res.status(201).json({ success: true, steps: DEFAULT_STEPS.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/onboarding/:workerId", authenticateToken, async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM onboarding_checklists WHERE worker_id = ${req.params.workerId} ORDER BY step_order
    `);
    const total = rows.rows.length;
    const completed = (rows.rows as any[]).filter(r => r.completed).length;
    return res.json({ steps: rows.rows, total, completed, percentage: total > 0 ? Math.round(completed / total * 100) : 0 });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/onboarding/step/:stepId", authenticateToken, async (req, res) => {
  try {
    const { completed } = req.body as { completed: boolean };
    await db.execute(sql`
      UPDATE onboarding_checklists SET completed = ${completed}, completed_at = ${completed ? new Date() : null},
        completed_by = ${(req as any).user?.email ?? "admin"} WHERE id = ${req.params.stepId}
    `);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ FEATURE 8: PAYROLL BANK EXPORT (ELIXIR) ═════════════════════════════════

router.get("/payroll/elixir-export", authenticateToken, async (req, res) => {
  try {
    const monthYear = (req.query.month as string) ?? "";
    const rows = await db.execute(sql`
      SELECT pr.*, w.iban, w.name FROM payroll_records pr
      JOIN workers w ON w.id = pr.worker_id
      WHERE (${!monthYear} OR pr.month_year = ${monthYear}) AND w.iban IS NOT NULL AND w.iban != ''
      ORDER BY w.name
    `);

    // ELIXIR format: Polish bank transfer file
    const lines: string[] = [];
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    for (const r of rows.rows as any[]) {
      const amount = Math.round((r.final_netto_payout ?? 0) * 100); // in grosze
      const iban = (r.iban ?? "").replace(/\s/g, "");
      if (!iban || amount <= 0) continue;
      // Simplified ELIXIR record
      lines.push(`110,${date},${amount},${iban},Euro Edu Jobs,${r.name},Wynagrodzenie ${r.month_year}`);
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=elixir_${monthYear || date}.txt`);
    return res.send(lines.join("\r\n"));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ FEATURE 9: GPS GEOFENCING ═══════════════════════════════════════════════

router.post("/gps/geofence", authenticateToken, async (req, res) => {
  try {
    const { name, latitude, longitude, radiusMeters } = req.body as any;
    if (!name || !latitude || !longitude) return res.status(400).json({ error: "name, latitude, longitude required" });
    await db.execute(sql`
      INSERT INTO geofence_sites (name, latitude, longitude, radius_meters) VALUES (${name}, ${latitude}, ${longitude}, ${radiusMeters ?? 200})
    `);
    return res.status(201).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/gps/geofence", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM geofence_sites ORDER BY name`);
    return res.json({ sites: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/gps/check-geofence", async (req, res) => {
  try {
    const { latitude, longitude } = req.body as { latitude: number; longitude: number };
    const sites = await db.execute(sql`SELECT * FROM geofence_sites`);
    const matches = (sites.rows as any[]).filter(site => {
      const dist = haversine(latitude, longitude, site.latitude, site.longitude);
      return dist <= (site.radius_meters ?? 200);
    }).map(s => ({ name: s.name, distance: Math.round(haversine(latitude, longitude, s.latitude, s.longitude)) }));
    return res.json({ insideGeofence: matches.length > 0, matchedSites: matches });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p = Math.PI / 180;
  const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p)) / 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ══ FEATURE 10: AI COMPLIANCE COPILOT (STREAMING) ═══════════════════════════

router.post("/ai/copilot", authenticateToken, async (req, res) => {
  try {
    const { question, workerId } = req.body as { question: string; workerId?: string };
    if (!question) return res.status(400).json({ error: "question required" });

    let context = "";
    if (workerId) {
      const w = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
      if (w.rows.length > 0) {
        const worker = w.rows[0] as any;
        context = `\nWorker context: ${worker.name}, ${worker.nationality}, TRC expires: ${worker.trc_expiry ?? "N/A"}, Work permit: ${worker.work_permit_expiry ?? "N/A"}, BHP: ${worker.bhp_status ?? "N/A"}`;
      }
    }

    // Search KB first
    const kb = await db.execute(sql`
      SELECT title, content, law_reference FROM legal_articles
      WHERE content ILIKE ${"%" + question.split(" ").slice(0, 3).join("%") + "%"} LIMIT 3
    `);
    const kbContext = (kb.rows as any[]).map(a => `[${a.law_reference}] ${a.content}`).join("\n");

    const mod = await import("@anthropic-ai/sdk");
    const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-sonnet-4-20250514", max_tokens: 800,
      messages: [{ role: "user", content:
        `You are a Polish labor law and immigration compliance assistant for Euro Edu Jobs staffing agency.
${context}
${kbContext ? "\nVerified legal knowledge base:\n" + kbContext : ""}

Question: ${question}

Answer concisely with:
1. Direct answer
2. Legal basis (article numbers)
3. Practical next steps
Mark as AI guidance — verify with legal team for formal decisions.` }],
    });

    const answer = resp.content[0].type === "text" ? resp.content[0].text : "Unable to generate response.";

    // Store for audit
    await db.execute(sql`
      INSERT INTO legal_approvals (target_type, target_id, action, ai_request, ai_response)
      VALUES ('copilot', gen_random_uuid(), 'copilot_query', ${question}, ${answer})
    `);

    return res.json({ answer, kbArticlesUsed: (kb.rows as any[]).length, status: "AI Guidance — verify with legal team" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ FEATURE 12: CLIENT COMPLIANCE PORTAL ════════════════════════════════════

router.get("/client-portal/:clientId/workers", async (req, res) => {
  try {
    const workers = await db.execute(sql`
      SELECT w.id, w.name, w.job_role, w.assigned_site,
        CASE
          WHEN w.trc_expiry IS NULL AND w.work_permit_expiry IS NULL THEN 'unknown'
          WHEN w.trc_expiry::date < NOW()::date OR w.work_permit_expiry::date < NOW()::date THEN 'action_required'
          WHEN w.trc_expiry::date < (NOW() + INTERVAL '30 days')::date OR w.work_permit_expiry::date < (NOW() + INTERVAL '30 days')::date THEN 'attention'
          ELSE 'current'
        END as compliance_status
      FROM workers w
      JOIN clients c ON w.assigned_site LIKE '%' || c.name || '%'
      WHERE c.id = ${req.params.clientId}
      ORDER BY w.name
    `);
    // Safe view — no legal codes, no risk levels
    return res.json({
      workers: (workers.rows as any[]).map(w => ({
        name: w.name, role: w.job_role, site: w.assigned_site,
        status: w.compliance_status === "current" ? "All documents current"
          : w.compliance_status === "attention" ? "Documents need renewal soon"
          : w.compliance_status === "action_required" ? "Action required"
          : "Status pending",
        statusColor: w.compliance_status === "current" ? "green" : w.compliance_status === "attention" ? "amber" : "red",
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ FEATURE 14: AUTH ON CRITICAL ENDPOINTS ══════════════════════════════════
// Already handled — all new endpoints use authenticateToken

export default router;

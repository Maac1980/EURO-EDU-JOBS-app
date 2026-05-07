/**
 * EEJ Escalation Engine + Weekly Digest
 *
 * TASK 1: /api/cron/daily-escalation
 *   Scans all workers. If days_remaining drops below 30d (YELLOW) or 14d (RED),
 *   updates pipeline_stage to "Action Required" and fires notifications.
 *   Dedup: logs escalations to prevent duplicate alerts for the same threshold.
 *
 * TASK 2: /api/cron/weekly-digest
 *   Queries all RED/YELLOW workers, compiles an EEJ-Blue HTML email digest,
 *   routes to sendEmailAlert() mock service.
 *
 * org_context: EEJ. No external platform dependencies.
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { safeError } from "../lib/security.js";
import { sendStatusPush, sendEmailAlert } from "./notification-engine.js";

const router = Router();

// ═══ TABLE: ESCALATION LOG (dedup tracker) ══════════════════════════════════

// ═══ TASK 1: DAILY ESCALATION ═══════════════════════════════════════════════

router.post("/cron/daily-escalation", authenticateToken, async (req, res) => {
  try {

    const recipientEmail = (req as any).user?.email ?? process.env.ALERT_EMAIL_TO ?? "anna@edu-jobs.eu";

    // Fetch all workers with expiry data
    const rows = await db.execute(sql`
      SELECT id, name, nationality, pipeline_stage,
             trc_expiry, work_permit_expiry, oswiadczenie_expiry
      FROM workers
      WHERE (trc_expiry IS NOT NULL OR work_permit_expiry IS NOT NULL OR oswiadczenie_expiry IS NOT NULL)
    `);

    const escalated: any[] = [];
    const skipped: any[] = [];

    for (const w of rows.rows as any[]) {
      const effectiveExpiry = w.trc_expiry ?? w.work_permit_expiry ?? w.oswiadczenie_expiry;
      if (!effectiveExpiry) continue;

      const daysLeft = Math.ceil((new Date(effectiveExpiry).getTime() - Date.now()) / 86400000);

      // Determine threshold
      let threshold: string | null = null;
      let priority: "critical" | "high" | null = null;
      if (daysLeft < 0) {
        threshold = "EXPIRED";
        priority = "critical";
      } else if (daysLeft <= 14) {
        threshold = "RED_14D";
        priority = "critical";
      } else if (daysLeft <= 30) {
        threshold = "YELLOW_30D";
        priority = "high";
      }

      if (!threshold || !priority) continue;

      // Dedup check: has this worker already been escalated for this threshold?
      const existing = await db.execute(sql`
        SELECT id FROM eej_escalation_log WHERE worker_id = ${w.id} AND threshold = ${threshold} LIMIT 1
      `);

      if (existing.rows.length > 0) {
        skipped.push({ workerId: w.id, name: w.name, threshold, reason: "already_escalated" });
        continue;
      }

      // Update pipeline_stage to "Action Required"
      const previousStage = w.pipeline_stage ?? "Unknown";
      await db.execute(sql`
        UPDATE workers SET pipeline_stage = 'Action Required', updated_at = NOW() WHERE id = ${w.id}
      `);

      // Send notification
      let notifId: string | null = null;
      try {
        const notif = threshold === "EXPIRED" || threshold === "RED_14D"
          ? await sendStatusPush({
              recipient: recipientEmail,
              subject: threshold === "EXPIRED"
                ? `ESCALATION: ${w.name} — permit EXPIRED (${Math.abs(daysLeft)}d ago)`
                : `ESCALATION: ${w.name} — permit expires in ${daysLeft}d`,
              body: threshold === "EXPIRED"
                ? `Worker ${w.name} (${w.nationality ?? "N/A"}) has an expired permit. Pipeline escalated to "Action Required". Suspend work assignment and consult lawyer.`
                : `Worker ${w.name} (${w.nationality ?? "N/A"}) has ${daysLeft} days remaining. Pipeline escalated to "Action Required". File via MOS portal immediately (PLN 800 TRC / PLN 400 WP).`,
              trigger: `ESCALATION_${threshold}`,
              priority,
              workerId: w.id,
              workerName: w.name,
              metadata: { daysLeft, threshold, previousStage, nationality: w.nationality },
            })
          : await sendEmailAlert({
              recipient: recipientEmail,
              subject: `ESCALATION: ${w.name} — ${daysLeft}d remaining (Yellow zone)`,
              body: `Worker ${w.name} (${w.nationality ?? "N/A"}) has ${daysLeft} days remaining. Pipeline escalated to "Action Required". Begin MOS filing process this week.`,
              trigger: `ESCALATION_${threshold}`,
              priority,
              workerId: w.id,
              workerName: w.name,
              metadata: { daysLeft, threshold, previousStage, nationality: w.nationality },
            });
        notifId = notif.id ?? null;
      } catch { /* notification is best-effort */ }

      // Log escalation (dedup insert)
      try {
        await db.execute(sql`
          INSERT INTO eej_escalation_log (worker_id, worker_name, threshold, days_remaining, previous_stage, new_stage, notification_id, org_context)
          VALUES (${w.id}, ${w.name}, ${threshold}, ${daysLeft}, ${previousStage}, 'Action Required', ${notifId}, 'EEJ')
          ON CONFLICT (worker_id, threshold) DO NOTHING
        `);
      } catch { /* dedup constraint handles duplicates */ }

      escalated.push({
        workerId: w.id,
        name: w.name,
        nationality: w.nationality,
        daysLeft,
        threshold,
        previousStage,
        newStage: "Action Required",
        notificationId: notifId,
      });
    }

    return res.json({
      cron: "DAILY_ESCALATION",
      timestamp: new Date().toISOString(),
      org_context: "EEJ",
      recipient: recipientEmail,
      results: {
        scanned: rows.rows.length,
        escalated: escalated.length,
        skipped: skipped.length,
        details: escalated,
        duplicatesSkipped: skipped,
      },
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// ═══ TASK 2: WEEKLY DIGEST EMAIL ════════════════════════════════════════════

router.post("/cron/weekly-digest", authenticateToken, async (req, res) => {
  try {
    const recipientEmail = (req as any).user?.email ?? process.env.ALERT_EMAIL_TO ?? "anna@edu-jobs.eu";

    // Fetch all workers with risk status
    const rows = await db.execute(sql`
      SELECT id, name, nationality, pipeline_stage, voivodeship,
             trc_expiry, work_permit_expiry, oswiadczenie_expiry,
             trc_filing_date, compliance_status_v2
      FROM workers
      WHERE (trc_expiry IS NOT NULL OR work_permit_expiry IS NOT NULL OR oswiadczenie_expiry IS NOT NULL)
      ORDER BY COALESCE(trc_expiry, work_permit_expiry, oswiadczenie_expiry) ASC
    `);

    // Classify into risk buckets
    const critical: any[] = [];
    const high: any[] = [];
    const medium: any[] = [];

    for (const w of rows.rows as any[]) {
      const effectiveExpiry = w.trc_expiry ?? w.work_permit_expiry ?? w.oswiadczenie_expiry;
      if (!effectiveExpiry) continue;

      const daysLeft = Math.ceil((new Date(effectiveExpiry).getTime() - Date.now()) / 86400000);
      const entry = {
        name: w.name,
        nationality: w.nationality ?? "N/A",
        daysLeft,
        expiry: effectiveExpiry,
        voivodeship: w.voivodeship ?? "—",
        stage: w.pipeline_stage ?? "—",
        hasFiling: !!w.trc_filing_date,
      };

      if (daysLeft < 0 || daysLeft <= 14) critical.push(entry);
      else if (daysLeft <= 30) high.push(entry);
      else if (daysLeft <= 60) medium.push(entry);
    }

    // Build HTML email
    const today = new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const totalAtRisk = critical.length + high.length + medium.length;

    const renderRows = (items: any[], color: string) => items.map(w =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0">${w.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8">${w.nationality}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:${color};font-weight:700">${w.daysLeft < 0 ? `EXPIRED (${Math.abs(w.daysLeft)}d ago)` : `${w.daysLeft}d`}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8">${w.voivodeship}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8">${w.hasFiling ? "Filed" : "Not filed"}</td>
      </tr>`
    ).join("");

    const htmlBody = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden">
        <div style="background:#1e293b;padding:24px 32px;border-bottom:2px solid #3b82f6">
          <h1 style="margin:0;font-size:20px;color:#ffffff">EEJ Weekly Compliance Digest</h1>
          <p style="margin:4px 0 0;font-size:12px;color:#3b82f6;font-weight:600">${today} &middot; org_context: EEJ</p>
        </div>

        <div style="padding:24px 32px">
          <div style="display:flex;gap:12px;margin-bottom:24px">
            <div style="flex:1;background:#7f1d1d20;border:1px solid #7f1d1d;border-radius:8px;padding:16px;text-align:center">
              <div style="font-size:28px;font-weight:800;color:#ef4444">${critical.length}</div>
              <div style="font-size:11px;color:#fca5a5;text-transform:uppercase;letter-spacing:1px">Critical / Expired</div>
            </div>
            <div style="flex:1;background:#78350f20;border:1px solid #92400e;border-radius:8px;padding:16px;text-align:center">
              <div style="font-size:28px;font-weight:800;color:#f59e0b">${high.length}</div>
              <div style="font-size:11px;color:#fcd34d;text-transform:uppercase;letter-spacing:1px">High (< 30d)</div>
            </div>
            <div style="flex:1;background:#1e3a5f20;border:1px solid #1d4ed8;border-radius:8px;padding:16px;text-align:center">
              <div style="font-size:28px;font-weight:800;color:#3b82f6">${medium.length}</div>
              <div style="font-size:11px;color:#93c5fd;text-transform:uppercase;letter-spacing:1px">Medium (< 60d)</div>
            </div>
          </div>

          ${critical.length > 0 ? `
          <h2 style="font-size:14px;color:#ef4444;text-transform:uppercase;letter-spacing:2px;margin:24px 0 8px;border-bottom:1px solid #7f1d1d;padding-bottom:4px">Critical / Expired</h2>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr style="text-align:left"><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px">Name</th><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase">Nationality</th><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase">Days Left</th><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase">Voivodeship</th><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase">TRC Filed</th></tr>
            ${renderRows(critical, "#ef4444")}
          </table>
          ` : ""}

          ${high.length > 0 ? `
          <h2 style="font-size:14px;color:#f59e0b;text-transform:uppercase;letter-spacing:2px;margin:24px 0 8px;border-bottom:1px solid #92400e;padding-bottom:4px">High Risk (< 30 days)</h2>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr style="text-align:left"><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px">Name</th><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase">Nationality</th><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase">Days Left</th><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase">Voivodeship</th><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase">TRC Filed</th></tr>
            ${renderRows(high, "#f59e0b")}
          </table>
          ` : ""}

          ${medium.length > 0 ? `
          <h2 style="font-size:14px;color:#3b82f6;text-transform:uppercase;letter-spacing:2px;margin:24px 0 8px;border-bottom:1px solid #1d4ed8;padding-bottom:4px">Medium Risk (< 60 days)</h2>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr style="text-align:left"><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px">Name</th><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase">Nationality</th><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase">Days Left</th><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase">Voivodeship</th><th style="padding:8px 12px;color:#64748b;font-size:10px;text-transform:uppercase">TRC Filed</th></tr>
            ${renderRows(medium, "#3b82f6")}
          </table>
          ` : ""}

          ${totalAtRisk === 0 ? `
          <div style="text-align:center;padding:40px 0;color:#22c55e">
            <div style="font-size:32px;margin-bottom:8px">&#10004;</div>
            <div style="font-size:16px;font-weight:700">All Clear</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px">No workers in critical, high, or medium risk zones this week.</div>
          </div>
          ` : ""}

          <div style="margin-top:24px;padding:16px;background:#1e293b;border-radius:8px;border:1px solid #334155">
            <p style="margin:0;font-size:12px;color:#94a3b8"><strong style="color:#3b82f6">MOS 2026 Reminder:</strong> TRC fee PLN 800, Work Permit PLN 400. All filings must be digital via <a href="https://mos.cudzoziemcy.gov.pl" style="color:#60a5fa">mos.cudzoziemcy.gov.pl</a>.</p>
          </div>
        </div>

        <div style="padding:16px 32px;background:#1e293b;border-top:1px solid #334155;text-align:center">
          <p style="margin:0;font-size:10px;color:#64748b">EEJ Recruitment Platform &middot; org_context: EEJ &middot; Auto-generated digest</p>
        </div>
      </div>
    `;

    // Send via mock notification engine
    const notification = await sendEmailAlert({
      recipient: recipientEmail,
      subject: `EEJ Weekly Digest: ${totalAtRisk} worker(s) at risk — ${critical.length} critical, ${high.length} high, ${medium.length} medium`,
      body: htmlBody,
      trigger: "WEEKLY_DIGEST",
      priority: critical.length > 0 ? "critical" : high.length > 0 ? "high" : "medium",
      metadata: {
        totalAtRisk,
        critical: critical.length,
        high: high.length,
        medium: medium.length,
        weekOf: today,
      },
    });

    return res.json({
      cron: "WEEKLY_DIGEST",
      timestamp: new Date().toISOString(),
      org_context: "EEJ",
      recipient: recipientEmail,
      notificationId: notification.id,
      summary: {
        totalAtRisk,
        critical: critical.length,
        high: high.length,
        medium: medium.length,
        totalScanned: rows.rows.length,
      },
      workers: {
        critical: critical.map(w => ({ name: w.name, daysLeft: w.daysLeft, nationality: w.nationality })),
        high: high.map(w => ({ name: w.name, daysLeft: w.daysLeft, nationality: w.nationality })),
        medium: medium.map(w => ({ name: w.name, daysLeft: w.daysLeft, nationality: w.nationality })),
      },
      note: "MOCK MODE — email HTML generated and logged, not sent externally",
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// ═══ GET: Escalation history ════════════════════════════════════════════════

router.get("/escalation/history", authenticateToken, async (req, res) => {
  try {
    const { workerId, limit: lim } = req.query as { workerId?: string; limit?: string };
    const maxRows = Math.min(parseInt(lim ?? "50", 10), 200);

    const rows = workerId
      ? await db.execute(sql`SELECT * FROM eej_escalation_log WHERE worker_id = ${workerId} AND org_context = 'EEJ' ORDER BY created_at DESC LIMIT ${maxRows}`)
      : await db.execute(sql`SELECT * FROM eej_escalation_log WHERE org_context = 'EEJ' ORDER BY created_at DESC LIMIT ${maxRows}`);

    return res.json({ escalations: rows.rows, total: rows.rows.length });
  } catch (err: any) {
    return safeError(res, err);
  }
});

export default router;

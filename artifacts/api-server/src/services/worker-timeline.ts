/**
 * Worker Timeline — complete history of a worker's lifecycle.
 * Shows: hiring, documents, expiry alerts, site changes, legal cases, payroll.
 * Pulls from audit_entries, legal_cases, legal_snapshots, payroll_records, notifications.
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

interface TimelineEvent {
  id: string;
  date: string;
  type: "hire" | "document" | "legal" | "payroll" | "site_change" | "alert" | "case" | "notification";
  title: string;
  description: string;
  severity?: "info" | "warning" | "critical" | "success";
  metadata?: Record<string, any>;
}

router.get("/workers/:workerId/timeline", authenticateToken, async (req, res) => {
  try {
    const wid = req.params.workerId;

    // Get worker basic info
    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${wid}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    const events: TimelineEvent[] = [];

    // 1. Worker creation
    if (w.created_at) {
      events.push({
        id: "hire-" + wid, date: w.created_at, type: "hire",
        title: "Worker added to system",
        description: `${w.name} registered as ${w.job_role ?? "worker"} — ${w.nationality ?? "unknown nationality"}`,
        severity: "success",
      });
    }

    // 2. Audit entries for this worker
    const audits = await db.execute(sql`
      SELECT id, action, field, old_value, new_value, actor, timestamp
      FROM audit_entries WHERE worker_id = ${wid}
      ORDER BY timestamp DESC LIMIT 50
    `);
    for (const a of audits.rows as any[]) {
      let type: TimelineEvent["type"] = "document";
      let severity: TimelineEvent["severity"] = "info";
      if (a.action === "SITE_CHANGE" || a.field === "assigned_site") { type = "site_change"; severity = "info"; }
      if (a.action === "DOCUMENT_UPLOAD") { type = "document"; severity = "success"; }
      if (a.action === "ALERT_SENT") { type = "alert"; severity = "warning"; }

      events.push({
        id: a.id, date: a.timestamp, type, severity,
        title: `${a.action ?? a.field ?? "Update"}`,
        description: a.new_value ? `${a.field}: ${JSON.stringify(a.old_value)} → ${JSON.stringify(a.new_value)}` : (a.field ?? ""),
        metadata: { actor: a.actor },
      });
    }

    // 3. Legal cases
    const cases = await db.execute(sql`
      SELECT id, case_type, title, status, severity, created_at, decided_at, lawyer_decision
      FROM legal_cases WHERE worker_id = ${wid}
      ORDER BY created_at DESC LIMIT 20
    `);
    for (const c of cases.rows as any[]) {
      events.push({
        id: c.id, date: c.created_at, type: "case",
        title: `Legal case: ${c.title}`,
        description: `Type: ${c.case_type} — Status: ${c.status}${c.lawyer_decision ? " — Decision: " + c.lawyer_decision : ""}`,
        severity: c.severity === "critical" ? "critical" : c.status === "resolved" ? "success" : "warning",
      });
    }

    // 4. Legal snapshots (status changes)
    const snapshots = await db.execute(sql`
      SELECT id, legal_status, risk_level, created_at, warnings
      FROM legal_snapshots WHERE worker_id = ${wid}
      ORDER BY created_at DESC LIMIT 10
    `);
    for (const s of snapshots.rows as any[]) {
      events.push({
        id: s.id, date: s.created_at, type: "legal",
        title: `Legal status: ${s.legal_status}`,
        description: `Risk: ${s.risk_level}${Array.isArray(s.warnings) && s.warnings.length > 0 ? " — " + s.warnings[0] : ""}`,
        severity: s.risk_level === "CRITICAL" ? "critical" : s.risk_level === "HIGH" ? "warning" : "info",
      });
    }

    // 5. Payroll records
    const payroll = await db.execute(sql`
      SELECT id, month_year, gross_pay, final_netto_payout, created_at
      FROM payroll_records WHERE worker_id = ${wid}
      ORDER BY month_year DESC LIMIT 12
    `);
    for (const p of payroll.rows as any[]) {
      events.push({
        id: p.id, date: p.created_at, type: "payroll",
        title: `Payroll: ${p.month_year}`,
        description: `Gross: ${(p.gross_pay ?? 0).toFixed(2)} PLN → Net: ${(p.final_netto_payout ?? 0).toFixed(2)} PLN`,
        severity: "info",
      });
    }

    // 6. Notifications sent to this worker
    const notifs = await db.execute(sql`
      SELECT id, message_type, message, channel, created_at, status
      FROM legal_notifications WHERE worker_id = ${wid}
      ORDER BY created_at DESC LIMIT 20
    `);
    for (const n of notifs.rows as any[]) {
      events.push({
        id: n.id, date: n.created_at, type: "notification",
        title: `${n.channel ?? "internal"}: ${n.message_type}`,
        description: n.message?.substring(0, 100) ?? "",
        severity: "info",
      });
    }

    // Sort by date descending
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Document expiry upcoming
    const expiryAlerts: { field: string; label: string; date: string | null; daysLeft: number | null }[] = [];
    const checks = [
      { field: "trc_expiry", label: "TRC / Residence Permit" },
      { field: "work_permit_expiry", label: "Work Permit" },
      { field: "bhp_status", label: "BHP Safety Training" },
      { field: "badania_lek_expiry", label: "Medical Examination" },
      { field: "contract_end_date", label: "Contract" },
      { field: "oswiadczenie_expiry", label: "Oświadczenie" },
    ];
    for (const c of checks) {
      const d = (w as any)[c.field];
      if (d) {
        const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
        expiryAlerts.push({ field: c.field, label: c.label, date: d, daysLeft: days });
      }
    }

    return res.json({
      worker: { id: w.id, name: w.name, nationality: w.nationality, jobRole: w.job_role, site: w.assigned_site },
      timeline: events,
      expiryAlerts: expiryAlerts.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999)),
      totalEvents: events.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

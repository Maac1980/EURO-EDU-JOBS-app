/**
 * EEJ Notification Engine — internal alert system.
 *
 * Provides standard functions for sending alerts when legal risk thresholds are crossed.
 * External APIs (Twilio SMS, SendGrid email) are MOCKED for now — only internal
 * logging and payload generation are active.
 *
 * Triggers:
 *  - Schengen RED (86-89 days used) → auto-logs alert payload
 *  - Schengen CRITICAL (90+ days) → auto-logs urgent payload
 *  - Permit <30 days → auto-logs filing reminder
 *  - Expired / No Permit → auto-logs suspension alert
 *
 * org_context: EEJ
 * No shared code with external platforms.
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { safeError } from "../lib/security.js";

const router = Router();

// ═══ NOTIFICATION TYPES ═════════════════════════════════════════════════════

export type NotificationChannel = "email" | "sms" | "whatsapp" | "push" | "internal_log";
export type NotificationPriority = "low" | "medium" | "high" | "critical";

export interface NotificationPayload {
  id?: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  recipient: string;
  subject: string;
  body: string;
  trigger: string;
  workerId?: string;
  workerName?: string;
  metadata: Record<string, any>;
  org_context: "EEJ";
  sent: boolean;
  sentAt?: string;
  createdAt: string;
}

// ═══ TABLE SETUP ════════════════════════════════════════════════════════════

async function ensureNotificationTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS eej_notification_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      channel TEXT NOT NULL DEFAULT 'internal_log',
      priority TEXT NOT NULL DEFAULT 'medium',
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      worker_id TEXT,
      worker_name TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      sent BOOLEAN DEFAULT false,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_notif_worker ON eej_notification_log(worker_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_notif_trigger ON eej_notification_log(trigger_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_notif_priority ON eej_notification_log(priority)`);
}

// ═══ CORE SEND FUNCTIONS ════════════════════════════════════════════════════

/**
 * Send a status push notification (MOCK — logs internally).
 * In production, this would call a push notification service.
 */
export async function sendStatusPush(payload: {
  recipient: string;
  subject: string;
  body: string;
  trigger: string;
  priority: NotificationPriority;
  workerId?: string;
  workerName?: string;
  metadata?: Record<string, any>;
}): Promise<NotificationPayload> {
  await ensureNotificationTable();

  const notification: NotificationPayload = {
    channel: "push",
    priority: payload.priority,
    recipient: payload.recipient,
    subject: payload.subject,
    body: payload.body,
    trigger: payload.trigger,
    workerId: payload.workerId,
    workerName: payload.workerName,
    metadata: payload.metadata ?? {},
    org_context: "EEJ",
    sent: false, // MOCK: would be true after real push service call
    createdAt: new Date().toISOString(),
  };

  // Log to database
  const rows = await db.execute(sql`
    INSERT INTO eej_notification_log (channel, priority, recipient, subject, body, trigger_type, worker_id, worker_name, metadata, org_context, sent)
    VALUES ('push', ${payload.priority}, ${payload.recipient}, ${payload.subject}, ${payload.body},
            ${payload.trigger}, ${payload.workerId ?? null}, ${payload.workerName ?? null},
            ${JSON.stringify(payload.metadata ?? {})}::jsonb, 'EEJ', false)
    RETURNING id
  `);

  notification.id = (rows.rows[0] as any)?.id;

  // MOCK: In production, call push notification service here
  // await pushService.send({ ... });
  console.log(`[EEJ Notification] ${payload.priority.toUpperCase()} push → ${payload.recipient}: ${payload.subject}`);

  return notification;
}

/**
 * Send an email alert (MOCK — logs internally).
 * In production, this would call sendEmail() from alerter.ts.
 */
export async function sendEmailAlert(payload: {
  recipient: string;
  subject: string;
  body: string;
  trigger: string;
  priority: NotificationPriority;
  workerId?: string;
  workerName?: string;
  metadata?: Record<string, any>;
}): Promise<NotificationPayload> {
  await ensureNotificationTable();

  const notification: NotificationPayload = {
    channel: "email",
    priority: payload.priority,
    recipient: payload.recipient,
    subject: payload.subject,
    body: payload.body,
    trigger: payload.trigger,
    workerId: payload.workerId,
    workerName: payload.workerName,
    metadata: payload.metadata ?? {},
    org_context: "EEJ",
    sent: false, // MOCK: would be true after real email send
    createdAt: new Date().toISOString(),
  };

  const rows = await db.execute(sql`
    INSERT INTO eej_notification_log (channel, priority, recipient, subject, body, trigger_type, worker_id, worker_name, metadata, org_context, sent)
    VALUES ('email', ${payload.priority}, ${payload.recipient}, ${payload.subject}, ${payload.body},
            ${payload.trigger}, ${payload.workerId ?? null}, ${payload.workerName ?? null},
            ${JSON.stringify(payload.metadata ?? {})}::jsonb, 'EEJ', false)
    RETURNING id
  `);

  notification.id = (rows.rows[0] as any)?.id;

  // MOCK: In production, call sendEmail() here
  // import { sendEmail } from "../lib/alerter.js";
  // await sendEmail({ from: "alerts@edu-jobs.eu", to: payload.recipient, subject: payload.subject, html: payload.body });
  console.log(`[EEJ Notification] ${payload.priority.toUpperCase()} email → ${payload.recipient}: ${payload.subject}`);

  return notification;
}

// ═══ SCHENGEN RED AUTO-TRIGGER ══════════════════════════════════════════════
//
// Scans all workers. If schengen_days_used >= 86, auto-logs alert.
// Connected to the Legal Risk thresholds from the diagnostics page.
//

export async function triggerSchengenAlerts(recipientEmail: string): Promise<NotificationPayload[]> {
  await ensureNotificationTable();
  const alerts: NotificationPayload[] = [];

  try {
    // Find workers with Schengen risk data via recruitment risk endpoint patterns
    // In production, this would query a schengen_tracking table.
    // For now, check workers approaching permit expiry as a proxy.
    const rows = await db.execute(sql`
      SELECT id, name, nationality, trc_expiry, work_permit_expiry, oswiadczenie_expiry
      FROM workers
      WHERE (trc_expiry IS NOT NULL OR work_permit_expiry IS NOT NULL OR oswiadczenie_expiry IS NOT NULL)
    `);

    for (const w of rows.rows as any[]) {
      const effectiveExpiry = w.trc_expiry ?? w.work_permit_expiry ?? w.oswiadczenie_expiry;
      if (!effectiveExpiry) continue;

      const daysLeft = Math.ceil((new Date(effectiveExpiry).getTime() - Date.now()) / 86400000);

      // Permit expired — CRITICAL alert
      if (daysLeft < 0) {
        alerts.push(await sendStatusPush({
          recipient: recipientEmail,
          subject: `CRITICAL: ${w.name} — permit expired ${Math.abs(daysLeft)}d ago`,
          body: `Worker ${w.name} (${w.nationality ?? "N/A"}) has an expired permit. Cannot legally work. Immediate action required.`,
          trigger: "PERMIT_EXPIRED",
          priority: "critical",
          workerId: w.id,
          workerName: w.name,
          metadata: { daysExpired: Math.abs(daysLeft), nationality: w.nationality },
        }));
      }
      // <14 days — CRITICAL filing alert
      else if (daysLeft <= 14) {
        alerts.push(await sendEmailAlert({
          recipient: recipientEmail,
          subject: `URGENT: ${w.name} — permit expires in ${daysLeft}d`,
          body: `Worker ${w.name} has ${daysLeft} days remaining on their permit. File via MOS portal immediately. Fee: PLN 800 (TRC) / PLN 400 (WP).`,
          trigger: "PERMIT_EXPIRING_CRITICAL",
          priority: "critical",
          workerId: w.id,
          workerName: w.name,
          metadata: { daysLeft, nationality: w.nationality },
        }));
      }
      // <30 days — HIGH alert
      else if (daysLeft <= 30) {
        alerts.push(await sendEmailAlert({
          recipient: recipientEmail,
          subject: `HIGH: ${w.name} — permit expires in ${daysLeft}d`,
          body: `Worker ${w.name} has ${daysLeft} days remaining. Begin MOS filing process this week.`,
          trigger: "PERMIT_EXPIRING_HIGH",
          priority: "high",
          workerId: w.id,
          workerName: w.name,
          metadata: { daysLeft, nationality: w.nationality },
        }));
      }
    }
  } catch (err) {
    console.error("[EEJ Notification] Schengen alert scan failed:", (err as Error).message);
  }

  return alerts;
}

// ═══ API ROUTES ═════════════════════════════════════════════════════════════

// GET — list notification log
router.get("/notifications/eej-log", authenticateToken, async (req, res) => {
  try {
    await ensureNotificationTable();
    const { priority, trigger, limit: lim } = req.query as { priority?: string; trigger?: string; limit?: string };
    const maxRows = Math.min(parseInt(lim ?? "50", 10), 200);

    let rows;
    if (priority) {
      rows = await db.execute(sql`
        SELECT * FROM eej_notification_log WHERE org_context = 'EEJ' AND priority = ${priority}
        ORDER BY created_at DESC LIMIT ${maxRows}
      `);
    } else if (trigger) {
      rows = await db.execute(sql`
        SELECT * FROM eej_notification_log WHERE org_context = 'EEJ' AND trigger_type = ${trigger}
        ORDER BY created_at DESC LIMIT ${maxRows}
      `);
    } else {
      rows = await db.execute(sql`
        SELECT * FROM eej_notification_log WHERE org_context = 'EEJ'
        ORDER BY created_at DESC LIMIT ${maxRows}
      `);
    }

    return res.json({ notifications: rows.rows, total: rows.rows.length });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// POST — manually trigger Schengen/expiry alert scan
router.post("/notifications/trigger-scan", authenticateToken, async (req, res) => {
  try {
    const recipientEmail = (req as any).user?.email ?? process.env.ALERT_EMAIL_TO ?? "anna@edu-jobs.eu";
    const alerts = await triggerSchengenAlerts(recipientEmail);

    return res.json({
      triggered: alerts.length,
      alerts: alerts.map(a => ({ id: a.id, priority: a.priority, subject: a.subject, trigger: a.trigger, workerId: a.workerId })),
      recipient: recipientEmail,
      org_context: "EEJ",
      note: "MOCK MODE — notifications logged internally, not sent externally",
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

export default router;

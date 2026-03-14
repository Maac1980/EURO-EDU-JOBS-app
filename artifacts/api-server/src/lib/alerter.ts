import nodemailer from "nodemailer";
import cron from "node-cron";
import { fetchAllRecords } from "./airtable.js";
import { mapRecordToWorker } from "./compliance.js";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

interface AlertEntry {
  name: string;
  doc: string;
  expiry: string;
  days: number;
}

async function checkAndAlert(): Promise<void> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const emailTo = process.env.ALERT_EMAIL_TO;

  if (!apiKey) {
    console.log("[alerter] AIRTABLE_API_KEY not set — skipping expiry check");
    return;
  }
  if (!emailTo) {
    console.log("[alerter] ALERT_EMAIL_TO not set — skipping email delivery");
    return;
  }

  try {
    const records = await fetchAllRecords();
    const workers = records.map(mapRecordToWorker);
    const THRESHOLD_DAYS = 14;
    const alerts: AlertEntry[] = [];

    for (const w of workers) {
      if (w.trcExpiry) {
        const days = daysUntil(w.trcExpiry);
        if (days !== null && days >= 0 && days <= THRESHOLD_DAYS) {
          alerts.push({ name: w.name, doc: "TRC Certificate", expiry: w.trcExpiry, days });
        }
      }
      if (w.bhpStatus && w.bhpStatus.includes("-")) {
        const days = daysUntil(w.bhpStatus);
        if (days !== null && days >= 0 && days <= THRESHOLD_DAYS) {
          alerts.push({ name: w.name, doc: "BHP Certificate", expiry: w.bhpStatus, days });
        }
      }
      if (w.workPermitExpiry) {
        const days = daysUntil(w.workPermitExpiry);
        if (days !== null && days >= 0 && days <= THRESHOLD_DAYS) {
          alerts.push({ name: w.name, doc: "Work Permit", expiry: w.workPermitExpiry, days });
        }
      }
    }

    if (alerts.length === 0) {
      console.log(`[alerter] ✓ Check complete — no documents expiring within ${THRESHOLD_DAYS} days`);
      return;
    }

    console.warn(`[alerter] ⚠ Found ${alerts.length} document(s) expiring within ${THRESHOLD_DAYS} days`);

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
    const smtpPort = Number(process.env.SMTP_PORT ?? "587");
    const smtpFrom = process.env.SMTP_FROM ?? smtpUser;

    if (!smtpUser || !smtpPass) {
      console.warn("[alerter] SMTP_USER/SMTP_PASS not configured — logging alerts only:");
      for (const a of alerts) {
        console.warn(`  ⚠  ${a.name} | ${a.doc} | Expiry: ${a.expiry} | ${a.days} day(s) left`);
      }
      return;
    }

    const tableRows = alerts
      .map(
        (a) => `
        <tr style="border-bottom:1px solid #efefef;">
          <td style="padding:10px 14px;font-weight:700;color:#222;">${a.name}</td>
          <td style="padding:10px 14px;color:#444;">${a.doc}</td>
          <td style="padding:10px 14px;font-family:monospace;color:#444;">${a.expiry}</td>
          <td style="padding:10px 14px;font-weight:800;color:${a.days <= 7 ? "#dc2626" : "#d97706"};">${a.days} day${a.days !== 1 ? "s" : ""}</td>
        </tr>`
      )
      .join("");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:620px;margin:0 auto;">
    <div style="background:#E9FF70;padding:22px 28px;border-radius:10px 10px 0 0;">
      <h1 style="margin:0;color:#333333;font-size:22px;font-weight:900;letter-spacing:0.04em;">⚠ EEJ DOCUMENT EXPIRY ALERT</h1>
      <p style="margin:5px 0 0;color:#555;font-size:13px;font-weight:600;">EURO EDU JOBS · Automated Compliance System</p>
    </div>
    <div style="background:#ffffff;padding:24px 28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
      <p style="margin:0 0 18px;color:#333;font-size:14px;line-height:1.6;">
        <strong>${alerts.length} document${alerts.length !== 1 ? "s" : ""}</strong> are expiring within
        <strong>14 days</strong> and require immediate attention.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;">
        <thead>
          <tr style="background:#f7f7f7;">
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#666;">Candidate</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#666;">Document</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#666;">Expiry Date</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#666;">Days Left</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p style="margin:20px 0 0;color:#999;font-size:11px;line-height:1.6;">
        This is an automated message from your EURO EDU JOBS compliance portal.
        Log in to take action on expiring documents. Do not reply to this email.
      </p>
    </div>
    <p style="text-align:center;color:#bbb;font-size:10px;margin:14px 0 0;">
      EURO EDU JOBS · International Recruitment &amp; Compliance · Automated System
    </p>
  </div>
</body>
</html>`;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `EURO EDU JOBS Compliance <${smtpFrom}>`,
      to: emailTo,
      subject: `⚠ EEJ Alert: ${alerts.length} Document${alerts.length !== 1 ? "s" : ""} Expiring Within 14 Days`,
      html,
    });

    console.log(`[alerter] ✓ Alert email sent to ${emailTo} — ${alerts.length} document(s)`);
  } catch (err) {
    console.error("[alerter] Error during check:", err);
  }
}

export function startAlerter(): void {
  const emailTo = process.env.ALERT_EMAIL_TO;
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!apiKey) {
    console.warn("[alerter] AIRTABLE_API_KEY not set — expiry alerts disabled");
    return;
  }

  if (!emailTo) {
    console.warn("[alerter] ALERT_EMAIL_TO not set — expiry alerts disabled. Set this secret to enable.");
    return;
  }

  setTimeout(() => {
    console.log("[alerter] Running initial expiry check…");
    checkAndAlert();
  }, 15_000);

  cron.schedule("0 8 * * *", () => {
    console.log("[alerter] Running scheduled daily expiry check…");
    checkAndAlert();
  });

  console.log(`[alerter] ✓ Expiry alert system active — daily check at 08:00, alerting → ${emailTo}`);
}

import nodemailer from "nodemailer";
import cron from "node-cron";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { fetchAllRecords } from "./airtable.js";
import { mapRecordToWorker } from "./compliance.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_FILE = join(__dirname, "../../data/admin-profile.json");

interface AdminProfile {
  fullName: string;
  email: string;
  phone: string;
  role: string;
}

function getAdminProfile(): AdminProfile | null {
  try {
    if (existsSync(PROFILE_FILE)) {
      return JSON.parse(readFileSync(PROFILE_FILE, "utf-8")) as AdminProfile;
    }
  } catch {}
  return null;
}

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
  zone: "red" | "yellow";
}

async function checkAndAlert(): Promise<void> {
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!apiKey) {
    console.log("[alerter] AIRTABLE_API_KEY not set — skipping expiry check");
    return;
  }

  // Resolve alert recipient: admin profile email takes priority, then env var fallback
  const adminProfile = getAdminProfile();
  const emailTo = adminProfile?.email || process.env.ALERT_EMAIL_TO;

  if (!emailTo) {
    console.log("[alerter] No alert recipient configured — skipping email delivery");
    return;
  }

  try {
    const records = await fetchAllRecords();
    const workers = records.map(mapRecordToWorker);
    const alerts: AlertEntry[] = [];

    for (const w of workers) {
      const docs: Array<{ type: string; date: string | null }> = [
        { type: "TRC Residence Card", date: w.trcExpiry },
        { type: "Work Permit", date: w.workPermitExpiry },
        { type: "Contract End Date", date: w.contractEndDate },
      ];
      if (w.bhpStatus && /\d{4}/.test(w.bhpStatus)) {
        docs.push({ type: "BHP Certificate", date: w.bhpStatus });
      }

      for (const doc of docs) {
        if (!doc.date) continue;
        const days = daysUntil(doc.date);
        if (days === null || days < 0) continue;

        if (days < 30) {
          alerts.push({ name: w.name, doc: doc.type, expiry: doc.date, days, zone: "red" });
          console.warn(`[alerter] 🔴 CRITICAL: ${w.name} | ${doc.type} | ${days} day(s) left — alert prepared for ${adminProfile?.fullName ?? "Admin"} (${emailTo})`);
        } else if (days < 60) {
          alerts.push({ name: w.name, doc: doc.type, expiry: doc.date, days, zone: "yellow" });
        }
      }
    }

    if (alerts.length === 0) {
      console.log("[alerter] ✓ Check complete — all documents are in the GREEN zone (60+ days)");
      return;
    }

    const redAlerts = alerts.filter((a) => a.zone === "red");
    const yellowAlerts = alerts.filter((a) => a.zone === "yellow");

    console.warn(`[alerter] ⚠ Found ${redAlerts.length} RED (critical <30d) and ${yellowAlerts.length} YELLOW (warning <60d) documents`);

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
    const smtpPort = Number(process.env.SMTP_PORT ?? "587");
    const smtpFrom = process.env.SMTP_FROM ?? smtpUser;

    if (!smtpUser || !smtpPass) {
      console.warn("[alerter] SMTP not configured — alerts logged only (no email sent)");
      return;
    }

    const makeRow = (a: AlertEntry) => `
      <tr style="border-bottom:1px solid #efefef;background:${a.zone === "red" ? "#fff5f5" : "#fffbeb"};">
        <td style="padding:10px 14px;font-weight:700;color:#222;">${a.name}</td>
        <td style="padding:10px 14px;color:#444;">${a.doc}</td>
        <td style="padding:10px 14px;font-family:monospace;color:#444;">${a.expiry}</td>
        <td style="padding:10px 14px;font-weight:800;color:${a.zone === "red" ? "#dc2626" : "#d97706"};">
          ${a.days} day${a.days !== 1 ? "s" : ""} ${a.zone === "red" ? "🔴 CRITICAL" : "⚠ WARNING"}
        </td>
      </tr>`;

    const allRows = [...redAlerts, ...yellowAlerts].map(makeRow).join("");

    const adminInfo = adminProfile
      ? `<p style="margin:12px 0 0;padding:12px;background:#f0fdf4;border-radius:6px;font-size:12px;color:#166534;">
           <strong>Alert recipient:</strong> ${adminProfile.fullName} · ${adminProfile.email}${adminProfile.phone ? ` · ${adminProfile.phone}` : ""}
         </p>`
      : "";

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:660px;margin:0 auto;">
    <div style="background:#E9FF70;padding:22px 28px;border-radius:10px 10px 0 0;">
      <h1 style="margin:0;color:#333333;font-size:22px;font-weight:900;letter-spacing:0.04em;">⚠ EEJ COMPLIANCE ALERT</h1>
      <p style="margin:5px 0 0;color:#555;font-size:13px;font-weight:600;">EURO EDU JOBS · Document Compliance Engine</p>
    </div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
      <p style="margin:0 0 6px;color:#333;font-size:14px;">
        <strong style="color:#dc2626;">${redAlerts.length} CRITICAL</strong> document${redAlerts.length !== 1 ? "s" : ""} expiring within 30 days.
        <strong style="color:#d97706;">${yellowAlerts.length} WARNING</strong> expiring within 60 days.
      </p>
      ${adminInfo}
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-top:18px;">
        <thead>
          <tr style="background:#f7f7f7;">
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;color:#666;">Worker</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;color:#666;">Document</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;color:#666;">Expiry Date</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;color:#666;">Status</th>
          </tr>
        </thead>
        <tbody>${allRows}</tbody>
      </table>
      <p style="margin:20px 0 0;color:#999;font-size:11px;">
        This is an automated message from the EEJ Compliance Engine. Log in to take action. Do not reply.
      </p>
    </div>
  </div>
</body></html>`;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `EURO EDU JOBS Compliance <${smtpFrom}>`,
      to: emailTo,
      subject: `🔴 EEJ Alert: ${redAlerts.length} Critical + ${yellowAlerts.length} Warning Document${alerts.length !== 1 ? "s" : ""}`,
      html,
    });

    console.log(`[alerter] ✓ Alert email sent to ${emailTo} — ${redAlerts.length} critical, ${yellowAlerts.length} warning`);
  } catch (err) {
    console.error("[alerter] Error during check:", err);
  }
}

export function startAlerter(): void {
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!apiKey) {
    console.warn("[alerter] AIRTABLE_API_KEY not set — expiry alerts disabled");
    return;
  }

  // Run 15s after startup for an initial check
  setTimeout(() => {
    console.log("[alerter] Running initial compliance scan…");
    checkAndAlert();
  }, 15_000);

  // Daily at 08:00
  cron.schedule("0 8 * * *", () => {
    console.log("[alerter] Running scheduled daily compliance scan…");
    checkAndAlert();
  });

  const adminProfile = getAdminProfile();
  const recipient = adminProfile?.email ?? process.env.ALERT_EMAIL_TO ?? "not configured";
  console.log(`[alerter] ✓ Compliance engine active — daily scan at 08:00, alerts → ${recipient}`);
}

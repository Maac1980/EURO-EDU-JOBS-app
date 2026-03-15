import nodemailer from "nodemailer";
import cron from "node-cron";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { fetchAllRecords } from "./airtable.js";
import { mapRecordToWorker } from "./compliance.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_FILE = join(__dirname, "../../data/admin-profile.json");
const USERS_FILE = join(__dirname, "../../data/users.json");

function getCoordinatorEmails(): string[] {
  try {
    if (!existsSync(USERS_FILE)) return [];
    const data = JSON.parse(readFileSync(USERS_FILE, "utf-8")) as { users: Array<{ email: string; role: string; site?: string | null }> };
    return data.users
      .filter((u) => u.role === "coordinator" && u.email)
      .map((u) => u.email)
      .filter(Boolean);
  } catch { return []; }
}

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
  zone: "red" | "yellow" | "green";
}

export interface AlertResult {
  scanned: number;
  docsFound: number;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  emailSent: boolean;
  emailTo: string | null;
  error: string | null;
  alerts: AlertEntry[];
}

export async function checkAndAlert(testMode = false): Promise<AlertResult> {
  const result: AlertResult = {
    scanned: 0,
    docsFound: 0,
    redCount: 0,
    yellowCount: 0,
    greenCount: 0,
    emailSent: false,
    emailTo: null,
    error: null,
    alerts: [],
  };

  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!apiKey) {
    result.error = "AIRTABLE_API_KEY not configured in Secrets.";
    return result;
  }

  const adminProfile = getAdminProfile();
  const emailTo = adminProfile?.email || process.env.ALERT_EMAIL_TO;
  result.emailTo = emailTo ?? null;

  // In test mode include ALL documents (threshold=9999d), normal mode: red<30, yellow<60
  const RED_THRESHOLD = testMode ? 9999 : 30;
  const YELLOW_THRESHOLD = testMode ? 9999 : 60;

  try {
    const records = await fetchAllRecords();
    const workers = records.map(mapRecordToWorker);
    result.scanned = workers.length;

    for (const w of workers) {
      const docs: Array<{ type: string; date: string | null }> = [
        { type: "TRC Residence Card", date: w.trcExpiry },
        { type: "Work Permit", date: w.workPermitExpiry },
        { type: "Contract End Date", date: w.contractEndDate },
        { type: "Badania Lekarskie (Medical)", date: w.badaniaLekExpiry },
        { type: "Oświadczenie (Work Declaration)", date: w.oswiadczenieExpiry },
        { type: "UDT Certificate", date: w.udtCertExpiry },
      ];
      if (w.bhpStatus && /\d{4}/.test(w.bhpStatus)) {
        docs.push({ type: "BHP Certificate", date: w.bhpStatus });
      }

      for (const doc of docs) {
        if (!doc.date) continue;
        const days = daysUntil(doc.date);
        if (days === null) continue;

        const zone: "red" | "yellow" | "green" =
          days < 30 ? "red" : days < 60 ? "yellow" : "green";

        // Include if within threshold for current mode
        const includeInAlert = testMode || days < YELLOW_THRESHOLD;
        if (!includeInAlert) continue;

        const entry: AlertEntry = { name: w.name, doc: doc.type, expiry: doc.date, days, zone };
        result.alerts.push(entry);
        result.docsFound++;
        if (zone === "red") result.redCount++;
        else if (zone === "yellow") result.yellowCount++;
        else result.greenCount++;

        if (!testMode && zone === "red") {
          console.warn(`[alerter] 🔴 CRITICAL: ${w.name} | ${doc.type} | ${days}d left — alert queued for ${adminProfile?.fullName ?? "Admin"} (${emailTo})`);
        }
      }
    }

    if (result.docsFound === 0) {
      console.log("[alerter] ✓ Scan complete — no documents to alert on");
      return result;
    }

    if (!emailTo) {
      result.error = "No alert recipient configured. Save an email in Admin Settings or set ALERT_EMAIL_TO secret.";
      return result;
    }

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
    const smtpPort = Number(process.env.SMTP_PORT ?? "587");
    const smtpFrom = process.env.SMTP_FROM ?? smtpUser;

    if (!smtpUser || !smtpPass) {
      result.error = "SMTP not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT to Secrets to send emails.";
      return result;
    }

    const zoneColor = (z: string) => z === "red" ? "#dc2626" : z === "yellow" ? "#d97706" : "#16a34a";
    const zoneLabel = (z: string, d: number) =>
      z === "red" ? `🔴 ${d}d — CRITICAL` : z === "yellow" ? `⚠ ${d}d — WARNING` : `✓ ${d}d — OK`;

    const rows = result.alerts
      .sort((a, b) => a.days - b.days)
      .map((a) => `
        <tr style="border-bottom:1px solid #f0f0f0;background:${a.zone === "red" ? "#fff5f5" : a.zone === "yellow" ? "#fffbeb" : "#f0fdf4"};">
          <td style="padding:10px 14px;font-weight:700;color:#111;">${a.name}</td>
          <td style="padding:10px 14px;color:#444;">${a.doc}</td>
          <td style="padding:10px 14px;font-family:monospace;color:#555;">${a.expiry}</td>
          <td style="padding:10px 14px;font-weight:800;color:${zoneColor(a.zone)};">${zoneLabel(a.zone, a.days)}</td>
        </tr>`)
      .join("");

    const adminLine = adminProfile
      ? `<p style="margin:14px 0 0;padding:10px 14px;background:#f0fdf4;border-radius:6px;font-size:12px;color:#166534;">
           <strong>Recipient:</strong> ${adminProfile.fullName} — ${adminProfile.email}${adminProfile.phone ? ` — ${adminProfile.phone}` : ""}
         </p>`
      : "";

    const modeNote = testMode
      ? `<p style="margin:0 0 12px;padding:8px 14px;background:#fefce8;border:1px solid #fde047;border-radius:6px;font-size:12px;color:#854d0e;font-weight:700;">
           🧪 TEST MODE — showing all ${result.docsFound} document(s) regardless of expiry zone
         </p>`
      : "";

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:680px;margin:0 auto;">
    <div style="background:#E9FF70;padding:22px 28px;border-radius:10px 10px 0 0;">
      <h1 style="margin:0;color:#333;font-size:22px;font-weight:900;letter-spacing:0.04em;">
        ${testMode ? "🧪 EEJ TEST ALERT" : "⚠ EEJ COMPLIANCE ALERT"}
      </h1>
      <p style="margin:5px 0 0;color:#555;font-size:13px;font-weight:600;">EURO EDU JOBS · Document Compliance Engine${testMode ? " · Test Mode" : ""}</p>
    </div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
      ${modeNote}
      <p style="margin:0 0 6px;color:#333;font-size:14px;">
        Scanned <strong>${result.scanned}</strong> workers.
        Found <strong style="color:#dc2626;">${result.redCount} critical</strong>,
        <strong style="color:#d97706;">${result.yellowCount} warning</strong>,
        <strong style="color:#16a34a;">${result.greenCount} compliant</strong> documents.
      </p>
      <p style="margin:4px 0 14px;font-size:12px;color:#888;">
        These dates come from <strong>all sources</strong> — manually entered in Airtable AND auto-populated by document scans.
      </p>
      ${adminLine}
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e0e0e0;margin-top:18px;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f7f7f7;">
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;color:#666;">Worker</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;color:#666;">Document</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;color:#666;">Expiry</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;color:#666;">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:20px 0 0;color:#999;font-size:11px;">
        Automated message from EEJ Compliance Engine. Do not reply to this email.
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

    const coordinatorEmails = getCoordinatorEmails().filter((e) => e !== emailTo);

    await transporter.sendMail({
      from: `EURO EDU JOBS Compliance <${smtpFrom}>`,
      to: emailTo,
      ...(coordinatorEmails.length > 0 ? { cc: coordinatorEmails.join(", ") } : {}),
      subject: testMode
        ? `🧪 EEJ Test Alert — ${result.docsFound} documents found across ${result.scanned} workers`
        : `⚠ EEJ Alert: ${result.redCount} Critical + ${result.yellowCount} Warning documents`,
      html,
    });

    result.emailSent = true;
    console.log(`[alerter] ✓ ${testMode ? "Test" : ""} alert email sent to ${emailTo}`);
    return result;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = msg;
    console.error("[alerter] Error:", msg);
    return result;
  }
}

export function startAlerter(): void {
  if (!process.env.AIRTABLE_API_KEY) {
    console.warn("[alerter] AIRTABLE_API_KEY not set — expiry alerts disabled");
    return;
  }

  setTimeout(() => {
    console.log("[alerter] Running initial compliance scan…");
    checkAndAlert(false);
  }, 15_000);

  cron.schedule("0 8 * * *", () => {
    console.log("[alerter] Running scheduled daily compliance scan…");
    checkAndAlert(false);
  });

  const adminProfile = getAdminProfile();
  const recipient = adminProfile?.email ?? process.env.ALERT_EMAIL_TO ?? "not configured";
  console.log(`[alerter] ✓ Compliance engine active — daily scan at 08:00, alerts → ${recipient}`);
}

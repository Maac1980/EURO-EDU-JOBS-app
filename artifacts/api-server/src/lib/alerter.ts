import nodemailer from "nodemailer";
import twilio from "twilio";
import cron from "node-cron";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { fetchAllRecords } from "./airtable.js";
import { mapRecordToWorker } from "./compliance.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_FILE = join(__dirname, "../../data/admin-profile.json");
const USERS_FILE = join(__dirname, "../../data/users.json");
const ALERT_RESULT_FILE = join(__dirname, "../../data/last-alert-result.json");

interface PersistedAlertResult extends AlertResult {
  ranAt: string;
}

function persistAlertResult(result: AlertResult): void {
  try {
    mkdirSync(join(__dirname, "../../data"), { recursive: true });
    const persisted: PersistedAlertResult = { ...result, ranAt: new Date().toISOString() };
    writeFileSync(ALERT_RESULT_FILE, JSON.stringify(persisted, null, 2), "utf-8");
  } catch { /* non-critical */ }
}

export function getLastAlertStatus(): PersistedAlertResult | null {
  try {
    if (!existsSync(ALERT_RESULT_FILE)) return null;
    return JSON.parse(readFileSync(ALERT_RESULT_FILE, "utf-8")) as PersistedAlertResult;
  } catch { return null; }
}

// ── Phone normalization ───────────────────────────────────────────────────────
function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-().]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) p = "+48" + p;
  return p;
}

// ── Twilio WhatsApp / SMS ─────────────────────────────────────────────────────
export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const rawFrom = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886";
  if (!accountSid || !authToken) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured.");
  const client = twilio(accountSid, authToken);
  const toNum = normalizePhone(to);
  const from = rawFrom.startsWith("whatsapp:") ? rawFrom : `whatsapp:${rawFrom}`;
  await client.messages.create({ from, to: `whatsapp:${toNum}`, body });
}

export async function sendSmsMessage(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;
  if (!accountSid || !authToken) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured.");
  if (!from) throw new Error("TWILIO_SMS_FROM not set.");
  const client = twilio(accountSid, authToken);
  const toNum = normalizePhone(to);
  await client.messages.create({ from, to: toNum, body });
}

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
      persistAlertResult(result);
      return result;
    }

    if (!emailTo) {
      result.error = "No alert recipient configured. Save an email in Admin Settings or set ALERT_EMAIL_TO secret.";
      persistAlertResult(result);
      return result;
    }

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
    const smtpPort = Number(process.env.SMTP_PORT ?? "587");
    const smtpFrom = process.env.SMTP_FROM ?? smtpUser;

    if (!smtpUser || !smtpPass) {
      result.error = "SMTP not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT to Secrets to send emails.";
      persistAlertResult(result);
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

    // WhatsApp alert to admin phone (if Twilio configured and admin has a phone number)
    const adminPhone = adminProfile?.phone || process.env.ADMIN_PHONE;
    if (adminPhone && process.env.TWILIO_ACCOUNT_SID && !testMode) {
      const criticals = result.alerts
        .filter((a) => a.zone === "red")
        .slice(0, 5)
        .map((a) => `🔴 ${a.name} | ${a.doc} | ${a.days}d`)
        .join("\n");
      const waBody = `⚠ EEJ COMPLIANCE ALERT\n\nScanned ${result.scanned} workers.\n${result.redCount} critical, ${result.yellowCount} warning.\n\n${criticals}\n\nReview in EEJ dashboard.`;
      sendWhatsAppMessage(adminPhone, waBody)
        .then(() => console.log(`[alerter] ✓ WhatsApp alert sent to admin (${adminPhone})`))
        .catch((e: Error) => console.warn(`[alerter] WhatsApp alert skipped: ${e.message}`));
    }

    persistAlertResult(result);
    return result;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = msg;
    console.error("[alerter] Error:", msg);
    persistAlertResult(result);
    return result;
  }
}

// ── Worker direct expiry reminders ───────────────────────────────────────────
// Called daily or on-demand. Emails each worker whose document expires within 30 days.
export async function sendWorkerExpiryReminders(): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const result = { sent: 0, skipped: 0, errors: [] as string[] };

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT ?? "587");
  const smtpFrom = process.env.SMTP_FROM ?? smtpUser;

  if (!smtpUser || !smtpPass) {
    result.errors.push("SMTP not configured.");
    return result;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost, port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  let workers;
  try {
    const records = await fetchAllRecords();
    workers = records.map(mapRecordToWorker);
  } catch (err) {
    result.errors.push(`Airtable fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const DOCS: Array<{ label: string; key: keyof typeof workers[0] }> = [
    { label: "Pozwolenie na pracę", key: "workPermitExpiry" },
    { label: "Karta Pobytu (TRC)", key: "trcExpiry" },
    { label: "Koniec umowy", key: "contractEndDate" },
    { label: "Badania lekarskie", key: "badaniaLekExpiry" },
    { label: "Oświadczenie", key: "oswiadczenieExpiry" },
    { label: "Cert. UDT", key: "udtCertExpiry" },
  ];

  for (const worker of workers) {
    if (!worker.email) { result.skipped++; continue; }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiring: Array<{ label: string; expiry: string; days: number }> = [];

    for (const { label, key } of DOCS) {
      const val = worker[key] as string | null;
      if (!val) continue;
      const exp = new Date(val); exp.setHours(0, 0, 0, 0);
      const days = Math.round((exp.getTime() - today.getTime()) / 86400000);
      if (days >= 0 && days <= 30) expiring.push({ label, expiry: val, days });
    }

    if (expiring.length === 0) { result.skipped++; continue; }

    const rows = expiring.map((e) =>
      `<tr><td style="padding:8px 12px;font-weight:700;">${e.label}</td>
       <td style="padding:8px 12px;font-family:monospace;">${e.expiry}</td>
       <td style="padding:8px 12px;font-weight:800;color:${e.days <= 7 ? "#dc2626" : "#d97706"};">${e.days} dni</td></tr>`
    ).join("");

    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:24px;background:#f5f5f5;">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;">
        <div style="background:#333;padding:20px 28px;"><h2 style="color:#E9FF70;margin:0;font-size:18px;">EURO EDU JOBS — Przypomnienie o dokumentach</h2></div>
        <div style="padding:24px 28px;">
          <p>Cześć <strong>${worker.name}</strong>,</p>
          <p>Twoje dokumenty wygasają wkrótce. Skontaktuj się z koordynatorem, aby je odnowić.</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #eee;margin:16px 0;">
            <thead><tr style="background:#f7f7f7;">
              <th style="padding:8px 12px;text-align:left;">Dokument</th>
              <th style="padding:8px 12px;text-align:left;">Data wygaśnięcia</th>
              <th style="padding:8px 12px;text-align:left;">Pozostało dni</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="color:#888;font-size:11px;">EURO EDU JOBS · edu-jobs.eu</p>
        </div>
      </div>
    </body></html>`;

    try {
      await transporter.sendMail({
        from: `EURO EDU JOBS <${smtpFrom}>`,
        to: worker.email,
        subject: `Ważne: Twoje dokumenty wygasają za ${expiring[0].days} dni — EEJ`,
        html,
      });
      result.sent++;

      // Also send WhatsApp reminder to worker if they have a phone and Twilio is configured
      if (worker.phone && process.env.TWILIO_ACCOUNT_SID) {
        const waBody = `Cześć ${worker.name} 👋\n\nTwoje dokumenty wygasają wkrótce:\n\n${expiring.map((e) => `📋 ${e.label} — za ${e.days} dni (${e.expiry})`).join("\n")}\n\nSkontaktuj się z koordynatorem, aby je odnowić.\n\n— EURO EDU JOBS`;
        sendWhatsAppMessage(worker.phone, waBody)
          .then(() => console.log(`[alerter] ✓ WhatsApp reminder sent to ${worker.name}`))
          .catch((e: Error) => result.errors.push(`${worker.name} WhatsApp: ${e.message}`));
      }
    } catch (err) {
      result.errors.push(`${worker.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}

// ── Payslip email to worker ───────────────────────────────────────────────────
export async function sendPayslipEmail(
  workerEmail: string,
  workerName: string,
  monthYear: string,
  pdfBuffer: Buffer,
  payslipData?: {
    totalHours: number; hourlyRate: number; grossPay: number;
    advancesDeducted: number; penaltiesDeducted: number;
    zusDeducted: number; finalNettoPayout: number; siteLocation: string;
  }
): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT ?? "587");
  const smtpFrom = process.env.SMTP_FROM ?? smtpUser;

  if (!smtpUser || !smtpPass) throw new Error("SMTP not configured.");

  const transporter = nodemailer.createTransport({
    host: smtpHost, port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const tableRows = payslipData ? `
    <tr><td style="padding:10px 16px;color:#555;border-bottom:1px solid #f0f0f0">Godziny przepracowane</td><td style="padding:10px 16px;font-weight:bold;text-align:right;border-bottom:1px solid #f0f0f0">${payslipData.totalHours.toFixed(1)} h</td></tr>
    <tr><td style="padding:10px 16px;color:#555;border-bottom:1px solid #f0f0f0">Stawka godzinowa (netto)</td><td style="padding:10px 16px;font-weight:bold;text-align:right;border-bottom:1px solid #f0f0f0">${payslipData.hourlyRate.toFixed(2)} zł</td></tr>
    <tr style="background:#fafafa"><td style="padding:10px 16px;color:#555;border-bottom:1px solid #f0f0f0">Wynagrodzenie brutto</td><td style="padding:10px 16px;font-weight:bold;text-align:right;border-bottom:1px solid #f0f0f0">${payslipData.grossPay.toFixed(2)} zł</td></tr>
    ${payslipData.zusDeducted > 0 ? `<tr><td style="padding:10px 16px;color:#e55;border-bottom:1px solid #f0f0f0">Składki ZUS pracownika (11,26%)</td><td style="padding:10px 16px;color:#e55;font-weight:bold;text-align:right;border-bottom:1px solid #f0f0f0">- ${payslipData.zusDeducted.toFixed(2)} zł</td></tr>` : ""}
    <tr><td style="padding:10px 16px;color:#555;border-bottom:1px solid #f0f0f0">Zaliczki potrącone</td><td style="padding:10px 16px;color:#e55;font-weight:bold;text-align:right;border-bottom:1px solid #f0f0f0">- ${payslipData.advancesDeducted.toFixed(2)} zł</td></tr>
    <tr style="background:#fafafa"><td style="padding:10px 16px;color:#555;border-bottom:1px solid #f0f0f0">Kary potrącone</td><td style="padding:10px 16px;color:#e55;font-weight:bold;text-align:right;border-bottom:1px solid #f0f0f0">- ${payslipData.penaltiesDeducted.toFixed(2)} zł</td></tr>
    <tr style="background:#333333"><td style="padding:14px 16px;color:#E9FF70;font-weight:900;font-size:15px">DO WYPŁATY NETTO</td><td style="padding:14px 16px;color:#E9FF70;font-weight:900;font-size:18px;text-align:right">${payslipData.finalNettoPayout.toFixed(2)} zł</td></tr>
  ` : `<tr style="background:#333333"><td colspan="2" style="padding:14px 16px;color:#E9FF70;font-weight:900;text-align:center">Szczegóły w załączonym pliku PDF</td></tr>`;

  const htmlBody = `
  <!DOCTYPE html><html><head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <tr><td style="background:#333333;padding:24px 32px">
        <table width="100%"><tr>
          <td><span style="color:#E9FF70;font-size:22px;font-weight:900;letter-spacing:-0.5px">EURO EDU JOBS</span><br><span style="color:#aaa;font-size:11px;letter-spacing:2px">ODCINEK WYPŁATY / PAYSLIP</span></td>
          <td style="text-align:right"><span style="color:#E9FF70;font-size:18px;font-weight:700">${monthYear}</span></td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#f8f8f8;padding:20px 32px;border-bottom:2px solid #E9FF70">
        <p style="margin:0;font-size:18px;font-weight:700;color:#333">${workerName}</p>
        ${payslipData ? `<p style="margin:4px 0 0;font-size:12px;color:#888">Lokacja: ${payslipData.siteLocation || "—"}</p>` : ""}
      </td></tr>
      <tr><td style="padding:0">
        <table width="100%" cellpadding="0" cellspacing="0">${tableRows}</table>
      </td></tr>
      <tr><td style="padding:20px 32px;background:#f9f9f9;border-top:1px solid #eee">
        <p style="margin:0;font-size:11px;color:#aaa;text-align:center">EURO EDU JOBS · edu-jobs.eu · Wygenerowano: ${new Date().toLocaleDateString("pl-PL")}</p>
        <p style="margin:8px 0 0;font-size:10px;color:#ccc;text-align:center">Odcinek wypłaty w formacie PDF w załączniku.</p>
      </td></tr>
    </table>
  </body></html>`;

  await transporter.sendMail({
    from: `EURO EDU JOBS Payroll <${smtpFrom}>`,
    to: workerEmail,
    subject: `Twój odcinek wypłaty za ${monthYear} — EURO EDU JOBS`,
    html: htmlBody,
    attachments: [{
      filename: `Payslip_${workerName.replace(/\s+/g, "_")}_${monthYear}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    }],
  });
}

// ── Login OTP email ────────────────────────────────────────────────────────────
export async function sendLoginOtp(
  toEmail: string,
  name: string,
  otp: string
): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT ?? "587");
  const smtpFrom = process.env.SMTP_FROM ?? smtpUser;

  if (!smtpUser || !smtpPass) throw new Error("SMTP not configured for email OTP.");

  const transporter = nodemailer.createTransport({
    host: smtpHost, port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: `EURO EDU JOBS Security <${smtpFrom}>`,
    to: toEmail,
    subject: `Twój kod logowania EEJ: ${otp}`,
    html: `
    <!DOCTYPE html><html><head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
        <tr><td style="background:#333;padding:24px 32px">
          <span style="color:#E9FF70;font-size:20px;font-weight:900">EURO EDU JOBS</span><br>
          <span style="color:#aaa;font-size:10px;letter-spacing:2px">SECURE LOGIN</span>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:15px;color:#333">Cześć, <strong>${name}</strong></p>
          <p style="margin:0 0 24px;font-size:13px;color:#666">Twój jednorazowy kod logowania do portalu EEJ:</p>
          <div style="background:#333;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px">
            <span style="color:#E9FF70;font-size:36px;font-weight:900;letter-spacing:12px;font-family:monospace">${otp}</span>
          </div>
          <p style="margin:0;font-size:11px;color:#aaa">Kod wygasa za <strong>10 minut</strong>. Nie udostępniaj go nikomu.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f9f9f9;border-top:1px solid #eee">
          <p style="margin:0;font-size:10px;color:#ccc;text-align:center">EURO EDU JOBS · edu-jobs.eu</p>
        </td></tr>
      </table>
    </body></html>`,
  });
}

// ── Weekly digest email ───────────────────────────────────────────────────────
export async function sendWeeklyDigest(): Promise<{ sent: boolean; error?: string }> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT ?? "587");
  const smtpFrom = process.env.SMTP_FROM ?? smtpUser;
  if (!smtpUser || !smtpPass) return { sent: false, error: "SMTP not configured." };

  const adminProfile = getAdminProfile();
  const to = adminProfile?.email ?? process.env.ALERT_EMAIL_TO;
  if (!to) return { sent: false, error: "No recipient configured." };

  let workers: ReturnType<typeof mapRecordToWorker>[];
  try {
    const records = await fetchAllRecords();
    workers = records.map(mapRecordToWorker);
  } catch (err) { return { sent: false, error: `Airtable: ${err instanceof Error ? err.message : String(err)}` }; }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in30 = new Date(today.getTime() + 30 * 86400_000);

  const DOCS = [
    { label: "TRC", key: "trcExpiry" as const },
    { label: "Work Permit", key: "workPermitExpiry" as const },
    { label: "Contract", key: "contractEndDate" as const },
  ];

  // Group by site
  const bySite: Record<string, Array<{ name: string; doc: string; expiry: string; days: number }>> = {};
  for (const w of workers) {
    const site = (w as any).siteLocation || "Bench";
    for (const d of DOCS) {
      const dateStr = w[d.key];
      if (!dateStr) continue;
      const exp = new Date(dateStr); exp.setHours(0, 0, 0, 0);
      const days = Math.round((exp.getTime() - today.getTime()) / 86400_000);
      if (days <= 30) {
        if (!bySite[site]) bySite[site] = [];
        bySite[site].push({ name: w.name, doc: d.label, expiry: dateStr, days });
      }
    }
  }

  const total = Object.values(bySite).reduce((s, arr) => s + arr.length, 0);
  if (total === 0) return { sent: false };

  const siteBlocks = Object.entries(bySite).map(([site, items]) => `
    <tr><td colspan="3" style="padding:10px 0 4px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#E9FF70;border-top:1px solid #333">${site}</td></tr>
    ${items.map(({ name, doc, expiry, days }) => `
      <tr>
        <td style="padding:4px 8px 4px 0;font-size:12px;color:#fff;font-weight:700">${name}</td>
        <td style="padding:4px 8px;font-size:12px;color:#aaa;font-family:monospace">${doc}</td>
        <td style="padding:4px 0;font-size:12px;font-family:monospace;font-weight:900;color:${days < 0 ? "#ef4444" : days < 14 ? "#f87171" : "#f59e0b"}">${days < 0 ? "WYGASŁ" : `${days}d`}</td>
      </tr>`).join("")}
  `).join("");

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#111;font-family:Arial,sans-serif">
    <table width="600" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#1a1a1a;border-radius:12px;overflow:hidden">
      <tr><td style="padding:24px 32px;background:#E9FF70">
        <p style="margin:0;font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:3px;color:#333">EURO EDU JOBS</p>
        <p style="margin:4px 0 0;font-size:12px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px">Tygodniowy Raport Zgodności</p>
      </td></tr>
      <tr><td style="padding:24px 32px">
        <p style="margin:0 0 16px;font-size:13px;color:#aaa">Poniżej lista <strong style="color:#fff">${total} dokumentów</strong> wygasających w ciągu <strong style="color:#E9FF70">30 dni</strong> (${new Date().toLocaleDateString("pl-PL")} — ${in30.toLocaleDateString("pl-PL")}).</p>
        <table width="100%" cellpadding="0" cellspacing="0">${siteBlocks}</table>
      </td></tr>
      <tr><td style="padding:16px 32px;background:#111;border-top:1px solid #333">
        <p style="margin:0;font-size:10px;color:#555;text-align:center">EURO EDU JOBS · edu-jobs.eu — Wysyłane automatycznie każdy poniedziałek 08:00</p>
      </td></tr>
    </table>
  </body></html>`;

  try {
    const transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpPort === 465, auth: { user: smtpUser, pass: smtpPass } });
    await transporter.sendMail({
      from: `"EEJ Compliance" <${smtpFrom}>`,
      to,
      subject: `[EEJ] Tygodniowy Raport — ${total} dok. do odnowienia`,
      html,
    });
    console.log(`[alerter] ✓ Weekly digest sent → ${to} (${total} items)`);
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
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

  cron.schedule("0 9 * * *", () => {
    console.log("[alerter] Running scheduled worker expiry reminder emails…");
    sendWorkerExpiryReminders().then((r) => {
      console.log(`[alerter] Worker reminders: ${r.sent} sent, ${r.skipped} skipped, ${r.errors.length} errors`);
    });
  });

  cron.schedule("0 8 * * 1", () => {
    console.log("[alerter] Running weekly digest (Monday 08:00)…");
    sendWeeklyDigest().then((r) => {
      if (r.sent) console.log("[alerter] ✓ Weekly digest sent");
      else if (r.error) console.warn(`[alerter] Weekly digest skipped: ${r.error}`);
      else console.log("[alerter] Weekly digest: no expiries in next 30d — skipped");
    });
  });

  const adminProfile = getAdminProfile();
  const recipient = adminProfile?.email ?? process.env.ALERT_EMAIL_TO ?? "not configured";
  console.log(`[alerter] ✓ Compliance engine active — daily 08:00, weekly Mon 08:00, alerts → ${recipient}`);
}

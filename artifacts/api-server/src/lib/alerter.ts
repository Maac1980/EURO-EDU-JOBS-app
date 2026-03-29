import nodemailer from "nodemailer";
import { Resend } from "resend";
import twilio from "twilio";
import cron from "node-cron";
import { db, schema } from "../db/index.js";
import { toWorker, type Worker } from "./compliance.js";
import { desc, sql } from "drizzle-orm";

// ── Universal email sender: Resend (HTTPS) preferred, SMTP fallback ──────────
export async function sendEmail(opts: {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;

  if (resendKey) {
    const resend = new Resend(resendKey);
    const toArr = Array.isArray(opts.to) ? opts.to : [opts.to];
    const payload: Parameters<typeof resend.emails.send>[0] = {
      from: opts.from,
      to: toArr,
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.attachments?.length) {
      payload.attachments = opts.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
      }));
    }
    const { error } = await resend.emails.send(payload);
    if (error) throw new Error((error as any).message ?? JSON.stringify(error));
    return;
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT ?? "587");
  if (!smtpUser || !smtpPass) {
    throw new Error("No email transport configured. Add RESEND_API_KEY or SMTP_USER/SMTP_PASS.");
  }
  const transporter = nodemailer.createTransport({
    host: smtpHost, port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transporter.sendMail({
    from: opts.from,
    to: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
}

// ── Alert result persistence (PostgreSQL) ────────────────────────────────────
async function persistAlertResult(result: AlertResult): Promise<void> {
  try {
    await db.insert(schema.alertResults).values({ result: JSON.parse(JSON.stringify(result)) });
  } catch { /* non-critical */ }
}

export async function getLastAlertStatus(): Promise<any | null> {
  try {
    const [last] = await db.select().from(schema.alertResults).orderBy(desc(schema.alertResults.ranAt)).limit(1);
    if (!last) return null;
    return { ...(last.result as any), ranAt: last.ranAt?.toISOString() };
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

async function getCoordinatorEmails(): Promise<string[]> {
  try {
    const users = await db.select().from(schema.users);
    return users.filter(u => u.role === "coordinator" && u.email).map(u => u.email);
  } catch { return []; }
}

async function getAdminProfile(): Promise<{ fullName: string; email: string; phone: string; role: string } | null> {
  try {
    const [profile] = await db.select().from(schema.adminProfile);
    return profile ? { fullName: profile.fullName, email: profile.email, phone: profile.phone ?? "", role: profile.role ?? "Administrator" } : null;
  } catch { return null; }
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
    scanned: 0, docsFound: 0, redCount: 0, yellowCount: 0, greenCount: 0,
    emailSent: false, emailTo: null, error: null, alerts: [],
  };

  const adminProfile = await getAdminProfile();
  const emailTo = adminProfile?.email || process.env.ALERT_EMAIL_TO;
  result.emailTo = emailTo ?? null;

  const RED_THRESHOLD = testMode ? 9999 : 30;
  const YELLOW_THRESHOLD = testMode ? 9999 : 60;

  try {
    const rows = await db.select().from(schema.workers);
    const workers = rows.map(r => toWorker(r));
    result.scanned = workers.length;

    for (const w of workers) {
      const docs: Array<{ type: string; date: string | null }> = [
        { type: "TRC Residence Card", date: w.trcExpiry },
        { type: "Work Permit", date: w.workPermitExpiry },
        { type: "Contract End Date", date: w.contractEndDate },
        { type: "Badania Lekarskie (Medical)", date: w.badaniaLekExpiry },
        { type: "Oswiadczenie (Work Declaration)", date: w.oswiadczenieExpiry },
        { type: "UDT Certificate", date: w.udtCertExpiry },
      ];
      if (w.bhpStatus && /\d{4}/.test(w.bhpStatus)) {
        docs.push({ type: "BHP Certificate", date: w.bhpStatus });
      }

      for (const doc of docs) {
        if (!doc.date) continue;
        const days = daysUntil(doc.date);
        if (days === null) continue;
        const zone: "red" | "yellow" | "green" = days < 30 ? "red" : days < 60 ? "yellow" : "green";
        const includeInAlert = testMode || days < YELLOW_THRESHOLD;
        if (!includeInAlert) continue;

        result.alerts.push({ name: w.name, doc: doc.type, expiry: doc.date, days, zone });
        result.docsFound++;
        if (zone === "red") result.redCount++;
        else if (zone === "yellow") result.yellowCount++;
        else result.greenCount++;
      }
    }

    if (result.docsFound === 0) {
      console.log("[alerter] Scan complete — no documents to alert on");
      await persistAlertResult(result);
      return result;
    }

    if (!emailTo) {
      result.error = "No alert recipient configured.";
      await persistAlertResult(result);
      return result;
    }

    const smtpFrom = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@edu-jobs.eu";
    const resendKey = process.env.RESEND_API_KEY;
    const smtpReady = !!(process.env.SMTP_USER && process.env.SMTP_PASS);

    if (!resendKey && !smtpReady) {
      result.error = "No email transport configured.";
      await persistAlertResult(result);
      return result;
    }

    const zoneColor = (z: string) => z === "red" ? "#dc2626" : z === "yellow" ? "#d97706" : "#16a34a";
    const zoneLabel = (z: string, d: number) =>
      z === "red" ? `${d}d — CRITICAL` : z === "yellow" ? `${d}d — WARNING` : `${d}d — OK`;

    const htmlRows = result.alerts.sort((a, b) => a.days - b.days).map((a) => `
      <tr style="border-bottom:1px solid #f0f0f0;background:${a.zone === "red" ? "#fff5f5" : a.zone === "yellow" ? "#fffbeb" : "#f0fdf4"};">
        <td style="padding:10px 14px;font-weight:700;color:#111;">${a.name}</td>
        <td style="padding:10px 14px;color:#444;">${a.doc}</td>
        <td style="padding:10px 14px;font-family:monospace;color:#555;">${a.expiry}</td>
        <td style="padding:10px 14px;font-weight:800;color:${zoneColor(a.zone)};">${zoneLabel(a.zone, a.days)}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:680px;margin:0 auto;">
    <div style="background:#E9FF70;padding:22px 28px;border-radius:10px 10px 0 0;">
      <h1 style="margin:0;color:#333;font-size:22px;font-weight:900;">
        ${testMode ? "EEJ TEST ALERT" : "EEJ COMPLIANCE ALERT"}
      </h1>
      <p style="margin:5px 0 0;color:#555;font-size:13px;">EURO EDU JOBS Document Compliance Engine</p>
    </div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
      <p style="margin:0 0 6px;color:#333;font-size:14px;">
        Scanned <strong>${result.scanned}</strong> workers.
        <strong style="color:#dc2626;">${result.redCount} critical</strong>,
        <strong style="color:#d97706;">${result.yellowCount} warning</strong>,
        <strong style="color:#16a34a;">${result.greenCount} compliant</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e0e0e0;margin-top:18px;">
        <thead><tr style="background:#f7f7f7;">
          <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;color:#666;">Worker</th>
          <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;color:#666;">Document</th>
          <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;color:#666;">Expiry</th>
          <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:800;color:#666;">Status</th>
        </tr></thead>
        <tbody>${htmlRows}</tbody>
      </table>
    </div>
  </div>
</body></html>`;

    const coordinatorEmails = (await getCoordinatorEmails()).filter((e) => e !== emailTo);
    const toList = [emailTo, ...coordinatorEmails];

    await sendEmail({
      from: `EURO EDU JOBS Compliance <${smtpFrom}>`,
      to: toList,
      subject: testMode
        ? `EEJ Test Alert — ${result.docsFound} documents across ${result.scanned} workers`
        : `EEJ Alert: ${result.redCount} Critical + ${result.yellowCount} Warning documents`,
      html,
    });

    result.emailSent = true;
    console.log(`[alerter] Alert email sent to ${emailTo}`);

    const adminPhone = adminProfile?.phone || process.env.ADMIN_PHONE;
    if (adminPhone && process.env.TWILIO_ACCOUNT_SID && !testMode) {
      const criticals = result.alerts.filter(a => a.zone === "red").slice(0, 5)
        .map(a => `${a.name} | ${a.doc} | ${a.days}d`).join("\n");
      sendWhatsAppMessage(adminPhone, `EEJ COMPLIANCE ALERT\n\n${result.redCount} critical, ${result.yellowCount} warning.\n\n${criticals}`)
        .catch((e: Error) => console.warn(`[alerter] WhatsApp alert skipped: ${e.message}`));
    }

    await persistAlertResult(result);
    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.error("[alerter] Error:", result.error);
    await persistAlertResult(result);
    return result;
  }
}

// ── Worker direct expiry reminders ───────────────────────────────────────────
export async function sendWorkerExpiryReminders(): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const result = { sent: 0, skipped: 0, errors: [] as string[] };
  const smtpFrom = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@edu-jobs.eu";

  let workers: Worker[];
  try {
    const rows = await db.select().from(schema.workers);
    workers = rows.map(r => toWorker(r));
  } catch (err) {
    result.errors.push(`DB fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const DOCS: Array<{ label: string; key: keyof Worker }> = [
    { label: "Pozwolenie na prace", key: "workPermitExpiry" },
    { label: "Karta Pobytu (TRC)", key: "trcExpiry" },
    { label: "Koniec umowy", key: "contractEndDate" },
    { label: "Badania lekarskie", key: "badaniaLekExpiry" },
    { label: "Oswiadczenie", key: "oswiadczenieExpiry" },
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

    const rows = expiring.map(e =>
      `<tr><td style="padding:8px 12px;font-weight:700;">${e.label}</td>
       <td style="padding:8px 12px;font-family:monospace;">${e.expiry}</td>
       <td style="padding:8px 12px;font-weight:800;color:${e.days <= 7 ? "#dc2626" : "#d97706"};">${e.days} dni</td></tr>`
    ).join("");

    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:24px;background:#f5f5f5;">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;">
        <div style="background:#333;padding:20px 28px;"><h2 style="color:#E9FF70;margin:0;">EURO EDU JOBS — Przypomnienie o dokumentach</h2></div>
        <div style="padding:24px 28px;">
          <p>Czesc <strong>${worker.name}</strong>,</p>
          <p>Twoje dokumenty wygasaja wkrotce. Skontaktuj sie z koordynatorem.</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #eee;margin:16px 0;">
            <thead><tr style="background:#f7f7f7;">
              <th style="padding:8px 12px;text-align:left;">Dokument</th>
              <th style="padding:8px 12px;text-align:left;">Data wygasniecia</th>
              <th style="padding:8px 12px;text-align:left;">Pozostalo dni</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </body></html>`;

    try {
      await sendEmail({ from: `EURO EDU JOBS <${smtpFrom}>`, to: worker.email, subject: `Wazne: Twoje dokumenty wygasaja za ${expiring[0].days} dni`, html });
      result.sent++;
      if (worker.phone && process.env.TWILIO_ACCOUNT_SID) {
        const waBody = `Czesc ${worker.name}\n\nTwoje dokumenty wygasaja:\n${expiring.map(e => `${e.label} — za ${e.days} dni`).join("\n")}\n\n— EURO EDU JOBS`;
        sendWhatsAppMessage(worker.phone, waBody).catch((e: Error) => result.errors.push(`${worker.name} WhatsApp: ${e.message}`));
      }
    } catch (err) {
      result.errors.push(`${worker.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}

// ── Payslip email ───────────────────────────────────────────────────────────
export async function sendPayslipEmail(
  workerEmail: string, workerName: string, monthYear: string, pdfBuffer: Buffer,
  payslipData?: {
    totalHours: number; hourlyRate: number; grossPay: number;
    advancesDeducted: number; penaltiesDeducted: number;
    zusDeducted: number; finalNettoPayout: number; siteLocation: string;
  }
): Promise<void> {
  const smtpFrom = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@edu-jobs.eu";
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:24px;background:#f5f5f5;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:#333;padding:24px 32px;">
        <span style="color:#E9FF70;font-size:22px;font-weight:900;">EURO EDU JOBS</span>
        <br><span style="color:#aaa;font-size:11px;">ODCINEK WYPLATY / PAYSLIP — ${monthYear}</span>
      </div>
      <div style="padding:24px 32px;">
        <p>Czesc <strong>${workerName}</strong>,</p>
        <p>Twoj odcinek wyplaty za <strong>${monthYear}</strong> jest gotowy.</p>
        ${payslipData ? `<p><strong>Do wyplaty: ${payslipData.finalNettoPayout.toFixed(2)} zl</strong></p>` : ""}
        <p style="color:#888;font-size:11px;">Szczegoly w zalaczonym pliku PDF.</p>
      </div>
    </div>
  </body></html>`;

  await sendEmail({
    from: `EURO EDU JOBS Payroll <${smtpFrom}>`,
    to: workerEmail,
    subject: `Odcinek wyplaty ${monthYear} — EURO EDU JOBS`,
    html,
    attachments: [{ filename: `Payslip_${workerName.replace(/\s+/g, "_")}_${monthYear}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
  });
}

// ── Login notification ───────────────────────────────────────────────────────
export async function sendLoginNotification(
  user: { name: string; email: string; role: string; site: string | null },
  clientIp: string
): Promise<void> {
  const adminProfile = await getAdminProfile();
  const alertEmail = adminProfile?.email || process.env.ALERT_EMAIL_TO;
  if (!alertEmail) return;

  const smtpFrom = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@edu-jobs.eu";
  const html = `<p><strong>${user.name}</strong> (${user.email}) logged in as <strong>${user.role}</strong>${user.site ? ` @ ${user.site}` : ""}.</p>
  <p>IP: ${clientIp} | Time: ${new Date().toISOString()}</p>`;

  await sendEmail({
    from: `EEJ Security <${smtpFrom}>`,
    to: alertEmail,
    subject: `EEJ Login: ${user.name} (${user.role})`,
    html,
  }).catch((e) => console.warn("[alerter] Login notification failed:", e));
}

// ── Cron-based alerter ──────────────────────────────────────────────────────
export function startAlerter(): void {
  const cronExpr = process.env.ALERT_CRON ?? "0 8 * * *";
  console.log(`[alerter] Scheduling compliance check: "${cronExpr}"`);
  cron.schedule(cronExpr, async () => {
    console.log("[alerter] Running scheduled compliance check...");
    await checkAndAlert(false);
  });
}

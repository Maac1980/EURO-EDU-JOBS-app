import { Router } from "express";
import jwt from "jsonwebtoken";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { fetchAllRecords, fetchRecord, updateRecord } from "../lib/airtable.js";
import { mapRecordToWorker } from "../lib/compliance.js";
import { appendAuditEntry } from "./audit.js";
import { sendWhatsAppMessage } from "../lib/alerter.js";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET ?? "eej-jwt-fallback-secret-2024";
const PORTAL_TOKEN_EXPIRY = "30d";

// ── Daily log file per worker ─────────────────────────────────────────────

const DATA_DIR = join(__dirname, "../../data/portal-logs");

function getDailyLogPath(workerId: string): string {
  mkdirSync(DATA_DIR, { recursive: true });
  return join(DATA_DIR, `${workerId}.json`);
}

export interface DailyEntry {
  date: string;          // YYYY-MM-DD
  hours: number;
  submittedAt: string;   // ISO timestamp
}

function readDailyLog(workerId: string): DailyEntry[] {
  const file = getDailyLogPath(workerId);
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : [];
  } catch {
    return [];
  }
}

function writeDailyLog(workerId: string, entries: DailyEntry[]): void {
  writeFileSync(getDailyLogPath(workerId), JSON.stringify(entries.slice(-365), null, 2));
}

// ── Token helpers ─────────────────────────────────────────────────────────

function signPortalToken(workerId: string): string {
  return jwt.sign({ workerId, type: "portal" }, JWT_SECRET, { expiresIn: PORTAL_TOKEN_EXPIRY });
}

function verifyPortalToken(token: string): { workerId: string } {
  const decoded = jwt.verify(token, JWT_SECRET) as { workerId?: string; type?: string };
  if (decoded.type !== "portal" || !decoded.workerId) {
    throw new Error("Invalid portal token");
  }
  return { workerId: decoded.workerId };
}

// ── Admin: generate a portal link token for a given worker ────────────────

// GET /api/portal/token/:recordId  (requires admin Bearer token)
router.get("/portal/token/:recordId", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    jwt.verify(authHeader.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid admin token" });
  }

  const { recordId } = req.params;
  if (!recordId?.startsWith("rec")) {
    return res.status(400).json({ error: "Invalid record ID" });
  }

  const token = signPortalToken(recordId);
  return res.json({ token, expiresIn: PORTAL_TOKEN_EXPIRY });
});

// ── Candidate: get own minimal profile (NO compliance/financial data) ──────

// GET /api/portal/me?token=xxx
router.get("/portal/me", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token) return res.status(400).json({ error: "Missing token" });

  let workerId: string;
  try {
    ({ workerId } = verifyPortalToken(token));
  } catch {
    return res.status(401).json({ error: "Invalid or expired portal link. Please ask your coordinator for a new one." });
  }

  try {
    const records = await fetchAllRecords();
    const record = records.find((r) => r.id === workerId);
    if (!record) return res.status(404).json({ error: "Worker record not found." });

    const full = mapRecordToWorker(record);

    // Return ONLY the candidate's own identity — nothing confidential
    const profile = {
      id: full.id,
      name: full.name,
      specialization: full.specialization,
      siteLocation: full.siteLocation ?? null,
    };

    // Also return their own daily log
    const dailyLog = readDailyLog(workerId);

    return res.json({ profile, dailyLog });
  } catch (err) {
    console.error("[portal] me error:", err);
    return res.status(500).json({ error: "Failed to load profile." });
  }
});

// ── Candidate: submit hours for a specific day ────────────────────────────

// POST /api/portal/hours?token=xxx
// Body: { date: "YYYY-MM-DD", hours: number }
router.post("/portal/hours", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token) return res.status(400).json({ error: "Missing token" });

  let workerId: string;
  try {
    ({ workerId } = verifyPortalToken(token));
  } catch {
    return res.status(401).json({ error: "Invalid or expired portal link." });
  }

  const { date, hours } = req.body as { date?: string; hours?: number };

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD format." });
  }
  const hoursNum = Number(hours);
  if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
    return res.status(400).json({ error: "Invalid hours value. Must be between 0 and 24." });
  }

  try {
    // Read current daily log
    const log = readDailyLog(workerId);

    // Upsert: replace if same date already exists, otherwise append
    const existingIdx = log.findIndex((e) => e.date === date);
    const entry: DailyEntry = { date, hours: hoursNum, submittedAt: new Date().toISOString() };
    if (existingIdx >= 0) {
      log[existingIdx] = entry;
    } else {
      log.push(entry);
    }
    // Keep sorted by date ascending
    log.sort((a, b) => a.date.localeCompare(b.date));
    writeDailyLog(workerId, log);

    // Accumulate total hours into Airtable from ALL daily log entries
    const totalHours = log.reduce((sum, e) => sum + e.hours, 0);
    await updateRecord(workerId, { "TOTAL HOURS": Math.round(totalHours * 10) / 10 });

    // Audit trail
    appendAuditEntry({
      workerId,
      actor: "candidate-portal",
      field: "TOTAL HOURS (daily)",
      newValue: `${hoursNum}h on ${date}`,
      action: "daily-hours",
    });

    return res.json({ ok: true, totalHours, log });
  } catch (err) {
    console.error("[portal] hours error:", err);
    return res.status(500).json({ error: "Failed to save hours." });
  }
});

// ── POST /api/portal/send-whatsapp/:recordId ──────────────────────────────────
// Generates a fresh portal token and sends the link to the worker's phone via WhatsApp
router.post("/portal/send-whatsapp/:recordId", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    jwt.verify(authHeader.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid admin token" });
  }

  const { recordId } = req.params;
  if (!recordId?.startsWith("rec")) {
    return res.status(400).json({ error: "Invalid record ID" });
  }

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return res.status(503).json({ error: "WhatsApp not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM to Secrets." });
  }

  try {
    const record = await fetchRecord(recordId);
    const worker = mapRecordToWorker(record);
    if (!worker.phone) {
      return res.status(400).json({ error: "Worker has no phone number on record. Add it in Airtable first." });
    }

    const token = signPortalToken(recordId);
    const portalUrl = (req.body?.portalUrl as string | undefined) ?? `${process.env.APP_URL ?? ""}/portal?token=${token}`;

    const waBody = `Cześć ${worker.name} 👋\n\nTwój portal EEJ jest gotowy! Kliknij, aby zobaczyć swój profil, dokumenty i godziny pracy:\n\n${portalUrl}\n\n⏳ Link ważny przez 30 dni.\n\n— EURO EDU JOBS`;
    await sendWhatsAppMessage(worker.phone, waBody);

    console.log(`[portal] ✓ WhatsApp portal link sent to ${worker.name} (${worker.phone})`);
    return res.json({ success: true, sentTo: worker.phone, workerName: worker.name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send WhatsApp";
    console.error("[portal] send-whatsapp error:", msg);
    return res.status(500).json({ error: msg });
  }
});

export default router;

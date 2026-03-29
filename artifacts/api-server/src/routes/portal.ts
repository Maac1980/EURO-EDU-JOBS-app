import { Router } from "express";
import jwt from "jsonwebtoken";
import { db, schema } from "../db/index.js";
import { eq, and, sql, asc } from "drizzle-orm";
import { toWorker } from "../lib/compliance.js";
import { appendAuditEntry } from "./audit.js";
import { sendWhatsAppMessage } from "../lib/alerter.js";
import { JWT_SECRET } from "../lib/authMiddleware.js";

const router = Router();
const PORTAL_TOKEN_EXPIRY = "30d";

function signPortalToken(workerId: string): string {
  return jwt.sign({ workerId, type: "portal" }, JWT_SECRET, { expiresIn: PORTAL_TOKEN_EXPIRY });
}

function verifyPortalToken(token: string): { workerId: string } {
  const decoded = jwt.verify(token, JWT_SECRET) as { workerId?: string; type?: string };
  if (decoded.type !== "portal" || !decoded.workerId) throw new Error("Invalid portal token");
  return { workerId: decoded.workerId };
}

router.get("/portal/token/:recordId", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  try { jwt.verify(authHeader.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: "Invalid admin token" }); }
  const { recordId } = req.params;
  const token = signPortalToken(recordId);
  return res.json({ token, expiresIn: PORTAL_TOKEN_EXPIRY });
});

router.get("/portal/me", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token) return res.status(400).json({ error: "Missing token" });
  let workerId: string;
  try { ({ workerId } = verifyPortalToken(token)); } catch { return res.status(401).json({ error: "Invalid or expired portal link." }); }

  try {
    const [row] = await db.select().from(schema.workers).where(eq(schema.workers.id, workerId));
    if (!row) return res.status(404).json({ error: "Worker not found." });
    const w = toWorker(row);
    const dailyLog = await db.select().from(schema.portalDailyLogs).where(eq(schema.portalDailyLogs.workerId, workerId)).orderBy(asc(schema.portalDailyLogs.date));
    return res.json({
      profile: { id: w.id, name: w.name, specialization: w.jobRole, siteLocation: w.assignedSite },
      dailyLog: dailyLog.map(l => ({ date: l.date, hours: l.hours, submittedAt: l.submittedAt?.toISOString() })),
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load profile." });
  }
});

router.post("/portal/hours", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token) return res.status(400).json({ error: "Missing token" });
  let workerId: string;
  try { ({ workerId } = verifyPortalToken(token)); } catch { return res.status(401).json({ error: "Invalid or expired portal link." }); }

  const { date, hours } = req.body as { date?: string; hours?: number };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Invalid date format." });
  const hoursNum = Number(hours);
  if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) return res.status(400).json({ error: "Hours must be 0-24." });

  try {
    // Upsert daily log
    const [existing] = await db.select().from(schema.portalDailyLogs).where(
      and(eq(schema.portalDailyLogs.workerId, workerId), eq(schema.portalDailyLogs.date, date))
    );
    if (existing) {
      await db.update(schema.portalDailyLogs).set({ hours: hoursNum, submittedAt: new Date() }).where(eq(schema.portalDailyLogs.id, existing.id));
    } else {
      await db.insert(schema.portalDailyLogs).values({ workerId, date, hours: hoursNum });
    }

    // Recalculate total hours
    const allLogs = await db.select().from(schema.portalDailyLogs).where(eq(schema.portalDailyLogs.workerId, workerId));
    const totalHours = allLogs.reduce((sum, e) => sum + e.hours, 0);
    await db.update(schema.workers).set({ totalHours: Math.round(totalHours * 10) / 10, updatedAt: new Date() }).where(eq(schema.workers.id, workerId));

    appendAuditEntry({ workerId, actor: "candidate-portal", field: "TOTAL HOURS (daily)", newValue: `${hoursNum}h on ${date}`, action: "daily-hours" });
    return res.json({ ok: true, totalHours });
  } catch (err) {
    return res.status(500).json({ error: "Failed to save hours." });
  }
});

router.post("/portal/send-whatsapp/:recordId", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  try { jwt.verify(authHeader.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: "Invalid admin token" }); }
  const { recordId } = req.params;

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return res.status(503).json({ error: "WhatsApp not configured." });
  }

  try {
    const [row] = await db.select().from(schema.workers).where(eq(schema.workers.id, recordId));
    if (!row) return res.status(404).json({ error: "Worker not found." });
    if (!row.phone) return res.status(400).json({ error: "Worker has no phone number." });

    const token = signPortalToken(recordId);
    const portalUrl = (req.body?.portalUrl as string) ?? `${process.env.APP_URL ?? ""}/portal?token=${token}`;
    const waBody = `Czesc ${row.name}\n\nTwoj portal EEJ jest gotowy!\n${portalUrl}\n\nLink wazny 30 dni.\n\u2014 EURO EDU JOBS`;
    await sendWhatsAppMessage(row.phone, waBody);
    return res.json({ success: true, sentTo: row.phone, workerName: row.name });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send WhatsApp" });
  }
});

export default router;

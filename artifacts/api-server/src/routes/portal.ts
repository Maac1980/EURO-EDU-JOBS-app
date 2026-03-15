import { Router } from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import { fetchAllRecords, updateRecord } from "../lib/airtable.js";
import { mapRecordToWorker } from "../lib/compliance.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const JWT_SECRET = process.env.JWT_SECRET ?? "eej-jwt-fallback-secret-2024";
const PORTAL_TOKEN_EXPIRY = "30d";

// ── Token helpers ──────────────────────────────────────────────────────────

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

// ── Admin: generate a portal link token for a given worker ─────────────────

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

// ── Candidate: get own profile ──────────────────────────────────────────────

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

    const worker = mapRecordToWorker(record);
    return res.json({ worker });
  } catch (err) {
    console.error("[portal] me error:", err);
    return res.status(500).json({ error: "Failed to load profile." });
  }
});

// ── Candidate: update their total hours ────────────────────────────────────

// PATCH /api/portal/hours?token=xxx
router.patch("/portal/hours", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token) return res.status(400).json({ error: "Missing token" });

  let workerId: string;
  try {
    ({ workerId } = verifyPortalToken(token));
  } catch {
    return res.status(401).json({ error: "Invalid or expired portal link." });
  }

  const { totalHours } = req.body as { totalHours?: number };
  if (totalHours === undefined || isNaN(Number(totalHours)) || Number(totalHours) < 0) {
    return res.status(400).json({ error: "Invalid hours value." });
  }

  try {
    await updateRecord(workerId, { "TOTAL HOURS": Number(totalHours) });
    appendAudit({ workerId, actor: "candidate-portal", field: "TOTAL HOURS", newValue: totalHours });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[portal] hours update error:", err);
    return res.status(500).json({ error: "Failed to update hours." });
  }
});

// ── Audit log helper (inline, written to api-server/data/audit.json) ────────
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIT_FILE = join(__dirname, "../../data/audit.json");

function appendAudit(entry: { workerId: string; actor: string; field: string; newValue: unknown; oldValue?: unknown }) {
  try {
    mkdirSync(join(__dirname, "../../data"), { recursive: true });
    const existing: unknown[] = existsSync(AUDIT_FILE)
      ? JSON.parse(readFileSync(AUDIT_FILE, "utf-8"))
      : [];
    existing.push({ ...entry, timestamp: new Date().toISOString() });
    // Keep last 2000 entries
    const trimmed = existing.slice(-2000);
    writeFileSync(AUDIT_FILE, JSON.stringify(trimmed, null, 2));
  } catch (e) {
    console.error("[audit] write error:", e);
  }
}

export { appendAudit };
export default router;

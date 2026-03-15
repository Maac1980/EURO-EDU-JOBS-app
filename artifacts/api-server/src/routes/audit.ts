import { Router } from "express";
import jwt from "jsonwebtoken";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIT_FILE = join(__dirname, "../../data/audit.json");
const JWT_SECRET = process.env.JWT_SECRET ?? "eej-jwt-fallback-secret-2024";

function requireAdmin(req: any, res: any): boolean {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  try {
    jwt.verify(authHeader.slice(7), JWT_SECRET);
    return true;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return false;
  }
}

export interface AuditEntry {
  timestamp: string;
  actor: string;
  workerId: string;
  workerName?: string;
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  action?: string;
}

export function appendAuditEntry(entry: Omit<AuditEntry, "timestamp">) {
  try {
    mkdirSync(join(__dirname, "../../data"), { recursive: true });
    const existing: AuditEntry[] = existsSync(AUDIT_FILE)
      ? JSON.parse(readFileSync(AUDIT_FILE, "utf-8"))
      : [];
    existing.push({ ...entry, timestamp: new Date().toISOString() });
    writeFileSync(AUDIT_FILE, JSON.stringify(existing.slice(-2000), null, 2));
  } catch (e) {
    console.error("[audit] write error:", e);
  }
}

// GET /api/audit  (admin only)
router.get("/audit", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const entries: AuditEntry[] = existsSync(AUDIT_FILE)
      ? JSON.parse(readFileSync(AUDIT_FILE, "utf-8"))
      : [];
    // Return newest first
    return res.json({ entries: entries.slice().reverse(), total: entries.length });
  } catch {
    return res.status(500).json({ error: "Failed to read audit log." });
  }
});

// DELETE /api/audit  (admin only — clears the log)
router.delete("/audit", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    writeFileSync(AUDIT_FILE, "[]");
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to clear audit log." });
  }
});

export default router;

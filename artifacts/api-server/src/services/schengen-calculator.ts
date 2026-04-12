/**
 * Schengen 90/180 Calculator — deterministic stay calculation.
 *
 * Manual input: Anna enters border crossing dates.
 * Output: days used, days remaining, latest legal exit date.
 * Alert: triggers YELLOW when remaining < 15 days.
 *
 * Accounts for Art. 108 protection (TRC pending = not counted against 90/180).
 *
 * POST /api/schengen/calculate — calculate from crossing dates
 * GET  /api/schengen/worker/:workerId — get stored crossings + calculation
 * POST /api/schengen/worker/:workerId/crossing — add a border crossing
 *
 * NO fake biometric data. Manual entry only.
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

// ═══ TABLE ══════════════════════════════════════════════════════════════════

async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS border_crossings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      crossing_date DATE NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('entry', 'exit')),
      country TEXT DEFAULT 'PL',
      notes TEXT,
      entered_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// ═══ 90/180 CALCULATION (pure, deterministic) ═══════════════════════════════

interface Crossing {
  date: string;       // YYYY-MM-DD
  direction: "entry" | "exit";
}

interface SchengenResult {
  daysUsed: number;
  daysRemaining: number;
  latestLegalExitDate: string;
  isOverstay: boolean;
  isWarning: boolean;  // < 15 days remaining
  periods: Array<{ entry: string; exit: string; days: number }>;
  calculatedAt: string;
  referenceDate: string;
}

export function calculateSchengen90180(crossings: Crossing[], referenceDate?: string, art108Active = false): SchengenResult {
  const today = referenceDate ? new Date(referenceDate) : new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // If Art. 108 is active, worker has legal stay — 90/180 doesn't apply
  if (art108Active) {
    return {
      daysUsed: 0,
      daysRemaining: 90,
      latestLegalExitDate: "N/A — Art. 108 protection active",
      isOverstay: false,
      isWarning: false,
      periods: [],
      calculatedAt: new Date().toISOString(),
      referenceDate: todayStr,
    };
  }

  // Sort crossings by date
  const sorted = [...crossings].sort((a, b) => a.date.localeCompare(b.date));

  // Build stay periods (entry → exit pairs)
  const periods: Array<{ entry: string; exit: string; days: number }> = [];
  let currentEntry: string | null = null;

  for (const c of sorted) {
    if (c.direction === "entry") {
      currentEntry = c.date;
    } else if (c.direction === "exit" && currentEntry) {
      const entryDate = new Date(currentEntry);
      const exitDate = new Date(c.date);
      const days = Math.ceil((exitDate.getTime() - entryDate.getTime()) / 86400000) + 1; // inclusive
      periods.push({ entry: currentEntry, exit: c.date, days: Math.max(1, days) });
      currentEntry = null;
    }
  }

  // If currently in Schengen (entry without exit), count until today
  if (currentEntry) {
    const entryDate = new Date(currentEntry);
    const days = Math.ceil((today.getTime() - entryDate.getTime()) / 86400000) + 1;
    periods.push({ entry: currentEntry, exit: todayStr, days: Math.max(1, days) });
  }

  // Calculate days in last 180 days (rolling window)
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 180);

  let daysUsed = 0;
  for (const p of periods) {
    const pEntry = new Date(p.entry);
    const pExit = new Date(p.exit);

    // Clamp to 180-day window
    const effectiveEntry = pEntry < windowStart ? windowStart : pEntry;
    const effectiveExit = pExit > today ? today : pExit;

    if (effectiveEntry <= effectiveExit) {
      const days = Math.ceil((effectiveExit.getTime() - effectiveEntry.getTime()) / 86400000) + 1;
      daysUsed += Math.max(0, days);
    }
  }

  daysUsed = Math.min(daysUsed, 180); // cap at window size
  const daysRemaining = Math.max(0, 90 - daysUsed);

  // Latest legal exit: today + daysRemaining
  const exitDate = new Date(today);
  exitDate.setDate(exitDate.getDate() + daysRemaining);
  const latestLegalExitDate = daysRemaining > 0 ? exitDate.toISOString().slice(0, 10) : todayStr;

  return {
    daysUsed,
    daysRemaining,
    latestLegalExitDate,
    isOverstay: daysUsed > 90,
    isWarning: daysRemaining > 0 && daysRemaining < 15,
    periods,
    calculatedAt: new Date().toISOString(),
    referenceDate: todayStr,
  };
}

// ═══ ROUTES ═════════════════════════════════════════════════════════════════

// POST /api/schengen/calculate — calculate from provided crossings (no DB)
router.post("/schengen/calculate", authenticateToken, (req, res) => {
  try {
    const { crossings, referenceDate, art108Active } = req.body as {
      crossings: Crossing[]; referenceDate?: string; art108Active?: boolean;
    };
    if (!crossings || !Array.isArray(crossings)) return res.status(400).json({ error: "crossings array required" });
    const result = calculateSchengen90180(crossings, referenceDate, art108Active);
    return res.json({ result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/schengen/worker/:workerId/crossing — add a border crossing
router.post("/schengen/worker/:workerId/crossing", authenticateToken, async (req, res) => {
  try {
    await ensureTable();
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const { date, direction, country, notes } = req.body as {
      date: string; direction: "entry" | "exit"; country?: string; notes?: string;
    };
    if (!date || !direction) return res.status(400).json({ error: "date and direction required" });

    await db.execute(sql`
      INSERT INTO border_crossings (worker_id, crossing_date, direction, country, notes, entered_by)
      VALUES (${wid}, ${date}, ${direction}, ${country ?? "PL"}, ${notes ?? null}, ${(req as any).user?.name ?? "system"})
    `);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/schengen/worker/:workerId — get crossings + calculation
router.get("/schengen/worker/:workerId", authenticateToken, async (req, res) => {
  try {
    await ensureTable();
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;

    const rows = await db.execute(sql`
      SELECT id, crossing_date, direction, country, notes, entered_by, created_at
      FROM border_crossings WHERE worker_id = ${wid}
      ORDER BY crossing_date ASC
    `);

    const crossings = (rows.rows as any[]).map(r => ({
      date: r.crossing_date?.toString().slice(0, 10) ?? "",
      direction: r.direction as "entry" | "exit",
    }));

    // Check Art. 108 status
    let art108 = false;
    try {
      const sdRows = await db.execute(sql`
        SELECT COUNT(*)::int as count FROM smart_documents
        WHERE worker_id = ${wid} AND doc_type IN ('TRC_APPLICATION', 'UPO_RECEIPT') AND status = 'verified'
      `);
      art108 = ((sdRows.rows[0] as any)?.count ?? 0) > 0;
    } catch { /* smart_documents may not exist */ }

    const result = calculateSchengen90180(crossings, undefined, art108);

    return res.json({ crossings: rows.rows, calculation: result, art108Active: art108 });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

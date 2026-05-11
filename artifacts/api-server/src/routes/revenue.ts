import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken, requireFinancialAccess } from "../lib/authMiddleware.js";

const router = Router();
const HOURS_PER_MONTH = 160;

interface WorkerRow {
  id: string;
  name: string;
  hourly_netto_rate: number | string | null;
  assigned_site: string | null;
  contract_end_date: string | null;
  pipeline_stage: string | null;
  [key: string]: unknown;
}

interface InvoiceRow {
  total: number | string;
  status: string;
  month_year: string;
  [key: string]: unknown;
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

// ── GET /api/revenue/forecast — 6 month forward projection ───────────────
router.get("/revenue/forecast", authenticateToken, requireFinancialAccess, async (_req, res) => {
  try {
    const workers = await db.execute<WorkerRow>(sql`
      SELECT id, name, hourly_netto_rate, assigned_site, contract_end_date, pipeline_stage
      FROM workers WHERE pipeline_stage IN ('Active', 'Placed')
    `);
    const activeWorkers: WorkerRow[] = workers.rows;

    const now = new Date();
    const months: { month: number; year: number; label: string; projected: number; workers: number; atRisk: number }[] = [];

    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();

      let projected = 0;
      let count = 0;
      let atRisk = 0;

      for (const w of activeWorkers) {
        const rate = Number(w.hourly_netto_rate ?? 0);
        if (rate <= 0) continue;

        // Check if contract still active in this month
        if (w.contract_end_date) {
          const end = new Date(w.contract_end_date);
          if (end < d) {
            atRisk++;
            continue; // contract ended before this month
          }
        }

        projected += rate * HOURS_PER_MONTH;
        count++;
      }

      months.push({
        month: m,
        year: y,
        label: `${y}-${String(m).padStart(2, "0")}`,
        projected: Math.round(projected * 100) / 100,
        workers: count,
        atRisk,
      });
    }

    // Bench workers = active but no site
    const benchCount = activeWorkers.filter(w => !w.assigned_site || w.assigned_site === "Available").length;
    const benchRevenueGap = activeWorkers
      .filter(w => !w.assigned_site || w.assigned_site === "Available")
      .reduce((sum, w) => sum + Number(w.hourly_netto_rate ?? 0) * HOURS_PER_MONTH, 0);

    return res.json({
      forecast: months,
      benchWorkers: benchCount,
      benchRevenueGap: Math.round(benchRevenueGap * 100) / 100,
      totalActiveWorkers: activeWorkers.length,
    });
  } catch (err) {
    console.error("[revenue] Forecast error:", err);
    return res.status(500).json({ error: "Failed to generate forecast" });
  }
});

// ── GET /api/revenue/actual — actual vs projected comparison ─────────────
router.get("/revenue/actual", authenticateToken, requireFinancialAccess, async (_req, res) => {
  try {
    // Get invoices grouped by month
    const invoices = await db.execute<InvoiceRow>(sql`
      SELECT month_year, status,
        SUM(total) as total
      FROM invoices
      GROUP BY month_year, status
      ORDER BY month_year DESC
      LIMIT 24
    `);

    const byMonth: Record<string, { invoiced: number; paid: number; outstanding: number }> = {};
    for (const row of invoices.rows) {
      const key = row.month_year;
      if (!byMonth[key]) byMonth[key] = { invoiced: 0, paid: 0, outstanding: 0 };
      const total = Number(row.total) || 0;
      byMonth[key].invoiced += total;
      if (row.status === "paid") byMonth[key].paid += total;
      else byMonth[key].outstanding += total;
    }

    // Get worker-based projected revenue for same months
    const workers = await db.execute<{ hourly_netto_rate: number | string | null; [key: string]: unknown }>(sql`
      SELECT hourly_netto_rate FROM workers
      WHERE pipeline_stage IN ('Active', 'Placed') AND hourly_netto_rate > 0
    `);
    const monthlyProjected = workers.rows.reduce(
      (sum, w) => sum + (Number(w.hourly_netto_rate) || 0) * HOURS_PER_MONTH, 0
    );

    const comparison = Object.entries(byMonth).map(([month, data]) => ({
      month,
      projected: Math.round(monthlyProjected * 100) / 100,
      invoiced: Math.round(data.invoiced * 100) / 100,
      paid: Math.round(data.paid * 100) / 100,
      outstanding: Math.round(data.outstanding * 100) / 100,
    }));

    return res.json({ comparison });
  } catch (err) {
    console.error("[revenue] Actual error:", err);
    return res.status(500).json({ error: "Failed to get actuals" });
  }
});

// ── GET /api/revenue/summary — current month, next month, 6 month total ──
router.get("/revenue/summary", authenticateToken, requireFinancialAccess, async (_req, res) => {
  try {
    const workers = await db.execute<WorkerRow>(sql`
      SELECT id, name, hourly_netto_rate, assigned_site, contract_end_date, pipeline_stage
      FROM workers WHERE pipeline_stage IN ('Active', 'Placed') AND hourly_netto_rate > 0
    `);
    const active: WorkerRow[] = workers.rows;

    const now = new Date();
    const currentMonth = active.reduce((s, w) => s + Number(w.hourly_netto_rate ?? 0) * HOURS_PER_MONTH, 0);

    // Next month: exclude workers whose contracts end this month
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthWorkers = active.filter(w => {
      if (!w.contract_end_date) return true;
      return new Date(w.contract_end_date) >= nextMonthDate;
    });
    const nextMonth = nextMonthWorkers.reduce((s, w) => s + Number(w.hourly_netto_rate ?? 0) * HOURS_PER_MONTH, 0);

    // 6 month total
    let sixMonthTotal = 0;
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      for (const w of active) {
        if (w.contract_end_date && new Date(w.contract_end_date) < d) continue;
        sixMonthTotal += Number(w.hourly_netto_rate ?? 0) * HOURS_PER_MONTH;
      }
    }

    // Contracts ending in 30 days
    const thirtyDaysOut = new Date(now.getTime() + 30 * 86400000);
    const endingSoon = active.filter(w =>
      w.contract_end_date && new Date(w.contract_end_date) <= thirtyDaysOut && new Date(w.contract_end_date) >= now
    );
    const revenueAtRisk = endingSoon.reduce((s, w) => s + Number(w.hourly_netto_rate ?? 0) * HOURS_PER_MONTH, 0);

    // Top 5 clients by worker revenue
    const clientRevenue: Record<string, number> = {};
    for (const w of active) {
      const site = w.assigned_site ?? "Unassigned";
      clientRevenue[site] = (clientRevenue[site] ?? 0) + Number(w.hourly_netto_rate ?? 0) * HOURS_PER_MONTH;
    }
    const topClients = Object.entries(clientRevenue)
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const avgRate = active.length > 0
      ? active.reduce((s, w) => s + Number(w.hourly_netto_rate ?? 0), 0) / active.length
      : 0;

    return res.json({
      currentMonth: Math.round(currentMonth * 100) / 100,
      nextMonth: Math.round(nextMonth * 100) / 100,
      sixMonthTotal: Math.round(sixMonthTotal * 100) / 100,
      activeWorkers: active.length,
      avgRate: Math.round(avgRate * 100) / 100,
      revenueAtRisk: Math.round(revenueAtRisk * 100) / 100,
      contractsEndingSoon: endingSoon.length,
      topClients,
    });
  } catch (err) {
    console.error("[revenue] Summary error:", err);
    return res.status(500).json({ error: "Failed to get summary" });
  }
});

export default router;

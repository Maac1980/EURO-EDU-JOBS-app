/**
 * Test Data Safety System — Option C (combined)
 * - tenant_id = 'test' for all test data
 * - Names prefixed with [TEST]
 * - Fake phones +48000000xxx, emails @test.eej.invalid
 * - One-click cleanup
 * - Service-level blocking for WhatsApp/email
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

// ── Safety gate — call before any external communication ─────────────────
export function isTestWorker(worker: { tenant_id?: string; email?: string; phone?: string }): boolean {
  if (worker.tenant_id === "test") return true;
  if (worker.email?.endsWith("@test.eej.invalid")) return true;
  if (worker.phone?.startsWith("+48000000")) return true;
  return false;
}

export function shouldSkipNotification(worker: any): { skip: boolean; reason?: string } {
  if (isTestWorker(worker)) return { skip: true, reason: "test_worker" };
  return { skip: false };
}

// ── POST /api/test/seed — seed 50 test workers + 3 clients ──────────────
router.post("/test/seed", authenticateToken, async (_req, res) => {
  try {
    const existing = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM workers WHERE tenant_id = 'test'`);
    if ((existing.rows[0] as any).cnt > 10) {
      return res.json({ message: "Test data already seeded", count: (existing.rows[0] as any).cnt });
    }

    // Seed test clients
    await db.execute(sql`
      INSERT INTO clients (name, contact_person, email, phone, nip, billing_rate, tenant_id)
      VALUES
        ('[TEST] TestCorp Manufacturing', 'Jan Testowy', 'jan@test.eej.invalid', '+48000000090', '0000000001', 45.00, 'test'),
        ('[TEST] DemoFactory Polska', 'Maria Testowa', 'maria@test.eej.invalid', '+48000000091', '0000000002', 38.00, 'test'),
        ('[TEST] SampleHospital Warsaw', 'Piotr Testowy', 'piotr@test.eej.invalid', '+48000000092', '0000000003', 42.00, 'test')
      ON CONFLICT DO NOTHING
    `);

    // Seed 50 test workers across various statuses
    const workers = [
      // Compliant workers (20)
      ...generateWorkers(1, 20, "Active", "compliant"),
      // Expiring soon (10)
      ...generateWorkers(21, 30, "Active", "expiring"),
      // Expired / critical (8)
      ...generateWorkers(31, 38, "Active", "expired"),
      // Art. 108 pending (5)
      ...generateWorkers(39, 43, "Screening", "art108"),
      // No permit (4)
      ...generateWorkers(44, 47, "New", "no_permit"),
      // EU nationals (3)
      ...generateWorkers(48, 50, "Active", "eu"),
    ];

    for (const w of workers) {
      await db.execute(sql`
        INSERT INTO workers (name, email, phone, job_role, nationality, assigned_site, hourly_netto_rate,
          trc_expiry, work_permit_expiry, bhp_status, badania_lek_expiry, contract_end_date,
          pipeline_stage, tenant_id, experience, qualification)
        VALUES (${w.name}, ${w.email}, ${w.phone}, ${w.jobRole}, ${w.nationality}, ${w.site},
          ${w.rate}, ${w.trcExpiry}, ${w.permitExpiry}, ${w.bhpExpiry}, ${w.medicalExpiry},
          ${w.contractEnd}, ${w.stage}, 'test', ${w.experience}, ${w.qualification})
        ON CONFLICT DO NOTHING
      `);
    }

    const total = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM workers WHERE tenant_id = 'test'`);
    return res.json({ message: "Test data seeded", workersCreated: (total.rows[0] as any).cnt, clientsCreated: 3 });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/test/cleanup — delete ALL test data ─────────────────────
router.delete("/test/cleanup", authenticateToken, async (_req, res) => {
  try {
    const wDel = await db.execute(sql`DELETE FROM workers WHERE tenant_id = 'test'`);
    const cDel = await db.execute(sql`DELETE FROM clients WHERE tenant_id = 'test'`);
    const dDel = await db.execute(sql`DELETE FROM crm_deals WHERE tenant_id = 'test'`);
    return res.json({ message: "All test data deleted", workers: wDel.rowCount, clients: cDel.rowCount, deals: dDel.rowCount });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/test/status — check test data status ───────────────────────
router.get("/test/status", authenticateToken, async (_req, res) => {
  try {
    const w = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM workers WHERE tenant_id = 'test'`);
    const c = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM clients WHERE tenant_id = 'test'`);
    return res.json({ testWorkers: (w.rows[0] as any).cnt, testClients: (c.rows[0] as any).cnt });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Worker generator ────────────────────────────────────────────────────
function generateWorkers(from: number, to: number, stage: string, type: string) {
  const nationalities = ["Ukrainian", "Romanian", "Georgian", "Indian", "Vietnamese", "Egyptian", "Polish", "Belarusian", "Moldovan", "Nepali"];
  const sites = ["TEST-Wroclaw", "TEST-Warsaw", "TEST-Poznan", "TEST-Gdansk", "TEST-Krakow"];
  const roles = ["Welder TIG", "Welder MIG", "Fabricator", "Electrician", "Plumber", "Cook", "Nurse", "Warehouse", "Driver", "Security"];
  const now = new Date();

  return Array.from({ length: to - from + 1 }, (_, i) => {
    const idx = from + i;
    const nat = type === "eu" ? "Polish" : nationalities[idx % nationalities.length];
    const d = (days: number) => new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);

    let trcExpiry: string | null = null, permitExpiry: string | null = null;
    let bhpExpiry = d(180), medicalExpiry = d(200), contractEnd = d(365);

    switch (type) {
      case "compliant":
        trcExpiry = d(180 + idx * 10); permitExpiry = d(200 + idx * 10);
        break;
      case "expiring":
        trcExpiry = d(10 + idx); permitExpiry = d(15 + idx);
        bhpExpiry = d(20); medicalExpiry = d(25);
        break;
      case "expired":
        trcExpiry = d(-10 - idx); permitExpiry = d(-5 - idx);
        bhpExpiry = d(-15); medicalExpiry = d(-20);
        break;
      case "art108":
        trcExpiry = d(-30); permitExpiry = d(-30);
        break;
      case "no_permit":
        trcExpiry = null; permitExpiry = null;
        break;
      case "eu":
        trcExpiry = null; permitExpiry = null; // EU doesn't need permits
        break;
    }

    return {
      name: `[TEST] Worker ${String(idx).padStart(2, "0")} ${nat}`,
      email: `test.worker.${String(idx).padStart(2, "0")}@test.eej.invalid`,
      phone: `+48000000${String(idx).padStart(3, "0")}`,
      jobRole: roles[idx % roles.length],
      nationality: nat,
      site: sites[idx % sites.length],
      rate: 25 + (idx % 30),
      trcExpiry, permitExpiry, bhpExpiry, medicalExpiry, contractEnd,
      stage,
      experience: `${1 + (idx % 10)} years`,
      qualification: ["ISO 9606", "BHP Certificate", "SEP", "Forklift License", "Nursing Diploma"][idx % 5],
    };
  });
}

export default router;

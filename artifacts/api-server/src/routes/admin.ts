import { Router } from "express";
import { db, schema } from "../db/index.js";
import { and, eq, sql } from "drizzle-orm";
import { authenticateToken, requireAdmin } from "../lib/authMiddleware.js";
import { requireTenant } from "../lib/tenancy.js";
import { scrypt, randomBytes } from "crypto";

const router = Router();

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

// ── Admin Profile ─────────────────────────────────────────────────────────────

router.get("/admin/profile", authenticateToken, async (_req, res) => {
  try {
    const [profile] = await db.select().from(schema.adminProfile);
    if (!profile) {
      const defaults = { fullName: "Anna", email: "anna.b@edu-jobs.eu", phone: "", role: "Administrator" };
      await db.insert(schema.adminProfile).values(defaults);
      return res.json(defaults);
    }
    return res.json(profile);
  } catch (err) {
    return res.status(500).json({ error: "Could not load admin profile." });
  }
});

router.patch("/admin/profile", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [current] = await db.select().from(schema.adminProfile);
    if (!current) return res.status(404).json({ error: "Profile not found." });

    const { email, phone } = req.body as { email?: string; phone?: string };
    const updates: Record<string, any> = {};
    if (email !== undefined) updates.email = email.trim();
    if (phone !== undefined) updates.phone = phone.trim();

    await db.update(schema.adminProfile).set(updates).where(eq(schema.adminProfile.id, current.id));
    const [updated] = await db.select().from(schema.adminProfile).where(eq(schema.adminProfile.id, current.id));
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Could not save admin profile." });
  }
});

// ── Team / User Management ────────────────────────────────────────────────────

router.get("/admin/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const users = await db.select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      site: schema.users.site,
    }).from(schema.users).where(eq(schema.users.tenantId, tenantId));
    return res.json({ users });
  } catch {
    return res.status(500).json({ error: "Could not load users." });
  }
});

router.post("/admin/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email, name, role, site, password } = req.body as {
      email?: string; name?: string; role?: string; site?: string; password?: string;
    };
    if (!email || !name || !role || !password) {
      return res.status(400).json({ error: "email, name, role, and password are required." });
    }

    const tenantId = requireTenant(req);
    const [existing] = await db.select().from(schema.users).where(
      sql`LOWER(${schema.users.email}) = ${email.toLowerCase()}`
    );
    if (existing) {
      return res.status(409).json({ error: "A user with that email already exists." });
    }

    const passwordHash = await hashPassword(password);
    const [newUser] = await db.insert(schema.users).values({
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role,
      site: site ?? null,
      passwordHash,
      tenantId,
    }).returning();

    return res.status(201).json({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      site: newUser.site,
    });
  } catch {
    return res.status(500).json({ error: "Could not create user." });
  }
});

router.patch("/admin/users/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = requireTenant(req);
    const [user] = await db.select().from(schema.users).where(
      and(eq(schema.users.id, String(id)), eq(schema.users.tenantId, tenantId))
    );
    if (!user) return res.status(404).json({ error: "User not found." });

    const { email, name, role, site, password } = req.body as {
      email?: string; name?: string; role?: string; site?: string; password?: string;
    };

    if (user.role === "admin" && role && role !== "admin") {
      return res.status(400).json({ error: "Cannot change the admin's role." });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (email !== undefined) updates.email = email.trim().toLowerCase();
    if (name !== undefined) updates.name = name.trim();
    if (role !== undefined) updates.role = role;
    if (site !== undefined) updates.site = site ?? null;
    if (password !== undefined && password !== "") updates.passwordHash = await hashPassword(password);

    await db.update(schema.users).set(updates).where(
      and(eq(schema.users.id, String(id)), eq(schema.users.tenantId, tenantId))
    );
    const [updated] = await db.select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      site: schema.users.site,
    }).from(schema.users).where(
      and(eq(schema.users.id, String(id)), eq(schema.users.tenantId, tenantId))
    );
    return res.json(updated);
  } catch {
    return res.status(500).json({ error: "Could not update user." });
  }
});

router.delete("/admin/users/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = requireTenant(req);
    const [target] = await db.select().from(schema.users).where(
      and(eq(schema.users.id, String(id)), eq(schema.users.tenantId, tenantId))
    );
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.role === "admin") {
      return res.status(400).json({ error: "Cannot delete the admin account." });
    }
    await db.delete(schema.users).where(
      and(eq(schema.users.id, String(id)), eq(schema.users.tenantId, tenantId))
    );
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Could not delete user." });
  }
});

// ── T1 Executive Dashboard Aggregator ─────────────────────────────────────────
// Returns all home-screen KPIs in one call. Tenant-scoped. Admin/T1 only.
router.get("/admin/stats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tenantId = requireTenant(req);

    const [counts] = await db.execute<{
      total_candidates: string;
      active_deployments: string;
      b2b_contracts: string;
      new_today: string;
    }>(sql`
      SELECT
        COUNT(*)                                                AS total_candidates,
        COUNT(*) FILTER (WHERE pipeline_stage IN ('Placed','Active')) AS active_deployments,
        COUNT(*) FILTER (WHERE contract_type = 'B2B')           AS b2b_contracts,
        COUNT(*) FILTER (WHERE created_at >= (NOW() AT TIME ZONE 'Europe/Warsaw')::date) AS new_today
      FROM workers
      WHERE tenant_id = ${tenantId}
    `).then(r => r.rows);

    const totalCandidates   = Number(counts?.total_candidates   ?? 0);
    const activeDeployments = Number(counts?.active_deployments ?? 0);
    const b2bContracts      = Number(counts?.b2b_contracts      ?? 0);
    const newToday          = Number(counts?.new_today          ?? 0);
    const placementPct      = totalCandidates > 0
      ? Math.round((activeDeployments / totalCandidates) * 100)
      : 0;

    const [permitCounts] = await db.execute<{ pending: string }>(sql`
      SELECT COUNT(*) AS pending
      FROM work_permit_applications
      WHERE tenant_id = ${tenantId}
        AND status IN ('submitted', 'under_review', 'preparing')
    `).then(r => r.rows);
    const pendingReviews = Number(permitCounts?.pending ?? 0);

    // Monthly paid revenue grouped by currency. Legacy NULL currency → PLN.
    const revenueRows = await db.execute<{ currency: string | null; paid_total: string | null }>(sql`
      SELECT COALESCE(currency, 'PLN') AS currency,
             COALESCE(SUM(total), 0)   AS paid_total
      FROM invoices
      WHERE tenant_id = ${tenantId}
        AND status = 'paid'
        AND paid_at >= date_trunc('month', NOW() AT TIME ZONE 'Europe/Warsaw')
        AND paid_at <  date_trunc('month', NOW() AT TIME ZONE 'Europe/Warsaw') + INTERVAL '1 month'
      GROUP BY COALESCE(currency, 'PLN')
    `).then(r => r.rows);
    const monthlyRevenueByCurrency: Record<"PLN" | "EUR", string> = { PLN: "0.00", EUR: "0.00" };
    for (const row of revenueRows) {
      const cur = (row.currency ?? "PLN").toUpperCase();
      if (cur === "PLN" || cur === "EUR") {
        monthlyRevenueByCurrency[cur as "PLN" | "EUR"] = Number(row.paid_total ?? 0).toFixed(2);
      }
    }
    const monthlyRevenue = Number(monthlyRevenueByCurrency.PLN);

    const [zus] = await db.execute<{ total_gross: string | null }>(sql`
      SELECT COALESCE(SUM(gross_pay), 0) AS total_gross
      FROM payroll_records
      WHERE tenant_id = ${tenantId}
        AND month_year = to_char(NOW() AT TIME ZONE 'Europe/Warsaw', 'YYYY-MM')
    `).then(r => r.rows);
    const payrollGross = Number(zus?.total_gross ?? 0);
    const zusLiability = payrollGross > 0
      ? payrollGross * 0.1881
      : activeDeployments * 160 * 31.40 * 0.1881;

    // Weighted pipeline (open deals) per currency + stagnant leads + stage counts
    const weightedRows = await db.execute<{ currency: string; weighted: string | null }>(sql`
      SELECT currency, COALESCE(SUM(estimated_value * probability_pct / 100.0), 0)::numeric(14,2) AS weighted
      FROM client_deals
      WHERE tenant_id = ${tenantId} AND stage = 'OPEN'
      GROUP BY currency
    `).then(r => r.rows);
    const weightedPipeline: Record<"PLN" | "EUR", string> = { PLN: "0.00", EUR: "0.00" };
    for (const row of weightedRows) {
      const cur = (row.currency ?? "PLN").toUpperCase();
      if (cur === "PLN" || cur === "EUR") {
        weightedPipeline[cur as "PLN" | "EUR"] = Number(row.weighted ?? 0).toFixed(2);
      }
    }

    const [stagnantRow] = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*)::text AS cnt FROM clients c
      WHERE c.tenant_id = ${tenantId}
        AND c.stage NOT IN ('SIGNED', 'LOST')
        AND COALESCE(
              (SELECT MAX(created_at) FROM client_activities a
                WHERE a.client_id = c.id AND a.tenant_id = ${tenantId}),
              c.created_at
            ) < (NOW() - INTERVAL '7 days')
    `).then(r => r.rows);
    const stagnantLeads = Number(stagnantRow?.cnt ?? 0);

    const stageRows = await db.execute<{ stage: string; count: string }>(sql`
      SELECT stage, COUNT(*)::text AS count
      FROM clients
      WHERE tenant_id = ${tenantId}
      GROUP BY stage
    `).then(r => r.rows);
    const pipelineCount: Record<string, number> = { LEAD: 0, NEGOTIATING: 0, SIGNED: 0, STALE: 0, LOST: 0 };
    for (const row of stageRows) {
      if (row.stage in pipelineCount) pipelineCount[row.stage] = Number(row.count);
    }

    // Step 3d Task O: WhatsApp counters — both tenant-scoped, both integers.
    // Indexes used: idx_whatsapp_messages_tenant_direction_unread (partial,
    // WHERE read_at IS NULL) for unreadWhatsApp; idx_whatsapp_messages_tenant_status_created
    // for whatsappPendingApproval.
    const [whatsappCounts] = await db.execute<{
      unread_whatsapp: string;
      whatsapp_pending_approval: string;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE direction = 'inbound' AND read_at IS NULL) AS unread_whatsapp,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'APPROVED') AS whatsapp_pending_approval
      FROM whatsapp_messages
      WHERE tenant_id = ${tenantId}
    `).then(r => r.rows);
    const unreadWhatsApp = Number(whatsappCounts?.unread_whatsapp ?? 0);
    const whatsappPendingApproval = Number(whatsappCounts?.whatsapp_pending_approval ?? 0);

    const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
    let stripeMonthlyRevenue = 0;
    if (stripeConfigured) {
      const [stripe] = await db.execute<{ stripe_total: string | null }>(sql`
        SELECT COALESCE(SUM(amount), 0) AS stripe_total
        FROM eej_billing_events
        WHERE org_context = 'EEJ'
          AND event_type = 'invoice.paid'
          AND processed_at >= date_trunc('month', NOW() AT TIME ZONE 'Europe/Warsaw')
      `).then(r => r.rows);
      stripeMonthlyRevenue = Number(stripe?.stripe_total ?? 0);
    }

    return res.json({
      totalCandidates,
      placementPct,
      pendingReviews,
      activeDeployments,
      monthlyRevenue: monthlyRevenue.toFixed(2),
      monthlyRevenueByCurrency,
      weightedPipeline,
      stagnantLeads,
      pipelineCount,
      zusLiability: zusLiability.toFixed(2),
      b2bContracts,
      newApplicationsToday: newToday,
      unreadWhatsApp,
      whatsappPendingApproval,
      schengenAlerts: 0,
      schengenTrackingEnabled: false,
      stripeConfigured,
      stripeMonthlyRevenue: stripeMonthlyRevenue.toFixed(2),
      currency: "PLN",
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin/stats]", err);
    return res.status(500).json({ error: "Could not load executive stats." });
  }
});

router.get("/admin/system-status", authenticateToken, requireAdmin, (_req, res) => {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST ?? null;
  const smtpPort = process.env.SMTP_PORT ?? "587";

  return res.json({
    smtpConfigured: !!(smtpUser && smtpPass),
    smtpHost: smtpHost ?? "smtp.gmail.com (default)",
    smtpPort,
    smtpUser: smtpUser ? smtpUser.replace(/(?<=.{3})./g, "*") : null,
    jwtIsDefault: false, // JWT_SECRET is now required
    databaseConnected: true,
  });
});

export default router;

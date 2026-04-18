import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { authenticateToken, requireT1T2 } from "../lib/authMiddleware.js";
import { requireTenant } from "../lib/tenancy.js";

const router = Router();

// ── Shared helpers ───────────────────────────────────────────────────────────
const CLIENT_STAGES = ["LEAD", "NEGOTIATING", "SIGNED", "STALE", "LOST"] as const;
type ClientStage = typeof CLIENT_STAGES[number];
const DEAL_STAGES = ["OPEN", "WON", "LOST"] as const;
type DealStage = typeof DEAL_STAGES[number];
const DEAL_CURRENCIES = ["PLN", "EUR"] as const;
type DealCurrency = typeof DEAL_CURRENCIES[number];
const ACTIVITY_KINDS = ["note", "call", "email", "meeting", "stage_change"] as const;

function parsePagination(req: { query: Record<string, unknown> }, defaultLimit = 50, max = 200) {
  const rawLimit = Number(req.query.limit ?? defaultLimit);
  const rawOffset = Number(req.query.offset ?? 0);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(Math.floor(rawLimit), max)) : defaultLimit;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
  return { limit, offset };
}

async function assertClientInTenant(clientId: string, tenantId: string): Promise<boolean> {
  const [row] = await db.select({ id: schema.clients.id }).from(schema.clients).where(
    and(eq(schema.clients.id, clientId), eq(schema.clients.tenantId, tenantId))
  );
  return Boolean(row);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/crm/pipeline — dual-currency totals + client stage counts + stagnant leads
// ─────────────────────────────────────────────────────────────────────────────
router.get("/crm/pipeline", authenticateToken, requireT1T2, async (req, res) => {
  try {
    const tenantId = requireTenant(req);

    const dealAggs = await db.execute<{
      currency: DealCurrency;
      total: string | null;
      weighted: string | null;
      count: string;
    }>(sql`
      SELECT
        currency,
        COALESCE(SUM(estimated_value), 0)::numeric(14,2)                                       AS total,
        COALESCE(SUM(estimated_value * probability_pct / 100.0), 0)::numeric(14,2)             AS weighted,
        COUNT(*)::text                                                                          AS count
      FROM client_deals
      WHERE tenant_id = ${tenantId}
        AND stage = 'OPEN'
      GROUP BY currency
    `);

    const deals: Record<DealCurrency, { total: string; weighted: string; count: number }> = {
      PLN: { total: "0.00", weighted: "0.00", count: 0 },
      EUR: { total: "0.00", weighted: "0.00", count: 0 },
    };
    for (const row of dealAggs.rows) {
      if (row.currency === "PLN" || row.currency === "EUR") {
        deals[row.currency] = {
          total: Number(row.total ?? 0).toFixed(2),
          weighted: Number(row.weighted ?? 0).toFixed(2),
          count: Number(row.count ?? 0),
        };
      }
    }

    const clientAggs = await db.execute<{ stage: ClientStage; count: string }>(sql`
      SELECT stage, COUNT(*)::text AS count
      FROM clients
      WHERE tenant_id = ${tenantId}
      GROUP BY stage
    `);
    const clients: Record<ClientStage, number> = { LEAD: 0, NEGOTIATING: 0, SIGNED: 0, STALE: 0, LOST: 0 };
    for (const r of clientAggs.rows) {
      if ((CLIENT_STAGES as readonly string[]).includes(r.stage)) clients[r.stage] = Number(r.count);
    }

    // Stagnant leads: stage NOT IN ('SIGNED','LOST') AND last activity > 7 days ago
    // OR no activity AND client.created_at > 7 days ago.
    const stagnantRow = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*)::text AS cnt FROM clients c
      WHERE c.tenant_id = ${tenantId}
        AND c.stage NOT IN ('SIGNED', 'LOST')
        AND COALESCE(
              (SELECT MAX(created_at) FROM client_activities a
                WHERE a.client_id = c.id AND a.tenant_id = ${tenantId}),
              c.created_at
            ) < (NOW() - INTERVAL '7 days')
    `);
    const stagnantLeads = Number(stagnantRow.rows[0]?.cnt ?? 0);

    const topDealsRows = await db.execute<{
      id: string; client_id: string; title: string;
      estimated_value: string; currency: DealCurrency; probability_pct: number;
      expected_close_date: string | null; stage: DealStage; weighted_value: string;
    }>(sql`
      SELECT id, client_id, title, estimated_value, currency, probability_pct,
             expected_close_date, stage,
             (estimated_value * probability_pct / 100.0)::numeric(14,2) AS weighted_value
      FROM client_deals
      WHERE tenant_id = ${tenantId} AND stage = 'OPEN'
      ORDER BY weighted_value DESC NULLS LAST
      LIMIT 5
    `);
    const topDeals = topDealsRows.rows.map(r => ({
      id: r.id,
      clientId: r.client_id,
      title: r.title,
      estimatedValue: Number(r.estimated_value).toFixed(2),
      currency: r.currency,
      probabilityPct: Number(r.probability_pct),
      expectedCloseDate: r.expected_close_date,
      stage: r.stage,
      weightedValue: Number(r.weighted_value ?? 0).toFixed(2),
    }));

    return res.json({ deals, clients, stagnantLeads, topDeals });
  } catch (err) {
    console.error("[crm/pipeline]", err);
    return res.status(500).json({ error: "Could not load CRM pipeline." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/crm/activity — append an activity to a client
// ─────────────────────────────────────────────────────────────────────────────
router.post("/crm/activity", authenticateToken, requireT1T2, async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      clientId?: string; kind?: string; content?: string; metadata?: unknown;
    };
    if (!body.clientId || typeof body.clientId !== "string") {
      return res.status(400).json({ error: "clientId is required." });
    }
    if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
      return res.status(400).json({ error: "content is required." });
    }
    const kind = (body.kind ?? "note").toString();
    if (!(ACTIVITY_KINDS as readonly string[]).includes(kind)) {
      return res.status(400).json({ error: `kind must be one of ${ACTIVITY_KINDS.join(", ")}` });
    }

    const tenantId = requireTenant(req);
    if (!(await assertClientInTenant(body.clientId, tenantId))) {
      return res.status(404).json({ error: "Client not found." });
    }

    const userId = req.user?.id && /^[0-9a-f-]{36}$/i.test(req.user.id) ? req.user.id : null;
    const [activity] = await db.insert(schema.clientActivities).values({
      clientId: body.clientId,
      userId,
      actorName: req.user?.name ?? null,
      kind,
      content: body.content.trim(),
      metadata: (body.metadata ?? null) as any,
      tenantId,
    }).returning();

    return res.status(201).json({ activity });
  } catch (err) {
    console.error("[crm/activity POST]", err);
    return res.status(500).json({ error: "Could not log activity." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/crm/activities/:clientId — paginated activity timeline
// ─────────────────────────────────────────────────────────────────────────────
router.get("/crm/activities/:clientId", authenticateToken, requireT1T2, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const clientId = String(req.params.clientId);
    if (!(await assertClientInTenant(clientId, tenantId))) {
      return res.status(404).json({ error: "Client not found." });
    }
    const { limit, offset } = parsePagination(req, 50, 200);
    const activities = await db.select().from(schema.clientActivities).where(
      and(eq(schema.clientActivities.clientId, clientId), eq(schema.clientActivities.tenantId, tenantId))
    ).orderBy(desc(schema.clientActivities.createdAt)).limit(limit).offset(offset);
    return res.json({ activities, limit, offset });
  } catch (err) {
    console.error("[crm/activities GET]", err);
    return res.status(500).json({ error: "Could not load activities." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/crm/clients — CRM client list with stage, last activity, open deal rollups
// ─────────────────────────────────────────────────────────────────────────────
router.get("/crm/clients", authenticateToken, requireT1T2, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const { limit, offset } = parsePagination(req, 50, 200);
    const rows = await db.execute<{
      id: string; name: string; contact_person: string | null; email: string | null;
      phone: string | null; nip: string | null; stage: ClientStage; source: string | null;
      created_at: string; updated_at: string;
      last_activity_at: string | null;
      open_deals_count: string;
      open_deals_pln: string | null;
      open_deals_eur: string | null;
    }>(sql`
      SELECT c.id, c.name, c.contact_person, c.email, c.phone, c.nip, c.stage, c.source,
             c.created_at, c.updated_at,
             (SELECT MAX(a.created_at) FROM client_activities a
                WHERE a.client_id = c.id AND a.tenant_id = ${tenantId}) AS last_activity_at,
             COALESCE((SELECT COUNT(*) FROM client_deals d
                WHERE d.client_id = c.id AND d.tenant_id = ${tenantId} AND d.stage = 'OPEN'), 0)::text AS open_deals_count,
             (SELECT COALESCE(SUM(d.estimated_value), 0)::numeric(14,2) FROM client_deals d
                WHERE d.client_id = c.id AND d.tenant_id = ${tenantId} AND d.stage = 'OPEN' AND d.currency = 'PLN') AS open_deals_pln,
             (SELECT COALESCE(SUM(d.estimated_value), 0)::numeric(14,2) FROM client_deals d
                WHERE d.client_id = c.id AND d.tenant_id = ${tenantId} AND d.stage = 'OPEN' AND d.currency = 'EUR') AS open_deals_eur
      FROM clients c
      WHERE c.tenant_id = ${tenantId}
      ORDER BY c.updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    const clients = rows.rows.map(r => ({
      id: r.id,
      name: r.name,
      contactPerson: r.contact_person,
      email: r.email,
      phone: r.phone,
      nip: r.nip,
      stage: r.stage,
      source: r.source,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastActivityAt: r.last_activity_at,
      openDealsCount: Number(r.open_deals_count ?? 0),
      openDealsByCurrency: {
        PLN: Number(r.open_deals_pln ?? 0).toFixed(2),
        EUR: Number(r.open_deals_eur ?? 0).toFixed(2),
      },
    }));
    return res.json({ clients, limit, offset });
  } catch (err) {
    console.error("[crm/clients GET]", err);
    return res.status(500).json({ error: "Could not load CRM clients." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/crm/deals — create deal
// ─────────────────────────────────────────────────────────────────────────────
router.post("/crm/deals", authenticateToken, requireT1T2, async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      clientId?: string; title?: string;
      estimatedValue?: number | string; currency?: string;
      probabilityPct?: number; expectedCloseDate?: string | null;
      stage?: string; invoiceId?: string | null;
    };
    if (!body.clientId) return res.status(400).json({ error: "clientId is required." });
    if (!body.title?.toString().trim()) return res.status(400).json({ error: "title is required." });
    const currency = (body.currency ?? "PLN").toString().toUpperCase();
    if (!(DEAL_CURRENCIES as readonly string[]).includes(currency)) {
      return res.status(400).json({ error: "currency must be PLN or EUR." });
    }
    const probabilityPct = Number(body.probabilityPct ?? 50);
    if (!Number.isFinite(probabilityPct) || probabilityPct < 0 || probabilityPct > 100) {
      return res.status(400).json({ error: "probabilityPct must be 0..100." });
    }
    const estimatedValueNum = Number(body.estimatedValue ?? 0);
    if (!Number.isFinite(estimatedValueNum) || estimatedValueNum < 0) {
      return res.status(400).json({ error: "estimatedValue must be >= 0." });
    }
    const stage = (body.stage ?? "OPEN").toString().toUpperCase();
    if (!(DEAL_STAGES as readonly string[]).includes(stage)) {
      return res.status(400).json({ error: "stage must be OPEN, WON, or LOST." });
    }

    const tenantId = requireTenant(req);
    if (!(await assertClientInTenant(body.clientId, tenantId))) {
      return res.status(404).json({ error: "Client not found." });
    }

    const [deal] = await db.insert(schema.clientDeals).values({
      clientId: body.clientId,
      title: body.title.trim(),
      estimatedValue: estimatedValueNum.toFixed(2),
      currency: currency as DealCurrency,
      probabilityPct: Math.round(probabilityPct),
      expectedCloseDate: body.expectedCloseDate ?? null,
      stage: stage as DealStage,
      invoiceId: body.invoiceId ?? null,
      tenantId,
    }).returning();
    return res.status(201).json({ deal });
  } catch (err) {
    console.error("[crm/deals POST]", err);
    return res.status(500).json({ error: "Could not create deal." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/crm/deals/:id — update deal
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/crm/deals/:id", authenticateToken, requireT1T2, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = String(req.params.id);
    const [existing] = await db.select().from(schema.clientDeals).where(
      and(eq(schema.clientDeals.id, id), eq(schema.clientDeals.tenantId, tenantId))
    );
    if (!existing) return res.status(404).json({ error: "Deal not found." });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.title !== undefined) {
      const t = String(body.title).trim();
      if (!t) return res.status(400).json({ error: "title cannot be empty." });
      updates.title = t;
    }
    if (body.estimatedValue !== undefined) {
      const n = Number(body.estimatedValue);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: "estimatedValue must be >= 0." });
      updates.estimatedValue = n.toFixed(2);
    }
    if (body.currency !== undefined) {
      const c = String(body.currency).toUpperCase();
      if (!(DEAL_CURRENCIES as readonly string[]).includes(c)) {
        return res.status(400).json({ error: "currency must be PLN or EUR." });
      }
      updates.currency = c;
    }
    if (body.probabilityPct !== undefined) {
      const p = Number(body.probabilityPct);
      if (!Number.isFinite(p) || p < 0 || p > 100) return res.status(400).json({ error: "probabilityPct must be 0..100." });
      updates.probabilityPct = Math.round(p);
    }
    if (body.expectedCloseDate !== undefined) {
      updates.expectedCloseDate = body.expectedCloseDate === null ? null : String(body.expectedCloseDate);
    }
    if (body.stage !== undefined) {
      const s = String(body.stage).toUpperCase();
      if (!(DEAL_STAGES as readonly string[]).includes(s)) return res.status(400).json({ error: "stage must be OPEN, WON, or LOST." });
      updates.stage = s;
    }
    if (body.invoiceId !== undefined) {
      updates.invoiceId = body.invoiceId === null ? null : String(body.invoiceId);
    }

    await db.update(schema.clientDeals).set(updates).where(
      and(eq(schema.clientDeals.id, id), eq(schema.clientDeals.tenantId, tenantId))
    );
    const [updated] = await db.select().from(schema.clientDeals).where(
      and(eq(schema.clientDeals.id, id), eq(schema.clientDeals.tenantId, tenantId))
    );
    return res.json({ deal: updated });
  } catch (err) {
    console.error("[crm/deals PATCH]", err);
    return res.status(500).json({ error: "Could not update deal." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/crm/clients/:id/stage — change client stage + append stage_change activity
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/crm/clients/:id/stage", authenticateToken, requireT1T2, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = String(req.params.id);
    const newStage = String((req.body ?? {}).stage ?? "").toUpperCase();
    if (!(CLIENT_STAGES as readonly string[]).includes(newStage)) {
      return res.status(400).json({ error: `stage must be one of ${CLIENT_STAGES.join(", ")}` });
    }

    const [existing] = await db.select().from(schema.clients).where(
      and(eq(schema.clients.id, id), eq(schema.clients.tenantId, tenantId))
    );
    if (!existing) return res.status(404).json({ error: "Client not found." });

    const prevStage = existing.stage;
    if (prevStage === newStage) {
      return res.json({ client: existing, unchanged: true });
    }

    const actorId = req.user?.id && /^[0-9a-f-]{36}$/i.test(req.user.id) ? req.user.id : null;
    const actorName = req.user?.name ?? null;

    const result = await db.transaction(async (tx) => {
      await tx.update(schema.clients).set({
        stage: newStage as ClientStage,
        updatedAt: new Date(),
      }).where(and(eq(schema.clients.id, id), eq(schema.clients.tenantId, tenantId)));

      await tx.insert(schema.clientActivities).values({
        clientId: id,
        userId: actorId,
        actorName,
        kind: "stage_change",
        content: `Stage changed from ${prevStage} to ${newStage}`,
        metadata: { prev_stage: prevStage, new_stage: newStage } as any,
        tenantId,
      });

      const [updated] = await tx.select().from(schema.clients).where(
        and(eq(schema.clients.id, id), eq(schema.clients.tenantId, tenantId))
      );
      return updated;
    });

    return res.json({ client: result });
  } catch (err) {
    console.error("[crm/clients/stage PATCH]", err);
    return res.status(500).json({ error: "Could not update client stage." });
  }
});

export default router;

/**
 * WhatsApp manual draft endpoints (Step 3b Task G).
 *
 * Per STEP3_PLAN.md: all endpoints in this router require
 * authenticateToken + requireT1T2 + requireTenant. The drafter is
 * always available to admins regardless of WHATSAPP_AUTOMATION_ENABLED;
 * the flag only gates auto-trigger hooks elsewhere.
 *
 * Step 3c (inbound webhook) and Step 3d (approve/discard/read +
 * dashboard counters) extend this router in subsequent commits.
 */

import { Router } from "express";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { authenticateToken, requireT1T2 } from "../lib/authMiddleware.js";
import { requireTenant } from "../lib/tenancy.js";
import { createDraft, DrafterError, type WhatsappTriggerEvent } from "../services/whatsapp-drafter.js";
import { isTestWorker } from "../services/test-safety.js";

const router = Router();

const TRIGGER_EVENTS: readonly WhatsappTriggerEvent[] = [
  "application_received",
  "permit_update",
  "payment_reminder",
  "expiry_nudge",
  "manual",
  "inbound_reply",
  "system",
];

const STATUSES = ["DRAFT", "APPROVED", "SENT", "FAILED", "RECEIVED", "DISCARDED"] as const;
type WhatsappStatus = typeof STATUSES[number];

function parsePagination(req: { query: Record<string, unknown> }, defaultLimit = 50, max = 200) {
  const rawLimit = Number(req.query.limit ?? defaultLimit);
  const rawOffset = Number(req.query.offset ?? 0);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(Math.floor(rawLimit), max)) : defaultLimit;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
  return { limit, offset };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/whatsapp/drafts — manual draft creation
// ─────────────────────────────────────────────────────────────────────────────
router.post("/whatsapp/drafts", authenticateToken, requireT1T2, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const body = (req.body ?? {}) as {
      templateName?: unknown;
      workerId?: unknown;
      clientId?: unknown;
      variables?: unknown;
      triggerEvent?: unknown;
    };

    const templateName = typeof body.templateName === "string" ? body.templateName.trim() : "";
    if (!templateName) {
      return res.status(400).json({ error: "templateName is required and must be a non-empty string." });
    }

    const workerId = typeof body.workerId === "string" && body.workerId.length > 0 ? body.workerId : undefined;
    const clientId = typeof body.clientId === "string" && body.clientId.length > 0 ? body.clientId : undefined;
    if (!workerId && !clientId) {
      return res.status(400).json({ error: "At least one of workerId or clientId is required." });
    }

    let variables: Record<string, string> = {};
    if (body.variables !== undefined) {
      if (typeof body.variables !== "object" || body.variables === null || Array.isArray(body.variables)) {
        return res.status(400).json({ error: "variables must be an object mapping name to string value." });
      }
      const entries = Object.entries(body.variables as Record<string, unknown>);
      for (const [k, v] of entries) {
        if (typeof v !== "string") {
          return res.status(400).json({ error: `variable '${k}' must be a string.` });
        }
      }
      variables = body.variables as Record<string, string>;
    }

    const triggerEvent = body.triggerEvent;
    if (!TRIGGER_EVENTS.includes(triggerEvent as WhatsappTriggerEvent)) {
      return res.status(400).json({ error: `triggerEvent must be one of: ${TRIGGER_EVENTS.join(", ")}.` });
    }

    const row = await createDraft({
      tenantId,
      templateName,
      workerId,
      clientId,
      variables,
      triggerEvent: triggerEvent as WhatsappTriggerEvent,
    });

    return res.status(201).json(row);
  } catch (err) {
    if (err instanceof DrafterError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("[whatsapp] POST /drafts failed:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Could not create WhatsApp draft." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/whatsapp/drafts — list, tenant-scoped, status filter, paginated
// ─────────────────────────────────────────────────────────────────────────────
router.get("/whatsapp/drafts", authenticateToken, requireT1T2, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const { limit, offset } = parsePagination(req);

    const rawStatus = typeof req.query.status === "string" ? req.query.status : "DRAFT";
    if (!(STATUSES as readonly string[]).includes(rawStatus)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(", ")}.` });
    }
    const statusFilter = rawStatus as WhatsappStatus;

    const rows = await db.select().from(schema.whatsappMessages).where(
      and(
        eq(schema.whatsappMessages.tenantId, tenantId),
        eq(schema.whatsappMessages.status, statusFilter),
      ),
    ).orderBy(desc(schema.whatsappMessages.createdAt)).limit(limit).offset(offset);

    return res.json({
      drafts: rows,
      pagination: { limit, offset, count: rows.length },
      filter: { status: statusFilter },
    });
  } catch (err) {
    console.error("[whatsapp] GET /drafts failed:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Could not load WhatsApp drafts." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/whatsapp/drafts/:id — single row, tenant-scoped
// ─────────────────────────────────────────────────────────────────────────────
router.get("/whatsapp/drafts/:id", authenticateToken, requireT1T2, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = String(req.params.id);
    const [row] = await db.select().from(schema.whatsappMessages).where(
      and(
        eq(schema.whatsappMessages.id, id),
        eq(schema.whatsappMessages.tenantId, tenantId),
      ),
    ).limit(1);
    if (!row) return res.status(404).json({ error: "Draft not found." });
    return res.json(row);
  } catch (err) {
    console.error("[whatsapp] GET /drafts/:id failed:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Could not load WhatsApp draft." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/whatsapp/drafts/:id/approve — DRAFT → APPROVED, optional → SENT
//
// Step 3d Task M. Per STEP3_PLAN.md: approved_by + approved_at columns on
// whatsapp_messages are the structural enforcement; client_activities and
// notifications carry the side-channel audit trail. No audit_entries routing.
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/whatsapp/drafts/:id/approve", authenticateToken, requireT1T2, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = String(req.params.id);
    const body = (req.body ?? {}) as { sendImmediately?: unknown };
    const sendImmediately = body.sendImmediately === true;

    const [row] = await db.select().from(schema.whatsappMessages).where(
      and(eq(schema.whatsappMessages.id, id), eq(schema.whatsappMessages.tenantId, tenantId)),
    ).limit(1);
    if (!row) return res.status(404).json({ error: "Draft not found." });

    if (row.status !== "DRAFT") {
      return res.status(409).json({ error: `Draft cannot be approved; current status is '${row.status}'.` });
    }

    let isTest = false;
    if (row.workerId) {
      const [worker] = await db.select({
        tenantId: schema.workers.tenantId,
        email: schema.workers.email,
        phone: schema.workers.phone,
      }).from(schema.workers).where(eq(schema.workers.id, row.workerId)).limit(1);
      if (worker) {
        isTest = isTestWorker({
          tenant_id: worker.tenantId,
          email: worker.email ?? undefined,
          phone: worker.phone ?? undefined,
        });
      }
    }

    const reqUser = req.user as { id?: string; email?: string; name?: string } | undefined;
    const userId = typeof reqUser?.id === "string" ? reqUser.id : null;
    const userEmail = typeof reqUser?.email === "string" ? reqUser.email : "unknown";
    const userName = typeof reqUser?.name === "string" ? reqUser.name : null;

    // Atomic: transition to APPROVED + write client_activities side-channel.
    const [approved] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(schema.whatsappMessages).set({
        status: "APPROVED",
        approvedBy: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      }).where(
        and(eq(schema.whatsappMessages.id, id), eq(schema.whatsappMessages.tenantId, tenantId)),
      ).returning();

      if (row.clientId) {
        await tx.insert(schema.clientActivities).values({
          tenantId,
          clientId: row.clientId,
          userId,
          actorName: userName,
          kind: "whatsapp_approval",
          content: `Approved WhatsApp draft ${id}`,
          metadata: { messageId: id, templateId: row.templateId, approvedBy: userId },
        });
      }
      return [updated];
    });

    // Test-worker external send is blocked even after approval is recorded.
    if (sendImmediately && isTest) {
      return res.status(409).json({
        error: "Test worker — external sends blocked. Approval recorded; send refused.",
        approved,
      });
    }

    if (!sendImmediately) {
      return res.json(approved);
    }

    // Send path. Re-validate template + Twilio configuration before any external call.
    if (!approved.templateId) {
      return res.status(409).json({ error: "Cannot send: draft has no template_id." });
    }
    const [template] = await db.select().from(schema.whatsappTemplates).where(
      eq(schema.whatsappTemplates.id, approved.templateId),
    ).limit(1);
    if (!template) {
      return res.status(409).json({ error: "Cannot send: template not found." });
    }
    if (!template.active) {
      return res.status(409).json({
        error: `Cannot send: template '${template.name}' is inactive (no Twilio content_sid provisioned).`,
      });
    }
    if (!template.contentSid) {
      return res.status(409).json({
        error: `Cannot send: template '${template.name}' has no Twilio content_sid.`,
      });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return res.status(503).json({
        error: "Twilio not configured: TWILIO_ACCOUNT_SID and/or TWILIO_AUTH_TOKEN missing.",
      });
    }

    const fromRaw = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886";
    const from = fromRaw.startsWith("whatsapp:") ? fromRaw : `whatsapp:${fromRaw}`;

    let twilioSid: string;
    try {
      const twilioMod = await import("twilio");
      const client = twilioMod.default(accountSid, authToken);
      const message = await client.messages.create({
        contentSid: template.contentSid,
        contentVariables: JSON.stringify(approved.templateVariables ?? {}),
        to: `whatsapp:${approved.phone}`,
        from,
      });
      twilioSid = message.sid;
    } catch (twilioErr) {
      const errMsg = twilioErr instanceof Error ? twilioErr.message : String(twilioErr);
      await db.update(schema.whatsappMessages).set({
        status: "FAILED",
        failedReason: errMsg.slice(0, 500),
        updatedAt: new Date(),
      }).where(eq(schema.whatsappMessages.id, id));
      console.error("[whatsapp] Twilio send failed for draft", id, ":", errMsg);
      return res.status(502).json({ error: `Twilio send failed: ${errMsg}` });
    }

    // Atomic: transition to SENT + write notifications side-channel.
    const [sent] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(schema.whatsappMessages).set({
        status: "SENT",
        sentAt: new Date(),
        twilioMessageSid: twilioSid,
        updatedAt: new Date(),
      }).where(eq(schema.whatsappMessages.id, id)).returning();

      await tx.insert(schema.notifications).values({
        workerId: updated.workerId ?? null,
        workerName: null,
        channel: "whatsapp",
        message: updated.body.slice(0, 500),
        actor: userEmail,
      });
      return [updated];
    });

    return res.json(sent);
  } catch (err) {
    console.error("[whatsapp] PATCH /drafts/:id/approve failed:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Could not approve draft." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/whatsapp/drafts/:id — DRAFT → DISCARDED (does NOT delete row)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/whatsapp/drafts/:id", authenticateToken, requireT1T2, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = String(req.params.id);

    const [existing] = await db.select().from(schema.whatsappMessages).where(
      and(
        eq(schema.whatsappMessages.id, id),
        eq(schema.whatsappMessages.tenantId, tenantId),
      ),
    ).limit(1);
    if (!existing) return res.status(404).json({ error: "Draft not found." });
    if (existing.status !== "DRAFT") {
      return res.status(409).json({ error: `Only DRAFT messages can be discarded; current status is '${existing.status}'.` });
    }

    const [updated] = await db.update(schema.whatsappMessages).set({
      status: "DISCARDED",
      updatedAt: new Date(),
    }).where(
      and(
        eq(schema.whatsappMessages.id, id),
        eq(schema.whatsappMessages.tenantId, tenantId),
      ),
    ).returning();

    return res.json(updated);
  } catch (err) {
    console.error("[whatsapp] DELETE /drafts/:id failed:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Could not discard WhatsApp draft." });
  }
});

export default router;

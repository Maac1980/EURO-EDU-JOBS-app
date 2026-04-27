/**
 * WhatsApp inbound webhook receiver (Step 3c Task K).
 *
 * POST /api/webhooks/whatsapp — receives WhatsApp messages from Twilio.
 *
 * Authentication: Twilio X-Twilio-Signature only. NO JWT — Twilio cannot
 * present one. This is the deliberate design per STEP3_PLAN.md.
 *
 * Body parsing: relies on the global express.urlencoded middleware
 * (app.ts:27). Twilio sends application/x-www-form-urlencoded.
 *
 * Idempotency: Twilio retries on 5xx and slow responses. The partial
 * unique index idx_whatsapp_messages_twilio_sid (Step 3a Task C) is the
 * dedup primitive. Duplicate MessageSids are accepted with 200 + empty
 * TwiML; ON CONFLICT silently drops the duplicate INSERT.
 *
 * Phone matching precedence: workers.phone → clients.phone → orphan.
 * Search across all tenants for an exact normalized-E.164 phone match;
 * if matched, inherit that record's tenant. If unmatched, persist as
 * orphan in tenant 'production' so the message is not lost.
 *
 * Failure mode: every code path returns 200 with empty TwiML, except
 * 503 (TWILIO_AUTH_TOKEN unset — fail closed) and 403 (signature
 * missing/invalid). Internal DB errors are logged and swallowed; Twilio
 * retries on 5xx so we prefer a swallowed error + manual triage over a
 * retry storm.
 */

import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { normalizePhone } from "../lib/phone.js";
import { verifyTwilioSignature } from "../lib/twilio-signature.js";

const router = Router();

const TWIML_OK = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>";

function buildFullUrl(req: { headers: Record<string, unknown>; protocol: string; originalUrl: string; get(name: string): string | undefined }): string {
  const fwdProto = req.headers["x-forwarded-proto"];
  const proto = (typeof fwdProto === "string" && fwdProto.length > 0)
    ? fwdProto.split(",")[0].trim()
    : req.protocol;
  const fwdHost = req.headers["x-forwarded-host"];
  const host = (typeof fwdHost === "string" && fwdHost.length > 0)
    ? fwdHost.split(",")[0].trim()
    : (req.get("host") ?? "");
  return `${proto}://${host}${req.originalUrl}`;
}

router.post("/webhooks/whatsapp", async (req, res) => {
  // Always reply with TwiML on the path that succeeds; helper keeps it consistent.
  const ok = () => res.type("text/xml").status(200).send(TWIML_OK);

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error("[whatsapp-webhook] TWILIO_AUTH_TOKEN not configured — rejecting webhook");
    return res.status(503).json({ error: "Webhook receiver not configured" });
  }

  const signature = req.headers["x-twilio-signature"];
  if (typeof signature !== "string" || signature.length === 0) {
    return res.status(403).json({ error: "Missing X-Twilio-Signature header" });
  }

  const url = buildFullUrl(req);
  const params = (req.body && typeof req.body === "object" && !Array.isArray(req.body))
    ? (req.body as Record<string, string>)
    : {};

  if (!verifyTwilioSignature({ authToken, signature, url, params })) {
    console.warn("[whatsapp-webhook] Invalid signature");
    return res.status(403).json({ error: "Invalid signature" });
  }

  const messageSid = typeof params.MessageSid === "string" ? params.MessageSid : "";
  const fromRaw = typeof params.From === "string" ? params.From : "";
  const body = typeof params.Body === "string" ? params.Body : "";

  // Malformed body or missing MessageSid: don't error to Twilio, just record nothing.
  if (!messageSid) {
    console.warn("[whatsapp-webhook] Missing MessageSid in body — ignoring without insert");
    return ok();
  }

  // Twilio prefixes WhatsApp numbers with "whatsapp:" — strip before normalization.
  const fromCleaned = fromRaw.replace(/^whatsapp:/, "");
  const phone = normalizePhone(fromCleaned);
  if (!phone) {
    console.warn(`[whatsapp-webhook] Could not normalize From phone (raw: ${JSON.stringify(fromRaw)}) — ignoring without insert`);
    return ok();
  }

  // Match worker first, then client, across ALL tenants. The first hit
  // determines tenant_id. Orphan (no match) defaults to 'production'.
  let workerId: string | null = null;
  let clientId: string | null = null;
  let tenantId = "production";

  try {
    const [matchedWorker] = await db.select({
      id: schema.workers.id, tenantId: schema.workers.tenantId,
    }).from(schema.workers).where(eq(schema.workers.phone, phone)).limit(1);

    if (matchedWorker) {
      workerId = matchedWorker.id;
      tenantId = matchedWorker.tenantId;
    } else {
      const [matchedClient] = await db.select({
        id: schema.clients.id, tenantId: schema.clients.tenantId,
      }).from(schema.clients).where(eq(schema.clients.phone, phone)).limit(1);
      if (matchedClient) {
        clientId = matchedClient.id;
        tenantId = matchedClient.tenantId;
      }
    }

    // Idempotent insert. Partial unique index handles dedup.
    await db.execute(sql`
      INSERT INTO whatsapp_messages (
        tenant_id, direction, status, worker_id, client_id, phone, body,
        twilio_message_sid, trigger_event, received_at, is_test_label
      ) VALUES (
        ${tenantId}, 'inbound', 'RECEIVED', ${workerId}, ${clientId}, ${phone}, ${body},
        ${messageSid}, 'inbound_reply', NOW(), FALSE
      )
      ON CONFLICT (twilio_message_sid) WHERE twilio_message_sid IS NOT NULL DO NOTHING
    `);
  } catch (err) {
    console.error("[whatsapp-webhook] insert failed:", err instanceof Error ? err.message : err);
    // Fall through to ok() — do not surface 5xx to Twilio.
  }

  return ok();
});

export default router;

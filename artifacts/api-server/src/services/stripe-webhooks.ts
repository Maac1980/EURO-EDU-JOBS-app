/**
 * EEJ Stripe Webhook Receiver + Billing Events Log
 *
 * POST /api/webhooks/stripe — receives Stripe webhook events
 * Parses: checkout.session.completed, invoice.paid, invoice.payment_failed
 * Logs to: eej_billing_events table (org_context: EEJ)
 * Security: Stripe signature verification (STRIPE_WEBHOOK_SECRET)
 *
 * org_context: EEJ. No external platform dependencies.
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { safeError } from "../lib/security.js";

const router = Router();

// ═══ TABLE SETUP ════════════════════════════════════════════════════════════

async function ensureBillingTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS eej_billing_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stripe_event_id TEXT UNIQUE,
      event_type TEXT NOT NULL,
      employer_name TEXT,
      employer_email TEXT,
      amount INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'pln',
      status TEXT NOT NULL DEFAULT 'received',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_invoice_id TEXT,
      plan_name TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_billing_event_type ON eej_billing_events(event_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_billing_employer ON eej_billing_events(employer_name)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_billing_status ON eej_billing_events(status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_billing_stripe_id ON eej_billing_events(stripe_event_id)`);
}

// ═══ STRIPE SIGNATURE VERIFICATION ══════════════════════════════════════════

function verifyStripeSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const crypto = require("crypto");
    const elements = signature.split(",");
    const timestamp = elements.find((e: string) => e.startsWith("t="))?.split("=")[1];
    const v1Sig = elements.find((e: string) => e.startsWith("v1="))?.split("=")[1];

    if (!timestamp || !v1Sig) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const expectedSig = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");

    return crypto.timingSafeEqual(Buffer.from(v1Sig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

// ═══ WEBHOOK RECEIVER ═══════════════════════════════════════════════════════

// Note: This route needs raw body for signature verification.
// Express must NOT parse JSON for this route — use express.raw() upstream.
router.post("/webhooks/stripe", async (req, res) => {
  try {
    await ensureBillingTable();

    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers["stripe-signature"] as string | undefined;
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

    if (!secret) {
      console.error("[EEJ Stripe] STRIPE_WEBHOOK_SECRET not configured — rejecting webhook");
      return res.status(503).json({ error: "Webhook receiver not configured" });
    }
    if (!signature) {
      console.warn("[EEJ Stripe] Webhook missing stripe-signature header");
      return res.status(400).json({ error: "Missing signature" });
    }
    const valid = verifyStripeSignature(rawBody, signature, secret);
    if (!valid) {
      console.warn("[EEJ Stripe] Invalid webhook signature");
      return res.status(400).json({ error: "Invalid signature" });
    }

    // Parse event
    const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const eventType = event.type as string;
    const eventId = event.id as string;

    // Dedup: check if this event was already processed
    const existing = await db.execute(sql`
      SELECT id FROM eej_billing_events WHERE stripe_event_id = ${eventId} LIMIT 1
    `);
    if (existing.rows.length > 0) {
      return res.json({ received: true, duplicate: true });
    }

    // Extract data based on event type
    let employerName: string | null = null;
    let employerEmail: string | null = null;
    let amount = 0;
    let currency = "pln";
    let status = "received";
    let customerId: string | null = null;
    let subscriptionId: string | null = null;
    let invoiceId: string | null = null;
    let planName: string | null = null;

    switch (eventType) {
      case "checkout.session.completed": {
        const session = event.data?.object;
        employerName = session?.customer_details?.name ?? session?.metadata?.employer_name ?? null;
        employerEmail = session?.customer_details?.email ?? null;
        amount = session?.amount_total ?? 0;
        currency = session?.currency ?? "pln";
        customerId = session?.customer ?? null;
        subscriptionId = session?.subscription ?? null;
        planName = session?.metadata?.plan ?? null;
        status = "completed";
        break;
      }
      case "invoice.paid": {
        const invoice = event.data?.object;
        employerName = invoice?.customer_name ?? null;
        employerEmail = invoice?.customer_email ?? null;
        amount = invoice?.amount_paid ?? 0;
        currency = invoice?.currency ?? "pln";
        customerId = invoice?.customer ?? null;
        subscriptionId = invoice?.subscription ?? null;
        invoiceId = invoice?.id ?? null;
        status = "paid";
        break;
      }
      case "invoice.payment_failed": {
        const failedInvoice = event.data?.object;
        employerName = failedInvoice?.customer_name ?? null;
        employerEmail = failedInvoice?.customer_email ?? null;
        amount = failedInvoice?.amount_due ?? 0;
        currency = failedInvoice?.currency ?? "pln";
        customerId = failedInvoice?.customer ?? null;
        invoiceId = failedInvoice?.id ?? null;
        status = "failed";
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data?.object;
        customerId = sub?.customer ?? null;
        subscriptionId = sub?.id ?? null;
        status = "cancelled";
        break;
      }
      default:
        status = "unhandled";
    }

    // Log to database
    await db.execute(sql`
      INSERT INTO eej_billing_events
        (stripe_event_id, event_type, employer_name, employer_email, amount, currency, status,
         stripe_customer_id, stripe_subscription_id, stripe_invoice_id, plan_name, metadata, org_context, processed_at)
      VALUES
        (${eventId}, ${eventType}, ${employerName}, ${employerEmail}, ${amount}, ${currency}, ${status},
         ${customerId}, ${subscriptionId}, ${invoiceId}, ${planName},
         ${JSON.stringify(event.data?.object ?? {})}::jsonb, 'EEJ', NOW())
    `);

    console.log(`[EEJ Stripe] ${eventType} → ${status} | ${employerName ?? "unknown"} | ${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`);

    return res.json({ received: true, eventType, status });
  } catch (err: any) {
    console.error("[EEJ Stripe] Webhook error:", err.message);
    return safeError(res, err);
  }
});

// ═══ BILLING HISTORY (authenticated) ════════════════════════════════════════

router.get("/billing/events", authenticateToken, async (req, res) => {
  try {
    await ensureBillingTable();
    const { status: filterStatus, limit: lim } = req.query as { status?: string; limit?: string };
    const maxRows = Math.min(parseInt(lim ?? "50", 10), 200);

    const rows = filterStatus
      ? await db.execute(sql`SELECT * FROM eej_billing_events WHERE org_context = 'EEJ' AND status = ${filterStatus} ORDER BY created_at DESC LIMIT ${maxRows}`)
      : await db.execute(sql`SELECT * FROM eej_billing_events WHERE org_context = 'EEJ' ORDER BY created_at DESC LIMIT ${maxRows}`);

    // Summary
    const summaryRows = await db.execute(sql`
      SELECT status, COUNT(*)::int as count, COALESCE(SUM(amount), 0)::int as total_amount
      FROM eej_billing_events WHERE org_context = 'EEJ'
      GROUP BY status ORDER BY count DESC
    `);

    return res.json({
      events: rows.rows,
      total: rows.rows.length,
      summary: summaryRows.rows,
      org_context: "EEJ",
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

export default router;

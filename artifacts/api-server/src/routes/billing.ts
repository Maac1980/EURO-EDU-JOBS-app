import { Router } from "express";
import Stripe from "stripe";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { authenticateToken, requireAdmin } from "../lib/authMiddleware.js";

const router = Router();

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Pricing plans
const PLANS = {
  starter: { name: "Starter", price: 19900, workers: 25, priceId: process.env.STRIPE_STARTER_PRICE_ID },
  professional: { name: "Professional", price: 49900, workers: 100, priceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID },
  enterprise: { name: "Enterprise", price: 99900, workers: -1, priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID }, // -1 = unlimited
};

// GET /api/billing/plans — public pricing page
router.get("/billing/plans", (_req, res) => {
  return res.json({
    plans: Object.entries(PLANS).map(([key, plan]) => ({
      id: key,
      name: plan.name,
      priceEur: plan.price / 100,
      priceFormatted: `€${(plan.price / 100).toFixed(0)}/month`,
      workerLimit: plan.workers === -1 ? "Unlimited" : plan.workers,
      features: key === "starter"
        ? ["25 workers", "Document tracking", "Email alerts", "Basic compliance"]
        : key === "professional"
          ? ["100 workers", "Full ATS pipeline", "AI document scanning", "WhatsApp/SMS alerts", "Invoice generation", "Regulatory intelligence"]
          : ["Unlimited workers", "Everything in Professional", "Custom branding", "API access", "Dedicated support", "Custom contract templates"],
    })),
  });
});

// POST /api/billing/checkout — create Stripe checkout session
router.post("/billing/checkout", async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  const { plan, agencyName, email } = req.body as { plan: string; agencyName: string; email: string };
  if (!plan || !agencyName || !email) return res.status(400).json({ error: "plan, agencyName, and email are required" });

  const planConfig = PLANS[plan as keyof typeof PLANS];
  if (!planConfig) return res.status(400).json({ error: "Invalid plan" });

  try {
    // Create or find Stripe customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customer = customers.data[0];
    if (!customer) {
      customer = await stripe.customers.create({ email, name: agencyName, metadata: { plan } });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: `EEJ ${planConfig.name} Plan`, description: `${planConfig.workers === -1 ? "Unlimited" : planConfig.workers} workers` },
          recurring: { interval: "month" },
          unit_amount: planConfig.price,
        },
        quantity: 1,
      }],
      success_url: `${process.env.APP_URL ?? "http://localhost:5173"}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL ?? "http://localhost:5173"}/billing/cancel`,
      metadata: { agencyName, plan },
    });

    return res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create checkout" });
  }
});

// POST /api/billing/webhook — Stripe webhook handler
router.post("/billing/webhook", async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET not set" });

  let event: Stripe.Event;
  try {
    // For raw body parsing, Express needs rawBody middleware
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[billing] Webhook signature verification failed:", err);
    return res.status(400).json({ error: "Invalid signature" });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const email = session.customer_email ?? (session.customer_details?.email ?? "");
      const plan = session.metadata?.plan ?? "starter";
      const agencyName = session.metadata?.agencyName ?? "New Agency";
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : (session.subscription as any)?.id;

      // Create agency record
      const workerLimit = PLANS[plan as keyof typeof PLANS]?.workers ?? 25;
      await db.insert(schema.agencies).values({
        name: agencyName,
        email,
        plan,
        workerLimit: workerLimit === -1 ? 999999 : workerLimit,
        stripeCustomerId: customerId ?? null,
        stripeSubscriptionId: subscriptionId ?? null,
        billingStatus: "active",
      }).catch(() => {
        // May already exist - update instead
        return db.update(schema.agencies).set({
          plan, workerLimit: workerLimit === -1 ? 999999 : workerLimit,
          stripeCustomerId: customerId ?? null,
          stripeSubscriptionId: subscriptionId ?? null,
          billingStatus: "active",
          updatedAt: new Date(),
        }).where(eq(schema.agencies.email, email));
      });

      // Send welcome email
      try {
        const { sendEmail } = await import("../lib/alerter.js");
        const smtpFrom = process.env.SMTP_FROM ?? process.env.BREVO_SMTP_USER ?? "noreply@edu-jobs.eu";
        await sendEmail({
          from: `EURO EDU JOBS <${smtpFrom}>`,
          to: email,
          subject: `Welcome to EEJ ${PLANS[plan as keyof typeof PLANS]?.name ?? "Starter"} Plan!`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#333;padding:24px;"><h1 style="color:#E9FF70;margin:0;">Welcome to EURO EDU JOBS</h1></div>
            <div style="padding:24px;background:#fff;">
              <p>Hi <strong>${agencyName}</strong>,</p>
              <p>Your <strong>${PLANS[plan as keyof typeof PLANS]?.name}</strong> subscription is now active!</p>
              <ul>
                <li>Worker limit: <strong>${workerLimit === -1 ? "Unlimited" : workerLimit}</strong></li>
                <li>Plan: <strong>EUR ${(PLANS[plan as keyof typeof PLANS]?.price ?? 0) / 100}/month</strong></li>
              </ul>
              <p>Log in to your dashboard to start managing your workforce.</p>
              <p style="color:#888;font-size:12px;">EURO EDU JOBS | edu-jobs.eu</p>
            </div>
          </div>`,
        });
      } catch (e) { console.warn("[billing] Welcome email failed:", e); }

      console.log(`[billing] New subscription: ${agencyName} (${email}) - ${plan}`);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      await db.update(schema.agencies).set({ billingStatus: "cancelled", updatedAt: new Date() })
        .where(eq(schema.agencies.stripeCustomerId, customerId));
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as any)?.id;
      if (customerId) {
        await db.update(schema.agencies).set({ billingStatus: "past_due", updatedAt: new Date() })
          .where(eq(schema.agencies.stripeCustomerId, customerId));
      }
      break;
    }
  }

  return res.json({ received: true });
});

// GET /api/billing/status — current agency billing status
router.get("/billing/status", authenticateToken, async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ error: "Not authenticated" });
    const [agency] = await db.select().from(schema.agencies).where(eq(schema.agencies.email, email));
    if (!agency) return res.json({ hasSubscription: false });
    return res.json({
      hasSubscription: true,
      plan: agency.plan,
      billingStatus: agency.billingStatus,
      workerLimit: agency.workerLimit,
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load billing" });
  }
});

// POST /api/billing/portal — create Stripe customer portal session
router.post("/billing/portal", authenticateToken, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  try {
    const [agency] = await db.select().from(schema.agencies).where(eq(schema.agencies.email, req.user!.email));
    if (!agency?.stripeCustomerId) return res.status(404).json({ error: "No subscription found" });

    const session = await stripe.billingPortal.sessions.create({
      customer: agency.stripeCustomerId,
      return_url: `${process.env.APP_URL ?? "http://localhost:5173"}/settings`,
    });
    return res.json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create portal" });
  }
});

export default router;

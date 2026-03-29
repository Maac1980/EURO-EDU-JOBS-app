import { Router } from "express";
import { db, schema } from "../db/index.js";
import { eq, desc } from "drizzle-orm";
import { authenticateToken, requireAdmin } from "../lib/authMiddleware.js";
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

// POST /api/agency/register — self-service agency registration
router.post("/agency/register", async (req, res) => {
  try {
    const { name, email, phone, contactPerson, password, nip } = req.body as {
      name: string; email: string; phone?: string; contactPerson?: string; password: string; nip?: string;
    };

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Check if agency already exists
    const [existing] = await db.select().from(schema.agencies).where(eq(schema.agencies.email, email.toLowerCase()));
    if (existing) return res.status(409).json({ error: "An agency with this email already exists" });

    // Create agency
    const [agency] = await db.insert(schema.agencies).values({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim() || null,
      contactPerson: contactPerson?.trim() || null,
      nip: nip?.trim() || null,
      plan: "starter",
      workerLimit: 25,
      billingStatus: "trialing",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day trial
    }).returning();

    // Create admin user for this agency
    const passwordHash = await hashPassword(password);
    await db.insert(schema.users).values({
      email: email.toLowerCase().trim(),
      name: contactPerson?.trim() || name.trim(),
      role: "admin",
      passwordHash,
    });

    // Send welcome email
    try {
      const { sendEmail } = await import("../lib/alerter.js");
      const smtpFrom = process.env.SMTP_FROM ?? process.env.BREVO_SMTP_USER ?? "noreply@edu-jobs.eu";
      await sendEmail({
        from: `EURO EDU JOBS <${smtpFrom}>`,
        to: email,
        subject: "Welcome to EURO EDU JOBS - Your 14-day free trial",
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#333;padding:24px;"><h1 style="color:#E9FF70;margin:0;">Welcome to EEJ!</h1></div>
          <div style="padding:24px;background:#fff;">
            <p>Hi <strong>${contactPerson || name}</strong>,</p>
            <p>Your agency <strong>${name}</strong> has been registered with a <strong>14-day free trial</strong>.</p>
            <p>Your trial includes:</p>
            <ul><li>25 workers</li><li>Document tracking</li><li>Compliance alerts</li><li>AI document scanning</li></ul>
            <p>Log in at your dashboard to get started.</p>
            <p style="color:#888;font-size:12px;">EURO EDU JOBS | edu-jobs.eu</p>
          </div>
        </div>`,
      });
    } catch (e) { console.warn("[agency] Welcome email failed:", e); }

    return res.status(201).json({ agency: { id: agency.id, name: agency.name, email: agency.email, plan: agency.plan, trialEndsAt: agency.trialEndsAt } });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Registration failed" });
  }
});

// GET /api/agency/list — admin: list all agencies
router.get("/agency/list", authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const agencies = await db.select().from(schema.agencies).orderBy(desc(schema.agencies.createdAt));
    return res.json({ agencies });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load agencies" });
  }
});

export default router;

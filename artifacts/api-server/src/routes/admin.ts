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

import { Router } from "express";
import jwt from "jsonwebtoken";
import { scrypt, timingSafeEqual } from "crypto";
import { db, schema } from "../db/index.js";
import { eq, sql } from "drizzle-orm";
import { JWT_SECRET } from "../lib/authMiddleware.js";

const router = Router();
const TOKEN_EXPIRY = "7d";

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, storedHash] = parts;
  return new Promise((resolve) => {
    scrypt(password, salt, 64, (err, key) => {
      if (err) { resolve(false); return; }
      try { resolve(timingSafeEqual(Buffer.from(storedHash, "hex"), key)); } catch { resolve(false); }
    });
  });
}

async function hashPassword(password: string): Promise<string> {
  const { randomBytes } = await import("crypto");
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

// Map system_users.role (T1-T4) to mobile-app appRole + tier + shortName.
// Designation refines the mapping at T1: Liza ("Head of Legal & Client
// Relations") gets the legal layout despite her T1 tier — she has T1-level
// visibility but her daily work is TRC/legal, so she lands on LegalHome
// instead of ExecutiveHome. Manish + Anna keep the executive layout.
function roleToMobile(role: string, designation?: string | null) {
  switch (role) {
    case "T1": {
      const isLegal =
        designation?.toLowerCase().includes("legal") ?? false;
      if (isLegal) return { appRole: "legal", tier: 1, shortName: "Legal & Compliance" };
      return { appRole: "executive", tier: 1, shortName: "Executive" };
    }
    case "T2": return { appRole: "legal", tier: 2, shortName: "Legal & Compliance" };
    case "T3": return { appRole: "operations", tier: 3, shortName: "Operations" };
    case "T4": return { appRole: "candidate", tier: 4, shortName: "Candidate Portal" };
    default: return { appRole: "operations", tier: 3, shortName: "Operations" };
  }
}

function verifyEejToken(authHeader: string | undefined): { email: string; role: string; tier: number } | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as Record<string, unknown>;
    return { email: String(decoded.email ?? ""), role: String(decoded.role ?? ""), tier: Number(decoded.tier ?? 3) };
  } catch { return null; }
}

import { loginLimiter } from "../lib/security.js";

// T23 — JWT payload includes per-user permission flags (canViewFinancials +
// nationalityScope). Baking into JWT avoids DB lookup on every gated request;
// flags propagate within TOKEN_EXPIRY (7d) or sooner via /eej/auth/refresh.
function buildPayload(user: typeof schema.systemUsers.$inferSelect) {
  const { appRole, tier, shortName } = roleToMobile(user.role, user.designation);
  return {
    sub: user.id,
    id: user.id,
    email: user.email,
    name: user.name,
    role: appRole,
    tier,
    designation: user.designation,
    shortName,
    tenantId: "production" as const,
    site: null,
    canViewFinancials: user.canViewFinancials,
    nationalityScope: user.nationalityScope,
  };
}

router.post("/eej/auth/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email?.trim() || !password) return res.status(400).json({ error: "Email and password are required." });

  try {
    const [user] = await db.select().from(schema.systemUsers).where(sql`LOWER(${schema.systemUsers.email}) = ${email.trim().toLowerCase()}`);
    if (!user) return res.status(401).json({ error: "Invalid email or password." });
    if (!(await verifyPassword(password, user.passwordHash))) return res.status(401).json({ error: "Invalid email or password." });

    const payload = buildPayload(user);
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    return res.json({
      token,
      user: {
        name: user.name, email: user.email, role: payload.role, tier: payload.tier,
        designation: user.designation, shortName: payload.shortName,
        canViewFinancials: user.canViewFinancials, nationalityScope: user.nationalityScope,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Authentication service unavailable." });
  }
});

// Token refresh — issue a new token if current one is still valid
router.post("/eej/auth/refresh", async (req, res) => {
  const caller = verifyEejToken(req.headers.authorization);
  if (!caller) return res.status(401).json({ error: "Invalid or expired token" });

  try {
    const [user] = await db.select().from(schema.systemUsers).where(sql`LOWER(${schema.systemUsers.email}) = ${caller.email.toLowerCase()}`);
    if (!user) return res.status(401).json({ error: "User not found" });

    const token = jwt.sign(buildPayload(user), JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    return res.json({ token });
  } catch {
    return res.status(500).json({ error: "Refresh failed" });
  }
});

// T23 — GET /eej/auth/me: returns the authenticated mobile user's profile
// including per-user permission flags so the client can gate UI surfaces.
// Server-side gates are the source of truth; this endpoint exists for UI hints.
router.get("/eej/auth/me", async (req, res) => {
  const caller = verifyEejToken(req.headers.authorization);
  if (!caller) return res.status(401).json({ error: "Invalid or expired token" });
  try {
    const [user] = await db.select().from(schema.systemUsers).where(sql`LOWER(${schema.systemUsers.email}) = ${caller.email.toLowerCase()}`);
    if (!user) return res.status(401).json({ error: "User not found" });
    const { appRole, tier, shortName } = roleToMobile(user.role);
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: appRole,
        tier,
        designation: user.designation,
        shortName,
        canViewFinancials: user.canViewFinancials,
        nationalityScope: user.nationalityScope,
      },
    });
  } catch {
    return res.status(500).json({ error: "Profile lookup failed" });
  }
});

// T23 — POST /eej/auth/change-password: rotate the mobile user's password.
// Requires valid EEJ token + current password verification + min-length new password.
router.post("/eej/auth/change-password", async (req, res) => {
  const caller = verifyEejToken(req.headers.authorization);
  if (!caller) return res.status(401).json({ error: "Invalid or expired token" });

  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "currentPassword and newPassword are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  try {
    const [user] = await db.select().from(schema.systemUsers).where(sql`LOWER(${schema.systemUsers.email}) = ${caller.email.toLowerCase()}`);
    if (!user) return res.status(401).json({ error: "User not found" });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    const newHash = await hashPassword(newPassword);
    await db.update(schema.systemUsers).set({ passwordHash: newHash }).where(eq(schema.systemUsers.id, user.id));
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Password rotation failed" });
  }
});

router.get("/eej/auth/users", async (req, res) => {
  const caller = verifyEejToken(req.headers.authorization);
  if (!caller || caller.tier !== 1) return res.status(403).json({ error: "Executive access required." });
  const users = await db.select({ id: schema.systemUsers.id, name: schema.systemUsers.name, email: schema.systemUsers.email, role: schema.systemUsers.role, designation: schema.systemUsers.designation, shortName: schema.systemUsers.shortName }).from(schema.systemUsers);
  return res.json({ users });
});

router.post("/eej/auth/users", async (req, res) => {
  const caller = verifyEejToken(req.headers.authorization);
  if (!caller || caller.tier !== 1) return res.status(403).json({ error: "Executive access required." });
  const { name, email, password, role } = req.body as any;
  if (!name?.trim() || !email?.trim() || !password || !role) return res.status(400).json({ error: "All fields required." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (!["T1", "T2", "T3", "T4"].includes(role)) return res.status(400).json({ error: "Invalid role." });

  const [existing] = await db.select().from(schema.systemUsers).where(sql`LOWER(${schema.systemUsers.email}) = ${email.trim().toLowerCase()}`);
  if (existing) return res.status(409).json({ error: "Email already exists." });

  const { shortName } = roleToMobile(role);
  const designationMap: Record<string, string> = { T1: "Executive Board & Finance", T2: "Legal & Compliance", T3: "Workforce Operations", T4: "Candidate Portal" };
  const passwordHash = await hashPassword(password);
  const [created] = await db.insert(schema.systemUsers).values({
    name: name.trim(), email: email.trim().toLowerCase(), passwordHash,
    role, designation: designationMap[role] ?? "Staff", shortName,
  }).returning();
  return res.status(201).json({ user: { id: created.id, name: created.name, email: created.email, role: created.role, designation: created.designation } });
});

router.delete("/eej/auth/users/:id", async (req, res) => {
  const caller = verifyEejToken(req.headers.authorization);
  if (!caller || caller.tier !== 1) return res.status(403).json({ error: "Executive access required." });
  await db.delete(schema.systemUsers).where(eq(schema.systemUsers.id, String(req.params.id)));
  return res.json({ success: true });
});

export default router;

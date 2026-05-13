import { Router } from "express";
import jwt from "jsonwebtoken";
import { scrypt, timingSafeEqual } from "crypto";
import { db, schema } from "../db/index.js";
import { eq, sql } from "drizzle-orm";
import { JWT_SECRET, authenticateToken, type AuthUser, type UserRole } from "../lib/authMiddleware.js";
import { loginLimiter } from "../lib/security.js";
import { verify2FAToken, user2FAEnabled } from "./twofa.js";
import { appendAuditEntry } from "./audit.js";
import { sendLoginNotification } from "../lib/alerter.js";

const router = Router();

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, storedHash] = parts;
  return new Promise((resolve) => {
    scrypt(password, salt, 64, (err, key) => {
      if (err) { resolve(false); return; }
      try {
        resolve(timingSafeEqual(Buffer.from(storedHash, "hex"), key));
      } catch {
        resolve(false);
      }
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

function getAdminEmail(): string {
  return (process.env.EEJ_ADMIN_EMAIL ?? "anna.b@edu-jobs.eu").trim().toLowerCase();
}

// Dashboard auth unification (May 14). Maps system_users tier+designation to
// dashboard role taxonomy. Translation table (see Phase A audit doc §3):
//   T1 with "legal" in designation → coordinator (Liza)
//   T1 other                       → admin       (Manish, Anna)
//   T2 any                         → coordinator (Marta, reserved)
//   T3 any                         → manager     (Karan, Marjorie, Yana, Piotr)
//   T4 any                         → null (candidate-tier rejected at login)
//   unknown                        → null (defensive)
function roleFromSystemUser(sysUser: { role: string; designation: string | null }): UserRole | null {
  const role = sysUser.role;
  const designation = (sysUser.designation ?? "").toLowerCase();
  if (role === "T1") {
    return designation.includes("legal") ? "coordinator" : "admin";
  }
  if (role === "T2") return "coordinator";
  if (role === "T3") return "manager";
  return null;
}

router.post("/auth/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const emailLower = email.trim().toLowerCase();

  // ── Path 1 (new, May 14): try system_users first ────────────────────────
  // Per Phase A audit doc §1 + §8. System_users is authoritative for the EEJ
  // team (Manish, Anna, Liza, Karan, Marjorie, Yana from T23 seed). Order
  // matters: when an email exists in both tables (Anna), system_users wins
  // and her JWT carries the extended payload.
  const [sysUser] = await db.select().from(schema.systemUsers).where(
    sql`LOWER(${schema.systemUsers.email}) = ${emailLower}`
  );

  if (sysUser) {
    const dashRole = roleFromSystemUser(sysUser);
    if (dashRole === null) {
      // T4 candidate-tier or unknown role — explicit reject with mobile guidance.
      console.warn(`[auth] Login rejected: role ${sysUser.role} not allowed on dashboard for "${emailLower}"`);
      return res.status(403).json({ error: "Dashboard is for staff. Please use the mobile app." });
    }

    const passwordOk = await verifyPassword(password, sysUser.passwordHash);
    if (!passwordOk) {
      console.warn(`[auth] Login rejected: incorrect password for "${emailLower}" (system_users path)`);
      return res.status(401).json({ error: "Incorrect password." });
    }

    // 2FA on system_users path is added in commits 4-5 (TOTP migration +
    // mandatory-for-admin). For now, no 2FA check on this path.

    const payload: AuthUser = {
      id: sysUser.id,
      email: sysUser.email,
      name: sysUser.name,
      role: dashRole,
      site: null, // system_users has no site column
      tenantId: "production", // system_users default tenant
      canViewFinancials: sysUser.canViewFinancials,
      nationalityScope: sysUser.nationalityScope,
      canEditWorkers: sysUser.canEditWorkers,
      designation: sysUser.designation ?? null,
      sourceTable: "system_users",
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });

    appendAuditEntry({
      workerId: sysUser.id,
      actor: sysUser.email,
      field: "SESSION",
      newValue: { role: dashRole, sourceTable: "system_users" },
      action: "ADMIN_LOGIN",
    });

    console.log(`[auth] Login: ${sysUser.email} (${dashRole}, system_users path)`);

    const clientIp =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";
    sendLoginNotification(
      { name: sysUser.name, email: sysUser.email, role: dashRole, site: null },
      clientIp
    ).catch((e) => console.warn("[auth] Login notification failed:", e instanceof Error ? e.message : e));

    return res.json({ token, user: payload });
  }

  // ── Path 2 (legacy fallback): users table ───────────────────────────────
  // Defensive backward-compat per Phase A audit doc §1. Today only Anna exists
  // in the users table and she also exists in system_users, so this path is
  // dormant. Kept for any future user that exists in users but not
  // system_users (would otherwise hit "Access Denied" with no recourse).
  const [found] = await db.select().from(schema.users).where(
    sql`LOWER(${schema.users.email}) = ${emailLower}`
  );

  if (!found) {
    console.warn(`[auth] Login rejected: unknown email "${emailLower}"`);
    return res.status(403).json({ error: "Access Denied: Contact Administrator." });
  }

  let passwordOk = false;

  if (found.role === "admin") {
    const adminEmail = getAdminEmail();
    if (emailLower !== adminEmail) {
      return res.status(403).json({ error: "Access Denied: Contact Administrator." });
    }
    const adminPassword = process.env.EEJ_ADMIN_PASSWORD;
    if (!adminPassword) {
      console.error("[auth] EEJ_ADMIN_PASSWORD not configured — admin login disabled");
      return res.status(503).json({ error: "Admin login not configured. Contact Administrator." });
    }
    passwordOk = password === adminPassword;
  } else {
    if (!found.passwordHash) {
      return res.status(503).json({ error: "Account not configured. Contact Administrator." });
    }
    passwordOk = await verifyPassword(password, found.passwordHash);
  }

  if (!passwordOk) {
    console.warn(`[auth] Login rejected: incorrect password for "${emailLower}"`);
    return res.status(401).json({ error: "Incorrect password." });
  }

  // TOTP 2FA (non-admin, if enabled)
  if (found.role !== "admin" && await user2FAEnabled(found.id)) {
    const totpToken = (req.body as any).totpToken as string | undefined;
    if (!totpToken) {
      return res.status(202).json({ requires2FA: true, message: "Please enter your authenticator code." });
    }
    if (!(await verify2FAToken(found.id, totpToken))) {
      return res.status(401).json({ error: "Invalid authenticator code." });
    }
  }

  // Tenant slug: persisted on users.tenant_id (FK to tenants.slug). Falls back
  // to production for legacy admin rows created before the column existed.
  const payload: AuthUser = {
    id: found.id,
    email: found.email,
    name: found.name,
    role: found.role as AuthUser["role"],
    site: found.site ?? null,
    tenantId: ((found as { tenantId?: string | null }).tenantId ?? "production") || "production",
    sourceTable: "users",
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });

  appendAuditEntry({
    workerId: found.id,
    actor: found.email,
    field: "SESSION",
    newValue: { role: found.role, site: found.site ?? null, sourceTable: "users" },
    action: "ADMIN_LOGIN",
  });

  console.log(`[auth] Login: ${found.email} (${found.role}${found.site ? " @ " + found.site : ""}, users path)`);

  const clientIp =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";
  sendLoginNotification(
    { name: found.name, email: found.email, role: found.role as string, site: found.site ?? null },
    clientIp
  ).catch((e) => console.warn("[auth] Login notification failed:", e instanceof Error ? e.message : e));

  return res.json({ token, user: payload });
});

router.post("/auth/verify", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ valid: false });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ valid: true, user: decoded });
  } catch {
    return res.status(401).json({ valid: false });
  }
});

router.get("/auth/whoami", async (_req, res) => {
  const users = await db.select().from(schema.users);
  return res.json({
    allowedEmail: getAdminEmail(),
    userCount: users.length,
  });
});

router.post("/auth/change-password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "currentPassword and newPassword are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }
  const userReq = req.user!;

  // Dashboard auth unification (May 14): dispatch on sourceTable. Users
  // logged in via system_users path have their id pointing to system_users,
  // not users — querying the legacy users table by that id returns nothing.
  if (userReq.sourceTable === "system_users") {
    const [sysUser] = await db.select().from(schema.systemUsers).where(eq(schema.systemUsers.id, userReq.id));
    if (!sysUser) return res.status(404).json({ error: "User not found." });
    if (!(await verifyPassword(currentPassword, sysUser.passwordHash))) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    const newHash = await hashPassword(newPassword);
    await db.update(schema.systemUsers).set({ passwordHash: newHash }).where(eq(schema.systemUsers.id, userReq.id));
    console.log(`[auth] Password changed: ${sysUser.email} (system_users path)`);
    return res.json({ success: true });
  }

  // Legacy users-table path (Anna's pre-unification token, defensive fallback).
  if (userReq.role === "admin") {
    return res.status(400).json({ error: "Admin password is managed via the EEJ_ADMIN_PASSWORD secret." });
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userReq.id));
  if (!user) return res.status(404).json({ error: "User not found." });

  if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }

  const newHash = await hashPassword(newPassword);
  await db.update(schema.users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(schema.users.id, userReq.id));
  console.log(`[auth] Password changed: ${user.email}`);
  return res.json({ success: true });
});

export default router;

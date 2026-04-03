import { Router } from "express";
import jwt from "jsonwebtoken";
import { scrypt, timingSafeEqual } from "crypto";
import { db, schema } from "../db/index.js";
import { eq, sql } from "drizzle-orm";
import { JWT_SECRET, authenticateToken, type AuthUser } from "../lib/authMiddleware.js";
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

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const emailLower = email.trim().toLowerCase();

  // Look up user in DB
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
    const adminPassword = process.env.EEJ_ADMIN_PASSWORD ?? "EEJ2026!";
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

  const payload: AuthUser = {
    id: found.id,
    email: found.email,
    name: found.name,
    role: found.role as AuthUser["role"],
    site: found.site ?? null,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });

  appendAuditEntry({
    workerId: found.id,
    actor: found.email,
    field: "SESSION",
    newValue: { role: found.role, site: found.site ?? null },
    action: "ADMIN_LOGIN",
  });

  console.log(`[auth] Login: ${found.email} (${found.role}${found.site ? " @ " + found.site : ""})`);

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

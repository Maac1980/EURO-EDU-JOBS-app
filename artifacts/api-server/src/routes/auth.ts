import { Router } from "express";
import jwt from "jsonwebtoken";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { JWT_SECRET, authenticateToken, type AuthUser } from "../lib/authMiddleware.js";
import { verify2FAToken, user2FAEnabled } from "./twofa.js";
import { appendAuditEntry } from "./audit.js";
import { sendLoginOtp, sendLoginNotification } from "../lib/alerter.js";

// ── Email OTP in-memory store ─────────────────────────────────────────────────
// key: userId, value: { otp, expiresAt (ms timestamp) }
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_FILE = join(__dirname, "../../data/users.json");
const PROFILE_FILE = join(__dirname, "../../data/admin-profile.json");

interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "coordinator" | "manager";
  site: string | null;
  password: string | null;
}

function readUsers(): StoredUser[] {
  try {
    if (existsSync(USERS_FILE)) {
      return JSON.parse(readFileSync(USERS_FILE, "utf-8")).users as StoredUser[];
    }
  } catch {}
  return [];
}

function writeUsers(users: StoredUser[]): void {
  const dataDir = join(__dirname, "../../data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2));
}

function getAdminEmail(): string {
  if (process.env.EEJ_ADMIN_EMAIL) return process.env.EEJ_ADMIN_EMAIL.trim().toLowerCase();
  try {
    if (existsSync(PROFILE_FILE)) {
      const profile = JSON.parse(readFileSync(PROFILE_FILE, "utf-8"));
      if (profile?.email) return profile.email.trim().toLowerCase();
    }
  } catch {}
  return "anna.b@edu-jobs.eu";
}

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const emailLower = email.trim().toLowerCase();
  const users = readUsers();
  const found = users.find((u) => u.email.toLowerCase() === emailLower);

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
      return res.status(503).json({ error: "Server not configured. Set EEJ_ADMIN_PASSWORD in Secrets." });
    }
    passwordOk = password === adminPassword;
  } else {
    if (!found.password) {
      return res.status(503).json({ error: "Account not configured. Contact Administrator." });
    }
    passwordOk = password === found.password;
  }

  if (!passwordOk) {
    console.warn(`[auth] Login rejected: incorrect password for "${emailLower}"`);
    return res.status(401).json({ error: "Incorrect password." });
  }

  // ── Email OTP for admin logins (only when SMTP is configured) ───────────
  const emailConfigured = !!(process.env.RESEND_API_KEY);
  if (found.role === "admin" && emailConfigured) {
    const submittedOtp = (req.body as any).emailOtp as string | undefined;
    if (!submittedOtp) {
      const otp = generateOtp();
      otpStore.set(found.id, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });
      sendLoginOtp(found.email, found.name, otp).catch((e) =>
        console.warn("[auth] Email OTP send failed:", e instanceof Error ? e.message : e)
      );
      console.log(`[auth] Email OTP generated for ${found.email} — code: ${otp}`);
      return res.status(202).json({ requiresEmailOtp: true, message: "A 6-digit code has been sent to your email." });
    }
    const stored = otpStore.get(found.id);
    if (!stored || Date.now() > stored.expiresAt) {
      otpStore.delete(found.id);
      return res.status(401).json({ error: "OTP expired. Please log in again." });
    }
    if (submittedOtp !== stored.otp) {
      return res.status(401).json({ error: "Incorrect OTP code." });
    }
    otpStore.delete(found.id);
  }

  // ── TOTP 2FA (non-admin, if enabled) ─────────────────────────────────────
  if (found.role !== "admin" && user2FAEnabled(found.id)) {
    const totpToken = (req.body as any).totpToken as string | undefined;
    if (!totpToken) {
      return res.status(202).json({ requires2FA: true, message: "Please enter your authenticator code." });
    }
    if (!verify2FAToken(found.id, totpToken)) {
      return res.status(401).json({ error: "Invalid authenticator code." });
    }
  }

  const payload: AuthUser = {
    id: found.id,
    email: found.email,
    name: found.name,
    role: found.role,
    site: found.site,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });

  // Audit successful login
  appendAuditEntry({
    workerId: found.id,
    actor: found.email,
    field: "SESSION",
    newValue: { role: found.role, site: found.site ?? null },
    action: "ADMIN_LOGIN",
  });

  console.log(`[auth] ✓ Login: ${found.email} (${found.role}${found.site ? " @ " + found.site : ""})`);

  // ── Fire login notification (email + WhatsApp/SMS) ─────────────────────
  const clientIp =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";
  sendLoginNotification(
    { name: found.name, email: found.email, role: found.role, site: found.site },
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

router.get("/auth/whoami", (_req, res) => {
  const users = readUsers();
  return res.json({
    allowedEmail: getAdminEmail(),
    userCount: users.length,
  });
});

// POST /api/auth/change-password — any authenticated user changes their own password
router.post("/auth/change-password", authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "currentPassword and newPassword are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }
  const userReq = (req as any).user as AuthUser;

  if (userReq.role === "admin") {
    return res.status(400).json({ error: "Admin password is managed via the EEJ_ADMIN_PASSWORD secret. Update it in your deployment settings." });
  }

  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userReq.id);
  if (idx === -1) return res.status(404).json({ error: "User not found." });

  const user = users[idx];
  if (!user.password || user.password !== currentPassword) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }

  users[idx].password = newPassword;
  writeUsers(users);
  console.log(`[auth] Password changed: ${user.email}`);
  return res.json({ success: true });
});

export default router;

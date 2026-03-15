import { Router } from "express";
import jwt from "jsonwebtoken";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { JWT_SECRET, authenticateToken, type AuthUser } from "../lib/authMiddleware.js";

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

  const payload: AuthUser = {
    id: found.id,
    email: found.email,
    name: found.name,
    role: found.role,
    site: found.site,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });

  console.log(`[auth] ✓ Login: ${found.email} (${found.role}${found.site ? " @ " + found.site : ""})`);
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

import { Router } from "express";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { authenticateToken, requireAdmin } from "../lib/authMiddleware.js";

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const PROFILE_FILE = join(DATA_DIR, "admin-profile.json");
const USERS_FILE = join(DATA_DIR, "users.json");

interface AdminProfile {
  fullName: string;
  email: string;
  phone: string;
  role: string;
}

interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "coordinator" | "manager";
  site: string | null;
  password: string | null;
  note?: string;
}

function readProfile(): AdminProfile {
  if (!existsSync(PROFILE_FILE)) {
    mkdirSync(DATA_DIR, { recursive: true });
    const defaults: AdminProfile = {
      fullName: "Anna",
      email: "anna.b@edu-jobs.eu",
      phone: "",
      role: "Administrator",
    };
    writeFileSync(PROFILE_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(readFileSync(PROFILE_FILE, "utf-8")) as AdminProfile;
}

function writeProfile(profile: AdminProfile): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2));
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
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2));
}

// ── Admin Profile ─────────────────────────────────────────────────────────────

router.get("/admin/profile", (_req, res) => {
  try {
    return res.json(readProfile());
  } catch (err) {
    return res.status(500).json({ error: "Could not load admin profile." });
  }
});

router.patch("/admin/profile", (req, res) => {
  try {
    const current = readProfile();
    const { email, phone } = req.body as { email?: string; phone?: string };
    if (email !== undefined) current.email = email.trim();
    if (phone !== undefined) current.phone = phone.trim();
    writeProfile(current);
    return res.json(current);
  } catch (err) {
    return res.status(500).json({ error: "Could not save admin profile." });
  }
});

// ── Team / User Management (admin-only) ───────────────────────────────────────

// GET /admin/users — list all team members (passwords omitted)
router.get("/admin/users", authenticateToken, requireAdmin, (_req, res) => {
  try {
    const users = readUsers().map(({ password: _pw, note: _n, ...u }) => u);
    return res.json({ users });
  } catch {
    return res.status(500).json({ error: "Could not load users." });
  }
});

// POST /admin/users — add a new team member
router.post("/admin/users", authenticateToken, requireAdmin, (req, res) => {
  try {
    const { email, name, role, site, password } = req.body as Partial<StoredUser>;
    if (!email || !name || !role || !password) {
      return res.status(400).json({ error: "email, name, role, and password are required." });
    }
    const users = readUsers();
    if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(409).json({ error: "A user with that email already exists." });
    }
    const newUser: StoredUser = {
      id: randomUUID(),
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role,
      site: site ?? null,
      password,
    };
    writeUsers([...users, newUser]);
    const { password: _pw, ...safe } = newUser;
    return res.status(201).json(safe);
  } catch {
    return res.status(500).json({ error: "Could not create user." });
  }
});

// PATCH /admin/users/:id — update a team member
router.patch("/admin/users/:id", authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const users = readUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return res.status(404).json({ error: "User not found." });
    const { email, name, role, site, password } = req.body as Partial<StoredUser>;
    const user = users[idx];
    // Prevent changing admin's role
    if (user.role === "admin" && role && role !== "admin") {
      return res.status(400).json({ error: "Cannot change the admin's role." });
    }
    if (email !== undefined) user.email = email.trim().toLowerCase();
    if (name !== undefined) user.name = name.trim();
    if (role !== undefined) user.role = role;
    if (site !== undefined) user.site = site ?? null;
    if (password !== undefined && password !== "") user.password = password;
    users[idx] = user;
    writeUsers(users);
    const { password: _pw, ...safe } = user;
    return res.json(safe);
  } catch {
    return res.status(500).json({ error: "Could not update user." });
  }
});

// DELETE /admin/users/:id — remove a team member (cannot delete yourself)
router.delete("/admin/users/:id", authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const users = readUsers();
    const target = users.find((u) => u.id === id);
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.role === "admin") {
      return res.status(400).json({ error: "Cannot delete the admin account." });
    }
    writeUsers(users.filter((u) => u.id !== id));
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Could not delete user." });
  }
});

// GET /api/admin/system-status — returns SMTP and JWT configuration health
router.get("/admin/system-status", authenticateToken, requireAdmin, (_req, res) => {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST ?? null;
  const smtpPort = process.env.SMTP_PORT ?? "587";
  const jwtSecret = process.env.JWT_SECRET ?? null;
  const DEFAULT_SECRET = "eej-jwt-fallback-secret-2024";

  return res.json({
    smtpConfigured: !!(smtpUser && smtpPass),
    smtpHost: smtpHost ?? "smtp.gmail.com (default)",
    smtpPort,
    smtpUser: smtpUser ? smtpUser.replace(/(?<=.{3})./g, "*") : null,
    jwtIsDefault: !jwtSecret || jwtSecret === DEFAULT_SECRET,
  });
});

export default router;

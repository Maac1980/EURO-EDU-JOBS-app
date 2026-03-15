import { Router } from "express";
import jwt from "jsonwebtoken";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_FILE = join(__dirname, "../../data/admin-profile.json");

const JWT_SECRET = process.env.JWT_SECRET ?? "eej-jwt-fallback-secret-2024";

function getAllowedEmail(): string {
  // 1. Env var override
  if (process.env.EEJ_ADMIN_EMAIL) return process.env.EEJ_ADMIN_EMAIL.trim().toLowerCase();
  // 2. Admin profile file
  try {
    if (existsSync(PROFILE_FILE)) {
      const profile = JSON.parse(readFileSync(PROFILE_FILE, "utf-8"));
      if (profile?.email) return profile.email.trim().toLowerCase();
    }
  } catch {}
  // 3. Hard-coded fallback
  return "anna.b@edu-jobs.eu";
}

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const allowedEmail = getAllowedEmail();

  if (email.trim().toLowerCase() !== allowedEmail) {
    console.warn(`[auth] Login rejected: unknown email "${email.trim()}" (allowed: "${allowedEmail}")`);
    return res.status(403).json({ error: "Access Denied: Contact Administrator." });
  }

  const adminPassword = process.env.EEJ_ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(503).json({ error: "Server not configured. Set EEJ_ADMIN_PASSWORD in Secrets." });
  }

  if (password !== adminPassword) {
    console.warn(`[auth] Login rejected: incorrect password for "${email.trim()}"`);
    return res.status(401).json({ error: "Incorrect password." });
  }

  const token = jwt.sign(
    { email: allowedEmail, name: "Anna B", role: "Admin" },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

  console.log(`[auth] ✓ Login successful for ${allowedEmail}`);
  return res.json({
    token,
    user: { email: allowedEmail, name: "Anna B", role: "Admin" },
  });
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

// GET /api/auth/whoami — tells the frontend what email is accepted
router.get("/auth/whoami", (_req, res) => {
  return res.json({ allowedEmail: getAllowedEmail() });
});

export default router;

import { Router } from "express";
import jwt from "jsonwebtoken";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "eej-jwt-fallback-secret-2024";
const ALLOWED_EMAIL = "anna.b@edu-jobs.eu";

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  if (email.trim().toLowerCase() !== ALLOWED_EMAIL) {
    return res.status(403).json({ error: "Access Denied: Contact Administrator." });
  }

  const adminPassword = process.env.EEJ_ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(503).json({ error: "Server not configured. Set EEJ_ADMIN_PASSWORD in Secrets." });
  }

  if (password !== adminPassword) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  const token = jwt.sign(
    { email: ALLOWED_EMAIL, name: "Anna B", role: "Admin" },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

  return res.json({
    token,
    user: { email: ALLOWED_EMAIL, name: "Anna B", role: "Admin" },
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

export default router;

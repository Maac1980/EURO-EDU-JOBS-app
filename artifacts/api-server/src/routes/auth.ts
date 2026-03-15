import { Router } from "express";
import jwt from "jsonwebtoken";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "eej-jwt-fallback-secret-2024";

function getUsers() {
  const users = [];
  for (let i = 1; i <= 4; i++) {
    const email = process.env[`EEJ_EMAIL_${i}`]?.trim().toLowerCase();
    const password = process.env[`EEJ_PASS_${i}`]?.trim();
    const role = process.env[`EEJ_ROLE_${i}`]?.trim() ?? "Staff";
    if (email && password) {
      users.push({ email, password, role, name: email.split("@")[0] });
    }
  }
  return users;
}

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const users = getUsers();

  if (users.length === 0) {
    return res.status(503).json({
      error: "No users configured. Please set EEJ_EMAIL_1 and EEJ_PASS_1 in Secrets.",
    });
  }

  const match = users.find(
    (u) => u.email === email.trim().toLowerCase() && u.password === password
  );

  if (!match) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = jwt.sign(
    { email: match.email, name: match.name, role: match.role },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

  return res.json({
    token,
    user: { email: match.email, name: match.name, role: match.role },
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

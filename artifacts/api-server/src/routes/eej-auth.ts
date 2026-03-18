import { Router } from "express";
import jwt from "jsonwebtoken";
import { findUserByEmail, verifyPassword, createSystemUser, listAllUsers, deleteSystemUser } from "../lib/airtable-users.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? "eej-jwt-fallback-secret-2024";
const TOKEN_EXPIRY = "7d";

function roleToMobile(role: string): { appRole: string; tier: number; shortName: string } {
  switch (role) {
    case "T1": return { appRole: "executive",  tier: 1, shortName: "Executive" };
    case "T2": return { appRole: "legal",       tier: 2, shortName: "Legal & Compliance" };
    case "T3": return { appRole: "operations",  tier: 3, shortName: "Operations" };
    case "T4": return { appRole: "candidate",   tier: 4, shortName: "Candidate Portal" };
    default:   return { appRole: "operations",  tier: 3, shortName: "Operations" };
  }
}

function verifyEejToken(authHeader: string | undefined): { email: string; role: string; tier: number } | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as Record<string, unknown>;
    return {
      email: String(decoded.email ?? ""),
      role:  String(decoded.role  ?? ""),
      tier:  Number(decoded.tier  ?? 3),
    };
  } catch {
    return null;
  }
}

// POST /api/eej/auth/login
router.post("/eej/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const user = await findUserByEmail(email.trim());
    if (!user) {
      console.warn(`[eej-auth] Login rejected: unknown email "${email.trim()}"`);
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      console.warn(`[eej-auth] Login rejected: wrong password for "${user.email}"`);
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const { appRole, tier, shortName } = roleToMobile(user.role);

    const payload = {
      sub:         user.id,
      email:       user.email,
      name:        user.name,
      role:        appRole,
      tier,
      designation: user.designation,
      shortName,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

    console.log(`[eej-auth] ✓ Login: ${user.email} (${user.role})`);

    return res.json({
      token,
      user: {
        name:        user.name,
        email:       user.email,
        role:        appRole,
        tier,
        designation: user.designation,
        shortName,
      },
    });
  } catch (err) {
    console.error("[eej-auth] Login error:", err);
    return res.status(500).json({ error: "Authentication service unavailable. Try again." });
  }
});

// GET /api/eej/auth/users — T1 only: list all system users
router.get("/eej/auth/users", async (req, res) => {
  const caller = verifyEejToken(req.headers.authorization);
  if (!caller || caller.tier !== 1) {
    return res.status(403).json({ error: "Executive access required." });
  }
  try {
    const users = await listAllUsers();
    return res.json({
      users: users.map((u) => ({
        id:          u.id,
        name:        u.name,
        email:       u.email,
        role:        u.role,
        designation: u.designation,
        shortName:   u.shortName,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: "Could not load users." });
  }
});

// POST /api/eej/auth/users — T1 only: create a new staff user
router.post("/eej/auth/users", async (req, res) => {
  const caller = verifyEejToken(req.headers.authorization);
  if (!caller || caller.tier !== 1) {
    return res.status(403).json({ error: "Executive access required." });
  }

  const { name, email, password, role } = req.body as {
    name?: string; email?: string; password?: string; role?: string;
  };

  if (!name?.trim() || !email?.trim() || !password || !role) {
    return res.status(400).json({ error: "Name, email, password and role are all required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  if (!["T1", "T2", "T3", "T4"].includes(role)) {
    return res.status(400).json({ error: "Role must be T1, T2, T3 or T4." });
  }

  const existing = await findUserByEmail(email.trim());
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const { shortName } = roleToMobile(role);
  const designationMap: Record<string, string> = {
    T1: "Executive Board & Finance",
    T2: "Legal & Compliance",
    T3: "Workforce Operations",
    T4: "Candidate Portal",
  };
  const designation = designationMap[role] ?? "Staff";

  try {
    const created = await createSystemUser(
      name.trim(),
      email.trim(),
      password,
      role as "T1" | "T2" | "T3" | "T4",
      designation,
      shortName
    );
    console.log(`[eej-auth] ✓ Created user: ${created.email} (${role}) by ${caller.email}`);
    return res.status(201).json({
      user: {
        id:          created.id,
        name:        created.name,
        email:       created.email,
        role:        created.role,
        designation: created.designation,
      },
    });
  } catch (err) {
    console.error("[eej-auth] Create user error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create user." });
  }
});

// DELETE /api/eej/auth/users/:id — T1 only
router.delete("/eej/auth/users/:id", async (req, res) => {
  const caller = verifyEejToken(req.headers.authorization);
  if (!caller || caller.tier !== 1) {
    return res.status(403).json({ error: "Executive access required." });
  }
  try {
    await deleteSystemUser(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Delete failed." });
  }
});

export default router;

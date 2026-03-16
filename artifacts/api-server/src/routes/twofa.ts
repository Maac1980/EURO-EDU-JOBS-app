import { Router } from "express";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { authenticateToken, type AuthUser } from "../lib/authMiddleware.js";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const USERS_FILE = join(DATA_DIR, "users.json");

interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "coordinator" | "manager";
  site: string | null;
  password: string | null;
  twoFactorSecret?: string | null;
  twoFactorEnabled?: boolean;
}

function readUsers(): StoredUser[] {
  try {
    if (existsSync(USERS_FILE)) return JSON.parse(readFileSync(USERS_FILE, "utf-8")).users as StoredUser[];
  } catch {}
  return [];
}

function writeUsers(users: StoredUser[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2));
}

// POST /api/2fa/setup — generates a new TOTP secret and returns QR code data URL
router.post("/2fa/setup", authenticateToken, async (req, res) => {
  const user = (req as any).user as AuthUser;
  const secret = speakeasy.generateSecret({ name: `EEJ Portal (${user.email})`, length: 20 });
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx === -1) return res.status(404).json({ error: "User not found." });
  users[idx].twoFactorSecret = secret.base32;
  users[idx].twoFactorEnabled = false;
  writeUsers(users);
  const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url ?? "");
  return res.json({ secret: secret.base32, qrDataUrl });
});

// POST /api/2fa/verify — confirms the code and activates 2FA
router.post("/2fa/verify", authenticateToken, (req, res) => {
  const user = (req as any).user as AuthUser;
  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ error: "TOTP token is required." });
  const users = readUsers();
  const stored = users.find((u) => u.id === user.id);
  if (!stored?.twoFactorSecret) return res.status(400).json({ error: "2FA not set up. Call /api/2fa/setup first." });
  const valid = speakeasy.totp.verify({ secret: stored.twoFactorSecret, encoding: "base32", token, window: 1 });
  if (!valid) return res.status(401).json({ error: "Invalid code. Please try again." });
  const idx = users.findIndex((u) => u.id === user.id);
  users[idx].twoFactorEnabled = true;
  writeUsers(users);
  return res.json({ success: true });
});

// POST /api/2fa/disable — removes 2FA
router.post("/2fa/disable", authenticateToken, (req, res) => {
  const user = (req as any).user as AuthUser;
  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ error: "TOTP token is required to disable 2FA." });
  const users = readUsers();
  const stored = users.find((u) => u.id === user.id);
  if (!stored?.twoFactorEnabled || !stored?.twoFactorSecret) return res.status(400).json({ error: "2FA is not enabled." });
  const valid = speakeasy.totp.verify({ secret: stored.twoFactorSecret, encoding: "base32", token, window: 1 });
  if (!valid) return res.status(401).json({ error: "Invalid code." });
  const idx = users.findIndex((u) => u.id === user.id);
  users[idx].twoFactorSecret = null;
  users[idx].twoFactorEnabled = false;
  writeUsers(users);
  return res.json({ success: true });
});

// GET /api/2fa/status — returns 2FA status for the current user
router.get("/2fa/status", authenticateToken, (req, res) => {
  const user = (req as any).user as AuthUser;
  const users = readUsers();
  const stored = users.find((u) => u.id === user.id);
  return res.json({ enabled: !!(stored?.twoFactorEnabled) });
});

export { router as twofaRouter };

// Helper: check if a user has 2FA and if the provided token is valid
export function verify2FAToken(userId: string, token: string): boolean {
  const users = readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user?.twoFactorEnabled || !user?.twoFactorSecret) return true; // 2FA not enabled — pass through
  return speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: "base32", token, window: 1 });
}

export function user2FAEnabled(userId: string): boolean {
  const users = readUsers();
  const user = users.find((u) => u.id === userId);
  return !!(user?.twoFactorEnabled);
}

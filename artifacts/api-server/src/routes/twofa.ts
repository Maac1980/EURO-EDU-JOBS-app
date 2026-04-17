import { Router } from "express";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { authenticateToken, type AuthUser } from "../lib/authMiddleware.js";

const router = Router();

// [tenancy] 2FA routes key on req.user.id (globally unique UUID) that was
// already resolved via the authenticated JWT. The user's tenantId is
// intrinsic to the row they're modifying — no extra tenant filter needed.
router.post("/2fa/setup", authenticateToken, async (req, res) => {
  const user = req.user!;
  const secret = speakeasy.generateSecret({ name: `EEJ Portal (${user.email})`, length: 20 });
  await db.update(schema.users).set({ twoFactorSecret: secret.base32, twoFactorEnabled: false }).where(eq(schema.users.id, user.id));
  const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url ?? "");
  return res.json({ secret: secret.base32, qrDataUrl });
});

router.post("/2fa/verify", authenticateToken, async (req, res) => {
  const user = req.user!;
  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ error: "TOTP token is required." });
  const [stored] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  if (!stored?.twoFactorSecret) return res.status(400).json({ error: "2FA not set up." });
  const valid = speakeasy.totp.verify({ secret: stored.twoFactorSecret, encoding: "base32", token, window: 1 });
  if (!valid) return res.status(401).json({ error: "Invalid code." });
  await db.update(schema.users).set({ twoFactorEnabled: true }).where(eq(schema.users.id, user.id));
  return res.json({ success: true });
});

router.post("/2fa/disable", authenticateToken, async (req, res) => {
  const user = req.user!;
  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ error: "TOTP token required." });
  const [stored] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  if (!stored?.twoFactorEnabled || !stored?.twoFactorSecret) return res.status(400).json({ error: "2FA is not enabled." });
  const valid = speakeasy.totp.verify({ secret: stored.twoFactorSecret, encoding: "base32", token, window: 1 });
  if (!valid) return res.status(401).json({ error: "Invalid code." });
  await db.update(schema.users).set({ twoFactorSecret: null, twoFactorEnabled: false }).where(eq(schema.users.id, user.id));
  return res.json({ success: true });
});

router.get("/2fa/status", authenticateToken, async (req, res) => {
  const [stored] = await db.select().from(schema.users).where(eq(schema.users.id, req.user!.id));
  return res.json({ enabled: !!(stored?.twoFactorEnabled) });
});

export { router as twofaRouter };

// Helper functions used by auth.ts
export async function verify2FAToken(userId: string, token: string): Promise<boolean> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user?.twoFactorEnabled || !user?.twoFactorSecret) return true;
  return speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: "base32", token, window: 1 });
}

export async function user2FAEnabled(userId: string): Promise<boolean> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return !!(user?.twoFactorEnabled);
}

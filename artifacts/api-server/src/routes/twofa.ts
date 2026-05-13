import { Router } from "express";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

// Dashboard auth unification (May 15, commit 5a). TOTP columns live on BOTH
// system_users and users tables now (commit 4 migrated them to system_users).
// Helpers + routes below dispatch on the caller's sourceTable so the unified
// auth path updates the right row. Default sourceTable is "users" — preserves
// backward-compat for legacy tokens that don't carry the field.
//
// Per audit doc §11.5 Commit 5 dependencies: approach (a) explicit parameter
// dispatch chosen over (b) internal both-table-check. Reasoning: cleaner,
// faster (one query not two), callsites are countable.

type SourceTable = "system_users" | "users";

async function get2FARow(userId: string, sourceTable: SourceTable | undefined): Promise<
  { id: string; twoFactorSecret: string | null; twoFactorEnabled: boolean } | null
> {
  if ((sourceTable ?? "users") === "system_users") {
    const [row] = await db.select({
      id: schema.systemUsers.id,
      twoFactorSecret: schema.systemUsers.twoFactorSecret,
      twoFactorEnabled: schema.systemUsers.twoFactorEnabled,
    }).from(schema.systemUsers).where(eq(schema.systemUsers.id, userId));
    return row ?? null;
  }
  const [row] = await db.select({
    id: schema.users.id,
    twoFactorSecret: schema.users.twoFactorSecret,
    twoFactorEnabled: schema.users.twoFactorEnabled,
  }).from(schema.users).where(eq(schema.users.id, userId));
  if (!row) return null;
  // users.twoFactorEnabled is nullable; normalize to boolean.
  return { id: row.id, twoFactorSecret: row.twoFactorSecret, twoFactorEnabled: !!row.twoFactorEnabled };
}

async function set2FAFields(
  userId: string,
  sourceTable: SourceTable | undefined,
  fields: { twoFactorSecret?: string | null; twoFactorEnabled?: boolean },
): Promise<void> {
  if ((sourceTable ?? "users") === "system_users") {
    await db.update(schema.systemUsers).set(fields).where(eq(schema.systemUsers.id, userId));
    return;
  }
  await db.update(schema.users).set(fields).where(eq(schema.users.id, userId));
}

router.post("/2fa/setup", authenticateToken, async (req, res) => {
  const user = req.user!;
  const secret = speakeasy.generateSecret({ name: `EEJ Portal (${user.email})`, length: 20 });
  await set2FAFields(user.id, user.sourceTable, {
    twoFactorSecret: secret.base32,
    twoFactorEnabled: false,
  });
  const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url ?? "");
  return res.json({ secret: secret.base32, qrDataUrl });
});

router.post("/2fa/verify", authenticateToken, async (req, res) => {
  const user = req.user!;
  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ error: "TOTP token is required." });
  const stored = await get2FARow(user.id, user.sourceTable);
  if (!stored?.twoFactorSecret) return res.status(400).json({ error: "2FA not set up." });
  const valid = speakeasy.totp.verify({ secret: stored.twoFactorSecret, encoding: "base32", token, window: 1 });
  if (!valid) return res.status(401).json({ error: "Invalid code." });
  await set2FAFields(user.id, user.sourceTable, { twoFactorEnabled: true });
  return res.json({ success: true });
});

router.post("/2fa/disable", authenticateToken, async (req, res) => {
  const user = req.user!;
  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ error: "TOTP token required." });
  const stored = await get2FARow(user.id, user.sourceTable);
  if (!stored?.twoFactorEnabled || !stored?.twoFactorSecret) return res.status(400).json({ error: "2FA is not enabled." });
  const valid = speakeasy.totp.verify({ secret: stored.twoFactorSecret, encoding: "base32", token, window: 1 });
  if (!valid) return res.status(401).json({ error: "Invalid code." });
  await set2FAFields(user.id, user.sourceTable, {
    twoFactorSecret: null,
    twoFactorEnabled: false,
  });
  return res.json({ success: true });
});

router.get("/2fa/status", authenticateToken, async (req, res) => {
  const stored = await get2FARow(req.user!.id, req.user!.sourceTable);
  return res.json({ enabled: !!(stored?.twoFactorEnabled) });
});

export { router as twofaRouter };

// Helper functions used by auth.ts. SourceTable parameter added in commit 5a
// (dashboard auth unification). Default "users" preserves existing callers.
export async function verify2FAToken(
  userId: string,
  token: string,
  sourceTable: SourceTable | undefined = "users",
): Promise<boolean> {
  const row = await get2FARow(userId, sourceTable);
  if (!row?.twoFactorEnabled || !row?.twoFactorSecret) return true;
  return speakeasy.totp.verify({ secret: row.twoFactorSecret, encoding: "base32", token, window: 1 });
}

export async function user2FAEnabled(
  userId: string,
  sourceTable: SourceTable | undefined = "users",
): Promise<boolean> {
  const row = await get2FARow(userId, sourceTable);
  return !!(row?.twoFactorEnabled);
}

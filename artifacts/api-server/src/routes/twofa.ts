import { Router } from "express";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { authenticateToken, requireAdmin } from "../lib/authMiddleware.js";

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

// ── Recovery codes (May 15, commit 5b) — system_users only ─────────────────
// Stored on system_users.recovery_codes_hashed as a JSON array of
// scrypt-salted hashes. Plaintext returned ONCE at generation time. Each
// code is single-use: matched code is removed from the array on login.
// Lost-phone fallback path; primary auth is still TOTP.
//
// Format: "XXXX-XXXX" (8 hex chars, 4-4 with dash). 10 codes generated.
// Subsequent regeneration overwrites the array — old codes invalidated.

const RECOVERY_CODE_COUNT = 10;

function generateRecoveryCode(): string {
  const hex = randomBytes(4).toString("hex").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

async function scryptHashCode(code: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(code, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

async function verifyHashedCode(code: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, storedHash] = parts;
  return new Promise((resolve) => {
    scrypt(code, salt, 64, (err, key) => {
      if (err) { resolve(false); return; }
      try {
        const a = Buffer.from(storedHash, "hex");
        const b = key;
        if (a.length !== b.length) { resolve(false); return; }
        resolve(timingSafeEqual(a, b));
      } catch {
        resolve(false);
      }
    });
  });
}

router.post("/2fa/recovery-codes/generate", authenticateToken, async (req, res) => {
  const user = req.user!;
  // Recovery codes are a system_users-only feature today (column lives there).
  if ((user.sourceTable ?? "users") !== "system_users") {
    return res.status(400).json({ error: "Recovery codes require system_users auth." });
  }
  const stored = await get2FARow(user.id, "system_users");
  if (!stored?.twoFactorEnabled) {
    return res.status(400).json({ error: "Enable 2FA before generating recovery codes." });
  }
  const codes: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = generateRecoveryCode();
    codes.push(code);
    hashed.push(await scryptHashCode(code));
  }
  await db.update(schema.systemUsers)
    .set({ recoveryCodesHashed: JSON.stringify(hashed) })
    .where(eq(schema.systemUsers.id, user.id));
  return res.json({ codes, count: codes.length });
});

// Consumes a recovery code. Returns true on match (and removes it from the
// stored array). False on no match. Only operates on system_users today.
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const [row] = await db.select({ recoveryCodesHashed: schema.systemUsers.recoveryCodesHashed })
    .from(schema.systemUsers)
    .where(eq(schema.systemUsers.id, userId));
  if (!row?.recoveryCodesHashed) return false;
  let codesArray: string[];
  try {
    codesArray = JSON.parse(row.recoveryCodesHashed);
    if (!Array.isArray(codesArray)) return false;
  } catch {
    return false;
  }
  const normalizedCode = code.trim().toUpperCase();
  for (let i = 0; i < codesArray.length; i++) {
    if (await verifyHashedCode(normalizedCode, codesArray[i])) {
      // Consume — remove this hash from the array
      const remaining = [...codesArray.slice(0, i), ...codesArray.slice(i + 1)];
      await db.update(schema.systemUsers)
        .set({ recoveryCodesHashed: remaining.length > 0 ? JSON.stringify(remaining) : null })
        .where(eq(schema.systemUsers.id, userId));
      return true;
    }
  }
  return false;
}

// ── Admin reset (May 15, commit 5b) — admin clears another user's 2FA ──────
// Lost-phone-without-recovery-code path. Manish/Anna can reset Liza, Karan,
// Marjorie, Yana after identity confirmation (out-of-band). Clears
// two_factor_secret, two_factor_enabled, recovery_codes_hashed. The
// requires_2fa flag stays TRUE if it was — admin policy isn't cleared, only
// the user's current 2FA state. On next login the user re-enters the
// setup-required flow.

router.post("/2fa/admin-reset", authenticateToken, requireAdmin, async (req, res) => {
  const { targetUserId, sourceTable: targetSource } = req.body as {
    targetUserId?: string;
    sourceTable?: "system_users" | "users";
  };
  if (!targetUserId) {
    return res.status(400).json({ error: "targetUserId is required." });
  }
  const targetTable = (targetSource ?? "system_users") === "system_users" ? "system_users" : "users";
  if (targetTable === "system_users") {
    const result = await db.update(schema.systemUsers).set({
      twoFactorSecret: null,
      twoFactorEnabled: false,
      recoveryCodesHashed: null,
    }).where(eq(schema.systemUsers.id, targetUserId)).returning({ id: schema.systemUsers.id });
    if (result.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
  } else {
    const result = await db.update(schema.users).set({
      twoFactorSecret: null,
      twoFactorEnabled: false,
    }).where(eq(schema.users.id, targetUserId)).returning({ id: schema.users.id });
    if (result.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
  }
  console.log(`[2fa] Admin reset by ${req.user!.email} for user ${targetUserId} (${targetTable})`);
  return res.json({ success: true, targetUserId, sourceTable: targetTable });
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

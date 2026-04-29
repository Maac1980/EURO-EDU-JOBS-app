import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function resolveKey(): Buffer {
  const raw = process.env.EEJ_ENCRYPTION_KEY?.trim();
  if (raw) {
    // Try hex first (64 chars = 32 bytes)
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, "hex");
    }
    // Try base64 (must decode to 32 bytes)
    try {
      const b = Buffer.from(raw, "base64");
      if (b.length === KEY_BYTES) return b;
    } catch { /* fall through */ }
    console.warn("[encryption] EEJ_ENCRYPTION_KEY is set but not a valid 32-byte hex or base64 value — falling back to JWT_SECRET derivation.");
  } else {
    console.warn("[encryption] EEJ_ENCRYPTION_KEY not set — deriving key from JWT_SECRET (set EEJ_ENCRYPTION_KEY for production).");
  }
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("[encryption] JWT_SECRET required for key derivation fallback");
  }
  return createHash("sha256").update(jwtSecret).digest();
}

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!cachedKey) cachedKey = resolveKey();
  return cachedKey;
}

export function isEncrypted(s: unknown): boolean {
  return typeof s === "string" && s.startsWith(PREFIX);
}

export function encrypt(plain: string): string {
  if (typeof plain !== "string" || plain.length === 0) return plain;
  if (isEncrypted(plain)) return plain;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decrypt(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (typeof stored !== "string") return null;
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const parts = stored.slice(PREFIX.length).split(":");
    if (parts.length !== 3) return stored;
    const [ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const decipher = createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch (e) {
    console.error("[encryption] decrypt failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export function maskSensitive(value: string | null | undefined): string | null {
  if (value == null) return null;
  const plain = decrypt(value);
  if (!plain) return null;
  if (plain.length <= 4) return "***";
  const last4 = plain.slice(-4);
  return `***-****-${last4}`;
}

export function encryptIfPresent(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return encrypt(trimmed);
}

// ── PII projection by role ───────────────────────────────────────────────────
// Privileged roles (T1/T2 etc.) see decrypted PESEL/IBAN; non-privileged roles
// see masked values. Applied at the response boundary on any worker-shaped row.

const PRIVILEGED_ROLES = new Set(["admin", "coordinator", "T1", "T2", "executive", "legal"]);

function canSeeFullPII(role: string | undefined): boolean {
  return !!role && PRIVILEGED_ROLES.has(role);
}

export function projectWorkerPII<T extends { pesel?: string | null; iban?: string | null }>(row: T, role: string | undefined): T {
  const full = canSeeFullPII(role);
  const out = { ...row } as T;
  if (full) {
    if (row.pesel) out.pesel = decrypt(row.pesel) ?? row.pesel;
    if (row.iban) out.iban = decrypt(row.iban) ?? row.iban;
  } else {
    out.pesel = row.pesel ? maskSensitive(row.pesel) : row.pesel;
    out.iban = row.iban ? maskSensitive(row.iban) : row.iban;
  }
  return out;
}

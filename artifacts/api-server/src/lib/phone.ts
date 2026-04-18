/**
 * Pure format normalizer — returns E.164 string or null. Never throws.
 *
 * This utility normalizes FORMAT only. It does not judge whether a given
 * national number is semantically plausible (e.g. whether a Polish mobile
 * should start with 4–8 after +48). Semantic validation is the caller's
 * responsibility (or deferred to Twilio / libphonenumber downstream).
 *
 * Production contract note: services/test-safety.ts identifies test workers
 * by phone.startsWith("+48000000"). This normalizer preserves that prefix.
 *
 * KNOWN TRADE-OFF: bare 9-digit input is treated as Polish mobile.
 * A bare 9-digit German or Czech number would be incorrectly prefixed +48.
 * Acceptable for this platform (200 PL-based workers); re-evaluate if we
 * ever accept non-PL intake without libphonenumber-js.
 *
 * Contract:
 *   - Returns E.164 string on format-valid input, null on anything else
 *   - Never throws; all bad input (null, undefined, wrong type, malformed)
 *     returns null
 *   - Idempotent: normalizePhone(normalizePhone(x)) === normalizePhone(x)
 */

const ALLOWED_SEPARATORS = /[\s\-().\/]/g;
const DIGIT_OR_PLUS = /^\+?\d+$/;

export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const stripped = trimmed.replace(ALLOWED_SEPARATORS, "");
  if (!stripped) return null;

  if (!DIGIT_OR_PLUS.test(stripped)) return null;

  const digits = stripped.replace(/^\+/, "");
  if (digits.length < 8 || digits.length > 15) return null;

  if (stripped.startsWith("+")) return stripped;

  if (digits.startsWith("0048")) return "+" + digits.slice(2);
  if (digits.length === 11 && digits.startsWith("48")) return "+" + digits;
  if (digits.length === 9) return "+48" + digits;

  return null;
}

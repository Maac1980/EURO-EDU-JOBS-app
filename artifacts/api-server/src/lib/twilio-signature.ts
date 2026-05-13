/**
 * Twilio webhook signature verification.
 *
 * Wraps the Twilio Node SDK's validateRequest (HMAC-SHA1 over a canonical
 * URL+sorted-params string) with defensive input validation so callers can
 * pass untrusted request data without try/catch.
 *
 * Per STEP3_PLAN.md (Sub-task 3c): used by POST /api/webhooks/whatsapp.
 * The request is authenticated by signature, NOT JWT.
 *
 * Contract:
 *   - Returns true ONLY when the X-Twilio-Signature matches the
 *     authToken + url + params combination
 *   - Returns false on any malformed input (missing fields, wrong types,
 *     SDK throw)
 *   - Never throws
 */

// Twilio's CJS export shape differs across Node versions in ESM mode (named
// imports work under esbuild bundling but break under tsx ESM dev). Default-
// import the module and read validateRequest off it — same function, more
// tolerant of the dev-vs-build divergence.
import twilio from "twilio";
const { validateRequest } = twilio as unknown as {
  validateRequest: (authToken: string, signature: string, url: string, params: Record<string, string>) => boolean;
};

export interface VerifyTwilioSignatureInput {
  authToken: string;
  signature: string;
  url: string;
  params: Record<string, string>;
}

export function verifyTwilioSignature(input: VerifyTwilioSignatureInput): boolean {
  if (!input || typeof input !== "object") return false;
  const { authToken, signature, url, params } = input;
  if (typeof authToken !== "string" || authToken.length === 0) return false;
  if (typeof signature !== "string" || signature.length === 0) return false;
  if (typeof url !== "string" || url.length === 0) return false;
  if (typeof params !== "object" || params === null || Array.isArray(params)) return false;
  try {
    return validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}

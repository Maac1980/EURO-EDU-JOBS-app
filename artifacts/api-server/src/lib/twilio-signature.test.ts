import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyTwilioSignature } from "./twilio-signature.js";

/**
 * Twilio's signature algorithm:
 *   1. Sort params alphabetically by key
 *   2. Build string: url + key1 + value1 + key2 + value2 + ...
 *   3. HMAC-SHA1 with authToken, base64-encode
 */
function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const canonical = url + Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], "");
  return crypto.createHmac("sha1", authToken).update(canonical).digest("base64");
}

const AUTH_TOKEN = "test-auth-token-32-chars-padding-padding";
const URL_A = "https://eej-jobs-api.fly.dev/api/webhooks/whatsapp";
const URL_B = "https://eej-jobs-api.fly.dev/api/webhooks/whatsapp-other";
const PARAMS_A: Record<string, string> = {
  MessageSid: "SM" + "a".repeat(32),
  From: "whatsapp:+48501222333",
  To: "whatsapp:+14155238886",
  Body: "Witaj",
};

describe("verifyTwilioSignature — positive paths", () => {
  it("J1 returns true when signature matches authToken + url + params", () => {
    const sig = computeTwilioSignature(AUTH_TOKEN, URL_A, PARAMS_A);
    expect(verifyTwilioSignature({
      authToken: AUTH_TOKEN, signature: sig, url: URL_A, params: PARAMS_A,
    })).toBe(true);
  });

  it("J2 verifies independently-ordered param objects identically", () => {
    const reordered: Record<string, string> = {
      Body: PARAMS_A.Body, To: PARAMS_A.To, From: PARAMS_A.From, MessageSid: PARAMS_A.MessageSid,
    };
    const sig = computeTwilioSignature(AUTH_TOKEN, URL_A, PARAMS_A);
    expect(verifyTwilioSignature({
      authToken: AUTH_TOKEN, signature: sig, url: URL_A, params: reordered,
    })).toBe(true);
  });
});

describe("verifyTwilioSignature — negative paths", () => {
  it("J3 returns false when signature is tampered (suffix changed)", () => {
    const sig = computeTwilioSignature(AUTH_TOKEN, URL_A, PARAMS_A);
    const tampered = sig.slice(0, -2) + "XX";
    expect(verifyTwilioSignature({
      authToken: AUTH_TOKEN, signature: tampered, url: URL_A, params: PARAMS_A,
    })).toBe(false);
  });

  it("J4 returns false when signature was computed for a different URL", () => {
    const sigForB = computeTwilioSignature(AUTH_TOKEN, URL_B, PARAMS_A);
    expect(verifyTwilioSignature({
      authToken: AUTH_TOKEN, signature: sigForB, url: URL_A, params: PARAMS_A,
    })).toBe(false);
  });

  it("J5 returns false when one param value is mutated after signing", () => {
    const sig = computeTwilioSignature(AUTH_TOKEN, URL_A, PARAMS_A);
    const mutated = { ...PARAMS_A, Body: "Different message" };
    expect(verifyTwilioSignature({
      authToken: AUTH_TOKEN, signature: sig, url: URL_A, params: mutated,
    })).toBe(false);
  });

  it("J6 returns false when authToken is wrong", () => {
    const sig = computeTwilioSignature(AUTH_TOKEN, URL_A, PARAMS_A);
    expect(verifyTwilioSignature({
      authToken: "wrong-token-32-chars-padding-padding-x", signature: sig, url: URL_A, params: PARAMS_A,
    })).toBe(false);
  });
});

describe("verifyTwilioSignature — defensive contract (never throws)", () => {
  it("J7 returns false for empty signature", () => {
    expect(() => verifyTwilioSignature({
      authToken: AUTH_TOKEN, signature: "", url: URL_A, params: PARAMS_A,
    })).not.toThrow();
    expect(verifyTwilioSignature({
      authToken: AUTH_TOKEN, signature: "", url: URL_A, params: PARAMS_A,
    })).toBe(false);
  });

  it("J8 returns false for empty authToken", () => {
    expect(verifyTwilioSignature({
      authToken: "", signature: "abc", url: URL_A, params: PARAMS_A,
    })).toBe(false);
  });

  it("J9 returns false for empty url", () => {
    expect(verifyTwilioSignature({
      authToken: AUTH_TOKEN, signature: "abc", url: "", params: PARAMS_A,
    })).toBe(false);
  });

  it("J10 returns false for non-object params", () => {
    expect(verifyTwilioSignature({
      authToken: AUTH_TOKEN, signature: "abc", url: URL_A, params: null as unknown as Record<string, string>,
    })).toBe(false);
    expect(verifyTwilioSignature({
      authToken: AUTH_TOKEN, signature: "abc", url: URL_A, params: [] as unknown as Record<string, string>,
    })).toBe(false);
  });

  it("J11 returns false for completely null/undefined input shape (no throw)", () => {
    expect(() => verifyTwilioSignature(null as unknown as Parameters<typeof verifyTwilioSignature>[0])).not.toThrow();
    expect(verifyTwilioSignature(null as unknown as Parameters<typeof verifyTwilioSignature>[0])).toBe(false);
    expect(verifyTwilioSignature(undefined as unknown as Parameters<typeof verifyTwilioSignature>[0])).toBe(false);
  });
});

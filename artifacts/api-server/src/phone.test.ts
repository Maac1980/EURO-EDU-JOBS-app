import { describe, it, expect } from "vitest";
import { normalizePhone } from "./lib/phone.js";

describe("normalizePhone — separator stripping", () => {
  it("P1 strips spaces: '+48 123 456 789' -> '+48123456789'", () => {
    expect(normalizePhone("+48 123 456 789")).toBe("+48123456789");
  });
  it("P2 strips hyphens: '+48-123-456-789' -> '+48123456789'", () => {
    expect(normalizePhone("+48-123-456-789")).toBe("+48123456789");
  });
  it("P3 strips parens + hyphens: '(48) 123-456-789' -> '+48123456789'", () => {
    expect(normalizePhone("(48) 123-456-789")).toBe("+48123456789");
  });
  it("P4 strips forward-slash: '+48/123/456/789' -> '+48123456789'", () => {
    expect(normalizePhone("+48/123/456/789")).toBe("+48123456789");
  });
});

describe("normalizePhone — Polish prefix forms", () => {
  it("P5 '0048123456789' -> '+48123456789'", () => {
    expect(normalizePhone("0048123456789")).toBe("+48123456789");
  });
  it("P6 bare 11-digit starting 48: '48123456789' -> '+48123456789'", () => {
    expect(normalizePhone("48123456789")).toBe("+48123456789");
  });
  it("P7 bare 9-digit (KNOWN TRADE-OFF — assumed PL): '123456789' -> '+48123456789'", () => {
    expect(normalizePhone("123456789")).toBe("+48123456789");
  });
});

describe("normalizePhone — canonical + non-PL E.164 preservation", () => {
  it("P8 already E.164 PL is idempotent: '+48123456789' -> '+48123456789'", () => {
    expect(normalizePhone("+48123456789")).toBe("+48123456789");
  });
  it("P9 German +49 preserved, not Polonized: '+49123456789' -> '+49123456789'", () => {
    expect(normalizePhone("+49123456789")).toBe("+49123456789");
  });
});

describe("normalizePhone — length boundaries", () => {
  it("P10 min accept: 8 digits with + -> preserved", () => {
    expect(normalizePhone("+12345678")).toBe("+12345678");
  });
  it("P11 max accept: 15 digits with + -> preserved", () => {
    expect(normalizePhone("+123456789012345")).toBe("+123456789012345");
  });
  it("P12 reject over-max (16 digits) and under-min (7 digits)", () => {
    expect(normalizePhone("+1234567890123456")).toBeNull();
    expect(normalizePhone("+1234567")).toBeNull();
  });
});

describe("normalizePhone — rejection cases", () => {
  it("P13 accepts +480...: format-valid (semantic validity deferred to caller)", () => {
    // Production contract: services/test-safety.ts identifies test workers by
    // phone.startsWith("+48000000"). This utility normalizes format only; it
    // does not judge whether a national number should start with 0 — that's a
    // semantic check delegated to Twilio or a dedicated PL validator.
    expect(normalizePhone("+480123456789")).toBe("+480123456789");
  });
  it("P13b rejects characters outside the separator whitelist", () => {
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("++48123")).toBeNull();
    expect(normalizePhone("+48 123#456 789")).toBeNull();
  });
  it("P14 contract: never throws, returns null for all junk inputs", () => {
    expect(() => {
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone(undefined)).toBeNull();
      expect(normalizePhone("")).toBeNull();
      expect(normalizePhone("   ")).toBeNull();
      expect(normalizePhone(123)).toBeNull();
      expect(normalizePhone({})).toBeNull();
      expect(normalizePhone([])).toBeNull();
      expect(normalizePhone(true)).toBeNull();
      expect(normalizePhone(Symbol("x"))).toBeNull();
    }).not.toThrow();
  });
});

describe("normalizePhone — idempotency", () => {
  it("P15 normalizePhone(normalizePhone(x)) === normalizePhone(x) for representative inputs", () => {
    expect(normalizePhone(normalizePhone("+48 123 456 789"))).toBe("+48123456789");
    expect(normalizePhone(normalizePhone("0048123456789"))).toBe("+48123456789");
    expect(normalizePhone(normalizePhone("+49123456789"))).toBe("+49123456789");
  });
});

describe("normalizePhone — trade-off documentation", () => {
  it.todo("P16 documents known trade-off: bare 9-digit non-PL numbers are incorrectly Polonized (re-evaluate if non-PL intake is added)");
});

describe("normalizePhone — test-safety compatibility", () => {
  it('P17 preserves test-worker prefix so test-safety.ts startsWith("+48000000") still matches', () => {
    expect(normalizePhone("+48 000 000 123")?.startsWith("+48000000")).toBe(true);
    expect(normalizePhone("0048000000123")?.startsWith("+48000000")).toBe(true);
  });
});

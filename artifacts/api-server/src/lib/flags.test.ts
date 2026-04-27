import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isFeatureEnabled, FLAG_NAMES } from "./flags.js";

const FLAG = FLAG_NAMES.WHATSAPP_AUTOMATION_ENABLED;

describe("isFeatureEnabled — WHATSAPP_AUTOMATION_ENABLED", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[FLAG];
    delete process.env[FLAG];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
  });

  it("F1 returns true when env var is the literal string 'true'", () => {
    process.env[FLAG] = "true";
    expect(isFeatureEnabled(FLAG)).toBe(true);
  });

  it("F2 returns false when env var is unset", () => {
    expect(isFeatureEnabled(FLAG)).toBe(false);
  });

  it("F3 returns false when env var is the empty string", () => {
    process.env[FLAG] = "";
    expect(isFeatureEnabled(FLAG)).toBe(false);
  });

  it("F4 returns false for 'false', 'yes', '1', 'True', 'TRUE'", () => {
    for (const v of ["false", "yes", "1", "True", "TRUE", "0", "no"]) {
      process.env[FLAG] = v;
      expect(isFeatureEnabled(FLAG)).toBe(false);
    }
  });
});

describe("isFeatureEnabled — unknown flag names", () => {
  it("F5 returns false for unknown flag names without throwing", () => {
    expect(() => isFeatureEnabled("NOT_A_REAL_FLAG")).not.toThrow();
    expect(isFeatureEnabled("NOT_A_REAL_FLAG")).toBe(false);
  });

  it("F6 returns false for empty string flag name", () => {
    expect(isFeatureEnabled("")).toBe(false);
  });

  it("F7 unknown flag returns false even when env var of same name is 'true'", () => {
    process.env.NOT_A_REAL_FLAG = "true";
    try {
      expect(isFeatureEnabled("NOT_A_REAL_FLAG")).toBe(false);
    } finally {
      delete process.env.NOT_A_REAL_FLAG;
    }
  });
});

describe("FLAG_NAMES constant", () => {
  it("F8 exports WHATSAPP_AUTOMATION_ENABLED", () => {
    expect(FLAG_NAMES.WHATSAPP_AUTOMATION_ENABLED).toBe("WHATSAPP_AUTOMATION_ENABLED");
  });
});

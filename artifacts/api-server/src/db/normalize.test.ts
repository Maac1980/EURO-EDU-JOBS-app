import { describe, it, expect, beforeAll } from "vitest";

// Satisfy the throw in db/index.ts:5-7. Pool construction is lazy (no
// connection happens at import time); the unit tests below exercise the
// pure normalizeNeonUrl function and never touch the pool.
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/normalize_unit_test";

// Dynamic import so DATABASE_URL is set before the module body runs.
// Matches the pattern used in integration.test.ts beforeAll.
let normalizeNeonUrl: (url: string) => string;

beforeAll(async () => {
  const mod = await import("./index.js");
  normalizeNeonUrl = mod.normalizeNeonUrl;
});

describe("normalizeNeonUrl — Day 22 channel_binding strip", () => {
  it("strips &channel_binding=require mid-string, preserves sslmode + other params", () => {
    expect(
      normalizeNeonUrl("postgres://u:p@h.neon.tech/db?sslmode=require&channel_binding=require"),
    ).toBe("postgres://u:p@h.neon.tech/db?sslmode=require");
  });

  it("strips ?channel_binding=require when it is the only query param", () => {
    expect(
      normalizeNeonUrl("postgres://u:p@h.neon.tech/db?channel_binding=require"),
    ).toBe("postgres://u:p@h.neon.tech/db");
  });

  it("is idempotent on already-clean URLs (no channel_binding present)", () => {
    const clean = "postgres://u:p@h.neon.tech/db?sslmode=require";
    expect(normalizeNeonUrl(clean)).toBe(clean);
    // Running twice yields the same output.
    expect(normalizeNeonUrl(normalizeNeonUrl(clean))).toBe(clean);
  });

  it("strips channel_binding=prefer and channel_binding=disable variants", () => {
    expect(
      normalizeNeonUrl("postgres://u:p@h/db?sslmode=require&channel_binding=prefer"),
    ).toBe("postgres://u:p@h/db?sslmode=require");
    expect(
      normalizeNeonUrl("postgres://u:p@h/db?sslmode=require&channel_binding=disable"),
    ).toBe("postgres://u:p@h/db?sslmode=require");
  });

  it("preserves params that flank channel_binding (leading and sandwiched positions)", () => {
    // channel_binding first, followed by another param.
    expect(
      normalizeNeonUrl("postgres://u:p@h/db?channel_binding=require&sslmode=require"),
    ).toBe("postgres://u:p@h/db?sslmode=require");
    // channel_binding sandwiched between two other params.
    expect(
      normalizeNeonUrl("postgres://u:p@h/db?a=1&channel_binding=require&b=2"),
    ).toBe("postgres://u:p@h/db?a=1&b=2");
  });
});

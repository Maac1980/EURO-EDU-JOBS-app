import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";

// Required env vars for app module to load. Set BEFORE importing app.
process.env.JWT_SECRET ??= "test-jwt-secret-for-integration-tests-64-bytes-long-padding-xyz";
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test_does_not_connect";
process.env.EEJ_ADMIN_EMAIL ??= "anna.b@edu-jobs.eu";

let app: Express;

beforeAll(async () => {
  const mod = await import("./app.js");
  app = mod.default;
});

describe("integration: public endpoints (no DB required)", () => {
  it("GET /api/healthz returns 200 ok", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /api/workers without auth returns 401", async () => {
    const res = await request(app).get("/api/workers");
    expect(res.status).toBe(401);
  });

  it("GET /api/clients without auth returns 401", async () => {
    const res = await request(app).get("/api/clients");
    expect(res.status).toBe(401);
  });

  it("GET /api/workers with invalid token returns 401", async () => {
    const res = await request(app)
      .get("/api/workers")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("DELETE /api/audit returns 404 — endpoint removed by design", async () => {
    const res = await request(app).delete("/api/audit");
    expect(res.status).toBe(404);
  });
});

describe("integration: /api/auth/login input validation", () => {
  it("rejects missing credentials with 400", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("rejects missing password with 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "foo@bar.com" });
    expect(res.status).toBe(400);
  });

  it("rejects missing email with 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ password: "secret" });
    expect(res.status).toBe(400);
  });
});

describe("integration: encryption round-trip", () => {
  it("encrypts and decrypts a string", async () => {
    const { encrypt, decrypt, isEncrypted } = await import("./lib/encryption.js");
    const plain = "92010112345";
    const enc = encrypt(plain);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(decrypt(enc)).toBe(plain);
  });

  it("passes through legacy plaintext", async () => {
    const { decrypt, isEncrypted } = await import("./lib/encryption.js");
    const legacy = "legacy-plain-value";
    expect(isEncrypted(legacy)).toBe(false);
    expect(decrypt(legacy)).toBe(legacy);
  });

  it("masks sensitive values for low-privilege viewers", async () => {
    const { encrypt, maskSensitive } = await import("./lib/encryption.js");
    const pesel = "92010112345";
    const enc = encrypt(pesel);
    const masked = maskSensitive(enc);
    expect(masked).toBe("***-****-2345");
  });

  it("returns null for null/undefined inputs", async () => {
    const { decrypt, maskSensitive } = await import("./lib/encryption.js");
    expect(decrypt(null)).toBeNull();
    expect(decrypt(undefined)).toBeNull();
    expect(maskSensitive(null)).toBeNull();
  });
});

describe("integration: tenancy helper", () => {
  it("requireTenant defaults to production for requests without user", async () => {
    const { requireTenant, DEFAULT_TENANT } = await import("./lib/tenancy.js");
    const fakeReq = {} as unknown as Parameters<typeof requireTenant>[0];
    expect(requireTenant(fakeReq)).toBe(DEFAULT_TENANT);
  });

  it("requireTenant returns user.tenantId when present", async () => {
    const { requireTenant } = await import("./lib/tenancy.js");
    const fakeReq = { user: { tenantId: "acme-corp" } } as unknown as Parameters<typeof requireTenant>[0];
    expect(requireTenant(fakeReq)).toBe("acme-corp");
  });
});

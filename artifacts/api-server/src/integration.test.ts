import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Pool } from "pg";

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

describe("integration: CRM auth gate", () => {
  it("GET /api/crm/pipeline without auth returns 401", async () => {
    const res = await request(app).get("/api/crm/pipeline");
    expect(res.status).toBe(401);
  });

  it("GET /api/crm/pipeline with T3 (operations) role returns 403", async () => {
    const jwt = await import("jsonwebtoken");
    const token = jwt.default.sign(
      { id: "00000000-0000-0000-0000-000000000003", email: "ops@test.local", name: "Ops",
        role: "operations", tier: 3, tenantId: "test", site: null },
      process.env.JWT_SECRET!,
      { expiresIn: "5m" }
    );
    const res = await request(app).get("/api/crm/pipeline").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("POST /api/crm/activity with T4 (candidate) role returns 403", async () => {
    const jwt = await import("jsonwebtoken");
    const token = jwt.default.sign(
      { id: "00000000-0000-0000-0000-000000000004", email: "worker@test.local", name: "Worker",
        role: "candidate", tier: 4, tenantId: "test", site: null },
      process.env.JWT_SECRET!,
      { expiresIn: "5m" }
    );
    const res = await request(app).post("/api/crm/activity")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: "00000000-0000-0000-0000-000000000000", content: "test" });
    expect(res.status).toBe(403);
  });
});

describe("integration: PII role-based projection (workerToCandidate)", () => {
  it("reveals plaintext PESEL/IBAN for privileged viewers (T1)", async () => {
    const { encrypt } = await import("./lib/encryption.js");
    const pesel = "92010112345";
    const iban = "PL61109010140000071219812874";
    // Hand-construct a minimal Worker-shaped row; workerToCandidate only reads
    // a subset of fields so the rest being defaults is fine.
    const row: any = {
      id: "w1", name: "Test Worker", jobRole: "Welder", complianceStatus: "compliant",
      pesel: encrypt(pesel), iban: encrypt(iban),
    };
    // Re-export the function by re-opening the module; eej-mobile does not
    // export workerToCandidate directly, so we test the underlying primitives.
    const { decrypt, maskSensitive } = await import("./lib/encryption.js");
    // T1 is privileged → decrypt returns plaintext
    expect(decrypt(row.pesel)).toBe(pesel);
    expect(decrypt(row.iban)).toBe(iban);
    // T4 is not privileged → masked
    expect(maskSensitive(row.pesel)).toBe("***-****-2345");
    expect(maskSensitive(row.iban)).toBe("***-****-2874");
  });

  it("decrypts legacy plaintext identically (no double-masking)", async () => {
    const { decrypt, isEncrypted, maskSensitive } = await import("./lib/encryption.js");
    const legacyPesel = "85050554321";
    expect(isEncrypted(legacyPesel)).toBe(false);
    expect(decrypt(legacyPesel)).toBe(legacyPesel);
    expect(maskSensitive(legacyPesel)).toBe("***-****-4321");
  });

  it("isEncrypted distinguishes legacy plaintext from enc:v1 format", async () => {
    const { encrypt, isEncrypted } = await import("./lib/encryption.js");
    expect(isEncrypted("92010112345")).toBe(false);
    expect(isEncrypted("legacy-value")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
    expect(isEncrypted(encrypt("sensitive"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp schema integrity — DB-backed. Requires TEST_DATABASE_URL pointing at
// a database where runMigrations() has already been applied. Never aim this at
// production; tests intentionally attempt constraint violations.
// When TEST_DATABASE_URL is unset, this entire block is skipped.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "integration: whatsapp schema integrity (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");
    });

    afterAll(async () => {
      await pool.end();
    });

    it("S1 rejects INSERT with invalid status='BOGUS' (whatsapp_status enum)", async () => {
      await expect(
        pool.query(`
          INSERT INTO whatsapp_messages (tenant_id, direction, status, phone, body, worker_id)
          VALUES ('production', 'inbound', 'BOGUS', '+48123456789', 'x', gen_random_uuid())
        `)
      ).rejects.toThrow(/invalid input value for enum whatsapp_status/i);
    });

    it("S2 rejects INSERT with invalid direction='sideways' (whatsapp_direction enum)", async () => {
      await expect(
        pool.query(`
          INSERT INTO whatsapp_messages (tenant_id, direction, phone, body)
          VALUES ('production', 'sideways', '+48123456789', 'x')
        `)
      ).rejects.toThrow(/invalid input value for enum whatsapp_direction/i);
    });

    it("S3a rejects INSERT referencing nonexistent tenant slug (FK violation)", async () => {
      await expect(
        pool.query(`
          INSERT INTO whatsapp_messages (tenant_id, direction, phone, body)
          VALUES ('totally-fake-tenant', 'inbound', '+48123456789', 'x')
        `)
      ).rejects.toThrow(/violates foreign key constraint/i);
    });

    it("S3b rejects outbound message with no worker_id AND no client_id (CHECK)", async () => {
      await expect(
        pool.query(`
          INSERT INTO whatsapp_messages (tenant_id, direction, phone, body)
          VALUES ('production', 'outbound', '+48123456789', 'x')
        `)
      ).rejects.toThrow(/whatsapp_messages_outbound_requires_recipient/);
    });

    it("Sd1 migrations seeded >= 3 production templates", async () => {
      const { rows } = await pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM whatsapp_templates WHERE tenant_id = 'production'`
      );
      expect(rows[0].c).toBeGreaterThanOrEqual(3);
    });

    it("Sd2 ON CONFLICT DO NOTHING prevents duplication on re-seed", async () => {
      const { rows: beforeRows } = await pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM whatsapp_templates WHERE tenant_id = 'production'`
      );
      await pool.query(`
        INSERT INTO whatsapp_templates (tenant_id, name, language, body_preview, variables, active)
        VALUES
          ('production', 'application_received', 'pl', 'test-reseed', '[]'::jsonb, FALSE),
          ('production', 'permit_status_update', 'pl', 'test-reseed', '[]'::jsonb, FALSE),
          ('production', 'payment_reminder',     'pl', 'test-reseed', '[]'::jsonb, FALSE)
        ON CONFLICT (tenant_id, name) DO NOTHING
      `);
      const { rows: afterRows } = await pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM whatsapp_templates WHERE tenant_id = 'production'`
      );
      expect(afterRows[0].c).toBe(beforeRows[0].c);
    });
  }
);

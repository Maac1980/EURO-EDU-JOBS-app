import { describe, it, expect, beforeAll, beforeEach, afterAll, vi, type Mock } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Pool } from "pg";

// T0 portal/whatsapp tests need a deterministic stand-in for the Twilio dispatch
// leg. Mock just `sendWhatsAppMessage` (other alerter exports preserved). vi.mock
// is hoisted, so the spy is in place before app.ts loads alerter.
vi.mock("./lib/alerter.js", async (importActual) => {
  const actual = await importActual<typeof import("./lib/alerter.js")>();
  return {
    ...actual,
    sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
    sendLoginNotification: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock the `twilio` module for T0-C approve-dispatch tests. Source uses
// `await import("twilio")` then `twilioMod.default(accountSid, authToken)` →
// returns a client whose `messages.create(...)` is invoked. We expose the
// inner `create` as a vi.fn so tests can per-call .mockResolvedValueOnce /
// .mockRejectedValueOnce. Existing whatsapp lifecycle tests (A2/A3) hit 409
// branches BEFORE reaching this import, so the mock is never consulted there.
// Use vi.hoisted() so twilioCreateMock exists in the hoist phase before
// vi.mock's factory closure runs. twilio is CJS-only (`module.exports =
// TwilioSDK`); validateRequest is attached as `TwilioSDK.validateRequest =
// webhooks.validateRequest`. Vitest's importActual may surface twilio as the
// raw namespace OR as `{ default: namespace, ... }`; spread alone is
// unreliable. Explicitly list the named exports we depend on, sourcing from
// `actual.default ?? actual`. Only `default` is overridden so approve-dispatch
// tests can intercept messages.create; everything else passes through to the
// real implementation (preserving HMAC-SHA1 webhook signature verification).
const { twilioCreateMock } = vi.hoisted(() => ({ twilioCreateMock: vi.fn() }));
vi.mock("twilio", async (importActual) => {
  const actual: any = await importActual();
  const ns = actual?.default ?? actual;
  return {
    default: vi.fn(() => ({ messages: { create: twilioCreateMock } })),
    validateRequest: ns.validateRequest,
    validateBody: ns.validateBody,
    validateRequestWithBody: ns.validateRequestWithBody,
    validateExpressRequest: ns.validateExpressRequest,
    validateIncomingRequest: ns.validateIncomingRequest,
    getExpectedBodyHash: ns.getExpectedBodyHash,
    getExpectedTwilioSignature: ns.getExpectedTwilioSignature,
    webhook: ns.webhook,
    Twilio: ns.Twilio,
    jwt: ns.jwt,
    twiml: ns.twiml,
    RequestClient: ns.RequestClient,
    RestException: ns.RestException,
  };
});

// Mock the AI lib so document-scan tests can run without ANTHROPIC_API_KEY
// and without making real network calls. Individual tests override the mock
// per-case via analyzeImageMock.mockResolvedValueOnce(...).
const { analyzeImageMock, analyzeTextMock } = vi.hoisted(() => ({
  analyzeImageMock: vi.fn<(...args: unknown[]) => Promise<string | null>>(),
  analyzeTextMock: vi.fn<(...args: unknown[]) => Promise<string | null>>(),
}));
vi.mock("./lib/ai.js", async (importActual) => {
  const actual: any = await importActual();
  return {
    ...actual,
    analyzeImage: analyzeImageMock,
    analyzeText: analyzeTextMock,
  };
});

// Required env vars for app module to load. Set BEFORE importing app.
process.env.JWT_SECRET ??= "test-jwt-secret-for-integration-tests-64-bytes-long-padding-xyz";
// Use TEST_DATABASE_URL for integration tests against a real DB; fall back to stub when unset (skipIf gates DB-touching tests in stub case)
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? "postgres://test:test@127.0.0.1:5432/test_does_not_connect";
process.env.EEJ_ADMIN_EMAIL ??= "anna.b@edu-jobs.eu";

let app: Express;

beforeAll(async () => {
  // Apply migrations to test DB before importing app. Without this, recently-added
  // schema (e.g. T23 system_users.can_view_financials / nationality_scope) is absent
  // from the test branch, causing both new tests asserting those columns and
  // pre-existing tests that now traverse code paths reading them to fail with
  // "column does not exist". runMigrations is idempotent (Pattern B, Day 19) so
  // it is safe to re-run on every test invocation.
  if (process.env.TEST_DATABASE_URL) {
    const { runMigrations } = await import("./db/migrate.js");
    await runMigrations();
  }
  const mod = await import("./app.js");
  app = mod.default;
}, 60_000); // 60s hook timeout: runMigrations walks 75+ idempotent CREATE/ALTER guards;
            // CI cold-start exceeds the 10s vitest default. Local fast path still ~1s.

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

  // Item 3.0.0 emergency patch — confirmation friction on clear-all-notifications.
  // Friction returns 400 before reaching DB, so test runs without TEST_DATABASE_URL.
  it("DELETE /api/notifications returns 401 without auth (gate intact)", async () => {
    const res = await request(app).delete("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("DELETE /api/notifications returns 400 with admin token but no confirm body", async () => {
    const jwt = await import("jsonwebtoken");
    const adminToken = jwt.default.sign(
      { id: "00000000-0000-0000-0000-0000000000a0", email: "admin@test.local",
        name: "Test Admin", role: "admin", site: null, tenantId: "test" },
      process.env.JWT_SECRET!,
      { expiresIn: "5m" },
    );
    const res = await request(app)
      .delete("/api/notifications")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("WIPE_ALL_NOTIFICATIONS");
  });

  it("DELETE /api/notifications returns 400 with wrong confirm token", async () => {
    const jwt = await import("jsonwebtoken");
    const adminToken = jwt.default.sign(
      { id: "00000000-0000-0000-0000-0000000000a0", email: "admin@test.local",
        name: "Test Admin", role: "admin", site: null, tenantId: "test" },
      process.env.JWT_SECRET!,
      { expiresIn: "5m" },
    );
    const res = await request(app)
      .delete("/api/notifications")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ confirm: "wrong" });
    expect(res.status).toBe(400);
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
      // Tighten WHERE to the 3 seeded names — eej-test is a shared Neon branch
      // across vitest-parallel test files, and other suites churn templates
      // with Date.now() suffixes. Naming-anchored filter is race-immune.
      const namedFilter = `WHERE tenant_id = 'production'
          AND name IN ('application_received', 'permit_status_update', 'payment_reminder')`;
      const { rows: beforeRows } = await pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM whatsapp_templates ${namedFilter}`
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
        `SELECT COUNT(*)::int AS c FROM whatsapp_templates ${namedFilter}`
      );
      expect(afterRows[0].c).toBe(beforeRows[0].c);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp manual draft endpoints — DB-backed, end-to-end via supertest.
// Requires TEST_DATABASE_URL pointing at a database with Step 3a migrations.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "integration: whatsapp manual draft endpoints (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;
    let activeTemplateName: string;
    let realWorkerId: string;
    let t1Token: string;
    let t3Token: string;
    let crossTenantT1Token: string;

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");

      activeTemplateName = `endpoint_test_${Date.now()}`;
      await pool.query(
        `INSERT INTO whatsapp_templates (tenant_id, name, language, body_preview, variables, active)
         VALUES ('production', $1, 'pl', 'Witaj {{workerName}}.', '["workerName"]'::jsonb, TRUE)`,
        [activeTemplateName],
      );

      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id) VALUES ('Endpoint Real', '+48 501 999 888', 'production') RETURNING id`,
      );
      realWorkerId = rows[0].id;

      const jwt = await import("jsonwebtoken");
      t1Token = jwt.default.sign(
        { id: "00000000-0000-0000-0000-0000000000a1", email: "anna@test.local", name: "Anna",
          role: "executive", tier: 1, tenantId: "production", site: null },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
      t3Token = jwt.default.sign(
        { id: "00000000-0000-0000-0000-0000000000a3", email: "ops@test.local", name: "Ops",
          role: "operations", tier: 3, tenantId: "production", site: null },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
      crossTenantT1Token = jwt.default.sign(
        { id: "00000000-0000-0000-0000-0000000000b1", email: "anna@other.local", name: "Anna B",
          role: "executive", tier: 1, tenantId: "test", site: null },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
    });

    afterAll(async () => {
      try {
        await pool.query(`DELETE FROM whatsapp_messages WHERE worker_id = $1`, [realWorkerId]);
        await pool.query(`DELETE FROM workers WHERE id = $1`, [realWorkerId]);
        await pool.query(`DELETE FROM whatsapp_templates WHERE tenant_id = 'production' AND name = $1`, [activeTemplateName]);
      } finally {
        await pool.end();
      }
    });

    it("W1 T1 creates a draft via POST and the list endpoint includes it", async () => {
      const create = await request(app)
        .post("/api/whatsapp/drafts")
        .set("Authorization", `Bearer ${t1Token}`)
        .send({
          templateName: activeTemplateName,
          workerId: realWorkerId,
          variables: { workerName: "Adam" },
          triggerEvent: "manual",
        });
      expect(create.status).toBe(201);
      expect(create.body.status).toBe("DRAFT");
      expect(create.body.direction).toBe("outbound");
      expect(create.body.body).toBe("Witaj Adam.");
      const draftId = create.body.id as string;

      const list = await request(app)
        .get("/api/whatsapp/drafts?status=DRAFT&limit=200")
        .set("Authorization", `Bearer ${t1Token}`);
      expect(list.status).toBe(200);
      const ids = (list.body.drafts as Array<{ id: string }>).map(d => d.id);
      expect(ids).toContain(draftId);
    });

    it("W2 T1 discards a DRAFT via DELETE; row transitions to DISCARDED, not deleted", async () => {
      const create = await request(app)
        .post("/api/whatsapp/drafts")
        .set("Authorization", `Bearer ${t1Token}`)
        .send({
          templateName: activeTemplateName,
          workerId: realWorkerId,
          variables: { workerName: "Discard" },
          triggerEvent: "manual",
        });
      expect(create.status).toBe(201);
      const draftId = create.body.id as string;

      const del = await request(app)
        .delete(`/api/whatsapp/drafts/${draftId}`)
        .set("Authorization", `Bearer ${t1Token}`);
      expect(del.status).toBe(200);
      expect(del.body.status).toBe("DISCARDED");

      const verify = await pool.query<{ status: string }>(
        `SELECT status FROM whatsapp_messages WHERE id = $1`,
        [draftId],
      );
      expect(verify.rows.length).toBe(1);
      expect(verify.rows[0].status).toBe("DISCARDED");
    });

    it("W3 unauthenticated POST returns 401", async () => {
      const res = await request(app)
        .post("/api/whatsapp/drafts")
        .send({
          templateName: activeTemplateName,
          workerId: realWorkerId,
          variables: { workerName: "x" },
          triggerEvent: "manual",
        });
      expect(res.status).toBe(401);
    });

    it("W4 T3 (operations) POST returns 403", async () => {
      const res = await request(app)
        .post("/api/whatsapp/drafts")
        .set("Authorization", `Bearer ${t3Token}`)
        .send({
          templateName: activeTemplateName,
          workerId: realWorkerId,
          variables: { workerName: "x" },
          triggerEvent: "manual",
        });
      expect(res.status).toBe(403);
    });

    it("W5 cross-tenant: T1 of tenant 'test' GETs a 'production' draft → 404", async () => {
      const create = await request(app)
        .post("/api/whatsapp/drafts")
        .set("Authorization", `Bearer ${t1Token}`)
        .send({
          templateName: activeTemplateName,
          workerId: realWorkerId,
          variables: { workerName: "CrossTest" },
          triggerEvent: "manual",
        });
      expect(create.status).toBe(201);
      const draftId = create.body.id as string;

      const res = await request(app)
        .get(`/api/whatsapp/drafts/${draftId}`)
        .set("Authorization", `Bearer ${crossTenantT1Token}`);
      expect(res.status).toBe(404);
    });

    it("W6 DELETE on a non-DRAFT (status='SENT') returns 409 and does not mutate", async () => {
      const insertSent = await pool.query<{ id: string }>(
        `INSERT INTO whatsapp_messages (tenant_id, direction, status, worker_id, phone, body)
         VALUES ('production', 'outbound', 'SENT', $1, '+48501999888', 'preexisting sent') RETURNING id`,
        [realWorkerId],
      );
      const sentId = insertSent.rows[0].id;

      const res = await request(app)
        .delete(`/api/whatsapp/drafts/${sentId}`)
        .set("Authorization", `Bearer ${t1Token}`);
      expect(res.status).toBe(409);

      const verify = await pool.query<{ status: string }>(
        `SELECT status FROM whatsapp_messages WHERE id = $1`,
        [sentId],
      );
      expect(verify.rows[0].status).toBe("SENT");
    });

    it("W7 POST with no templateName and no workerId/clientId returns 400 and inserts no row", async () => {
      const before = await pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM whatsapp_messages WHERE tenant_id = 'production'`,
      );
      const res = await request(app)
        .post("/api/whatsapp/drafts")
        .set("Authorization", `Bearer ${t1Token}`)
        .send({});
      expect(res.status).toBe(400);
      const after = await pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM whatsapp_messages WHERE tenant_id = 'production'`,
      );
      expect(after.rows[0].c).toBe(before.rows[0].c);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp inbound webhook — DB-backed end-to-end via supertest.
// Signature verification uses fixed X-Forwarded-{Proto,Host} so the URL is
// deterministic regardless of the ephemeral supertest port.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "integration: whatsapp inbound webhook (requires TEST_DATABASE_URL)",
  () => {
    const TWILIO_TEST_TOKEN = "test-twilio-auth-token-32-chars-padding-ok";
    const FWD_PROTO = "https";
    const FWD_HOST = "eej-jobs-api.fly.dev";
    const WEBHOOK_PATH = "/api/webhooks/whatsapp";
    const WEBHOOK_URL = `${FWD_PROTO}://${FWD_HOST}${WEBHOOK_PATH}`;

    let pool: Pool;
    let originalAuthToken: string | undefined;
    let webhookWorkerId: string;
    let webhookWorkerPhone: string;
    let webhookClientId: string;
    let webhookClientPhone: string;
    let computeSig: (params: Record<string, string>, urlOverride?: string) => string;

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");

      originalAuthToken = process.env.TWILIO_AUTH_TOKEN;
      process.env.TWILIO_AUTH_TOKEN = TWILIO_TEST_TOKEN;

      const crypto = await import("node:crypto");
      computeSig = (params: Record<string, string>, urlOverride?: string): string => {
        const url = urlOverride ?? WEBHOOK_URL;
        const canonical = url + Object.keys(params).sort()
          .reduce((acc, k) => acc + k + params[k], "");
        return crypto.default.createHmac("sha1", TWILIO_TEST_TOKEN).update(canonical).digest("base64");
      };

      webhookWorkerPhone = "+48501777111";
      const w = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id) VALUES ('Webhook Worker', $1, 'production') RETURNING id`,
        [webhookWorkerPhone],
      );
      webhookWorkerId = w.rows[0].id;

      webhookClientPhone = "+48501777222";
      const c = await pool.query<{ id: string }>(
        `INSERT INTO clients (name, phone, tenant_id) VALUES ('Webhook Client', $1, 'production') RETURNING id`,
        [webhookClientPhone],
      );
      webhookClientId = c.rows[0].id;
    });

    afterAll(async () => {
      try {
        await pool.query(`DELETE FROM whatsapp_messages WHERE worker_id = $1 OR client_id = $2 OR phone IN ($3, $4, '+48501777999')`,
          [webhookWorkerId, webhookClientId, webhookWorkerPhone, webhookClientPhone]);
        await pool.query(`DELETE FROM workers WHERE id = $1`, [webhookWorkerId]);
        await pool.query(`DELETE FROM clients WHERE id = $1`, [webhookClientId]);
      } finally {
        if (originalAuthToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
        else process.env.TWILIO_AUTH_TOKEN = originalAuthToken;
        await pool.end();
      }
    });

    function makeBody(messageSid: string, fromPhoneE164: string, body = "hello"): Record<string, string> {
      return {
        MessageSid: messageSid,
        From: `whatsapp:${fromPhoneE164}`,
        To: "whatsapp:+14155238886",
        Body: body,
      };
    }

    it("L1 valid signature + known worker phone → inserts with worker_id, status RECEIVED", async () => {
      const sid = `SM${"a".repeat(32)}`;
      const params = makeBody(sid, webhookWorkerPhone);
      const sig = computeSig(params);

      const res = await request(app)
        .post(WEBHOOK_PATH)
        .set("X-Forwarded-Proto", FWD_PROTO)
        .set("X-Forwarded-Host", FWD_HOST)
        .set("X-Twilio-Signature", sig)
        .type("form")
        .send(params);

      expect(res.status).toBe(200);

      const inserted = await pool.query<{
        worker_id: string | null; client_id: string | null;
        status: string; direction: string; phone: string; body: string; trigger_event: string;
      }>(`SELECT worker_id, client_id, status, direction, phone, body, trigger_event
          FROM whatsapp_messages WHERE twilio_message_sid = $1`, [sid]);
      expect(inserted.rows.length).toBe(1);
      expect(inserted.rows[0].worker_id).toBe(webhookWorkerId);
      expect(inserted.rows[0].client_id).toBeNull();
      expect(inserted.rows[0].status).toBe("RECEIVED");
      expect(inserted.rows[0].direction).toBe("inbound");
      expect(inserted.rows[0].phone).toBe(webhookWorkerPhone);
      expect(inserted.rows[0].trigger_event).toBe("inbound_reply");
    });

    it("L2 valid signature + client phone (no worker) → inserts with client_id", async () => {
      const sid = `SM${"b".repeat(32)}`;
      const params = makeBody(sid, webhookClientPhone);
      const sig = computeSig(params);

      const res = await request(app)
        .post(WEBHOOK_PATH)
        .set("X-Forwarded-Proto", FWD_PROTO)
        .set("X-Forwarded-Host", FWD_HOST)
        .set("X-Twilio-Signature", sig)
        .type("form")
        .send(params);

      expect(res.status).toBe(200);

      const inserted = await pool.query<{ worker_id: string | null; client_id: string | null }>(
        `SELECT worker_id, client_id FROM whatsapp_messages WHERE twilio_message_sid = $1`, [sid]);
      expect(inserted.rows.length).toBe(1);
      expect(inserted.rows[0].worker_id).toBeNull();
      expect(inserted.rows[0].client_id).toBe(webhookClientId);
    });

    it("L3 valid signature + unknown phone → orphan insert (both ids null)", async () => {
      const sid = `SM${"c".repeat(32)}`;
      const params = makeBody(sid, "+48501777999");
      const sig = computeSig(params);

      const res = await request(app)
        .post(WEBHOOK_PATH)
        .set("X-Forwarded-Proto", FWD_PROTO)
        .set("X-Forwarded-Host", FWD_HOST)
        .set("X-Twilio-Signature", sig)
        .type("form")
        .send(params);

      expect(res.status).toBe(200);

      const inserted = await pool.query<{ worker_id: string | null; client_id: string | null; tenant_id: string }>(
        `SELECT worker_id, client_id, tenant_id FROM whatsapp_messages WHERE twilio_message_sid = $1`, [sid]);
      expect(inserted.rows.length).toBe(1);
      expect(inserted.rows[0].worker_id).toBeNull();
      expect(inserted.rows[0].client_id).toBeNull();
      expect(inserted.rows[0].tenant_id).toBe("production");
    });

    it("L4 same MessageSid posted twice → second post 200, no new row (idempotent)", async () => {
      const sid = `SM${"d".repeat(32)}`;
      const params = makeBody(sid, webhookWorkerPhone);
      const sig = computeSig(params);

      const first = await request(app)
        .post(WEBHOOK_PATH)
        .set("X-Forwarded-Proto", FWD_PROTO)
        .set("X-Forwarded-Host", FWD_HOST)
        .set("X-Twilio-Signature", sig)
        .type("form")
        .send(params);
      expect(first.status).toBe(200);

      const second = await request(app)
        .post(WEBHOOK_PATH)
        .set("X-Forwarded-Proto", FWD_PROTO)
        .set("X-Forwarded-Host", FWD_HOST)
        .set("X-Twilio-Signature", sig)
        .type("form")
        .send(params);
      expect(second.status).toBe(200);

      const count = await pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM whatsapp_messages WHERE twilio_message_sid = $1`, [sid]);
      expect(count.rows[0].c).toBe(1);
    });

    it("L5 invalid signature → 403, no row inserted", async () => {
      const sid = `SM${"e".repeat(32)}`;
      const params = makeBody(sid, webhookWorkerPhone);
      const goodSig = computeSig(params);
      const badSig = goodSig.slice(0, -2) + "ZZ";

      const res = await request(app)
        .post(WEBHOOK_PATH)
        .set("X-Forwarded-Proto", FWD_PROTO)
        .set("X-Forwarded-Host", FWD_HOST)
        .set("X-Twilio-Signature", badSig)
        .type("form")
        .send(params);

      expect(res.status).toBe(403);

      const count = await pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM whatsapp_messages WHERE twilio_message_sid = $1`, [sid]);
      expect(count.rows[0].c).toBe(0);
    });

    it("L6 missing X-Twilio-Signature header → 403", async () => {
      const sid = `SM${"f".repeat(32)}`;
      const params = makeBody(sid, webhookWorkerPhone);

      const res = await request(app)
        .post(WEBHOOK_PATH)
        .set("X-Forwarded-Proto", FWD_PROTO)
        .set("X-Forwarded-Host", FWD_HOST)
        .type("form")
        .send(params);

      expect(res.status).toBe(403);
    });

    it("L7 TWILIO_AUTH_TOKEN unset → 503 (fail-closed)", async () => {
      const saved = process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_AUTH_TOKEN;
      try {
        const sid = `SM${"g".repeat(32)}`;
        const params = makeBody(sid, webhookWorkerPhone);
        const res = await request(app)
          .post(WEBHOOK_PATH)
          .set("X-Forwarded-Proto", FWD_PROTO)
          .set("X-Forwarded-Host", FWD_HOST)
          .set("X-Twilio-Signature", "anything")
          .type("form")
          .send(params);
        expect(res.status).toBe(503);
      } finally {
        process.env.TWILIO_AUTH_TOKEN = saved;
      }
    });

    it("L8 valid signature + missing MessageSid → 200, no row inserted (do-not-error-to-Twilio)", async () => {
      const params: Record<string, string> = {
        From: `whatsapp:${webhookWorkerPhone}`,
        To: "whatsapp:+14155238886",
        Body: "missing-sid",
      };
      const sig = computeSig(params);
      const before = await pool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM whatsapp_messages`);

      const res = await request(app)
        .post(WEBHOOK_PATH)
        .set("X-Forwarded-Proto", FWD_PROTO)
        .set("X-Forwarded-Host", FWD_HOST)
        .set("X-Twilio-Signature", sig)
        .type("form")
        .send(params);

      expect(res.status).toBe(200);
      const after = await pool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM whatsapp_messages`);
      expect(after.rows[0].c).toBe(before.rows[0].c);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Step 3d Task P — approve, send, read, list, dashboard counters end-to-end.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "integration: whatsapp lifecycle (approve / read / counters) (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;
    let activeTemplateName: string;
    let inactiveTemplateName: string;
    let realWorkerId: string;
    let testWorkerId: string;
    let lifecycleClientId: string;
    let t1Token: string;
    let adminToken: string;
    const t1UserId = "00000000-0000-0000-0000-0000000000c1";
    const adminUserId = "00000000-0000-0000-0000-0000000000c0";

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");

      activeTemplateName = `lifecycle_active_${Date.now()}`;
      inactiveTemplateName = `lifecycle_inactive_${Date.now()}`;
      await pool.query(
        `INSERT INTO whatsapp_templates (tenant_id, name, language, body_preview, variables, active)
         VALUES ('production', $1, 'pl', 'Witaj {{workerName}}.', '["workerName"]'::jsonb, TRUE),
                ('production', $2, 'pl', 'Inaktywny {{workerName}}.', '["workerName"]'::jsonb, FALSE)`,
        [activeTemplateName, inactiveTemplateName],
      );

      const wReal = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id) VALUES ('Lifecycle Real', '+48 502 111 222', 'production') RETURNING id`,
      );
      realWorkerId = wReal.rows[0].id;

      const wTest = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id) VALUES ('Lifecycle Test', '+48000000444', 'production') RETURNING id`,
      );
      testWorkerId = wTest.rows[0].id;

      const c = await pool.query<{ id: string }>(
        `INSERT INTO clients (name, phone, tenant_id) VALUES ('Lifecycle Client', '+48 502 111 333', 'production') RETURNING id`,
      );
      lifecycleClientId = c.rows[0].id;

      const jwt = await import("jsonwebtoken");
      t1Token = jwt.default.sign(
        { id: t1UserId, email: "lifecycle-t1@test.local", name: "Lifecycle T1",
          role: "executive", tier: 1, tenantId: "production", site: null },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
      adminToken = jwt.default.sign(
        { id: adminUserId, email: "lifecycle-admin@test.local", name: "Lifecycle Admin",
          role: "admin", tier: 1, tenantId: "production", site: null },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
    });

    afterAll(async () => {
      try {
        await pool.query(`DELETE FROM client_activities WHERE client_id = $1`, [lifecycleClientId]);
        await pool.query(`DELETE FROM whatsapp_messages WHERE worker_id = ANY($1::uuid[]) OR client_id = $2`,
          [[realWorkerId, testWorkerId], lifecycleClientId]);
        await pool.query(`DELETE FROM workers WHERE id = ANY($1::uuid[])`, [[realWorkerId, testWorkerId]]);
        await pool.query(`DELETE FROM clients WHERE id = $1`, [lifecycleClientId]);
        await pool.query(`DELETE FROM whatsapp_templates WHERE tenant_id = 'production' AND name IN ($1, $2)`,
          [activeTemplateName, inactiveTemplateName]);
      } finally {
        await pool.end();
      }
    });

    async function createDraftViaApi(args: {
      templateName: string; workerId?: string; clientId?: string;
      variables?: Record<string, string>;
    }): Promise<string> {
      const res = await request(app)
        .post("/api/whatsapp/drafts")
        .set("Authorization", `Bearer ${t1Token}`)
        .send({
          templateName: args.templateName,
          workerId: args.workerId,
          clientId: args.clientId,
          variables: args.variables ?? { workerName: "Subject" },
          triggerEvent: "manual",
        });
      expect(res.status).toBe(201);
      return res.body.id as string;
    }

    it("A1 T1 creates client-linked draft, approves → APPROVED + client_activities row written", async () => {
      const draftId = await createDraftViaApi({
        templateName: activeTemplateName,
        clientId: lifecycleClientId,
        variables: { workerName: "Adam" },
      });

      const res = await request(app)
        .patch(`/api/whatsapp/drafts/${draftId}/approve`)
        .set("Authorization", `Bearer ${t1Token}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("APPROVED");
      expect(res.body.approvedBy).toBe(t1UserId);
      expect(res.body.approvedAt).toBeTruthy();

      const activity = await pool.query<{ kind: string; user_id: string | null; metadata: Record<string, unknown> }>(
        `SELECT kind, user_id, metadata FROM client_activities
         WHERE client_id = $1 AND kind = 'whatsapp_approval'
         ORDER BY created_at DESC LIMIT 1`,
        [lifecycleClientId],
      );
      expect(activity.rows.length).toBe(1);
      expect(activity.rows[0].kind).toBe("whatsapp_approval");
      expect(activity.rows[0].user_id).toBe(t1UserId);
      expect((activity.rows[0].metadata as { messageId?: string }).messageId).toBe(draftId);
    });

    it("A2 sendImmediately + non-test worker + inactive template → 409 inactive-template; row stays APPROVED", async () => {
      const draftId = await createDraftViaApi({
        templateName: activeTemplateName,
        workerId: realWorkerId,
      });
      // Swap the row's template_id to point at the inactive template so we
      // exercise the "inactive at send time" path without affecting the active
      // template's seed state.
      await pool.query(
        `UPDATE whatsapp_messages SET template_id = (SELECT id FROM whatsapp_templates WHERE name = $1 AND tenant_id = 'production')
         WHERE id = $2`,
        [inactiveTemplateName, draftId],
      );

      const res = await request(app)
        .patch(`/api/whatsapp/drafts/${draftId}/approve`)
        .set("Authorization", `Bearer ${t1Token}`)
        .send({ sendImmediately: true });
      expect(res.status).toBe(409);
      expect(typeof res.body.error).toBe("string");
      expect(res.body.error.toLowerCase()).toContain("inactive");

      const verify = await pool.query<{ status: string }>(
        `SELECT status FROM whatsapp_messages WHERE id = $1`, [draftId]);
      expect(verify.rows[0].status).toBe("APPROVED");
    });

    it("A3 sendImmediately + test worker → 409 test-worker; row stays APPROVED", async () => {
      const draftId = await createDraftViaApi({
        templateName: activeTemplateName,
        workerId: testWorkerId,
        variables: { workerName: "TestSubject" },
      });

      const res = await request(app)
        .patch(`/api/whatsapp/drafts/${draftId}/approve`)
        .set("Authorization", `Bearer ${t1Token}`)
        .send({ sendImmediately: true });
      expect(res.status).toBe(409);
      expect(res.body.error.toLowerCase()).toContain("test worker");

      const verify = await pool.query<{ status: string }>(
        `SELECT status FROM whatsapp_messages WHERE id = $1`, [draftId]);
      expect(verify.rows[0].status).toBe("APPROVED");
    });

    it("A4 PATCH /messages/:id/read sets read_at; second PATCH is idempotent", async () => {
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO whatsapp_messages (tenant_id, direction, status, worker_id, phone, body, twilio_message_sid)
         VALUES ('production', 'inbound', 'RECEIVED', $1, '+48502111222', 'inbound test', $2)
         RETURNING id`,
        [realWorkerId, `SM${"x".repeat(32)}`],
      );
      const msgId = ins.rows[0].id;

      const first = await request(app)
        .patch(`/api/whatsapp/messages/${msgId}/read`)
        .set("Authorization", `Bearer ${t1Token}`)
        .send({});
      expect(first.status).toBe(200);
      expect(first.body.readAt).toBeTruthy();
      const firstReadAt = first.body.readAt;

      const second = await request(app)
        .patch(`/api/whatsapp/messages/${msgId}/read`)
        .set("Authorization", `Bearer ${t1Token}`)
        .send({});
      expect(second.status).toBe(200);
      expect(second.body.readAt).toBe(firstReadAt);
    });

    it("A5 /admin/stats reports unreadWhatsApp and whatsappPendingApproval correctly", async () => {
      // Snapshot pre-existing tenant-scoped counts (other tests may have left rows in either state)
      const baseline = await pool.query<{ unread: number; pending: number }>(
        `SELECT
           COUNT(*) FILTER (WHERE direction = 'inbound' AND read_at IS NULL)::int AS unread,
           COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'APPROVED')::int AS pending
         FROM whatsapp_messages WHERE tenant_id = 'production'`,
      );
      const baseUnread = baseline.rows[0].unread;
      const basePending = baseline.rows[0].pending;

      // Insert one inbound (read_at NULL) and one outbound APPROVED.
      await pool.query(
        `INSERT INTO whatsapp_messages (tenant_id, direction, status, worker_id, phone, body, twilio_message_sid)
         VALUES ('production', 'inbound', 'RECEIVED', $1, '+48502111999', 'a5-inbound', $2),
                ('production', 'outbound', 'APPROVED', $1, '+48502111999', 'a5-pending-approval', $3)`,
        [realWorkerId, `SM${"y".repeat(32)}`, `SM${"z".repeat(32)}`],
      );

      const res = await request(app)
        .get("/api/admin/stats")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.unreadWhatsApp).toBe("number");
      expect(typeof res.body.whatsappPendingApproval).toBe("number");
      expect(res.body.unreadWhatsApp).toBe(baseUnread + 1);
      expect(res.body.whatsappPendingApproval).toBe(basePending + 1);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Gap 4 — placement_type schema, API, audit, and behavioral gating.
// Requires TEST_DATABASE_URL pointing at a database with Gap 4 Task A migration applied.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "integration: Gap 4 placement_type (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;
    let coordToken: string;
    const createdWorkerIds: string[] = [];

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");

      const jwt = await import("jsonwebtoken");
      coordToken = jwt.default.sign(
        { id: "00000000-0000-0000-0000-0000000000c4", email: "coord@test.local", name: "Coord",
          role: "coordinator", tier: 2, tenantId: "production", site: null },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
    });

    afterAll(async () => {
      try {
        if (createdWorkerIds.length > 0) {
          await pool.query(`DELETE FROM eej_assignments WHERE worker_id = ANY($1::text[])`, [createdWorkerIds]);
          await pool.query(`DELETE FROM audit_entries WHERE worker_id = ANY($1::text[])`, [createdWorkerIds]);
          await pool.query(`DELETE FROM workers WHERE id = ANY($1::uuid[])`, [createdWorkerIds]);
        }
      } finally {
        await pool.end();
      }
    });

    it("E1 placement_type column exists on workers with default 'agency_leased' and CHECK constraint", async () => {
      const colInfo = await pool.query(
        `SELECT column_name, column_default, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'workers' AND column_name = 'placement_type'`
      );
      expect(colInfo.rowCount).toBe(1);
      expect(colInfo.rows[0].column_default).toMatch(/agency_leased/);
      expect(colInfo.rows[0].is_nullable).toBe("NO");

      // CHECK rejects bogus value
      await expect(
        pool.query(`INSERT INTO workers (name, placement_type, tenant_id) VALUES ('GAP4-bogus', 'fake_value', 'production')`)
      ).rejects.toThrow(/workers_placement_type_check/);
    });

    it("E2 POST /api/apply with no placementType creates worker with default 'agency_leased'", async () => {
      const res = await request(app)
        .post("/api/apply")
        .send({ name: `GAP4-default-${Date.now()}`, email: `gap4-default-${Date.now()}@test.local` });
      expect(res.status).toBe(200);
      const workerId = res.body.id as string;
      expect(workerId).toBeTruthy();
      createdWorkerIds.push(workerId);

      const row = await pool.query(`SELECT placement_type FROM workers WHERE id = $1`, [workerId]);
      expect(row.rows[0].placement_type).toBe("agency_leased");
    });

    it("E3 POST /api/apply with explicit placementType='direct_outsourcing' is honored", async () => {
      const res = await request(app)
        .post("/api/apply")
        .send({
          name: `GAP4-direct-${Date.now()}`,
          email: `gap4-direct-${Date.now()}@test.local`,
          placementType: "direct_outsourcing",
        });
      expect(res.status).toBe(200);
      const workerId = res.body.id as string;
      expect(workerId).toBeTruthy();
      createdWorkerIds.push(workerId);

      const row = await pool.query(`SELECT placement_type FROM workers WHERE id = $1`, [workerId]);
      expect(row.rows[0].placement_type).toBe("direct_outsourcing");
    });

    it("E4 POST /api/apply with invalid placementType returns 400", async () => {
      const res = await request(app)
        .post("/api/apply")
        .send({
          name: `GAP4-invalid-${Date.now()}`,
          email: `gap4-invalid-${Date.now()}@test.local`,
          placementType: "something_else",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/placementType/i);
    });

    it("E5 PATCH /api/workers/:id with placementType change writes PLACEMENT_TYPE audit row", async () => {
      // Create via admin POST to get a worker we can PATCH
      const create = await request(app)
        .post("/api/workers")
        .set("Authorization", `Bearer ${coordToken}`)
        .send({ name: `GAP4-patch-${Date.now()}` });
      expect(create.status).toBe(201);
      const workerId = create.body.worker.id as string;
      createdWorkerIds.push(workerId);

      const patch = await request(app)
        .patch(`/api/workers/${workerId}`)
        .set("Authorization", `Bearer ${coordToken}`)
        .send({ placementType: "direct_outsourcing" });
      expect(patch.status).toBe(200);

      // Audit log: PLACEMENT_TYPE entry should be present (fire-and-forget; small wait)
      await new Promise(r => setTimeout(r, 200));
      const audit = await pool.query(
        `SELECT field, old_value #>> '{}' AS old_v, new_value #>> '{}' AS new_v FROM audit_entries
         WHERE worker_id = $1 AND field = 'PLACEMENT_TYPE' ORDER BY timestamp DESC LIMIT 1`,
        [workerId]
      );
      expect(audit.rowCount).toBeGreaterThanOrEqual(1);
      expect(audit.rows[0].old_v).toBe("agency_leased");
      expect(audit.rows[0].new_v).toBe("direct_outsourcing");
    });

    it("E6 art_20_enforced=TRUE on assignment insert for agency_leased worker", async () => {
      const create = await request(app)
        .post("/api/workers")
        .set("Authorization", `Bearer ${coordToken}`)
        .send({ name: `GAP4-agency-${Date.now()}` });
      const workerId = create.body.worker.id as string;
      createdWorkerIds.push(workerId);

      const assign = await request(app)
        .post("/api/v1/agency/assignments")
        .set("Authorization", `Bearer ${coordToken}`)
        .send({ workerId, clientName: "GAP4-Client", startDate: new Date().toISOString().slice(0, 10) });
      expect(assign.status).toBe(200);
      expect(assign.body.compliance.art20Enforced).toBe(true);
      expect(assign.body.compliance.placementType).toBe("agency_leased");

      const row = await pool.query(`SELECT art_20_enforced FROM eej_assignments WHERE worker_id = $1`, [workerId]);
      expect(row.rows[0].art_20_enforced).toBe(true);
    });

    it("E7 art_20_enforced=FALSE for direct_outsourcing worker; 18-month block does not fire", async () => {
      const create = await request(app)
        .post("/api/workers")
        .set("Authorization", `Bearer ${coordToken}`)
        .send({ name: `GAP4-direct-asn-${Date.now()}`, placementType: "direct_outsourcing" });
      const workerId = create.body.worker.id as string;
      createdWorkerIds.push(workerId);

      // Pre-seed eej_assignments with an assignment that already exceeds 18 months (560 days back) so
      // an agency-leased worker would be blocked. Direct-outsourcing must NOT block.
      const start600 = new Date(Date.now() - 600 * 86400000).toISOString().slice(0, 10);
      await pool.query(
        `INSERT INTO eej_assignments (worker_id, client_name, start_date, status, org_context, art_20_enforced)
         VALUES ($1, 'GAP4-Client-Direct', $2, 'ACTIVE', 'EEJ', FALSE)`,
        [workerId, start600]
      );

      const assign = await request(app)
        .post("/api/v1/agency/assignments")
        .set("Authorization", `Bearer ${coordToken}`)
        .send({ workerId, clientName: "GAP4-Client-Direct", startDate: new Date().toISOString().slice(0, 10) });
      // Should NOT be 400 PLACEMENT BLOCKED — direct_outsourcing is not bound by Art. 20
      expect(assign.status).toBe(200);
      expect(assign.body.compliance.art20Enforced).toBe(false);
      expect(assign.body.compliance.placementType).toBe("direct_outsourcing");
    });

    it("E8 GET /api/v1/agency/assignments/scan excludes art_20_enforced=FALSE rows", async () => {
      const create = await request(app)
        .post("/api/workers")
        .set("Authorization", `Bearer ${coordToken}`)
        .send({ name: `GAP4-scan-direct-${Date.now()}`, placementType: "direct_outsourcing" });
      const workerId = create.body.worker.id as string;
      createdWorkerIds.push(workerId);

      // Insert an assignment that would otherwise breach the 450-day threshold the scan filters on
      const start500 = new Date(Date.now() - 500 * 86400000).toISOString().slice(0, 10);
      await pool.query(
        `INSERT INTO eej_assignments (worker_id, client_name, start_date, status, org_context, art_20_enforced)
         VALUES ($1, 'GAP4-Scan-Direct', $2, 'ACTIVE', 'EEJ', FALSE)`,
        [workerId, start500]
      );

      const scan = await request(app)
        .get("/api/v1/agency/assignments/scan")
        .set("Authorization", `Bearer ${coordToken}`);
      expect(scan.status).toBe(200);
      const alertWorkerIds = (scan.body.alerts as Array<{ worker_id: string }>).map(a => a.worker_id);
      expect(alertWorkerIds).not.toContain(workerId);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Auth-gating closure: GET /api/jobs/:id — Stage 4.5 + Phase 3 Q8 commitment.
// Endpoint was previously unauthenticated; now requires Bearer token, scopes by
// tenant, projects worker PII per role, and strips tenantId from response.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "auth-gating closure: GET /api/jobs/:id (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;
    let prodToken: string;
    let testTenantToken: string;
    let testJobId: string;
    const createdIds: { jobIds: string[]; workerIds: string[]; appIds: string[] } = {
      jobIds: [], workerIds: [], appIds: [],
    };

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");

      // Insert a job in the production tenant for testing
      const jobRows = await pool.query<{ id: string }>(
        `INSERT INTO job_postings (title, tenant_id) VALUES ($1, 'production') RETURNING id`,
        [`AUTH-GATE-test-${Date.now()}`]
      );
      testJobId = jobRows.rows[0].id;
      createdIds.jobIds.push(testJobId);

      // Insert a worker + application so the response payload has worker rows
      const workerRows = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, tenant_id) VALUES ($1, 'production') RETURNING id`,
        [`AUTH-GATE-worker-${Date.now()}`]
      );
      const workerId = workerRows.rows[0].id;
      createdIds.workerIds.push(workerId);

      const appRows = await pool.query<{ id: string }>(
        `INSERT INTO job_applications (job_id, worker_id, tenant_id) VALUES ($1, $2, 'production') RETURNING id`,
        [testJobId, workerId]
      );
      createdIds.appIds.push(appRows.rows[0].id);

      const jwt = await import("jsonwebtoken");
      prodToken = jwt.default.sign(
        { id: "00000000-0000-0000-0000-0000000000a8", email: "auth-gate@test.local", name: "AuthGate",
          role: "coordinator", tier: 2, tenantId: "production", site: null },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
      testTenantToken = jwt.default.sign(
        { id: "00000000-0000-0000-0000-0000000000a9", email: "auth-gate-other@test.local", name: "AuthGateOther",
          role: "coordinator", tier: 2, tenantId: "test", site: null },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
    });

    afterAll(async () => {
      try {
        if (createdIds.appIds.length > 0) {
          await pool.query(`DELETE FROM job_applications WHERE id = ANY($1::uuid[])`, [createdIds.appIds]);
        }
        if (createdIds.workerIds.length > 0) {
          await pool.query(`DELETE FROM workers WHERE id = ANY($1::uuid[])`, [createdIds.workerIds]);
        }
        if (createdIds.jobIds.length > 0) {
          await pool.query(`DELETE FROM job_postings WHERE id = ANY($1::uuid[])`, [createdIds.jobIds]);
        }
      } finally {
        await pool.end();
      }
    });

    it("returns 401 when no auth header provided", async () => {
      const res = await request(app).get(`/api/jobs/${testJobId}`);
      expect(res.status).toBe(401);
    });

    it("returns 401 when invalid token provided", async () => {
      const res = await request(app)
        .get(`/api/jobs/${testJobId}`)
        .set("Authorization", "Bearer invalid-token");
      expect(res.status).toBe(401);
    });

    it("returns 200 with applications when authenticated user is in same tenant", async () => {
      const res = await request(app)
        .get(`/api/jobs/${testJobId}`)
        .set("Authorization", `Bearer ${prodToken}`);
      expect(res.status).toBe(200);
      expect(res.body.job).toBeDefined();
      expect(res.body.job.tenantId).toBeUndefined(); // Stripped
      expect(res.body.applications).toBeInstanceOf(Array);
      expect(res.body.applications.length).toBeGreaterThan(0);
      const firstApp = res.body.applications[0];
      expect(firstApp.worker).toBeDefined();
      expect(firstApp.worker.tenantId).toBeUndefined(); // Stripped
    });

    it("returns 404 when authenticated user is in different tenant", async () => {
      const res = await request(app)
        .get(`/api/jobs/${testJobId}`)
        .set("Authorization", `Bearer ${testTenantToken}`);
      expect(res.status).toBe(404);
    });
  }
);


// ─────────────────────────────────────────────────────────────────────────────
// a1_certificates schema integrity — DB-backed. Closes ghost-table query at
// services/pip-readiness.service.ts (Posted Workers risk detection).
// When TEST_DATABASE_URL is unset, this entire block is skipped.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "integration: a1_certificates schema (requires TEST_DATABASE_URL)",
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

    it("table exists with all columns required by pip-readiness query", async () => {
      const { rows } = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'a1_certificates' ORDER BY ordinal_position`
      );
      const cols = rows.map((r) => r.column_name);
      expect(cols).toContain("worker_name");
      expect(cols).toContain("host_country");
      expect(cols).toContain("tenant_id");
      expect(cols).toContain("status");
      expect(cols).toContain("certificate_number");
      expect(cols).toContain("issuing_country");
      expect(cols).toContain("issuing_authority");
      expect(cols).toContain("valid_until");
    });

    it("pip-readiness query shape executes without error", async () => {
      const { rows } = await pool.query(
        `SELECT worker_name, host_country FROM a1_certificates WHERE tenant_id = 'production' AND status = 'expired' LIMIT 1`
      );
      expect(Array.isArray(rows)).toBe(true);
    });

    it("FK constraint a1_certificates_tenant_slug_fk references tenants(slug)", async () => {
      const { rows } = await pool.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'a1_certificates'::regclass AND contype = 'f'`
      );
      const constraintNames = rows.map((r) => r.conname);
      expect(constraintNames).toContain("a1_certificates_tenant_slug_fk");
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Pattern B centralization 3a — DB-backed schema integrity. 10 lazy tables
// migrated from request-time helpers to migrate.ts. Skipped without TEST_DATABASE_URL.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "integration: Pattern B centralization 3a (requires TEST_DATABASE_URL)",
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

    it("all 10 centralized tables exist after migrations", async () => {
      const expected = [
        "eej_payroll_ledger", "border_crossings", "smart_documents",
        "eej_notification_log", "eej_billing_events", "eej_escalation_log",
        "digital_safe", "intelligence_alerts", "ocr_feedback_log", "upo_vault",
      ];
      for (const t of expected) {
        const e = await pool.query("SELECT to_regclass($1) AS r", [`public.${t}`]);
        expect(e.rows[0].r, `Table ${t} should exist`).toBeTruthy();
      }
    });

    it("CHECK constraint preserved on border_crossings.direction", async () => {
      await expect(
        pool.query(
          `INSERT INTO border_crossings (worker_id, crossing_date, direction) VALUES ('test-w-${Date.now()}', '2026-01-01', 'sideways')`
        )
      ).rejects.toThrow(/check constraint/i);
    });

    it("UNIQUE index preserved on eej_payroll_ledger (worker_id, month_year)", async () => {
      const wid = `test-payroll-${Date.now()}`;
      await pool.query(`INSERT INTO eej_payroll_ledger (worker_id, month_year) VALUES ($1, '2099-01')`, [wid]);
      await expect(
        pool.query(`INSERT INTO eej_payroll_ledger (worker_id, month_year) VALUES ($1, '2099-01')`, [wid])
      ).rejects.toThrow(/unique|duplicate/i);
      await pool.query(`DELETE FROM eej_payroll_ledger WHERE worker_id = $1`, [wid]);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Pattern B centralization 3b — TRC FK chain + agency-compliance.
// 7 tables migrated from request-time helpers (trc-service ensureTables +
// agency-compliance-engine ensureComplianceTables) to migrate.ts.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "integration: Pattern B centralization 3b — TRC + agency-compliance (requires TEST_DATABASE_URL)",
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

    it("all 7 centralized tables exist after migrations", async () => {
      const expected = [
        "trc_cases", "trc_documents", "trc_case_notes",
        "eej_assignments", "eej_kraz", "eej_compliance_deadlines", "eej_retention_schedule",
      ];
      for (const t of expected) {
        const e = await pool.query("SELECT to_regclass($1) AS r", [`public.${t}`]);
        expect(e.rows[0].r, `Table ${t} should exist`).toBeTruthy();
      }
    });

    it("FK chain enforced: trc_documents.case_id ON DELETE CASCADE", async () => {
      const caseRes = await pool.query(
        `INSERT INTO trc_cases (worker_name, permit_type) VALUES ('test-fk-chain', 'TRC') RETURNING id`
      );
      const caseId = (caseRes.rows[0] as any).id;
      await pool.query(
        `INSERT INTO trc_documents (case_id, document_type, document_name) VALUES ($1, 'PASSPORT', 'test')`,
        [caseId]
      );
      await pool.query(`DELETE FROM trc_cases WHERE id = $1`, [caseId]);
      const docs = await pool.query(`SELECT id FROM trc_documents WHERE case_id = $1`, [caseId]);
      expect(docs.rows.length).toBe(0);
    });

    it("Gap 4: eej_assignments.art_20_enforced column inline with default TRUE", async () => {
      const cols = await pool.query(
        `SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'eej_assignments' AND column_name = 'art_20_enforced'`
      );
      expect(cols.rows.length).toBe(1);
      expect((cols.rows[0] as any).column_default).toContain("true");
      expect((cols.rows[0] as any).is_nullable).toBe("NO");
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Pattern B centralization 3c — legal-intelligence + legal-case-engine + trigger.
// 8 tables + 1 PL/pgSQL trigger function + 1 trigger migrated from request-time
// helpers (legal-intelligence ensureTables + legal-case-engine ensureTables) to
// migrate.ts.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "integration: Pattern B centralization 3c — legal tables + trigger (requires TEST_DATABASE_URL)",
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

    it("all 8 centralized legal tables exist after migrations", async () => {
      const expected = [
        "research_memos", "appeal_outputs", "poa_documents", "authority_drafts", "case_tasks",
        "eej_legal_cases", "eej_case_generated_docs", "eej_case_notebook",
      ];
      for (const t of expected) {
        const e = await pool.query("SELECT to_regclass($1) AS r", [`public.${t}`]);
        expect(e.rows[0].r, `Table ${t} should exist`).toBeTruthy();
      }
    });

    it("UNIQUE(case_id, task_key) preserved on case_tasks", async () => {
      const cid = `test-task-${Date.now()}`;
      await pool.query(`INSERT INTO case_tasks (case_id, task_key, label) VALUES ($1, 'k1', 'test')`, [cid]);
      await expect(
        pool.query(`INSERT INTO case_tasks (case_id, task_key, label) VALUES ($1, 'k1', 'dup')`, [cid])
      ).rejects.toThrow(/unique|duplicate/i);
      await pool.query(`DELETE FROM case_tasks WHERE case_id = $1`, [cid]);
    });

    it("eej_notebook_search_update function exists in pg_proc", async () => {
      const r = await pool.query(
        `SELECT proname FROM pg_proc WHERE proname = 'eej_notebook_search_update'`
      );
      expect(r.rows.length).toBe(1);
    });

    it("trigger eej_notebook_search_trigger fires on insert (search_vector populated)", async () => {
      const caseId = (await pool.query(`SELECT gen_random_uuid() AS id`)).rows[0].id;
      const ins = await pool.query(
        `INSERT INTO eej_case_notebook (case_id, title, content) VALUES ($1, 'Polish appeal letter', 'Article 127 KPA reference') RETURNING search_vector::text AS sv`,
        [caseId]
      );
      const sv = (ins.rows[0] as any).sv;
      expect(sv).toBeTruthy();
      expect(sv.length).toBeGreaterThan(0);
      // tsvector format: 'word':position 'word2':position ...
      expect(sv).toContain("'");
      await pool.query(`DELETE FROM eej_case_notebook WHERE case_id = $1`, [caseId]);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Pattern B centralization 3d — knowledge-graph + POA + signature (FINAL closure).
// 6 tables migrated from request-time helpers. Pattern B fully closed after 3d:
// 31 of 31 tables centralized in migrate.ts; 0 ensureXxxTables in services/.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "integration: Pattern B centralization 3d — graph + poa + signature (FINAL)",
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

    it("all 6 centralized tables exist after migrations", async () => {
      const expected = [
        "kg_nodes", "kg_edges", "kg_patterns",
        "eej_poa_registry", "eej_rodo_consents", "employer_signature_links",
      ];
      for (const t of expected) {
        const e = await pool.query("SELECT to_regclass($1) AS r", [`public.${t}`]);
        expect(e.rows[0].r, `Table ${t} should exist`).toBeTruthy();
      }
    });

    it("kg_edges FK to kg_nodes enforced (CASCADE on delete)", async () => {
      const nodeId = `test-node-${Date.now()}`;
      const otherNodeId = `test-other-${Date.now()}`;
      await pool.query(
        `INSERT INTO kg_nodes (id, node_type, label) VALUES ($1, 'WORKER', 'Test'), ($2, 'CASE', 'Other')`,
        [nodeId, otherNodeId]
      );
      await pool.query(
        `INSERT INTO kg_edges (source_id, target_id, edge_type) VALUES ($1, $2, 'HAS')`,
        [nodeId, otherNodeId]
      );
      await pool.query(`DELETE FROM kg_nodes WHERE id IN ($1, $2)`, [nodeId, otherNodeId]);
      const edges = await pool.query(
        `SELECT id FROM kg_edges WHERE source_id = $1 OR target_id = $1`,
        [nodeId]
      );
      expect(edges.rows.length).toBe(0);
    });

    it("kg_edges UNIQUE(source_id, target_id, edge_type) preserved", async () => {
      const a = `test-a-${Date.now()}`;
      const b = `test-b-${Date.now()}`;
      await pool.query(`INSERT INTO kg_nodes (id, node_type, label) VALUES ($1, 'X', 'a'), ($2, 'X', 'b')`, [a, b]);
      await pool.query(`INSERT INTO kg_edges (source_id, target_id, edge_type) VALUES ($1, $2, 'LINK')`, [a, b]);
      await expect(
        pool.query(`INSERT INTO kg_edges (source_id, target_id, edge_type) VALUES ($1, $2, 'LINK')`, [a, b])
      ).rejects.toThrow(/unique|duplicate/i);
      await pool.query(`DELETE FROM kg_nodes WHERE id IN ($1, $2)`, [a, b]);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Pattern B closure invariant: zero `async function ensureXxxTables` helpers
// remain in services/. Source-grep regression catcher; doesn't require DB.
// Architectural memory of why Pattern B was bad. If a future PR re-introduces
// a lazy-table helper in services/, this test fails and CI surfaces the regression.
// ─────────────────────────────────────────────────────────────────────────────
describe("Pattern B closure invariant (architectural regression catcher)", () => {
  it("no ensure* helpers remain in services/", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const __filename = url.fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const servicesDir = path.resolve(__dirname, "services");
    const files = fs.readdirSync(servicesDir).filter((f) => f.endsWith(".ts"));
    const offending: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(servicesDir, f), "utf8");
      if (/^\s*async function ensure[A-Z]\w*\s*\(/m.test(src)) {
        offending.push(f);
      }
    }
    expect(
      offending,
      `Pattern B regression: services still containing ensure*Tables helpers: ${offending.join(", ")}`
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T0-A: Portal endpoints — DB-backed, end-to-end via supertest.
// Item 2.6 Phase B Step T0-A. Covers /portal/token, /portal/me, /portal/hours,
// /portal/send-whatsapp. Mocks sendWhatsAppMessage at file scope (see top).
// Tenant: 'test'. Cleanup in afterAll.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "T0-A: portal endpoints (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;
    let workerId: string;
    let adminToken: string;
    let crossTenantAdminToken: string;

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");

      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, job_role, assigned_site, tenant_id)
         VALUES ('Portal Test Worker', '+48 555 010 101', 'welder', 'Warsaw Site A', 'test')
         RETURNING id`,
      );
      workerId = rows[0].id;

      const jwt = await import("jsonwebtoken");
      adminToken = jwt.default.sign(
        { id: "00000000-0000-0000-0000-0000000000c1", email: "admin@portal-test.local",
          name: "Admin", role: "executive", tier: 1, tenantId: "test", site: null },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
      crossTenantAdminToken = jwt.default.sign(
        { id: "00000000-0000-0000-0000-0000000000c2", email: "admin2@portal-test.local",
          name: "Admin Other", role: "executive", tier: 1, tenantId: "production", site: null },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
    });

    afterAll(async () => {
      try {
        await pool.query(`DELETE FROM portal_daily_logs WHERE worker_id = $1`, [workerId]);
        await pool.query(`DELETE FROM audit_entries WHERE worker_id = $1`, [workerId]);
        await pool.query(`DELETE FROM workers WHERE id = $1`, [workerId]);
      } finally {
        await pool.end();
      }
    });

    // ── GET /portal/token/:recordId ─────────────────────────────────────────
    it("P1 GET /portal/token returns 401 without Authorization header", async () => {
      const res = await request(app).get(`/api/portal/token/${workerId}`);
      expect(res.status).toBe(401);
    });

    it("P2 GET /portal/token returns 401 with invalid bearer token", async () => {
      const res = await request(app)
        .get(`/api/portal/token/${workerId}`)
        .set("Authorization", "Bearer not-a-real-token");
      expect(res.status).toBe(401);
    });

    it("P3 GET /portal/token returns 404 when worker belongs to another tenant", async () => {
      const res = await request(app)
        .get(`/api/portal/token/${workerId}`)
        .set("Authorization", `Bearer ${crossTenantAdminToken}`);
      expect(res.status).toBe(404);
    });

    it("P4 GET /portal/token mints a valid 30-day portal-typed JWT", async () => {
      const res = await request(app)
        .get(`/api/portal/token/${workerId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe("string");
      expect(res.body.expiresIn).toBe("30d");

      const jwt = await import("jsonwebtoken");
      const decoded = jwt.default.verify(res.body.token, process.env.JWT_SECRET!) as Record<string, unknown>;
      expect(decoded.type).toBe("portal");
      expect(decoded.workerId).toBe(workerId);
    });

    // ── GET /portal/me ──────────────────────────────────────────────────────
    it("P5 GET /portal/me returns 400 when token query param missing", async () => {
      const res = await request(app).get("/api/portal/me");
      expect(res.status).toBe(400);
    });

    it("P6 GET /portal/me returns 401 with invalid portal token", async () => {
      const res = await request(app).get("/api/portal/me?token=garbage");
      expect(res.status).toBe(401);
    });

    it("P7 GET /portal/me happy path returns profile + dailyLog shape", async () => {
      // Mint a portal token via the admin endpoint (already exercised in P4).
      const tokRes = await request(app)
        .get(`/api/portal/token/${workerId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      const portalToken = tokRes.body.token as string;

      const res = await request(app).get(`/api/portal/me?token=${portalToken}`);
      expect(res.status).toBe(200);
      expect(res.body.profile).toMatchObject({
        id: workerId,
        name: "Portal Test Worker",
        specialization: "welder",
        siteLocation: "Warsaw Site A",
      });
      expect(Array.isArray(res.body.dailyLog)).toBe(true);
    });

    // ── POST /portal/hours ──────────────────────────────────────────────────
    it("P8 POST /portal/hours returns 400 when token missing", async () => {
      const res = await request(app).post("/api/portal/hours").send({ date: "2026-05-08", hours: 8 });
      expect(res.status).toBe(400);
    });

    it("P9 POST /portal/hours rejects malformed date with 400", async () => {
      const tokRes = await request(app)
        .get(`/api/portal/token/${workerId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      const portalToken = tokRes.body.token as string;

      const res = await request(app)
        .post(`/api/portal/hours?token=${portalToken}`)
        .send({ date: "not-a-date", hours: 8 });
      expect(res.status).toBe(400);
    });

    it("P10 POST /portal/hours rejects out-of-range hours with 400", async () => {
      const tokRes = await request(app)
        .get(`/api/portal/token/${workerId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      const portalToken = tokRes.body.token as string;

      const tooHigh = await request(app)
        .post(`/api/portal/hours?token=${portalToken}`)
        .send({ date: "2026-05-08", hours: 30 });
      expect(tooHigh.status).toBe(400);

      const negative = await request(app)
        .post(`/api/portal/hours?token=${portalToken}`)
        .send({ date: "2026-05-08", hours: -1 });
      expect(negative.status).toBe(400);
    });

    it("P11 POST /portal/hours happy path inserts log + recalculates totalHours + appends audit", async () => {
      const tokRes = await request(app)
        .get(`/api/portal/token/${workerId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      const portalToken = tokRes.body.token as string;

      const res = await request(app)
        .post(`/api/portal/hours?token=${portalToken}`)
        .send({ date: "2026-05-09", hours: 8 });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.totalHours).toBeGreaterThanOrEqual(8);

      const logRows = await pool.query(
        `SELECT hours::float AS hours FROM portal_daily_logs WHERE worker_id = $1 AND date = '2026-05-09'`,
        [workerId],
      );
      expect(logRows.rows.length).toBe(1);
      expect(Number(logRows.rows[0].hours)).toBe(8);

      const auditRows = await pool.query(
        `SELECT field, action FROM audit_entries WHERE worker_id = $1 AND action = 'daily-hours'`,
        [workerId],
      );
      expect(auditRows.rows.length).toBeGreaterThanOrEqual(1);
    });

    it("P12 POST /portal/hours upserts on second submission for same date", async () => {
      const tokRes = await request(app)
        .get(`/api/portal/token/${workerId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      const portalToken = tokRes.body.token as string;

      // Same date as P11 but new hours value — should UPDATE, not INSERT a duplicate.
      const res = await request(app)
        .post(`/api/portal/hours?token=${portalToken}`)
        .send({ date: "2026-05-09", hours: 6 });
      expect(res.status).toBe(200);

      const logRows = await pool.query(
        `SELECT hours::float AS hours FROM portal_daily_logs WHERE worker_id = $1 AND date = '2026-05-09'`,
        [workerId],
      );
      expect(logRows.rows.length).toBe(1);
      expect(Number(logRows.rows[0].hours)).toBe(6);
    });

    // ── POST /portal/send-whatsapp/:recordId ────────────────────────────────
    it("P13 POST /portal/send-whatsapp returns 401 without Authorization header", async () => {
      const res = await request(app).post(`/api/portal/send-whatsapp/${workerId}`).send({});
      expect(res.status).toBe(401);
    });

    it("P14 POST /portal/send-whatsapp returns 404 cross-tenant", async () => {
      // Twilio creds may be unset in CI; if so, the route returns 503 BEFORE
      // tenant lookup. Skip cross-tenant assertion in that case.
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        const res = await request(app)
          .post(`/api/portal/send-whatsapp/${workerId}`)
          .set("Authorization", `Bearer ${crossTenantAdminToken}`)
          .send({});
        expect(res.status).toBe(503);
        return;
      }
      const res = await request(app)
        .post(`/api/portal/send-whatsapp/${workerId}`)
        .set("Authorization", `Bearer ${crossTenantAdminToken}`)
        .send({});
      expect(res.status).toBe(404);
    });

    it("P15 POST /portal/send-whatsapp returns 400 for worker with no phone", async () => {
      // Twilio creds gate fires before phone check; skip if absent.
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id) VALUES ('No Phone Worker', NULL, 'test') RETURNING id`,
      );
      const noPhoneId = rows[0].id;
      try {
        const res = await request(app)
          .post(`/api/portal/send-whatsapp/${noPhoneId}`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({});
        expect(res.status).toBe(400);
      } finally {
        await pool.query(`DELETE FROM workers WHERE id = $1`, [noPhoneId]);
      }
    });

    it("P16 POST /portal/send-whatsapp happy path calls sendWhatsAppMessage with correct args", async () => {
      // Twilio creds gate fires first; skip mock-call assertion if absent.
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
      const alerter = await import("./lib/alerter.js");
      const sendMock = alerter.sendWhatsAppMessage as unknown as Mock;
      sendMock.mockClear();

      const res = await request(app)
        .post(`/api/portal/send-whatsapp/${workerId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sentTo).toBe("+48 555 010 101");

      expect(sendMock).toHaveBeenCalledTimes(1);
      const [phone, body] = sendMock.mock.calls[0];
      expect(phone).toBe("+48 555 010 101");
      expect(body).toContain("Twoj portal EEJ");
      expect(body).toContain("Portal Test Worker");
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// T0-B: Auth admin + Auth EEJ mobile + 2FA endpoints — DB-backed.
// Item 2.6 Phase B Step T0-B. Covers /auth/* (auth.ts), /eej/auth/* (eej-auth.ts),
// and /2fa/* (twofa.ts). Mock sendLoginNotification at file scope (top of file).
// Three test users created in beforeAll, all in tenant 'test', all cleaned in afterAll:
//   1. Admin-side `users` row, role='manager' (auth + change-password tests)
//   2. Mobile `system_users` row, role='T1' (eej-auth tests)
//   3. Admin-side `users` row, role='manager' (2FA tests — separate to avoid
//      F7's enable-2FA leaking into A5's login flow)
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "T0-B: auth + eej-auth + 2FA endpoints (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;
    let authUserId: string;
    let authUserEmail: string;
    let authUserPassword: string;
    let eejUserId: string;
    let eejUserEmail: string;
    let eejUserPassword: string;
    let twofaUserId: string;
    let twofaUserEmail: string;
    let managerToken: string;
    let t1MobileToken: string;
    let t3MobileToken: string;
    let twofaUserToken: string;

    // Unique X-Forwarded-For per login call, to keep `loginLimiter`
    // (lib/security.ts: 10 req / 15 min, IP-keyed, shared instance across
    // /auth/login + /eej/auth/login) from throttling cumulative test calls.
    // app.ts:11 enables `app.set("trust proxy", 1)`, so req.ip honors XFF.
    let xffCounter = 0;
    const uniqueIp = () => {
      xffCounter += 1;
      return `10.0.${Math.floor(xffCounter / 254)}.${(xffCounter % 254) + 1}`;
    };

    // scrypt hash helper matching auth.ts hashPassword shape "salt:hex"
    async function makeScryptHash(password: string): Promise<string> {
      const { randomBytes, scrypt } = await import("crypto");
      const salt = randomBytes(16).toString("hex");
      return new Promise((resolve, reject) => {
        scrypt(password, salt, 64, (err, key) => {
          if (err) reject(err);
          else resolve(`${salt}:${key.toString("hex")}`);
        });
      });
    }

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");

      authUserEmail = `auth-test-${Date.now()}@eej-test.local`;
      authUserPassword = "test-password-1234";
      const authHash = await makeScryptHash(authUserPassword);
      const authIns = await pool.query<{ id: string }>(
        `INSERT INTO users (email, name, role, site, password_hash, tenant_id)
         VALUES ($1, 'Auth Test User', 'manager', NULL, $2, 'test') RETURNING id`,
        [authUserEmail, authHash],
      );
      authUserId = authIns.rows[0].id;

      eejUserEmail = `eej-t1-test-${Date.now()}@eej-test.local`;
      eejUserPassword = "eej-test-password-1234";
      const eejHash = await makeScryptHash(eejUserPassword);
      const eejIns = await pool.query<{ id: string }>(
        `INSERT INTO system_users (name, email, password_hash, role, designation, short_name)
         VALUES ('EEJ T1 Test', $1, $2, 'T1', 'Executive Test', 'Test') RETURNING id`,
        [eejUserEmail, eejHash],
      );
      eejUserId = eejIns.rows[0].id;

      twofaUserEmail = `twofa-test-${Date.now()}@eej-test.local`;
      const twofaHash = await makeScryptHash("twofa-password-1234");
      const twofaIns = await pool.query<{ id: string }>(
        `INSERT INTO users (email, name, role, site, password_hash, tenant_id)
         VALUES ($1, '2FA Test User', 'manager', NULL, $2, 'test') RETURNING id`,
        [twofaUserEmail, twofaHash],
      );
      twofaUserId = twofaIns.rows[0].id;

      const jwt = await import("jsonwebtoken");
      managerToken = jwt.default.sign(
        { id: authUserId, email: authUserEmail, name: "Auth Test User",
          role: "manager", site: null, tenantId: "test" },
        process.env.JWT_SECRET!, { expiresIn: "5m" },
      );
      // EEJ mobile JWT shape (see eej-auth.ts:63 — id, email, role, tier, tenantId)
      t1MobileToken = jwt.default.sign(
        { sub: eejUserId, id: eejUserId, email: eejUserEmail, name: "EEJ T1 Test",
          role: "executive", tier: 1, tenantId: "production", site: null },
        process.env.JWT_SECRET!, { expiresIn: "5m" },
      );
      t3MobileToken = jwt.default.sign(
        { sub: "00000000-0000-0000-0000-0000000000d3", id: "00000000-0000-0000-0000-0000000000d3",
          email: "t3@eej-test.local", name: "T3 Mobile", role: "operations", tier: 3,
          tenantId: "production", site: null },
        process.env.JWT_SECRET!, { expiresIn: "5m" },
      );
      twofaUserToken = jwt.default.sign(
        { id: twofaUserId, email: twofaUserEmail, name: "2FA Test User",
          role: "manager", site: null, tenantId: "test" },
        process.env.JWT_SECRET!, { expiresIn: "5m" },
      );
    });

    afterAll(async () => {
      try {
        await pool.query(`DELETE FROM audit_entries WHERE worker_id = ANY($1::text[])`,
          [[authUserId, eejUserId, twofaUserId]]);
        await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`,
          [[authUserId, twofaUserId]]);
        await pool.query(`DELETE FROM system_users WHERE id = $1`, [eejUserId]);
        // Sweep any system_users created via E13 happy path (defensive)
        await pool.query(
          `DELETE FROM system_users WHERE email LIKE 'eej-create-test-%@eej-test.local'`,
        );
      } finally {
        await pool.end();
      }
    });

    // ── /auth/login (auth.ts:45) ───────────────────────────────────────────
    it("A1 POST /auth/login 400 missing email", async () => {
      const res = await request(app).post("/api/auth/login")
        .set("X-Forwarded-For", uniqueIp())
        .send({ password: "x" });
      expect(res.status).toBe(400);
    });

    it("A2 POST /auth/login 400 missing password", async () => {
      const res = await request(app).post("/api/auth/login")
        .set("X-Forwarded-For", uniqueIp())
        .send({ email: "x@y" });
      expect(res.status).toBe(400);
    });

    it("A3 POST /auth/login 403 unknown email", async () => {
      const res = await request(app).post("/api/auth/login")
        .set("X-Forwarded-For", uniqueIp())
        .send({ email: `unknown-${Date.now()}@nowhere.local`, password: "anything" });
      expect(res.status).toBe(403);
    });

    it("A4 POST /auth/login 401 wrong password", async () => {
      const res = await request(app).post("/api/auth/login")
        .set("X-Forwarded-For", uniqueIp())
        .send({ email: authUserEmail, password: "definitely-wrong" });
      expect(res.status).toBe(401);
    });

    it("A5 POST /auth/login 200 happy path returns JWT + user payload", async () => {
      const res = await request(app).post("/api/auth/login")
        .set("X-Forwarded-For", uniqueIp())
        .send({ email: authUserEmail, password: authUserPassword });
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe("string");
      expect(res.body.user).toMatchObject({
        id: authUserId, email: authUserEmail, role: "manager", tenantId: "test",
      });
    });

    // ── /auth/verify (auth.ts:134) ─────────────────────────────────────────
    it("A6 POST /auth/verify 401 no Bearer header", async () => {
      const res = await request(app).post("/api/auth/verify");
      expect(res.status).toBe(401);
    });

    it("A7 POST /auth/verify 401 invalid token", async () => {
      const res = await request(app).post("/api/auth/verify")
        .set("Authorization", "Bearer not-a-real-token");
      expect(res.status).toBe(401);
    });

    it("A8 POST /auth/verify 200 valid token returns decoded user", async () => {
      const res = await request(app).post("/api/auth/verify")
        .set("Authorization", `Bearer ${managerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.user.email).toBe(authUserEmail);
    });

    // ── /auth/whoami (auth.ts:148) — PUBLIC by design ──────────────────────
    it("A9 GET /auth/whoami is PUBLIC and returns shape { allowedEmail, userCount }", async () => {
      const res = await request(app).get("/api/auth/whoami");
      expect(res.status).toBe(200);
      expect(typeof res.body.allowedEmail).toBe("string");
      expect(typeof res.body.userCount).toBe("number");
    });

    // ── /auth/change-password (auth.ts:156) ────────────────────────────────
    it("A10 POST /auth/change-password 401 no token", async () => {
      const res = await request(app).post("/api/auth/change-password")
        .send({ currentPassword: "x", newPassword: "y" });
      expect(res.status).toBe(401);
    });

    it("A11 POST /auth/change-password 400 missing fields", async () => {
      const res = await request(app).post("/api/auth/change-password")
        .set("Authorization", `Bearer ${managerToken}`).send({});
      expect(res.status).toBe(400);
    });

    it("A12 POST /auth/change-password 400 newPassword < 8 chars", async () => {
      const res = await request(app).post("/api/auth/change-password")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ currentPassword: authUserPassword, newPassword: "short" });
      expect(res.status).toBe(400);
    });

    it("A13 POST /auth/change-password 401 currentPassword wrong", async () => {
      const res = await request(app).post("/api/auth/change-password")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ currentPassword: "definitely-wrong", newPassword: "newer-password-1234" });
      expect(res.status).toBe(401);
    });

    it("A14 POST /auth/change-password 200 happy path; password hash updated", async () => {
      const newPassword = "rotated-password-5678";
      const res = await request(app).post("/api/auth/change-password")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ currentPassword: authUserPassword, newPassword });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify by attempting login with new password
      const loginRes = await request(app).post("/api/auth/login")
        .set("X-Forwarded-For", uniqueIp())
        .send({ email: authUserEmail, password: newPassword });
      expect(loginRes.status).toBe(200);

      // Restore the original password so other tests aren't disturbed.
      await request(app).post("/api/auth/change-password")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ currentPassword: newPassword, newPassword: authUserPassword });
    });

    // ── /eej/auth/login (eej-auth.ts:53) ───────────────────────────────────
    it("E1 POST /eej/auth/login 400 missing fields", async () => {
      const res = await request(app).post("/api/eej/auth/login")
        .set("X-Forwarded-For", uniqueIp())
        .send({});
      expect(res.status).toBe(400);
    });

    it("E2 POST /eej/auth/login 401 unknown email", async () => {
      const res = await request(app).post("/api/eej/auth/login")
        .set("X-Forwarded-For", uniqueIp())
        .send({ email: `unknown-${Date.now()}@nowhere.local`, password: "x" });
      expect(res.status).toBe(401);
    });

    it("E3 POST /eej/auth/login 401 wrong password", async () => {
      const res = await request(app).post("/api/eej/auth/login")
        .set("X-Forwarded-For", uniqueIp())
        .send({ email: eejUserEmail, password: "definitely-wrong" });
      expect(res.status).toBe(401);
    });

    it("E4 POST /eej/auth/login 200 maps T1 → executive/tier=1", async () => {
      const res = await request(app).post("/api/eej/auth/login")
        .set("X-Forwarded-For", uniqueIp())
        .send({ email: eejUserEmail, password: eejUserPassword });
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe("string");
      expect(res.body.user).toMatchObject({
        email: eejUserEmail, role: "executive", tier: 1, shortName: "Executive",
      });
    });

    // ── /eej/auth/refresh (eej-auth.ts:71) ─────────────────────────────────
    it("E5 POST /eej/auth/refresh 401 no token", async () => {
      const res = await request(app).post("/api/eej/auth/refresh");
      expect(res.status).toBe(401);
    });

    it("E6 POST /eej/auth/refresh 200 returns new JWT", async () => {
      const res = await request(app).post("/api/eej/auth/refresh")
        .set("Authorization", `Bearer ${t1MobileToken}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe("string");
    });

    // ── /eej/auth/users GET (eej-auth.ts:87) ───────────────────────────────
    it("E7 GET /eej/auth/users 403 no token", async () => {
      const res = await request(app).get("/api/eej/auth/users");
      expect(res.status).toBe(403);
    });

    it("E8 GET /eej/auth/users 403 T3 token (T1 only)", async () => {
      const res = await request(app).get("/api/eej/auth/users")
        .set("Authorization", `Bearer ${t3MobileToken}`);
      expect(res.status).toBe(403);
    });

    it("E9 GET /eej/auth/users 200 T1 token; response shape excludes passwordHash", async () => {
      const res = await request(app).get("/api/eej/auth/users")
        .set("Authorization", `Bearer ${t1MobileToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      const sample = res.body.users.find((u: any) => u.email === eejUserEmail);
      expect(sample).toBeDefined();
      expect(sample).not.toHaveProperty("passwordHash");
      expect(sample).not.toHaveProperty("password_hash");
    });

    // ── /eej/auth/users POST (eej-auth.ts:94) ──────────────────────────────
    it("E10 POST /eej/auth/users 403 T3 token", async () => {
      const res = await request(app).post("/api/eej/auth/users")
        .set("Authorization", `Bearer ${t3MobileToken}`)
        .send({ name: "x", email: "x@y", password: "12345678", role: "T3" });
      expect(res.status).toBe(403);
    });

    it("E11 POST /eej/auth/users 400 missing fields", async () => {
      const res = await request(app).post("/api/eej/auth/users")
        .set("Authorization", `Bearer ${t1MobileToken}`)
        .send({ email: "x@y" });
      expect(res.status).toBe(400);
    });

    it("E12 POST /eej/auth/users 409 duplicate email", async () => {
      const res = await request(app).post("/api/eej/auth/users")
        .set("Authorization", `Bearer ${t1MobileToken}`)
        .send({ name: "Dup", email: eejUserEmail, password: "newpassword1", role: "T2" });
      expect(res.status).toBe(409);
    });

    it("E13 POST /eej/auth/users 201 happy path creates user", async () => {
      const newEmail = `eej-create-test-${Date.now()}@eej-test.local`;
      const res = await request(app).post("/api/eej/auth/users")
        .set("Authorization", `Bearer ${t1MobileToken}`)
        .send({ name: "Created Test", email: newEmail, password: "createpass1234", role: "T2" });
      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        name: "Created Test", email: newEmail, role: "T2",
      });
      // Cleanup happens in afterAll's email-LIKE sweep.
    });

    // ── /eej/auth/users DELETE (eej-auth.ts:115) ───────────────────────────
    it("E14 DELETE /eej/auth/users/:id 403 T3 token", async () => {
      const res = await request(app).delete(`/api/eej/auth/users/${eejUserId}`)
        .set("Authorization", `Bearer ${t3MobileToken}`);
      expect(res.status).toBe(403);
    });

    it("E15 DELETE /eej/auth/users/:id 200 T1 token; row removed", async () => {
      // Create a sacrificial user so we don't break our test fixture.
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO system_users (name, email, password_hash, role, designation, short_name)
         VALUES ('Sacrifice', $1, 'placeholder:nohash', 'T3', 'Test', 'Test') RETURNING id`,
        [`eej-create-test-sacrifice-${Date.now()}@eej-test.local`],
      );
      const sacrificialId = ins.rows[0].id;

      const res = await request(app).delete(`/api/eej/auth/users/${sacrificialId}`)
        .set("Authorization", `Bearer ${t1MobileToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const after = await pool.query(`SELECT id FROM system_users WHERE id = $1`, [sacrificialId]);
      expect(after.rows.length).toBe(0);
    });

    // ── /2fa/setup (twofa.ts:13) — separate user to avoid login flow leak ──
    it("F1 POST /2fa/setup 401 no token", async () => {
      const res = await request(app).post("/api/2fa/setup");
      expect(res.status).toBe(401);
    });

    it("F2 POST /2fa/setup 200 returns secret + QR; persists secret on user row", async () => {
      const res = await request(app).post("/api/2fa/setup")
        .set("Authorization", `Bearer ${twofaUserToken}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.secret).toBe("string");
      expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);

      const stored = await pool.query<{ s: string | null; e: boolean | null }>(
        `SELECT two_factor_secret AS s, two_factor_enabled AS e FROM users WHERE id = $1`,
        [twofaUserId],
      );
      expect(stored.rows[0].s).toBe(res.body.secret);
      expect(stored.rows[0].e).toBe(false); // not enabled until verify
    });

    // ── /2fa/verify (twofa.ts:21) ──────────────────────────────────────────
    it("F3 POST /2fa/verify 401 no token", async () => {
      const res = await request(app).post("/api/2fa/verify").send({ token: "000000" });
      expect(res.status).toBe(401);
    });

    it("F4 POST /2fa/verify 400 missing token field", async () => {
      const res = await request(app).post("/api/2fa/verify")
        .set("Authorization", `Bearer ${twofaUserToken}`).send({});
      expect(res.status).toBe(400);
    });

    it("F5 POST /2fa/verify 401 wrong TOTP", async () => {
      const res = await request(app).post("/api/2fa/verify")
        .set("Authorization", `Bearer ${twofaUserToken}`)
        .send({ token: "000000" });
      expect(res.status).toBe(401);
    });

    it("F6 POST /2fa/verify 200 with real TOTP; sets enabled=true", async () => {
      const speakeasy = (await import("speakeasy")).default;
      const stored = await pool.query<{ s: string }>(
        `SELECT two_factor_secret AS s FROM users WHERE id = $1`, [twofaUserId],
      );
      const realToken = speakeasy.totp({ secret: stored.rows[0].s, encoding: "base32" });

      const res = await request(app).post("/api/2fa/verify")
        .set("Authorization", `Bearer ${twofaUserToken}`)
        .send({ token: realToken });
      expect(res.status).toBe(200);

      const after = await pool.query<{ e: boolean }>(
        `SELECT two_factor_enabled AS e FROM users WHERE id = $1`, [twofaUserId],
      );
      expect(after.rows[0].e).toBe(true);
    });

    // ── /2fa/status (twofa.ts:45) ──────────────────────────────────────────
    it("F7 GET /2fa/status 200 returns { enabled: boolean }", async () => {
      const res = await request(app).get("/api/2fa/status")
        .set("Authorization", `Bearer ${twofaUserToken}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.enabled).toBe("boolean");
      expect(res.body.enabled).toBe(true); // F6 just enabled it
    });

    // ── /2fa/disable (twofa.ts:33) ─────────────────────────────────────────
    it("F8 POST /2fa/disable 401 wrong TOTP", async () => {
      const res = await request(app).post("/api/2fa/disable")
        .set("Authorization", `Bearer ${twofaUserToken}`)
        .send({ token: "000000" });
      expect(res.status).toBe(401);
    });

    it("F9 POST /2fa/disable 200 happy path; clears secret + enabled=false", async () => {
      const speakeasy = (await import("speakeasy")).default;
      const stored = await pool.query<{ s: string }>(
        `SELECT two_factor_secret AS s FROM users WHERE id = $1`, [twofaUserId],
      );
      const realToken = speakeasy.totp({ secret: stored.rows[0].s, encoding: "base32" });

      const res = await request(app).post("/api/2fa/disable")
        .set("Authorization", `Bearer ${twofaUserToken}`)
        .send({ token: realToken });
      expect(res.status).toBe(200);

      const after = await pool.query<{ s: string | null; e: boolean | null }>(
        `SELECT two_factor_secret AS s, two_factor_enabled AS e FROM users WHERE id = $1`,
        [twofaUserId],
      );
      expect(after.rows[0].s).toBeNull();
      expect(after.rows[0].e).toBe(false);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// T0-C: WhatsApp outbound — GET /whatsapp/messages + dispatch leg of approve.
// Item 2.6 Phase B Step T0-C. Webhook (POST /webhooks/whatsapp) already
// covered by L1-L8 in the inbound suite — no duplication here.
//
// Twilio dispatch: vi.mock("twilio") at file scope replaces the factory; per
// test we set twilioCreateMock.mockResolvedValueOnce / mockRejectedValueOnce.
// Real Twilio creds are temporarily set in beforeAll and restored in afterAll
// so D2/D3 reach the dispatch leg (route returns 503 before twilio import if
// creds absent).
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "T0-C: whatsapp outbound (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;
    let outboundTemplateName: string;
    let outboundTemplateId: string;
    let outboundWorkerId: string;
    let outboundClientId: string;
    let outT1Token: string;
    let outT3Token: string;
    let savedSid: string | undefined;
    let savedToken: string | undefined;
    let savedFrom: string | undefined;
    const outT1UserId = "00000000-0000-0000-0000-0000000000e1";

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");

      // Active template WITH content_sid — required by approve-dispatch path
      // (route line 256 returns 409 if content_sid absent).
      outboundTemplateName = `outbound_test_${Date.now()}`;
      const tIns = await pool.query<{ id: string }>(
        `INSERT INTO whatsapp_templates (tenant_id, name, language, body_preview, variables, active, content_sid)
         VALUES ('production', $1, 'pl', 'Outbound {{workerName}}.', '["workerName"]'::jsonb, TRUE, 'HX_test_content_sid_${Date.now()}')
         RETURNING id`,
        [outboundTemplateName],
      );
      outboundTemplateId = tIns.rows[0].id;

      const wIns = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id) VALUES ('Outbound Worker', '+48 503 444 555', 'production') RETURNING id`,
      );
      outboundWorkerId = wIns.rows[0].id;

      const cIns = await pool.query<{ id: string }>(
        `INSERT INTO clients (name, phone, tenant_id) VALUES ('Outbound Client', '+48 503 444 666', 'production') RETURNING id`,
      );
      outboundClientId = cIns.rows[0].id;

      const jwt = await import("jsonwebtoken");
      outT1Token = jwt.default.sign(
        { id: outT1UserId, email: "outbound-t1@test.local", name: "Outbound T1",
          role: "executive", tier: 1, tenantId: "production", site: null },
        process.env.JWT_SECRET!, { expiresIn: "5m" },
      );
      outT3Token = jwt.default.sign(
        { id: "00000000-0000-0000-0000-0000000000e3", email: "outbound-t3@test.local", name: "Outbound T3",
          role: "operations", tier: 3, tenantId: "production", site: null },
        process.env.JWT_SECRET!, { expiresIn: "5m" },
      );

      // Save Twilio env state and set fakes so D2/D3 reach dispatch leg.
      // D1 explicitly strips them within its own try/finally.
      savedSid = process.env.TWILIO_ACCOUNT_SID;
      savedToken = process.env.TWILIO_AUTH_TOKEN;
      savedFrom = process.env.TWILIO_WHATSAPP_FROM;
      process.env.TWILIO_ACCOUNT_SID = "AC_test_fake_account_sid";
      process.env.TWILIO_AUTH_TOKEN = "fake_test_auth_token";
      process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
    });

    afterAll(async () => {
      try {
        await pool.query(`DELETE FROM notifications WHERE worker_id = $1`, [outboundWorkerId]);
        await pool.query(`DELETE FROM client_activities WHERE client_id = $1`, [outboundClientId]);
        await pool.query(`DELETE FROM whatsapp_messages WHERE worker_id = $1 OR client_id = $2`,
          [outboundWorkerId, outboundClientId]);
        await pool.query(`DELETE FROM workers WHERE id = $1`, [outboundWorkerId]);
        await pool.query(`DELETE FROM clients WHERE id = $1`, [outboundClientId]);
        await pool.query(`DELETE FROM whatsapp_templates WHERE id = $1`, [outboundTemplateId]);

        if (savedSid === undefined) delete process.env.TWILIO_ACCOUNT_SID;
        else process.env.TWILIO_ACCOUNT_SID = savedSid;
        if (savedToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
        else process.env.TWILIO_AUTH_TOKEN = savedToken;
        if (savedFrom === undefined) delete process.env.TWILIO_WHATSAPP_FROM;
        else process.env.TWILIO_WHATSAPP_FROM = savedFrom;
      } finally {
        await pool.end();
      }
    });

    // Helper: create a DRAFT row directly via DB (bypass POST /drafts) so
    // dispatch-leg tests have a deterministic starting state.
    async function makeDraftRow(): Promise<string> {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO whatsapp_messages (
            tenant_id, direction, status, worker_id, phone, body, template_id, template_variables, trigger_event, is_test_label
         ) VALUES (
            'production', 'outbound', 'DRAFT', $1, '+48503444555', 'Outbound Subject.', $2, '{"workerName":"Subject"}'::jsonb, 'manual', FALSE
         ) RETURNING id`,
        [outboundWorkerId, outboundTemplateId],
      );
      return rows[0].id;
    }

    // ── GET /whatsapp/messages (whatsapp.ts:406) ──────────────────────────
    it("G1 GET /whatsapp/messages 401 no token", async () => {
      const res = await request(app).get("/api/whatsapp/messages");
      expect(res.status).toBe(401);
    });

    it("G2 GET /whatsapp/messages 403 T3 token (T1/T2 only)", async () => {
      const res = await request(app).get("/api/whatsapp/messages")
        .set("Authorization", `Bearer ${outT3Token}`);
      expect(res.status).toBe(403);
    });

    it("G3 GET /whatsapp/messages 200 T1; response shape { messages, pagination, filter }", async () => {
      const res = await request(app).get("/api/whatsapp/messages")
        .set("Authorization", `Bearer ${outT1Token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.pagination).toMatchObject({ limit: expect.any(Number), offset: 0 });
      expect(res.body.filter).toBeDefined();
    });

    it("G4 GET /whatsapp/messages?direction=inbound filter applies", async () => {
      const res = await request(app).get("/api/whatsapp/messages?direction=inbound")
        .set("Authorization", `Bearer ${outT1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.filter.direction).toBe("inbound");
      for (const m of res.body.messages) expect(m.direction).toBe("inbound");
    });

    it("G5 GET /whatsapp/messages?status=DRAFT filter applies", async () => {
      // Seed a DRAFT row so the result is non-empty for verification.
      const draftId = await makeDraftRow();

      const res = await request(app).get("/api/whatsapp/messages?status=DRAFT")
        .set("Authorization", `Bearer ${outT1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.filter.status).toEqual(["DRAFT"]);
      const ids = res.body.messages.map((m: { id: string }) => m.id);
      expect(ids).toContain(draftId);
      for (const m of res.body.messages) expect(m.status).toBe("DRAFT");
    });

    it("G6 GET /whatsapp/messages?direction=invalid → 400", async () => {
      const res = await request(app).get("/api/whatsapp/messages?direction=sideways")
        .set("Authorization", `Bearer ${outT1Token}`);
      expect(res.status).toBe(400);
    });

    // ── PATCH /whatsapp/drafts/:id/approve dispatch leg (whatsapp.ts:167) ──
    it("D1 sendImmediately + TWILIO_ACCOUNT_SID absent → 503", async () => {
      const draftId = await makeDraftRow();
      const savedSidLocal = process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_ACCOUNT_SID;
      try {
        const res = await request(app)
          .patch(`/api/whatsapp/drafts/${draftId}/approve`)
          .set("Authorization", `Bearer ${outT1Token}`)
          .send({ sendImmediately: true });
        expect(res.status).toBe(503);
        expect(typeof res.body.error).toBe("string");
        expect(res.body.error.toLowerCase()).toContain("twilio");
      } finally {
        if (savedSidLocal === undefined) delete process.env.TWILIO_ACCOUNT_SID;
        else process.env.TWILIO_ACCOUNT_SID = savedSidLocal;
      }
    });

    it("D2 sendImmediately happy path: Twilio mock returns sid → row → SENT + notifications row", async () => {
      const draftId = await makeDraftRow();
      const fakeSid = `SM_test_${Date.now()}`;
      twilioCreateMock.mockReset();
      twilioCreateMock.mockResolvedValueOnce({ sid: fakeSid });

      const res = await request(app)
        .patch(`/api/whatsapp/drafts/${draftId}/approve`)
        .set("Authorization", `Bearer ${outT1Token}`)
        .send({ sendImmediately: true });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("SENT");
      expect(res.body.twilioMessageSid).toBe(fakeSid);
      expect(res.body.sentAt).toBeTruthy();

      // Verify mock called with expected shape.
      expect(twilioCreateMock).toHaveBeenCalledTimes(1);
      const callArg = twilioCreateMock.mock.calls[0][0];
      expect(callArg.contentSid).toMatch(/^HX_test_content_sid_/);
      expect(callArg.to).toBe("whatsapp:+48503444555");
      expect(callArg.from).toBe("whatsapp:+14155238886");

      // Verify notifications row written.
      const notif = await pool.query<{ channel: string; actor: string }>(
        `SELECT channel, actor FROM notifications WHERE worker_id = $1 ORDER BY sent_at DESC LIMIT 1`,
        [outboundWorkerId],
      );
      expect(notif.rows.length).toBeGreaterThanOrEqual(1);
      expect(notif.rows[0].channel).toBe("whatsapp");
    });

    it("D3 sendImmediately + Twilio throws → 502; row → FAILED + failedReason set", async () => {
      const draftId = await makeDraftRow();
      twilioCreateMock.mockReset();
      twilioCreateMock.mockRejectedValueOnce(new Error("Twilio test failure: bad number"));

      const res = await request(app)
        .patch(`/api/whatsapp/drafts/${draftId}/approve`)
        .set("Authorization", `Bearer ${outT1Token}`)
        .send({ sendImmediately: true });
      expect(res.status).toBe(502);
      expect(typeof res.body.error).toBe("string");
      expect(res.body.error.toLowerCase()).toContain("twilio");

      // DB row should be FAILED with failedReason captured.
      const after = await pool.query<{ status: string; failed_reason: string | null }>(
        `SELECT status, failed_reason FROM whatsapp_messages WHERE id = $1`, [draftId],
      );
      expect(after.rows[0].status).toBe("FAILED");
      expect(after.rows[0].failed_reason).toContain("Twilio test failure");
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// T0-D: PIP readiness behavior — GET /api/pip-readiness.
// Item 2.6 Phase B Step T0-D. Existing schema-only coverage (a1_certificates
// integrity, lines 1310-1355) verifies the table exists; T0-D covers endpoint
// behavior end-to-end: auth gate, tenant scoping, score calculation, A1
// certificate query path.
//
// Test tenant: 'test' (clean of seeded workers). Each Q4-Q6 test does
// belt-and-suspenders DELETE at start to neutralize cross-test pollution.
// Score calculations derived from pip-readiness.service.ts WEIGHTS at the
// time of writing: blank worker scores 81 (LOW); expired work permit adds
// -10 deduction; expired A1 certificate adds -6.
//
// Deviations from production score code (Item 2.X surfaces #23, #24):
//   - workers.passport_expiry column doesn't exist; service reads undefined
//     for every worker → always counts as missing-Identity (pts=2)
//   - bhpExpiry := r.bhpStatus type-confuses TEXT for date; null bhpStatus
//     triggers missing-Safety path (pts=4)
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "T0-D: PIP readiness (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;
    let testTenantToken: string;
    const pipUserId = "00000000-0000-0000-0000-0000000000f1";

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");

      // Belt-and-suspenders: clean any leftover state in 'test' tenant before
      // suite runs (other suites should have cleaned up but PIP scoring is
      // sensitive to lingering workers).
      await pool.query(`DELETE FROM a1_certificates WHERE tenant_id = 'test'`);
      await pool.query(`DELETE FROM workers WHERE tenant_id = 'test'`);

      const jwt = await import("jsonwebtoken");
      testTenantToken = jwt.default.sign(
        { id: pipUserId, email: "pip-test@eej-test.local", name: "PIP Test User",
          role: "executive", tier: 1, tenantId: "test", site: null },
        process.env.JWT_SECRET!, { expiresIn: "5m" },
      );
    });

    afterAll(async () => {
      try {
        await pool.query(`DELETE FROM a1_certificates WHERE tenant_id = 'test'`);
        await pool.query(`DELETE FROM workers WHERE tenant_id = 'test'`);
        // Cross-tenant insert in Q3 — clean by name match.
        await pool.query(`DELETE FROM workers WHERE tenant_id = 'production' AND name = 'PIP Q3 Production Worker'`);
      } finally {
        await pool.end();
      }
    });

    // ── Q1 — auth gate ──────────────────────────────────────────────────────
    it("Q1 GET /pip-readiness 401 no token", async () => {
      const res = await request(app).get("/api/pip-readiness");
      expect(res.status).toBe(401);
    });

    // ── Q2 — empty tenant ───────────────────────────────────────────────────
    it("Q2 empty 'test' tenant returns score=100, totalWorkers=0", async () => {
      // Cleanup before-state for determinism.
      await pool.query(`DELETE FROM a1_certificates WHERE tenant_id = 'test'`);
      await pool.query(`DELETE FROM workers WHERE tenant_id = 'test'`);

      const res = await request(app).get("/api/pip-readiness")
        .set("Authorization", `Bearer ${testTenantToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalWorkers).toBe(0);
      expect(res.body.score).toBe(100);
      expect(res.body.riskLevel).toBe("LOW");
      expect(res.body.explanation).toContain("No workers");
    });

    // ── Q3 — tenant isolation: production worker invisible to test token ────
    it("Q3 'production' worker invisible to 'test' tenant token", async () => {
      await pool.query(`DELETE FROM a1_certificates WHERE tenant_id = 'test'`);
      await pool.query(`DELETE FROM workers WHERE tenant_id = 'test'`);
      // Insert a production-tenant worker that should NOT appear under the
      // 'test' tenant query path.
      await pool.query(
        `INSERT INTO workers (name, phone, tenant_id) VALUES ('PIP Q3 Production Worker', '+48 504 100 100', 'production')`,
      );
      try {
        const res = await request(app).get("/api/pip-readiness")
          .set("Authorization", `Bearer ${testTenantToken}`);
        expect(res.status).toBe(200);
        expect(res.body.totalWorkers).toBe(0);
        expect(res.body.score).toBe(100);
      } finally {
        await pool.query(
          `DELETE FROM workers WHERE tenant_id = 'production' AND name = 'PIP Q3 Production Worker'`,
        );
      }
    });

    // ── Q4 — blank worker scoring ──────────────────────────────────────────
    it("Q4 blank worker (all nulls) scores 81 LOW; counts.missing=6", async () => {
      await pool.query(`DELETE FROM a1_certificates WHERE tenant_id = 'test'`);
      await pool.query(`DELETE FROM workers WHERE tenant_id = 'test'`);
      await pool.query(
        `INSERT INTO workers (name, phone, tenant_id) VALUES ('PIP Q4 Blank Worker', '+48 504 200 200', 'test')`,
      );

      const res = await request(app).get("/api/pip-readiness")
        .set("Authorization", `Bearer ${testTenantToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalWorkers).toBe(1);
      // Deductions for a blank worker: 2 (trc) + 2 (passport — col undefined)
      // + 4 (bhp — bhpStatus null) + 2 (workPermit) + 5 (contract) + 4 (medical) = 19
      // Score = 100 - 19 = 81. riskLevel = LOW (>=80).
      expect(res.body.score).toBe(81);
      expect(res.body.riskLevel).toBe("LOW");
      expect(res.body.counts.missing).toBe(6);
      expect(res.body.counts.expired).toBe(0);
    });

    // ── Q5 — expired work permit triggers high deduction + MEDIUM risk ────
    it("Q5 expired work permit: -10 deduction; score=73 MEDIUM; topRisks[0] is Immigration expired", async () => {
      await pool.query(`DELETE FROM a1_certificates WHERE tenant_id = 'test'`);
      await pool.query(`DELETE FROM workers WHERE tenant_id = 'test'`);
      await pool.query(
        `INSERT INTO workers (name, phone, tenant_id, work_permit_expiry)
         VALUES ('PIP Q5 Expired Permit Worker', '+48 504 300 300', 'test', '2020-01-01')`,
      );

      const res = await request(app).get("/api/pip-readiness")
        .set("Authorization", `Bearer ${testTenantToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalWorkers).toBe(1);
      // Deductions: 2 (trc) + 2 (passport) + 4 (bhp) + 10 (permit expired) +
      // 5 (contract) + 4 (medical) = 27. Score = 100 - 27 = 73. MEDIUM.
      expect(res.body.score).toBe(73);
      expect(res.body.riskLevel).toBe("MEDIUM");
      expect(res.body.counts.expired).toBe(1);
      expect(res.body.counts.missing).toBe(5);
      // topRisks sorted: expired first (severityOrder.expired = 0).
      expect(res.body.topRisks[0].severity).toBe("expired");
      expect(res.body.topRisks[0].category).toBe("Immigration");
      expect(res.body.topRisks[0].pointsDeducted).toBe(10);
    });

    // ── Q6 — expired A1 certificate adds -6 + Posted Workers risk ──────────
    it("Q6 expired A1 certificate: -6 from blank-worker baseline → score=75 MEDIUM", async () => {
      await pool.query(`DELETE FROM a1_certificates WHERE tenant_id = 'test'`);
      await pool.query(`DELETE FROM workers WHERE tenant_id = 'test'`);
      const wIns = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id) VALUES ('PIP Q6 A1 Worker', '+48 504 400 400', 'test') RETURNING id`,
      );
      const a1WorkerId = wIns.rows[0].id;
      await pool.query(
        `INSERT INTO a1_certificates (worker_id, worker_name, certificate_number, host_country, status, tenant_id, valid_until)
         VALUES ($1, 'PIP Q6 A1 Worker', 'A1-TEST-${Date.now()}', 'DE', 'expired', 'test', '2020-01-01')`,
        [a1WorkerId],
      );

      const res = await request(app).get("/api/pip-readiness")
        .set("Authorization", `Bearer ${testTenantToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalWorkers).toBe(1);
      // Deductions: 19 (blank-worker) + 6 (expiredA1) = 25. Score = 100-25 = 75.
      // counts.expired = 1 (from A1); counts.missing = 6 (worker fields).
      expect(res.body.score).toBe(75);
      expect(res.body.riskLevel).toBe("MEDIUM");
      expect(res.body.counts.expired).toBe(1);
      expect(res.body.counts.missing).toBe(6);

      // Verify Posted Workers risk appears in topRisks.
      const postedWorkerRisk = res.body.topRisks.find((r: { category: string }) => r.category === "Posted Workers");
      expect(postedWorkerRisk).toBeDefined();
      expect(postedWorkerRisk.severity).toBe("expired");
      expect(postedWorkerRisk.pointsDeducted).toBe(6);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// T23 — Team-provisioning Phase B (TDD red→green).
// Item: per-user permission flags on system_users — can_view_financials gates
// business-level financials (invoices/revenue/admin-stats); nationality_scope
// filters worker-listing queries. Plus new /eej/auth/change-password +
// /eej/auth/me endpoints.
//
// Tests written BEFORE implementation per Manish AC-8.X directive
// (red→green pattern). On first run before implementation, expect failures
// on T1-T4. After implementation, all pass.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "T23: team-provisioning permission flags + auth endpoints (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;
    let lizaUserId: string;
    let lizaUserEmail: string;
    let yanaUserId: string;
    let yanaUserEmail: string;
    let changePasswordUserId: string;
    let changePasswordUserEmail: string;
    let changePasswordInitial: string;
    let meUserId: string;
    let meUserEmail: string;
    let ukrainianWorkerId: string;
    let polishWorkerId: string;
    let lizaToken: string;
    let yanaToken: string;
    let meToken: string;

    async function scryptHash(password: string): Promise<string> {
      const { randomBytes, scrypt } = await import("crypto");
      const salt = randomBytes(16).toString("hex");
      return new Promise((resolve, reject) => {
        scrypt(password, salt, 64, (err, key) => {
          if (err) reject(err);
          else resolve(`${salt}:${key.toString("hex")}`);
        });
      });
    }

    let xffCounter2 = 0;
    const uniqueIp2 = () => {
      xffCounter2 += 1;
      return `10.99.${Math.floor(xffCounter2 / 254)}.${(xffCounter2 % 254) + 1}`;
    };

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");

      // Liza fixture: T1 with can_view_financials=false (business-financials denied)
      lizaUserEmail = `liza-t23-${Date.now()}@eej-test.local`;
      const lizaHash = await scryptHash("liza-pwd-12345678");
      const lizaIns = await pool.query<{ id: string }>(
        `INSERT INTO system_users (name, email, password_hash, role, designation, short_name, can_view_financials, nationality_scope)
         VALUES ('Liza Test', $1, $2, 'T1', 'Legal Test', 'Test', FALSE, NULL) RETURNING id`,
        [lizaUserEmail, lizaHash],
      );
      lizaUserId = lizaIns.rows[0].id;

      // Yana fixture: T3 with nationality_scope='Ukrainian'
      yanaUserEmail = `yana-t23-${Date.now()}@eej-test.local`;
      const yanaHash = await scryptHash("yana-pwd-12345678");
      const yanaIns = await pool.query<{ id: string }>(
        `INSERT INTO system_users (name, email, password_hash, role, designation, short_name, can_view_financials, nationality_scope)
         VALUES ('Yana Test', $1, $2, 'T3', 'UA Liaison Test', 'Test', FALSE, 'Ukrainian') RETURNING id`,
        [yanaUserEmail, yanaHash],
      );
      yanaUserId = yanaIns.rows[0].id;

      // change-password user fixture
      changePasswordUserEmail = `chgpw-t23-${Date.now()}@eej-test.local`;
      changePasswordInitial = "initial-pwd-12345678";
      const chgHash = await scryptHash(changePasswordInitial);
      const chgIns = await pool.query<{ id: string }>(
        `INSERT INTO system_users (name, email, password_hash, role, designation, short_name)
         VALUES ('ChgPw Test', $1, $2, 'T3', 'Test', 'Test') RETURNING id`,
        [changePasswordUserEmail, chgHash],
      );
      changePasswordUserId = chgIns.rows[0].id;

      // /eej/auth/me user fixture
      meUserEmail = `me-t23-${Date.now()}@eej-test.local`;
      const meHash = await scryptHash("me-pwd-12345678");
      const meIns = await pool.query<{ id: string }>(
        `INSERT INTO system_users (name, email, password_hash, role, designation, short_name, can_view_financials, nationality_scope)
         VALUES ('Me Test', $1, $2, 'T2', 'Test', 'Test', TRUE, 'Ukrainian') RETURNING id`,
        [meUserEmail, meHash],
      );
      meUserId = meIns.rows[0].id;

      // Worker fixtures for nationality_scope test
      const uaIns = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id, nationality)
         VALUES ('T23 UA Worker', '+48 555 990 001', 'test', 'Ukrainian') RETURNING id`,
      );
      ukrainianWorkerId = uaIns.rows[0].id;

      const plIns = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id, nationality)
         VALUES ('T23 PL Worker', '+48 555 990 002', 'test', 'Polish') RETURNING id`,
      );
      polishWorkerId = plIns.rows[0].id;

      const jwt = await import("jsonwebtoken");
      // JWT payload mirrors /eej/auth/login shape PLUS new permission flags
      // (post-implementation, the login endpoint bakes these into the JWT).
      lizaToken = jwt.default.sign(
        { sub: lizaUserId, id: lizaUserId, email: lizaUserEmail, name: "Liza Test",
          role: "executive", tier: 1, tenantId: "test", site: null,
          canViewFinancials: false, nationalityScope: null },
        process.env.JWT_SECRET!, { expiresIn: "5m" },
      );
      yanaToken = jwt.default.sign(
        { sub: yanaUserId, id: yanaUserId, email: yanaUserEmail, name: "Yana Test",
          role: "operations", tier: 3, tenantId: "test", site: null,
          canViewFinancials: false, nationalityScope: "Ukrainian" },
        process.env.JWT_SECRET!, { expiresIn: "5m" },
      );
      meToken = jwt.default.sign(
        { sub: meUserId, id: meUserId, email: meUserEmail, name: "Me Test",
          role: "legal", tier: 2, tenantId: "test", site: null,
          canViewFinancials: true, nationalityScope: "Ukrainian" },
        process.env.JWT_SECRET!, { expiresIn: "5m" },
      );
    });

    afterAll(async () => {
      try {
        await pool.query(
          `DELETE FROM system_users WHERE id = ANY($1::uuid[])`,
          [[lizaUserId, yanaUserId, changePasswordUserId, meUserId]],
        );
        await pool.query(
          `DELETE FROM workers WHERE id = ANY($1::uuid[])`,
          [[ukrainianWorkerId, polishWorkerId]],
        );
      } finally {
        await pool.end();
      }
    });

    // ── Test #1: Liza (T1 + can_view_financials=false) cannot access invoices ──
    it("T23.1 Liza T1 with can_view_financials=false → GET /api/invoices returns 403", async () => {
      const res = await request(app).get("/api/invoices")
        .set("Authorization", `Bearer ${lizaToken}`);
      expect(res.status).toBe(403);
    });

    it("T23.1b Liza T1 with can_view_financials=false → GET /api/revenue/summary returns 403", async () => {
      const res = await request(app).get("/api/revenue/summary")
        .set("Authorization", `Bearer ${lizaToken}`);
      expect(res.status).toBe(403);
    });

    // ── Test #2: Yana (T3 + nationality_scope='Ukrainian') sees only UA workers ──
    it("T23.2 Yana T3 with nationality_scope='Ukrainian' → GET /api/workers filters by nationality", async () => {
      const res = await request(app).get("/api/workers")
        .set("Authorization", `Bearer ${yanaToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.workers)).toBe(true);
      const returnedIds: string[] = res.body.workers.map((w: { id: string }) => w.id);
      // UA worker MUST be in result; PL worker MUST NOT be
      // (other tenant workers excluded by existing tenant filter).
      expect(returnedIds).toContain(ukrainianWorkerId);
      expect(returnedIds).not.toContain(polishWorkerId);
      // Every returned row must have nationality='Ukrainian'.
      for (const w of res.body.workers as Array<{ nationality?: string | null }>) {
        expect(w.nationality).toBe("Ukrainian");
      }
    });

    // ── Test #3: /eej/auth/change-password happy path ──
    it("T23.3 POST /eej/auth/change-password rotates password; new password works on login", async () => {
      const jwt = await import("jsonwebtoken");
      const chgToken = jwt.default.sign(
        { sub: changePasswordUserId, id: changePasswordUserId, email: changePasswordUserEmail,
          name: "ChgPw Test", role: "operations", tier: 3, tenantId: "test", site: null,
          canViewFinancials: false, nationalityScope: null },
        process.env.JWT_SECRET!, { expiresIn: "5m" },
      );
      const newPassword = "rotated-pwd-87654321";
      const changeRes = await request(app)
        .post("/api/eej/auth/change-password")
        .set("Authorization", `Bearer ${chgToken}`)
        .send({ currentPassword: changePasswordInitial, newPassword });
      expect(changeRes.status).toBe(200);

      // Verify new password works on /eej/auth/login (use unique XFF to avoid loginLimiter).
      const loginRes = await request(app).post("/api/eej/auth/login")
        .set("X-Forwarded-For", uniqueIp2())
        .send({ email: changePasswordUserEmail, password: newPassword });
      expect(loginRes.status).toBe(200);

      // Old password rejected.
      const oldRes = await request(app).post("/api/eej/auth/login")
        .set("X-Forwarded-For", uniqueIp2())
        .send({ email: changePasswordUserEmail, password: changePasswordInitial });
      expect(oldRes.status).toBe(401);
    });

    it("T23.3b POST /eej/auth/change-password 401 wrong current password", async () => {
      const jwt = await import("jsonwebtoken");
      const tok = jwt.default.sign(
        { sub: meUserId, id: meUserId, email: meUserEmail, name: "Me Test",
          role: "legal", tier: 2, tenantId: "test", site: null,
          canViewFinancials: true, nationalityScope: "Ukrainian" },
        process.env.JWT_SECRET!, { expiresIn: "5m" },
      );
      const res = await request(app).post("/api/eej/auth/change-password")
        .set("Authorization", `Bearer ${tok}`)
        .send({ currentPassword: "wrong-current", newPassword: "newer-pwd-87654321" });
      expect(res.status).toBe(401);
    });

    it("T23.3c POST /eej/auth/change-password 400 short new password", async () => {
      const res = await request(app).post("/api/eej/auth/change-password")
        .set("Authorization", `Bearer ${meToken}`)
        .send({ currentPassword: "me-pwd-12345678", newPassword: "short" });
      expect(res.status).toBe(400);
    });

    // ── Test #4: /eej/auth/me returns can_view_financials + nationality_scope ──
    it("T23.4 GET /eej/auth/me returns canViewFinancials + nationalityScope fields", async () => {
      const res = await request(app).get("/api/eej/auth/me")
        .set("Authorization", `Bearer ${meToken}`);
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        email: meUserEmail,
        canViewFinancials: true,
        nationalityScope: "Ukrainian",
      });
    });

    it("T23.4b GET /eej/auth/me 401 no token", async () => {
      const res = await request(app).get("/api/eej/auth/me");
      expect(res.status).toBe(401);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Worker Cockpit — GET /workers/:id/cockpit aggregator endpoint.
// One call returns worker + adjacent state (TRC, work permit, documents,
// notes, payroll, jobs, audit, computed alerts). Tenant-scoped, PII masked.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "Worker Cockpit (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;
    let workerId: string;
    let otherTenantWorkerId: string;
    let trcCaseId: string;
    let userToken: string;

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");

      // Ensure the 'test' tenant exists (T23 tests reuse it; we're idempotent).
      await pool.query(
        `INSERT INTO tenants (slug, name) VALUES ('test', 'Test Tenant')
         ON CONFLICT (slug) DO NOTHING`,
      );
      await pool.query(
        `INSERT INTO tenants (slug, name) VALUES ('other-tenant', 'Other Tenant')
         ON CONFLICT (slug) DO NOTHING`,
      );

      // Worker with an imminent TRC expiry (10 days out) → should produce a red alert.
      const tenDaysOut = new Date(Date.now() + 10 * 86_400_000).toISOString().split("T")[0];
      const wIns = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id, nationality, job_role, assigned_site, trc_expiry)
         VALUES ('Cockpit Test Worker', '+48 555 990 100', 'test', 'Ukrainian',
                 'Welder', 'Wroclaw-Test', $1)
         RETURNING id`,
        [tenDaysOut],
      );
      workerId = wIns.rows[0].id;

      // Worker in a different tenant — cockpit must NOT return this one.
      const otherIns = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id, nationality)
         VALUES ('Other Tenant Worker', '+48 555 990 101', 'other-tenant', 'Polish')
         RETURNING id`,
      );
      otherTenantWorkerId = otherIns.rows[0].id;

      // TRC case linked to the worker — cockpit must surface it.
      const trcIns = await pool.query<{ id: string }>(
        `INSERT INTO trc_cases (worker_id, worker_name, nationality, permit_type, status, voivodeship)
         VALUES ($1, 'Cockpit Test Worker', 'Ukrainian', 'TRC', 'under_review', 'dolnoslaskie')
         RETURNING id`,
        [workerId],
      );
      trcCaseId = trcIns.rows[0].id;

      // One missing required TRC doc → cockpit alerts should mention it.
      await pool.query(
        `INSERT INTO trc_documents (case_id, document_type, document_name, is_required, is_uploaded)
         VALUES ($1, 'identity', 'Passport scan', true, false)`,
        [trcCaseId],
      );

      // A worker note → cockpit notes section should include it.
      await pool.query(
        `INSERT INTO worker_notes (worker_id, content, updated_by, updated_at)
         VALUES ($1, 'Initial intake by Karan', 'karan.c@edu-jobs.eu', NOW())`,
        [workerId],
      );

      const jwt = await import("jsonwebtoken");
      userToken = jwt.default.sign(
        {
          sub: "00000000-0000-0000-0000-00000000c0c0",
          id: "00000000-0000-0000-0000-00000000c0c0",
          email: "cockpit-test@eej-test.local",
          name: "Cockpit Test User",
          role: "legal",
          tier: 1,
          tenantId: "test",
          site: null,
          canViewFinancials: false,
          nationalityScope: null,
        },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
    });

    afterAll(async () => {
      try {
        await pool.query(`DELETE FROM trc_documents WHERE case_id = $1`, [trcCaseId]);
        await pool.query(`DELETE FROM trc_cases WHERE id = $1`, [trcCaseId]);
        await pool.query(`DELETE FROM worker_notes WHERE worker_id = $1`, [workerId]);
        await pool.query(`DELETE FROM workers WHERE id = ANY($1::uuid[])`, [
          [workerId, otherTenantWorkerId],
        ]);
      } finally {
        await pool.end();
      }
    });

    it("WC.1 returns 200 with all top-level keys for a real worker", async () => {
      const res = await request(app)
        .get(`/api/workers/${workerId}/cockpit`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("worker");
      expect(res.body).toHaveProperty("trcCase");
      expect(res.body).toHaveProperty("workPermit");
      expect(res.body).toHaveProperty("documents");
      expect(res.body).toHaveProperty("notes");
      expect(res.body.notes).toHaveProperty("worker");
      expect(res.body.notes).toHaveProperty("trc");
      expect(res.body).toHaveProperty("payroll");
      expect(res.body).toHaveProperty("jobApplications");
      expect(res.body).toHaveProperty("auditHistory");
      expect(res.body).toHaveProperty("alerts");
      expect(res.body).toHaveProperty("meta");
      expect(res.body.meta).toHaveProperty("generatedAt");
      expect(res.body.meta).toHaveProperty("viewerRole");
    });

    it("WC.2 surfaces the TRC case linked to the worker", async () => {
      const res = await request(app)
        .get(`/api/workers/${workerId}/cockpit`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.trcCase).not.toBeNull();
      expect(res.body.trcCase.status).toBe("under_review");
      expect(res.body.trcCase.permit_type).toBe("TRC");
      // Doc completion counts computed via sub-query.
      expect(Number(res.body.trcCase.total_documents)).toBe(1);
      expect(Number(res.body.trcCase.missing_documents)).toBe(1);
    });

    it("WC.3 includes worker notes and surfaces them in notes.worker", async () => {
      const res = await request(app)
        .get(`/api/workers/${workerId}/cockpit`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.notes.worker)).toBe(true);
      expect(res.body.notes.worker.length).toBeGreaterThan(0);
      expect(res.body.notes.worker[0].content).toContain("Initial intake by Karan");
    });

    it("WC.4 computes a red alert for TRC expiring inside 30 days + amber for missing TRC docs", async () => {
      const res = await request(app)
        .get(`/api/workers/${workerId}/cockpit`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      const alerts = res.body.alerts as Array<{ level: string; field: string; message: string }>;
      const trcExpiryAlert = alerts.find((a) => a.field === "trcExpiry");
      expect(trcExpiryAlert).toBeDefined();
      expect(trcExpiryAlert!.level).toBe("red");
      const missingDocsAlert = alerts.find((a) => a.field === "trcDocuments");
      expect(missingDocsAlert).toBeDefined();
      expect(missingDocsAlert!.level).toBe("amber");
    });

    it("WC.5 returns 404 for a worker in a different tenant (tenant isolation)", async () => {
      // userToken is scoped to tenantId='test'. The other worker is in tenantId='other-tenant'.
      const res = await request(app)
        .get(`/api/workers/${otherTenantWorkerId}/cockpit`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(404);
    });

    it("WC.6 returns 404 for non-existent worker UUID", async () => {
      const res = await request(app)
        .get(`/api/workers/00000000-0000-0000-0000-000000000000/cockpit`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(404);
    });

    it("WC.7 returns 401 without token", async () => {
      const res = await request(app).get(`/api/workers/${workerId}/cockpit`);
      expect(res.status).toBe(401);
    });

    it("WC.8 meta.viewerRole reflects the JWT role baked into the token", async () => {
      const res = await request(app)
        .get(`/api/workers/${workerId}/cockpit`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.meta.viewerRole).toBe("legal");
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// roleToMobile — Liza routing fix. Designation containing "Legal" at T1
// should route to appRole "legal" so Liza lands on LegalHome instead of
// ExecutiveHome. Manish + Anna (T1 without "Legal" in designation) stay
// on executive.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "roleToMobile: T1 designation-aware routing",
  () => {
    let pool: Pool;
    let lizaEmail: string;
    let annaEmail: string;
    let lizaPwd = "liza-route-pwd-1234";
    let annaPwd = "anna-route-pwd-1234";

    async function scryptHash(password: string): Promise<string> {
      const { randomBytes, scrypt } = await import("crypto");
      const salt = randomBytes(16).toString("hex");
      return new Promise((resolve, reject) => {
        scrypt(password, salt, 64, (err, key) => {
          if (err) reject(err);
          else resolve(`${salt}:${key.toString("hex")}`);
        });
      });
    }

    let xff = 0;
    const uniqueIp = () => {
      xff += 1;
      return `10.111.${Math.floor(xff / 254)}.${(xff % 254) + 1}`;
    };

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      lizaEmail = `liza-route-${Date.now()}@eej-test.local`;
      annaEmail = `anna-route-${Date.now()}@eej-test.local`;
      await pool.query(
        `INSERT INTO system_users (name, email, password_hash, role, designation, short_name)
         VALUES ('Liza Route', $1, $2, 'T1', 'Head of Legal & Client Relations', 'Legal')`,
        [lizaEmail, await scryptHash(lizaPwd)],
      );
      await pool.query(
        `INSERT INTO system_users (name, email, password_hash, role, designation, short_name)
         VALUES ('Anna Route', $1, $2, 'T1', 'Executive Board & Finance', 'Executive')`,
        [annaEmail, await scryptHash(annaPwd)],
      );
    });

    afterAll(async () => {
      try {
        await pool.query(`DELETE FROM system_users WHERE email IN ($1, $2)`, [lizaEmail, annaEmail]);
      } finally {
        await pool.end();
      }
    });

    it("RM.1 T1 + 'Legal' in designation routes to appRole=legal", async () => {
      const res = await request(app)
        .post("/api/eej/auth/login")
        .set("X-Forwarded-For", uniqueIp())
        .send({ email: lizaEmail, password: lizaPwd });
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("legal");
      expect(res.body.user.tier).toBe(1);
    });

    it("RM.2 T1 without 'Legal' in designation stays on appRole=executive", async () => {
      const res = await request(app)
        .post("/api/eej/auth/login")
        .set("X-Forwarded-For", uniqueIp())
        .send({ email: annaEmail, password: annaPwd });
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("executive");
      expect(res.body.user.tier).toBe(1);
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Document scanning loop — POST /workers/scan-document + .../apply
// AI extracts entities from an uploaded document, suggests worker matches,
// then optionally applies the entities to a chosen (or newly-created) worker
// and writes an ai_reasoning_log entry as the legal-evidence trail.
//
// analyzeImage is mocked at file scope so we don't burn Anthropic credits
// or depend on ANTHROPIC_API_KEY in CI. Each test sets its own mock response.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "Document scanning (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;
    let andriyId: string;     // existing worker name "Andriy Shevchenko" — should match strongly
    let kowalskiId: string;   // unrelated existing worker — should not match
    let userToken: string;

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");
      await pool.query(
        `INSERT INTO tenants (slug, name) VALUES ('test', 'Test Tenant')
         ON CONFLICT (slug) DO NOTHING`,
      );

      const andriy = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, nationality, tenant_id)
         VALUES ('Andriy Shevchenko', 'Ukrainian', 'test') RETURNING id`,
      );
      andriyId = andriy.rows[0].id;

      const kow = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, nationality, tenant_id)
         VALUES ('Mariusz Kowalski', 'Polish', 'test') RETURNING id`,
      );
      kowalskiId = kow.rows[0].id;

      const jwt = await import("jsonwebtoken");
      userToken = jwt.default.sign(
        {
          sub: "00000000-0000-0000-0000-00000000d0d0",
          id: "00000000-0000-0000-0000-00000000d0d0",
          email: "scan-test@eej-test.local",
          name: "Scan Test User",
          role: "legal",
          tier: 1,
          tenantId: "test",
          site: null,
          canViewFinancials: false,
          nationalityScope: null,
        },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
    });

    afterAll(async () => {
      try {
        await pool.query(
          `DELETE FROM ai_reasoning_log WHERE tenant_id = 'test' AND worker_id = ANY($1::uuid[])`,
          [[andriyId, kowalskiId]],
        );
        // Also purge orphan reasoning rows (decision_type=document_extraction has worker_id=NULL).
        await pool.query(
          `DELETE FROM ai_reasoning_log WHERE tenant_id = 'test' AND decision_type = 'document_extraction'`,
        );
        await pool.query(`DELETE FROM workers WHERE id = ANY($1::uuid[])`, [[andriyId, kowalskiId]]);
      } finally {
        await pool.end();
      }
    });

    beforeEach(() => {
      analyzeImageMock.mockReset();
    });

    it("DS.1 returns 400 when no file uploaded", async () => {
      const res = await request(app)
        .post("/api/workers/scan-document")
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no file/i);
    });

    it("DS.2 returns 401 without token", async () => {
      const res = await request(app)
        .post("/api/workers/scan-document")
        .attach("file", Buffer.from("fake-image-bytes"), "passport.jpg");
      expect(res.status).toBe(401);
    });

    it("DS.3 returns 422 when AI extraction yields null (e.g. missing API key)", async () => {
      analyzeImageMock.mockResolvedValueOnce(null);
      const res = await request(app)
        .post("/api/workers/scan-document")
        .set("Authorization", `Bearer ${userToken}`)
        .attach("file", Buffer.from("fake-image-bytes"), {
          filename: "passport.jpg",
          contentType: "image/jpeg",
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/extract/i);
    });

    it("DS.4 happy path: extract entities, score matches, return top match strongly", async () => {
      analyzeImageMock.mockResolvedValueOnce(JSON.stringify({
        docType: "passport",
        personName: "Andriy Shevchenko",
        documentNumber: "AB1234567",
        dateOfBirth: "1990-06-15",
        nationality: "Ukrainian",
        expiryDate: "2030-12-31",
        issueDate: "2020-12-31",
        issuingAuthority: "Ministry of Foreign Affairs of Ukraine",
        additionalFields: {},
        rawText: "PASSPORT UKRAINE...",
        confidence: 0.92,
      }));

      const res = await request(app)
        .post("/api/workers/scan-document")
        .set("Authorization", `Bearer ${userToken}`)
        .attach("file", Buffer.from("fake-image-bytes"), {
          filename: "passport.jpg",
          contentType: "image/jpeg",
        });

      expect(res.status).toBe(200);
      expect(res.body.entities.docType).toBe("passport");
      expect(res.body.entities.personName).toBe("Andriy Shevchenko");
      expect(res.body.entities.confidence).toBe(0.92);
      expect(res.body.matches.length).toBeGreaterThan(0);
      // Andriy should be the top match.
      expect(res.body.matches[0].id).toBe(andriyId);
      expect(res.body.matches[0].score).toBeGreaterThan(0.5);
      // Mariusz Kowalski (Polish, unrelated name) should not be in the matches.
      expect(res.body.matches.find((m: any) => m.id === kowalskiId)).toBeUndefined();
      // inputHash is a sha256 hex string.
      expect(res.body.inputHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("DS.5 reasoning log row written on extraction with decided_action=pending_review", async () => {
      analyzeImageMock.mockResolvedValueOnce(JSON.stringify({
        docType: "trc",
        personName: "Andriy Shevchenko",
        documentNumber: "KP-PL-0000-1",
        dateOfBirth: null,
        nationality: "Ukrainian",
        expiryDate: "2027-03-15",
        issueDate: null,
        issuingAuthority: "Wojewoda Dolnoslaski",
        additionalFields: {},
        rawText: null,
        confidence: 0.85,
      }));

      await request(app)
        .post("/api/workers/scan-document")
        .set("Authorization", `Bearer ${userToken}`)
        .attach("file", Buffer.from("trc-image-bytes"), {
          filename: "trc.jpg",
          contentType: "image/jpeg",
        });

      const reasoningRows = await pool.query(
        `SELECT decision_type, decided_action, reviewed_by, model
         FROM ai_reasoning_log
         WHERE tenant_id = 'test' AND decision_type = 'document_extraction'
         ORDER BY created_at DESC LIMIT 1`,
      );
      expect(reasoningRows.rows.length).toBeGreaterThan(0);
      const row = reasoningRows.rows[0];
      expect(row.decision_type).toBe("document_extraction");
      expect(row.decided_action).toBe("pending_review");
      expect(row.reviewed_by).toBe("scan-test@eej-test.local");
      expect(row.model).toBe("claude-sonnet-4-6");
    });

    it("DS.6 apply: updates an existing worker's TRC expiry from extracted entities", async () => {
      // Pre-condition: Andriy has no TRC expiry on file.
      await pool.query(`UPDATE workers SET trc_expiry = NULL WHERE id = $1`, [andriyId]);

      const entities = {
        docType: "trc",
        personName: "Andriy Shevchenko",
        documentNumber: "KP-PL-0000-1",
        dateOfBirth: null,
        nationality: "Ukrainian",
        expiryDate: "2027-03-15",
        issueDate: null,
        issuingAuthority: "Wojewoda Dolnoslaski",
        additionalFields: {},
        rawText: null,
        confidence: 0.85,
      };

      const res = await request(app)
        .post("/api/workers/scan-document/apply")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ entities, workerId: andriyId });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(false);
      expect(res.body.workerId).toBe(andriyId);
      expect(res.body.appliedFields).toContain("trcExpiry");

      // Verify the field actually updated.
      const updated = await pool.query<{ trc_expiry: string }>(
        `SELECT trc_expiry FROM workers WHERE id = $1`, [andriyId],
      );
      // pg returns Date objects for DATE columns; ISO-stringify both sides.
      const got = updated.rows[0].trc_expiry;
      const gotIso = (got as unknown) instanceof Date
        ? (got as unknown as Date).toISOString().slice(0, 10)
        : String(got).slice(0, 10);
      expect(gotIso).toBe("2027-03-15");
    });

    it("DS.7 apply with createNew=true creates a new worker in pipeline stage 'New'", async () => {
      const entities = {
        docType: "passport",
        personName: "Test Auto Created",
        documentNumber: "ZZ9999999",
        dateOfBirth: "1995-01-01",
        nationality: "Vietnamese",
        expiryDate: null,
        issueDate: null,
        issuingAuthority: null,
        additionalFields: {},
        rawText: null,
        confidence: 0.7,
      };

      const res = await request(app)
        .post("/api/workers/scan-document/apply")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ entities, createNew: true });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(true);
      expect(res.body.workerId).toBeTruthy();

      const newWorkerId = res.body.workerId;
      const row = await pool.query<{ name: string; nationality: string; pipeline_stage: string }>(
        `SELECT name, nationality, pipeline_stage FROM workers WHERE id = $1`, [newWorkerId],
      );
      expect(row.rows.length).toBe(1);
      expect(row.rows[0].name).toBe("Test Auto Created");
      expect(row.rows[0].nationality).toBe("Vietnamese");
      expect(row.rows[0].pipeline_stage).toBe("New");

      // Clean up the auto-created worker.
      await pool.query(`DELETE FROM ai_reasoning_log WHERE worker_id = $1`, [newWorkerId]);
      await pool.query(`DELETE FROM workers WHERE id = $1`, [newWorkerId]);
    });

    it("DS.8 apply respects allowOverwrite=false (conservative — no clobber)", async () => {
      // Pre-condition: Andriy has a TRC expiry already set.
      await pool.query(
        `UPDATE workers SET trc_expiry = '2025-01-01' WHERE id = $1`, [andriyId],
      );

      const entities = {
        docType: "trc",
        personName: "Andriy Shevchenko",
        documentNumber: "KP-PL-NEW",
        dateOfBirth: null,
        nationality: "Ukrainian",
        expiryDate: "2099-12-31",
        issueDate: null,
        issuingAuthority: null,
        additionalFields: {},
        rawText: null,
        confidence: 0.8,
      };

      const res = await request(app)
        .post("/api/workers/scan-document/apply")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ entities, workerId: andriyId, allowOverwrite: false });

      expect(res.status).toBe(200);
      expect(res.body.appliedFields).not.toContain("trcExpiry");

      const row = await pool.query<{ trc_expiry: string }>(
        `SELECT trc_expiry FROM workers WHERE id = $1`, [andriyId],
      );
      const got = row.rows[0].trc_expiry;
      const gotIso = (got as unknown) instanceof Date
        ? (got as unknown as Date).toISOString().slice(0, 10)
        : String(got).slice(0, 10);
      expect(gotIso).toBe("2025-01-01");
    });

    it("DS.9 apply respects allowOverwrite=true (overwrites existing value)", async () => {
      await pool.query(
        `UPDATE workers SET trc_expiry = '2025-01-01' WHERE id = $1`, [andriyId],
      );

      const entities = {
        docType: "trc",
        personName: "Andriy Shevchenko",
        documentNumber: "KP-PL-NEW",
        dateOfBirth: null,
        nationality: "Ukrainian",
        expiryDate: "2099-12-31",
        issueDate: null,
        issuingAuthority: null,
        additionalFields: {},
        rawText: null,
        confidence: 0.8,
      };

      const res = await request(app)
        .post("/api/workers/scan-document/apply")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ entities, workerId: andriyId, allowOverwrite: true });

      expect(res.status).toBe(200);
      expect(res.body.appliedFields).toContain("trcExpiry");

      const row = await pool.query<{ trc_expiry: string }>(
        `SELECT trc_expiry FROM workers WHERE id = $1`, [andriyId],
      );
      const got = row.rows[0].trc_expiry;
      const gotIso = (got as unknown) instanceof Date
        ? (got as unknown as Date).toISOString().slice(0, 10)
        : String(got).slice(0, 10);
      expect(gotIso).toBe("2099-12-31");
    });

    it("DS.10b cockpit returns aiReasoning array after a scan applies updates", async () => {
      // Apply something to leave a reasoning row.
      await request(app)
        .post("/api/workers/scan-document/apply")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          entities: {
            docType: "trc",
            personName: "Andriy Shevchenko",
            documentNumber: "KP-IT-1",
            dateOfBirth: null,
            nationality: "Ukrainian",
            expiryDate: "2030-01-01",
            issueDate: null,
            issuingAuthority: null,
            additionalFields: {},
            rawText: null,
            confidence: 0.9,
          },
          workerId: andriyId,
          allowOverwrite: true,
        });

      const cockpit = await request(app)
        .get(`/api/workers/${andriyId}/cockpit`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(cockpit.status).toBe(200);
      expect(Array.isArray(cockpit.body.aiReasoning)).toBe(true);
      expect(cockpit.body.aiReasoning.length).toBeGreaterThan(0);
      const r = cockpit.body.aiReasoning[0];
      expect(r).toHaveProperty("decision_type");
      expect(r).toHaveProperty("decided_action");
      expect(r).toHaveProperty("model");
    });

    it("DS.10 apply returns 404 for a worker in a different tenant", async () => {
      // Insert a worker in 'other-tenant' (created earlier in cockpit tests).
      await pool.query(
        `INSERT INTO tenants (slug, name) VALUES ('other-tenant', 'Other Tenant')
         ON CONFLICT (slug) DO NOTHING`,
      );
      const other = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, tenant_id) VALUES ('Stranger', 'other-tenant') RETURNING id`,
      );

      const res = await request(app)
        .post("/api/workers/scan-document/apply")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          entities: {
            docType: "trc",
            personName: "Stranger",
            documentNumber: null,
            dateOfBirth: null,
            nationality: null,
            expiryDate: "2030-01-01",
            issueDate: null,
            issuingAuthority: null,
            additionalFields: {},
            rawText: null,
            confidence: 0.5,
          },
          workerId: other.rows[0].id,
        });

      expect(res.status).toBe(404);
      await pool.query(`DELETE FROM workers WHERE id = $1`, [other.rows[0].id]);
    });

    it("DS.11 AI summary returns role-tuned narrative + structured actions", async () => {
      // AI now returns JSON with summary + actions array. The endpoint parses
      // it and exposes both. Action types come from a fixed allow-list; the
      // parser filters out invalid types.
      analyzeTextMock.mockResolvedValueOnce(
        JSON.stringify({
          summary:
            "Andriy's TRC expires in 8 days. Three required documents are still missing. Submit the renewal by 2026-05-20 to avoid lapse.",
          actions: [
            { label: "Scan new TRC card", actionType: "scan_document", priority: "high", reasoning: "TRC expires in 8 days." },
            // send_whatsapp action carries a templateHint matching one of the
            // seeded template names — cockpit will auto-select it in the picker.
            { label: "Send TRC reminder", actionType: "send_whatsapp", priority: "med", reasoning: "Worker not responsive.", templateHint: "trc_expiry_reminder_pl" },
            { label: "Open TRC case", actionType: "open_trc", priority: "low", reasoning: "Final filing review." },
            { label: "Should be filtered", actionType: "invalid_type", priority: "high", reasoning: "should not appear" },
          ],
        }),
      );

      const res = await request(app)
        .get(`/api/workers/${andriyId}/ai-summary`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toContain("Andriy");
      expect(res.body.viewerRole).toBe("legal");
      expect(res.body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(Array.isArray(res.body.actions)).toBe(true);
      // Three valid actions; invalid_type filtered out.
      expect(res.body.actions).toHaveLength(3);
      expect(res.body.actions[0].actionType).toBe("scan_document");
      expect(res.body.actions[0].priority).toBe("high");
      // Non-whatsapp actions never carry templateHint.
      expect(res.body.actions[0].templateHint).toBeNull();
      // The whatsapp action preserves the templateHint for cockpit auto-pick.
      const waAction = res.body.actions.find((a: any) => a.actionType === "send_whatsapp");
      expect(waAction.templateHint).toBe("trc_expiry_reminder_pl");
      // The endpoint also writes a reasoning_log row.
      const log = await pool.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM ai_reasoning_log
         WHERE worker_id = $1 AND decision_type = 'ai_summary'`,
        [andriyId],
      );
      expect(log.rows[0].cnt).toBeGreaterThan(0);
    });

    it("DS.11b AI summary tolerates plain-text response (no JSON parsing)", async () => {
      // Earlier Claude responses might be plain text; the endpoint should
      // still return the text as summary with an empty actions array.
      analyzeTextMock.mockResolvedValueOnce("Plain text summary, no JSON.");
      const res = await request(app)
        .get(`/api/workers/${andriyId}/ai-summary`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toBe("Plain text summary, no JSON.");
      expect(res.body.actions).toEqual([]);
    });

    it("DS.12 AI summary returns 503 when analyzeText returns null (key unset)", async () => {
      analyzeTextMock.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/workers/${andriyId}/ai-summary`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/ANTHROPIC_API_KEY/i);
    });

    it("DS.13 AI summary returns 404 for unknown worker", async () => {
      const res = await request(app)
        .get(`/api/workers/00000000-0000-0000-0000-000000000000/ai-summary`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(404);
    });

    it("DS.14 note append: inserts a new row each call (append-only feed)", async () => {
      const before = await pool.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM worker_notes WHERE worker_id = $1`,
        [andriyId],
      );

      const r1 = await request(app)
        .post(`/api/workers/${andriyId}/notes/append`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Called today, sending docs Friday." });
      expect(r1.status).toBe(201);
      expect(r1.body.note.content).toBe("Called today, sending docs Friday.");

      const r2 = await request(app)
        .post(`/api/workers/${andriyId}/notes/append`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Docs received, forwarding to lawyer." });
      expect(r2.status).toBe(201);

      const after = await pool.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM worker_notes WHERE worker_id = $1`,
        [andriyId],
      );
      expect(after.rows[0].cnt).toBe(before.rows[0].cnt + 2);

      // Cleanup added notes.
      await pool.query(
        `DELETE FROM worker_notes WHERE worker_id = $1 AND id IN ($2, $3)`,
        [andriyId, r1.body.note.id, r2.body.note.id],
      );
    });

    it("DS.15 note append: 400 when content empty or whitespace", async () => {
      const res = await request(app)
        .post(`/api/workers/${andriyId}/notes/append`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "   " });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/content/i);
    });

    it("DS.16 admin/ai-reasoning: requires admin token (legal viewer gets 403)", async () => {
      // userToken is for a legal-role user; requireAdmin should reject.
      const res = await request(app)
        .get("/api/admin/ai-reasoning")
        .set("Authorization", `Bearer ${userToken}`);
      expect([401, 403]).toContain(res.status);
    });

    it("DS.17a whatsapp/templates returns active templates only, scoped to tenant", async () => {
      // Seed a couple of test-tenant templates, one active one inactive.
      const tIns = await pool.query(
        `INSERT INTO whatsapp_templates (tenant_id, name, language, body_preview, variables, active)
         VALUES
           ('test', 'test_active_template', 'en', 'Hello {{name}}', '["name"]'::jsonb, TRUE),
           ('test', 'test_inactive_template', 'en', 'Inactive {{name}}', '["name"]'::jsonb, FALSE)
         RETURNING id`,
      );
      try {
        const res = await request(app)
          .get("/api/whatsapp/templates")
          .set("Authorization", `Bearer ${userToken}`);
        expect(res.status).toBe(200);
        const names = (res.body.templates ?? []).map((t: any) => t.name);
        expect(names).toContain("test_active_template");
        expect(names).not.toContain("test_inactive_template");
        // Verify shape on the active one
        const active = res.body.templates.find(
          (t: any) => t.name === "test_active_template",
        );
        expect(active.bodyPreview).toBe("Hello {{name}}");
        expect(active.variables).toEqual(["name"]);
        expect(active.language).toBe("en");
      } finally {
        await pool.query(`DELETE FROM whatsapp_templates WHERE id = ANY($1::uuid[])`, [
          tIns.rows.map((r: any) => r.id),
        ]);
      }
    });

    it("DS.16a upload: 401 without token", async () => {
      const res = await request(app)
        .post(`/api/workers/${andriyId}/upload`)
        .attach("file", Buffer.from("fake"), { filename: "passport.jpg", contentType: "image/jpeg" });
      expect(res.status).toBe(401);
    });

    it("DS.16b upload: 404 for worker in a different tenant", async () => {
      // userToken is scoped to tenantId='test'. Create a worker in 'other-tenant'.
      const other = await pool.query<{ id: string }>(
        `INSERT INTO tenants (slug, name) VALUES ('other-tenant', 'Other Tenant') ON CONFLICT (slug) DO NOTHING;
         INSERT INTO workers (name, tenant_id) VALUES ('Cross-Tenant Worker', 'other-tenant') RETURNING id`,
      );
      const otherId = other.rows[0].id;
      try {
        const res = await request(app)
          .post(`/api/workers/${otherId}/upload`)
          .set("Authorization", `Bearer ${userToken}`)
          .field("docType", "passport")
          .attach("file", Buffer.from("fake"), { filename: "passport.jpg", contentType: "image/jpeg" });
        expect(res.status).toBe(404);
      } finally {
        await pool.query(`DELETE FROM workers WHERE id = $1`, [otherId]);
      }
    });

    it("DS.16c upload: 400 when no file attached", async () => {
      const res = await request(app)
        .post(`/api/workers/${andriyId}/upload`)
        .set("Authorization", `Bearer ${userToken}`)
        .field("docType", "passport");
      expect(res.status).toBe(400);
    });

    it("DS.16d upload happy path: creates file_attachments row + returns metadata", async () => {
      // Non-passport/contract/cv docType to skip the OCR mock requirement.
      const res = await request(app)
        .post(`/api/workers/${andriyId}/upload`)
        .set("Authorization", `Bearer ${userToken}`)
        .field("docType", "bhp")
        .attach("file", Buffer.from("fake-bhp-cert"), {
          filename: "bhp-cert.jpg",
          contentType: "image/jpeg",
        });
      expect(res.status).toBe(200);
      expect(res.body.attachment).toBeDefined();
      expect(res.body.attachment.workerId).toBe(andriyId);
      expect(res.body.attachment.fieldName).toBe("bhp");
      expect(res.body.attachment.filename).toBe("bhp-cert.jpg");
      expect(res.body.attachment.mimeType).toBe("image/jpeg");
      // Non-AI docType → no scan output.
      expect(res.body.scanned).toBeFalsy();

      // Verify row exists in DB.
      const row = await pool.query<{ filename: string; field_name: string }>(
        `SELECT filename, field_name FROM file_attachments WHERE id = $1`,
        [res.body.attachment.id],
      );
      expect(row.rows[0].filename).toBe("bhp-cert.jpg");
      expect(row.rows[0].field_name).toBe("bhp");

      await pool.query(`DELETE FROM file_attachments WHERE id = $1`, [res.body.attachment.id]);
    });

    it("DS.16e upload passport: OCR auto-updates worker fields when AI extracts data", async () => {
      // Reset Andriy's nationality so we can verify it changes.
      await pool.query(`UPDATE workers SET nationality = NULL WHERE id = $1`, [andriyId]);

      // analyzeImage is mocked at file scope; the upload endpoint calls it
      // for docType=passport. Return a structured extraction.
      analyzeImageMock.mockResolvedValueOnce(JSON.stringify({
        name: "Andriy Shevchenko",
        dateOfBirth: "1990-06-15",
        passportExpiry: "2032-01-01",
        passportNumber: "AB1234567",
        nationality: "Ukrainian",
      }));

      const res = await request(app)
        .post(`/api/workers/${andriyId}/upload`)
        .set("Authorization", `Bearer ${userToken}`)
        .field("docType", "passport")
        .attach("file", Buffer.from("fake-passport"), {
          filename: "passport.jpg",
          contentType: "image/jpeg",
        });
      expect(res.status).toBe(200);
      expect(res.body.attachment).toBeDefined();
      expect(res.body.scanned).toBeTruthy();
      expect(res.body.scanned.nationality).toBe("Ukrainian");

      // Verify the worker row was auto-updated by the OCR result.
      const w = await pool.query<{ nationality: string; work_permit_expiry: string }>(
        `SELECT nationality, work_permit_expiry FROM workers WHERE id = $1`,
        [andriyId],
      );
      expect(w.rows[0].nationality).toBe("Ukrainian");
      const expiry = w.rows[0].work_permit_expiry;
      const iso = (expiry as unknown) instanceof Date
        ? (expiry as unknown as Date).toISOString().slice(0, 10)
        : String(expiry).slice(0, 10);
      expect(iso).toBe("2032-01-01");

      await pool.query(`DELETE FROM file_attachments WHERE id = $1`, [res.body.attachment.id]);
    });

    it("DS.17 admin/ai-reasoning: returns combined entries with worker_name join", async () => {
      // Admin token for the test tenant
      const jwt = await import("jsonwebtoken");
      const adminToken = jwt.default.sign(
        {
          sub: "00000000-0000-0000-0000-00000000a0a0",
          id: "00000000-0000-0000-0000-00000000a0a0",
          email: "admin-ar@eej-test.local",
          name: "Admin AR",
          role: "admin",
          tier: 1,
          tenantId: "test",
          site: null,
          canViewFinancials: true,
          nationalityScope: null,
        },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );

      // Seed at least one reasoning row tied to Andriy so the join produces a name.
      await pool.query(
        `INSERT INTO ai_reasoning_log (decision_type, worker_id, input_summary, decided_action, model, tenant_id, confidence)
         VALUES ('field_update', $1, 'integration test row', 'applied', 'claude-sonnet-4-6', 'test', 0.88)`,
        [andriyId],
      );

      const res = await request(app)
        .get("/api/admin/ai-reasoning?decisionType=field_update")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.entries)).toBe(true);
      const ours = res.body.entries.find(
        (e: any) => e.input_summary === "integration test row",
      );
      expect(ours).toBeDefined();
      expect(ours.worker_name).toBe("Andriy Shevchenko");
      expect(ours.decided_action).toBe("applied");
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Daily-use worker mutations — the inline-edit paths the cockpit relies on.
// Cockpit's contact edit goes to PATCH /workers/:id (existing endpoint, no
// dedicated coverage). Note append + cockpit deep-link nav covered earlier;
// these tests close the remaining gaps for the day's surfaces.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "Cockpit edit flows (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;
    let workerId: string;
    let executiveToken: string;
    let candidateToken: string;

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");
      await pool.query(
        `INSERT INTO tenants (slug, name) VALUES ('test', 'Test Tenant') ON CONFLICT (slug) DO NOTHING`,
      );

      const ins = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, email, phone, tenant_id, nationality)
         VALUES ('Edit Test Worker', 'old.email@test.local', '+48 555 000 100', 'test', 'Polish') RETURNING id`,
      );
      workerId = ins.rows[0].id;

      const jwt = await import("jsonwebtoken");
      executiveToken = jwt.default.sign(
        {
          sub: "00000000-0000-0000-0000-00000000e1e1",
          id: "00000000-0000-0000-0000-00000000e1e1",
          email: "exec-edit@eej-test.local",
          name: "Exec Edit",
          role: "executive",
          tier: 1,
          tenantId: "test",
          site: null,
          canViewFinancials: true,
          nationalityScope: null,
        },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
      candidateToken = jwt.default.sign(
        {
          sub: "00000000-0000-0000-0000-00000000e2e2",
          id: "00000000-0000-0000-0000-00000000e2e2",
          email: "cand-edit@eej-test.local",
          name: "Cand Edit",
          role: "candidate",
          tier: 4,
          tenantId: "test",
          site: null,
          canViewFinancials: false,
          nationalityScope: null,
        },
        process.env.JWT_SECRET!,
        { expiresIn: "5m" },
      );
    });

    afterAll(async () => {
      try {
        await pool.query(`DELETE FROM audit_entries WHERE worker_id = $1`, [workerId]);
        await pool.query(`DELETE FROM workers WHERE id = $1`, [workerId]);
      } finally {
        await pool.end();
      }
    });

    it("CE.1 PATCH /workers/:id updates phone + email (cockpit inline edit)", async () => {
      const res = await request(app)
        .patch(`/api/workers/${workerId}`)
        .set("Authorization", `Bearer ${executiveToken}`)
        .send({ email: "new.email@test.local", phone: "+48 555 999 100" });
      expect(res.status).toBe(200);

      const w = await pool.query<{ email: string; phone: string }>(
        `SELECT email, phone FROM workers WHERE id = $1`,
        [workerId],
      );
      expect(w.rows[0].email).toBe("new.email@test.local");
      expect(w.rows[0].phone).toBe("+48 555 999 100");

      // Audit entry written.
      const audit = await pool.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM audit_entries WHERE worker_id = $1 AND action = 'update'`,
        [workerId],
      );
      expect(audit.rows[0].cnt).toBeGreaterThan(0);
    });

    it("CE.2 PATCH /workers/:id requires coordinator-or-admin role (candidate forbidden)", async () => {
      const res = await request(app)
        .patch(`/api/workers/${workerId}`)
        .set("Authorization", `Bearer ${candidateToken}`)
        .send({ email: "should.not.land@test.local" });
      // Candidate role doesn't have coordinator privileges.
      expect([401, 403]).toContain(res.status);

      const w = await pool.query<{ email: string }>(
        `SELECT email FROM workers WHERE id = $1`,
        [workerId],
      );
      expect(w.rows[0].email).not.toBe("should.not.land@test.local");
    });

    it("CE.3 PATCH /workers/:id 404 for worker in a different tenant", async () => {
      await pool.query(
        `INSERT INTO tenants (slug, name) VALUES ('other-tenant', 'Other Tenant') ON CONFLICT (slug) DO NOTHING`,
      );
      const other = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, tenant_id) VALUES ('Cross Tenant Edit', 'other-tenant') RETURNING id`,
      );
      try {
        const res = await request(app)
          .patch(`/api/workers/${other.rows[0].id}`)
          .set("Authorization", `Bearer ${executiveToken}`)
          .send({ email: "x@x.com" });
        expect(res.status).toBe(404);
      } finally {
        await pool.query(`DELETE FROM workers WHERE id = $1`, [other.rows[0].id]);
      }
    });

    it("CE.4 cockpit endpoint exposes whatsappMessages array (key present even when empty)", async () => {
      const res = await request(app)
        .get(`/api/workers/${workerId}/cockpit`)
        .set("Authorization", `Bearer ${executiveToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.whatsappMessages)).toBe(true);
      // Empty for this worker (no whatsapp_messages rows yet) but the key
      // must always be present so the frontend renders the panel without
      // optional-chaining everywhere.
    });

    it("CE.5 cockpit endpoint exposes aiReasoning array (key present even when empty)", async () => {
      const res = await request(app)
        .get(`/api/workers/${workerId}/cockpit`)
        .set("Authorization", `Bearer ${executiveToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.aiReasoning)).toBe(true);
    });
  },
);

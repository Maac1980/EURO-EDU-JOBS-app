import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Pool } from "pg";

// Required env vars for app module to load. Set BEFORE importing app.
process.env.JWT_SECRET ??= "test-jwt-secret-for-integration-tests-64-bytes-long-padding-xyz";
// Use TEST_DATABASE_URL for integration tests against a real DB; fall back to stub when unset (skipIf gates DB-touching tests in stub case)
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? "postgres://test:test@127.0.0.1:5432/test_does_not_connect";
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

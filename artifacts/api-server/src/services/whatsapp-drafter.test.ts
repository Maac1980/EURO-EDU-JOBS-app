import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Pool } from "pg";

process.env.JWT_SECRET ??= "test-jwt-secret-for-integration-tests-64-bytes-long-padding-xyz";
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? "postgres://test:test@127.0.0.1:5432/test_does_not_connect";
process.env.EEJ_ADMIN_EMAIL ??= "anna.b@edu-jobs.eu";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "whatsapp-drafter — DB-backed (requires TEST_DATABASE_URL)",
  () => {
    let pool: Pool;
    let createDraft: typeof import("./whatsapp-drafter.js").createDraft;
    let DrafterError: typeof import("./whatsapp-drafter.js").DrafterError;

    let realWorkerId: string;
    let testWorkerId: string;
    let unnormalizableWorkerId: string;
    let inactiveTemplateName: string;

    beforeAll(async () => {
      const { Pool: PgPool } = await import("pg");
      pool = new PgPool({ connectionString: process.env.TEST_DATABASE_URL });
      await pool.query("SELECT 1");

      const mod = await import("./whatsapp-drafter.js");
      createDraft = mod.createDraft;
      DrafterError = mod.DrafterError;

      // Activate one seeded template so the positive paths can use it
      // (Step 3a Task C seeded all 3 with active=false).
      const activeName = `application_received_test_${Date.now()}`;
      await pool.query(
        `INSERT INTO whatsapp_templates (tenant_id, name, language, body_preview, variables, active)
         VALUES ('production', $1, 'pl', 'Witaj {{workerName}}.', '["workerName"]'::jsonb, TRUE)`,
        [activeName],
      );
      // shadow the original template name for active-path tests
      (globalThis as any).__activeTemplateName = activeName;

      // Test-controlled inactive template — decoupled from the seeded
      // `application_received` which flipped active=true in production after
      // Item 2.1 (Day 18) and is inherited by every child Neon branch (staging,
      // eej-test). Tenant 'production' to match the createDraft tenantId in
      // D4/D7; cleanup deletes this row in afterAll.
      inactiveTemplateName = `inactive_for_test_${Date.now()}`;
      await pool.query(
        `INSERT INTO whatsapp_templates (tenant_id, name, language, body_preview, variables, active)
         VALUES ('production', $1, 'pl', 'Inactive {{workerName}}.', '["workerName"]'::jsonb, FALSE)`,
        [inactiveTemplateName],
      );

      const real = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id) VALUES ('Drafter Real', '+48 501 222 333', 'production') RETURNING id`,
      );
      realWorkerId = real.rows[0].id;

      const tw = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id) VALUES ('Drafter Testworker', '+48000000777', 'production') RETURNING id`,
      );
      testWorkerId = tw.rows[0].id;

      const bad = await pool.query<{ id: string }>(
        `INSERT INTO workers (name, phone, tenant_id) VALUES ('Drafter Bad', 'not-a-phone-number-#$%', 'production') RETURNING id`,
      );
      unnormalizableWorkerId = bad.rows[0].id;
    });

    afterAll(async () => {
      try {
        await pool.query(`DELETE FROM whatsapp_messages WHERE worker_id = ANY($1::uuid[])`, [
          [realWorkerId, testWorkerId, unnormalizableWorkerId],
        ]);
        await pool.query(`DELETE FROM workers WHERE id = ANY($1::uuid[])`, [
          [realWorkerId, testWorkerId, unnormalizableWorkerId],
        ]);
        const activeName = (globalThis as any).__activeTemplateName as string | undefined;
        if (activeName) {
          await pool.query(`DELETE FROM whatsapp_templates WHERE tenant_id = 'production' AND name = $1`, [activeName]);
        }
        if (inactiveTemplateName) {
          await pool.query(`DELETE FROM whatsapp_templates WHERE tenant_id = 'production' AND name = $1`, [inactiveTemplateName]);
        }
      } finally {
        await pool.end();
      }
    });

    it("D1 createDraft inserts a DRAFT row with interpolated body and resolved phone", async () => {
      const activeName = (globalThis as any).__activeTemplateName as string;
      const row = await createDraft({
        tenantId: "production",
        templateName: activeName,
        workerId: realWorkerId,
        variables: { workerName: "Adam" },
        triggerEvent: "manual",
      });
      expect(row.status).toBe("DRAFT");
      expect(row.direction).toBe("outbound");
      expect(row.workerId).toBe(realWorkerId);
      expect(row.body).toBe("Witaj Adam.");
      expect(row.phone).toBe("+48501222333");
      expect(row.templateId).toBeTruthy();
      expect(row.isTestLabel).toBe(false);
      expect(row.tenantId).toBe("production");
    });

    it("D2 createDraft for a test worker sets is_test_label and prefixes [TEST]", async () => {
      const activeName = (globalThis as any).__activeTemplateName as string;
      const row = await createDraft({
        tenantId: "production",
        templateName: activeName,
        workerId: testWorkerId,
        variables: { workerName: "Tester" },
        triggerEvent: "manual",
      });
      expect(row.isTestLabel).toBe(true);
      expect(row.body.startsWith("[TEST] ")).toBe(true);
      expect(row.body).toBe("[TEST] Witaj Tester.");
    });

    it("D3 createDraft with unknown template name throws DrafterError", async () => {
      await expect(
        createDraft({
          tenantId: "production",
          templateName: "no_such_template_anywhere",
          workerId: realWorkerId,
          variables: { workerName: "x" },
          triggerEvent: "manual",
        }),
      ).rejects.toBeInstanceOf(DrafterError);
    });

    it("D4 createDraft with inactive template throws DrafterError", async () => {
      await expect(
        createDraft({
          tenantId: "production",
          templateName: inactiveTemplateName,
          workerId: realWorkerId,
          variables: { workerName: "x" },
          triggerEvent: "manual",
        }),
      ).rejects.toBeInstanceOf(DrafterError);
    });

    it("D5 createDraft with neither workerId nor clientId throws DrafterError", async () => {
      const activeName = (globalThis as any).__activeTemplateName as string;
      await expect(
        createDraft({
          tenantId: "production",
          templateName: activeName,
          variables: { workerName: "x" },
          triggerEvent: "manual",
        }),
      ).rejects.toBeInstanceOf(DrafterError);
    });

    it("D6 createDraft for worker with unnormalizable phone throws DrafterError", async () => {
      const activeName = (globalThis as any).__activeTemplateName as string;
      await expect(
        createDraft({
          tenantId: "production",
          templateName: activeName,
          workerId: unnormalizableWorkerId,
          variables: { workerName: "x" },
          triggerEvent: "manual",
        }),
      ).rejects.toBeInstanceOf(DrafterError);
    });

    it("D7 thrown calls do not insert a row (count unchanged across error paths)", async () => {
      const activeName = (globalThis as any).__activeTemplateName as string;
      const before = await pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM whatsapp_messages WHERE tenant_id = 'production'`,
      );
      const beforeCount = before.rows[0].c;

      await Promise.allSettled([
        createDraft({ tenantId: "production", templateName: "definitely_missing", workerId: realWorkerId, variables: { workerName: "x" }, triggerEvent: "manual" }),
        createDraft({ tenantId: "production", templateName: inactiveTemplateName, workerId: realWorkerId, variables: { workerName: "x" }, triggerEvent: "manual" }),
        createDraft({ tenantId: "production", templateName: activeName, variables: { workerName: "x" }, triggerEvent: "manual" }),
        createDraft({ tenantId: "production", templateName: activeName, workerId: unnormalizableWorkerId, variables: { workerName: "x" }, triggerEvent: "manual" }),
      ]);

      const after = await pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM whatsapp_messages WHERE tenant_id = 'production'`,
      );
      expect(after.rows[0].c).toBe(beforeCount);
    });
  },
);

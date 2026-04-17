/**
 * PII backfill: encrypt legacy plaintext PESEL/IBAN values at rest.
 *
 * Idempotent: rows whose values already start with `enc:v1:` are skipped.
 * Safe to run repeatedly. Batches of 100 per pass.
 *
 * Auto-invoked once on startup by runMigrations() when legacy rows exist.
 * Also runnable via scripts/backfill-pii.ts (see there for CLI wrapper).
 */
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { encrypt, isEncrypted } from "./encryption.js";

export interface BackfillResult {
  scanned: number;
  encrypted: number;
  skipped: number;
  errors: number;
}

const BATCH_SIZE = 100;

export async function backfillPII(): Promise<BackfillResult> {
  const result: BackfillResult = { scanned: 0, encrypted: 0, skipped: 0, errors: 0 };

  const { rows } = await db.execute(sql`
    SELECT id, pesel, iban FROM workers
    WHERE (pesel IS NOT NULL AND pesel NOT LIKE 'enc:v1:%')
       OR (iban IS NOT NULL AND iban NOT LIKE 'enc:v1:%')
  `);

  const legacy = rows as Array<{ id: string; pesel: string | null; iban: string | null }>;

  for (let i = 0; i < legacy.length; i += BATCH_SIZE) {
    const batch = legacy.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      result.scanned++;
      try {
        const updates: { pesel?: string; iban?: string } = {};
        if (row.pesel && !isEncrypted(row.pesel)) {
          updates.pesel = encrypt(row.pesel);
        }
        if (row.iban && !isEncrypted(row.iban)) {
          updates.iban = encrypt(row.iban);
        }
        if (Object.keys(updates).length === 0) {
          result.skipped++;
          continue;
        }
        if (updates.pesel && updates.iban) {
          await db.execute(sql`
            UPDATE workers SET pesel = ${updates.pesel}, iban = ${updates.iban}, updated_at = NOW()
            WHERE id = ${row.id}
          `);
        } else if (updates.pesel) {
          await db.execute(sql`
            UPDATE workers SET pesel = ${updates.pesel}, updated_at = NOW()
            WHERE id = ${row.id}
          `);
        } else if (updates.iban) {
          await db.execute(sql`
            UPDATE workers SET iban = ${updates.iban}, updated_at = NOW()
            WHERE id = ${row.id}
          `);
        }
        result.encrypted++;
      } catch (e) {
        result.errors++;
        console.error(`[backfill-pii] Failed on worker ${row.id}:`, e instanceof Error ? e.message : e);
      }
    }
  }

  return result;
}

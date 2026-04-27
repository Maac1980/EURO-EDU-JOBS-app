/**
 * WhatsApp drafter service. Pure function over the database; no Twilio
 * network calls in this layer. Inserts DRAFT rows in whatsapp_messages
 * for later approval and dispatch by Step 3d.
 *
 * Per STEP3_PLAN.md (Sub-task 3b): manual API draft creation in routes
 * always succeeds; auto-trigger hooks should check
 * isFeatureEnabled(WHATSAPP_AUTOMATION_ENABLED) before calling
 * createDraft. The drafter itself is unaware of the flag — it is the
 * underlying primitive.
 */

import { db, schema } from "../db/index.js";
import { and, eq } from "drizzle-orm";
import { normalizePhone } from "../lib/phone.js";
import { isTestWorker } from "./test-safety.js";

export type WhatsappTriggerEvent =
  | "application_received"
  | "permit_update"
  | "payment_reminder"
  | "expiry_nudge"
  | "manual"
  | "inbound_reply"
  | "system";

export type WhatsappMessageRow = typeof schema.whatsappMessages.$inferSelect;

export interface CreateDraftInput {
  tenantId: string;
  templateName: string;
  workerId?: string;
  clientId?: string;
  variables: Record<string, string>;
  triggerEvent: WhatsappTriggerEvent;
}

export class DrafterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrafterError";
  }
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      throw new DrafterError(`Missing variable '${key}' for template body interpolation.`);
    }
    return String(vars[key]);
  });
}

export async function createDraft(input: CreateDraftInput): Promise<WhatsappMessageRow> {
  const { tenantId, templateName, workerId, clientId, variables, triggerEvent } = input;

  if (!workerId && !clientId) {
    throw new DrafterError("createDraft requires at least one of workerId or clientId.");
  }

  const [template] = await db.select().from(schema.whatsappTemplates).where(
    and(
      eq(schema.whatsappTemplates.tenantId, tenantId),
      eq(schema.whatsappTemplates.name, templateName),
    ),
  ).limit(1);

  if (!template) {
    throw new DrafterError(`Template '${templateName}' not found for tenant '${tenantId}'.`);
  }
  if (!template.active) {
    throw new DrafterError(`Template '${templateName}' is inactive (no Twilio content_sid provisioned).`);
  }

  let recipientPhoneRaw: string | null = null;
  let recipientForTestCheck: { tenant_id?: string; email?: string; phone?: string } = {};

  if (workerId) {
    const [worker] = await db.select().from(schema.workers).where(
      and(eq(schema.workers.id, workerId), eq(schema.workers.tenantId, tenantId)),
    ).limit(1);
    if (!worker) {
      throw new DrafterError(`Worker '${workerId}' not found in tenant '${tenantId}'.`);
    }
    recipientPhoneRaw = worker.phone ?? null;
    recipientForTestCheck = {
      tenant_id: worker.tenantId,
      email: worker.email ?? undefined,
      phone: worker.phone ?? undefined,
    };
  } else if (clientId) {
    const [client] = await db.select().from(schema.clients).where(
      and(eq(schema.clients.id, clientId), eq(schema.clients.tenantId, tenantId)),
    ).limit(1);
    if (!client) {
      throw new DrafterError(`Client '${clientId}' not found in tenant '${tenantId}'.`);
    }
    recipientPhoneRaw = client.phone ?? null;
    recipientForTestCheck = {
      tenant_id: client.tenantId,
      email: client.email ?? undefined,
      phone: client.phone ?? undefined,
    };
  }

  const phone = normalizePhone(recipientPhoneRaw);
  if (!phone) {
    throw new DrafterError(`Recipient phone could not be normalized to E.164 (input: ${recipientPhoneRaw === null ? "null" : JSON.stringify(recipientPhoneRaw)}).`);
  }

  const isTest = isTestWorker(recipientForTestCheck);
  const interpolatedBody = interpolate(template.bodyPreview, variables);
  const body = isTest ? `[TEST] ${interpolatedBody}` : interpolatedBody;

  const [inserted] = await db.insert(schema.whatsappMessages).values({
    tenantId,
    direction: "outbound",
    status: "DRAFT",
    workerId: workerId ?? null,
    clientId: clientId ?? null,
    phone,
    body,
    templateId: template.id,
    templateVariables: variables,
    triggerEvent,
    isTestLabel: isTest,
  }).returning();

  return inserted;
}

/**
 * Template Suggestion Engine — deterministic matching + AI explanation.
 * Reads worker context, matches against template metadata, ranks by relevance.
 * AI only explains WHY, never decides WHAT.
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { sql, eq, desc } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

interface TemplateSuggestion {
  templateId: string;
  name: string;
  category: string;
  description: string;
  relevanceScore: number;
  reason: string;
  prefillStatus: { ready: string[]; missing: string[]; percentage: number };
  applicable: boolean;
}

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

// ── POST /api/templates/suggest/:workerId — suggest templates ───────────
router.post("/templates/suggest/:workerId", authenticateToken, async (req, res) => {
  try {
    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${req.params.workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    // Get all templates
    const templates = await db.execute(sql`SELECT * FROM contract_templates ORDER BY category, name`);

    // Determine worker conditions
    const conditions: string[] = [];
    const hasContract = !!w.contract_end_date;
    const contractDays = daysUntil(w.contract_end_date);
    const trcDays = daysUntil(w.trc_expiry);
    const medicalDays = daysUntil(w.badania_lek_expiry);
    const isNew = !hasContract && (w.pipeline_stage === "New" || w.pipeline_stage === "Screening");

    if (isNew) conditions.push("new_worker");
    if (contractDays !== null && contractDays < 30) conditions.push("contract_renewal");
    if (trcDays !== null && trcDays < 60) conditions.push("trc_expiring");
    if (trcDays !== null && trcDays < 60) conditions.push("trc_filing");
    if (medicalDays !== null && medicalDays < 30) conditions.push("medical_expiring");
    if (w.hourly_netto_rate && contractDays !== null && contractDays < 60) conditions.push("rate_change");

    // Check for rejected case
    const rejectedCase = await db.execute(sql`
      SELECT id FROM legal_cases WHERE worker_id = ${req.params.workerId} AND status = 'REJECTED' LIMIT 1
    `);
    if (rejectedCase.rows.length > 0) conditions.push("case_rejected");

    // Score each template
    const suggestions: TemplateSuggestion[] = [];

    for (const t of templates.rows as any[]) {
      const applicableWhen = Array.isArray(t.applicable_when) ? t.applicable_when : [];
      const requiredFields = Array.isArray(t.required_worker_fields) ? t.required_worker_fields : [];

      // Match conditions
      const matchCount = applicableWhen.filter((c: string) => conditions.includes(c)).length;
      const applicable = matchCount > 0 || applicableWhen.length === 0;
      const relevanceScore = applicableWhen.length > 0 ? Math.round(matchCount / applicableWhen.length * 100) : 10;

      // Check prefill readiness
      const fieldMap: Record<string, any> = {
        name: w.name, pesel: w.pesel, job_role: w.job_role,
        hourly_netto_rate: w.hourly_netto_rate, assigned_site: w.assigned_site,
        contract_end_date: w.contract_end_date, nationality: w.nationality,
      };
      const ready = requiredFields.filter((f: string) => fieldMap[f] !== null && fieldMap[f] !== undefined && fieldMap[f] !== "");
      const missing = requiredFields.filter((f: string) => !fieldMap[f]);
      const prefillPct = requiredFields.length > 0 ? Math.round(ready.length / requiredFields.length * 100) : 100;

      // Generate reason
      let reason = "";
      if (matchCount > 0) {
        const matched = applicableWhen.filter((c: string) => conditions.includes(c));
        reason = matched.map((c: string) => {
          switch (c) {
            case "new_worker": return "New worker — needs onboarding documents";
            case "contract_renewal": return `Contract ends in ${contractDays} days`;
            case "trc_expiring": return `TRC expires in ${trcDays} days — file before expiry for Art.108`;
            case "trc_filing": return "TRC filing needed";
            case "medical_expiring": return `Medical exam expires in ${medicalDays} days`;
            case "case_rejected": return "Case was rejected — appeal may be needed";
            case "rate_change": return "Rate change with contract renewal";
            default: return c;
          }
        }).join("; ");
      } else if (applicableWhen.length === 0) {
        reason = "General document — always available";
      } else {
        reason = "Not currently applicable";
      }

      suggestions.push({
        templateId: t.id,
        name: t.name,
        category: t.category ?? "inne",
        description: t.description ?? "",
        relevanceScore,
        reason,
        prefillStatus: { ready, missing, percentage: prefillPct },
        applicable,
      });
    }

    // Sort: applicable first, then by relevance score
    suggestions.sort((a, b) => {
      if (a.applicable !== b.applicable) return a.applicable ? -1 : 1;
      return b.relevanceScore - a.relevanceScore;
    });

    // Group by category
    const byCategory: Record<string, TemplateSuggestion[]> = {};
    for (const s of suggestions) {
      if (!byCategory[s.category]) byCategory[s.category] = [];
      byCategory[s.category].push(s);
    }

    return res.json({
      workerId: req.params.workerId,
      workerName: w.name,
      workerConditions: conditions,
      totalTemplates: suggestions.length,
      applicableCount: suggestions.filter(s => s.applicable).length,
      byCategory,
      suggestions,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/templates/prefill-check/:templateId/:workerId ─────────────
router.post("/templates/prefill-check/:templateId/:workerId", authenticateToken, async (req, res) => {
  try {
    const [tpl] = await db.execute(sql`SELECT * FROM contract_templates WHERE id = ${req.params.templateId}`).then(r => r.rows as any[]);
    if (!tpl) return res.status(404).json({ error: "Template not found" });

    const [w] = await db.execute(sql`SELECT * FROM workers WHERE id = ${req.params.workerId}`).then(r => r.rows as any[]);
    if (!w) return res.status(404).json({ error: "Worker not found" });

    const requiredFields = Array.isArray(tpl.required_worker_fields) ? tpl.required_worker_fields : [];

    const fieldValues: Record<string, { value: any; status: "filled" | "missing" }> = {};
    const fieldMap: Record<string, any> = {
      name: w.name, pesel: w.pesel, job_role: w.job_role,
      hourly_netto_rate: w.hourly_netto_rate, assigned_site: w.assigned_site,
      contract_end_date: w.contract_end_date, nationality: w.nationality,
      email: w.email, phone: w.phone, iban: w.iban,
    };

    for (const f of requiredFields) {
      const val = fieldMap[f];
      fieldValues[f] = { value: val ?? null, status: val ? "filled" : "missing" };
    }

    const filled = Object.values(fieldValues).filter(v => v.status === "filled").length;
    const total = Object.keys(fieldValues).length;

    return res.json({
      templateName: tpl.name,
      workerName: w.name,
      fields: fieldValues,
      filledCount: filled,
      totalFields: total,
      percentage: total > 0 ? Math.round(filled / total * 100) : 100,
      readyToGenerate: Object.values(fieldValues).every(v => v.status === "filled"),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

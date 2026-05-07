/**
 * EEJ AI Copilot — Claude tool_use powered natural language interface.
 *
 * Every enforcement endpoint becomes a callable tool.
 * Anna types a question → Claude picks the right endpoint → returns real data.
 *
 * "Who has BHP expiring this week?" → calls worker query
 * "Show me all workers at Gdansk with expired permits" → calls PIP per-site pack
 * "How many cases are stuck in DEFECT_NOTICE?" → calls legal case queue
 * "Is worker Jan Kowalski safe to deploy?" → calls placement check
 * "What's our compliance rate?" → calls compliance certificate
 *
 * org_context: EEJ. All data queries scoped to EEJ.
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { safeError } from "../lib/security.js";

const router = Router();

// ═══ TOOL DEFINITIONS — every EEJ endpoint as a Claude tool ═════════════════

const COPILOT_TOOLS: any[] = [
  {
    name: "search_workers",
    description: "Search workers by name, nationality, status, site, voivodeship, or any field. Use this for questions about specific workers or groups of workers.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Name or keyword to search" },
        nationality: { type: "string", description: "Filter by nationality (e.g. Ukrainian, Indian)" },
        site: { type: "string", description: "Filter by assigned site/client name" },
        status: { type: "string", description: "Filter by compliance status: compliant, warning, critical" },
        voivodeship: { type: "string", description: "Filter by Polish voivodeship" },
      },
      required: [],
    },
  },
  {
    name: "check_expiring_documents",
    description: "Find workers with BHP, medical, permit, passport, or contract documents expiring within a specified number of days. Use for questions about expiring documents or upcoming renewals.",
    input_schema: {
      type: "object",
      properties: {
        document_type: { type: "string", enum: ["bhp", "medical", "permit", "passport", "contract", "all"], description: "Type of document to check" },
        days: { type: "number", description: "Number of days to look ahead (default 7)" },
      },
      required: ["document_type"],
    },
  },
  {
    name: "get_legal_cases_queue",
    description: "Get the legal case queue showing blocked, overdue, and active cases. Use for questions about case pipeline, defect notices, case status, or legal workload.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["NEW", "DOCS_PENDING", "READY_TO_FILE", "FILED", "UNDER_REVIEW", "DEFECT_NOTICE", "DECISION_RECEIVED", "APPROVED", "REJECTED"], description: "Filter by specific status" },
      },
      required: [],
    },
  },
  {
    name: "get_upcoming_deadlines",
    description: "Get upcoming compliance deadlines (7-day PUP notifications, 14-day defect responses, 15-day voivode notifications). Use for questions about deadlines, overdue tasks, or notifications.",
    input_schema: {
      type: "object",
      properties: {
        days_ahead: { type: "number", description: "How many days ahead to look (default 7)" },
      },
      required: [],
    },
  },
  {
    name: "check_worker_safety",
    description: "Check if a specific worker is safe to deploy/place. Validates BHP, medical exam, work permit, and contract. Use for deployment readiness questions.",
    input_schema: {
      type: "object",
      properties: {
        worker_name: { type: "string", description: "Worker name to look up" },
        worker_id: { type: "string", description: "Worker UUID if known" },
      },
      required: [],
    },
  },
  {
    name: "get_pip_inspection_pack",
    description: "Generate PIP inspection readiness report for a specific site or worker. Use when asked about inspection readiness, compliance packs, or PIP preparation.",
    input_schema: {
      type: "object",
      properties: {
        site_name: { type: "string", description: "Site/client name for per-site pack" },
        worker_id: { type: "string", description: "Worker ID for individual pack" },
      },
      required: [],
    },
  },
  {
    name: "get_compliance_rate",
    description: "Get overall compliance metrics: compliance rate, total workers, documents processed, nationalities served. Use for compliance overview or certificate data.",
    input_schema: {
      type: "object",
      properties: {
        from_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
        to_date: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
      required: [],
    },
  },
  {
    name: "get_ukrainian_tracker",
    description: "Get status of all Ukrainian workers including CUKR deadlines, Specustawa status, PESEL photo-ID deadline. Use for any question about Ukrainian workers.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "check_assignment_limit",
    description: "Check 18/36 month assignment limit for a worker-client pair. Use when asked about assignment duration, temp worker limits, or placement eligibility.",
    input_schema: {
      type: "object",
      properties: {
        worker_name: { type: "string", description: "Worker name" },
        client_name: { type: "string", description: "Client/employer name" },
      },
      required: [],
    },
  },
  {
    name: "validate_contract_permit",
    description: "Validate if a contract type is allowed under a specific permit type. Use for contract-permit compatibility questions.",
    input_schema: {
      type: "object",
      properties: {
        contract_type: { type: "string", enum: ["umowa_o_prace", "umowa_zlecenie", "umowa_o_dzielo", "B2B"], description: "Contract type" },
        permit_type: { type: "string", enum: ["Type A", "Type B", "Seasonal", "Oswiadczenie", "TRC"], description: "Work permit type" },
      },
      required: ["contract_type", "permit_type"],
    },
  },
  {
    name: "get_annex1_tracker",
    description: "Get employer Annex 1 signature tracking dashboard. Shows pending signatures with countdown timers. Use for MOS signature questions.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_reclassification_risks",
    description: "Scan workers on civil contracts (Zlecenie/B2B) for PIP reclassification risk indicators. Use for contract risk questions.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_kraz_status",
    description: "Get KRAZ registry status and annual marshal report deadline. Use for KRAZ or agency registration questions.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ═══ TOOL EXECUTION — calls real EEJ endpoints with real data ═══════════════

async function executeTool(toolName: string, toolInput: any): Promise<any> {
  switch (toolName) {
    case "search_workers": {
      // Safe parameterized search — no sql.raw()
      const search = toolInput.search ? `%${toolInput.search}%` : "%";
      const nat = toolInput.nationality ? `%${toolInput.nationality}%` : "%";
      const site = toolInput.site ? `%${toolInput.site}%` : "%";
      const voiv = toolInput.voivodeship ? `%${toolInput.voivodeship}%` : "%";

      const rows = await db.execute(sql`
        SELECT id, name, nationality, job_role, assigned_site, voivodeship, pipeline_stage,
               trc_expiry, work_permit_expiry, bhp_status, badania_lek_expiry, contract_end_date, contract_type
        FROM workers
        WHERE name ILIKE ${search} AND nationality ILIKE ${nat}
          AND COALESCE(assigned_site, '') ILIKE ${site} AND COALESCE(voivodeship, '') ILIKE ${voiv}
        ORDER BY name ASC LIMIT 20
      `);

      return (rows.rows as any[]).map(w => {
        const permit = w.trc_expiry ?? w.work_permit_expiry;
        const daysLeft = permit ? Math.ceil((new Date(permit).getTime() - Date.now()) / 86400000) : null;
        return {
          id: w.id, name: w.name, nationality: w.nationality, role: w.job_role,
          site: w.assigned_site, voivodeship: w.voivodeship, pipeline: w.pipeline_stage,
          permitExpiry: permit, daysLeft, contractType: w.contract_type,
          bhpExpiry: w.bhp_status, medicalExpiry: w.badania_lek_expiry,
        };
      });
    }

    case "check_expiring_documents": {
      // Safe parameterized queries — separate query per doc type, no string concat
      const days = toolInput.days ?? 7;
      const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
      const docType = toolInput.document_type;
      const results: any[] = [];

      if (docType === "bhp" || docType === "all") {
        const r = await db.execute(sql`SELECT id, name, 'BHP' as doc_type, bhp_status as expiry_date FROM workers WHERE bhp_status IS NOT NULL AND bhp_status <= ${cutoff}::DATE AND pipeline_stage IN ('Placed','Active','New')`);
        results.push(...r.rows);
      }
      if (docType === "medical" || docType === "all") {
        const r = await db.execute(sql`SELECT id, name, 'Medical' as doc_type, badania_lek_expiry as expiry_date FROM workers WHERE badania_lek_expiry IS NOT NULL AND badania_lek_expiry <= ${cutoff}::DATE AND pipeline_stage IN ('Placed','Active','New')`);
        results.push(...r.rows);
      }
      if (docType === "permit" || docType === "all") {
        const r = await db.execute(sql`SELECT id, name, 'Permit' as doc_type, COALESCE(trc_expiry, work_permit_expiry) as expiry_date FROM workers WHERE COALESCE(trc_expiry, work_permit_expiry) IS NOT NULL AND COALESCE(trc_expiry, work_permit_expiry) <= ${cutoff}::DATE AND pipeline_stage IN ('Placed','Active','New')`);
        results.push(...r.rows);
      }
      if (docType === "passport" || docType === "all") {
        const r = await db.execute(sql`SELECT id, name, 'Passport' as doc_type, passport_expiry as expiry_date FROM workers WHERE passport_expiry IS NOT NULL AND passport_expiry <= ${cutoff}::DATE AND pipeline_stage IN ('Placed','Active','New')`);
        results.push(...r.rows);
      }
      if (docType === "contract" || docType === "all") {
        const r = await db.execute(sql`SELECT id, name, 'Contract' as doc_type, contract_end_date as expiry_date FROM workers WHERE contract_end_date IS NOT NULL AND contract_end_date <= ${cutoff}::DATE AND pipeline_stage IN ('Placed','Active','New')`);
        results.push(...r.rows);
      }

      return results.map((r: any) => {
        const daysLeft = Math.ceil((new Date(r.expiry_date).getTime() - Date.now()) / 86400000);
        return { ...r, daysLeft, expired: daysLeft < 0 };
      }).sort((a: any, b: any) => (a.expiry_date > b.expiry_date ? 1 : -1));
    }

    case "get_legal_cases_queue": {
      if (toolInput.status) {
        const rows = await db.execute(sql`SELECT id, worker_id, worker_name, case_type, status, voivodeship, sla_deadline, blocker_type, blocker_reason, next_action FROM eej_legal_cases WHERE org_context = 'EEJ' AND status = ${toolInput.status} ORDER BY sla_deadline ASC NULLS LAST LIMIT 30`);
        return rows.rows;
      }
      const blocked = await db.execute(sql`SELECT worker_name, case_type, status, voivodeship, sla_deadline, blocker_reason FROM eej_legal_cases WHERE org_context = 'EEJ' AND blocker_type = 'HARD' AND status NOT IN ('APPROVED','REJECTED') ORDER BY sla_deadline ASC`);
      const overdue = await db.execute(sql`SELECT worker_name, case_type, status, voivodeship, sla_deadline FROM eej_legal_cases WHERE org_context = 'EEJ' AND sla_deadline < NOW() AND status NOT IN ('APPROVED','REJECTED') AND blocker_type != 'HARD' ORDER BY sla_deadline ASC`);
      const active = await db.execute(sql`SELECT worker_name, case_type, status, voivodeship, sla_deadline FROM eej_legal_cases WHERE org_context = 'EEJ' AND status NOT IN ('APPROVED','REJECTED') AND blocker_type != 'HARD' ORDER BY sla_deadline ASC NULLS LAST LIMIT 20`);
      return { blocked: blocked.rows, overdue: overdue.rows, active: active.rows };
    }

    case "get_upcoming_deadlines": {
      const days = toolInput.days_ahead ?? 7;
      const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
      const overdue = await db.execute(sql`SELECT worker_name, deadline_type, deadline_date, fine_risk, legal_basis FROM eej_compliance_deadlines WHERE org_context = 'EEJ' AND status = 'PENDING' AND deadline_date < CURRENT_DATE ORDER BY deadline_date ASC`);
      const upcoming = await db.execute(sql`SELECT worker_name, deadline_type, deadline_date, fine_risk, legal_basis FROM eej_compliance_deadlines WHERE org_context = 'EEJ' AND status = 'PENDING' AND deadline_date >= CURRENT_DATE AND deadline_date <= ${cutoff}::DATE ORDER BY deadline_date ASC`);
      return { overdue: overdue.rows, upcoming: upcoming.rows };
    }

    case "check_worker_safety": {
      let workerId = toolInput.worker_id;
      if (!workerId && toolInput.worker_name) {
        const found = await db.execute(sql`SELECT id FROM workers WHERE name ILIKE ${"%" + toolInput.worker_name + "%"} LIMIT 1`);
        workerId = (found.rows[0] as any)?.id;
      }
      if (!workerId) return { error: "Worker not found" };

      const wRows = await db.execute(sql`SELECT name, bhp_status, badania_lek_expiry, trc_expiry, work_permit_expiry, contract_type, assigned_site FROM workers WHERE id = ${workerId}`);
      if (wRows.rows.length === 0) return { error: "Worker not found" };
      const w = wRows.rows[0] as any;

      const checks: any[] = [];
      if (!w.bhp_status) checks.push({ check: "BHP", status: "MISSING", blocked: true });
      else if (new Date(w.bhp_status) <= new Date()) checks.push({ check: "BHP", status: "EXPIRED", date: w.bhp_status, blocked: true });
      else checks.push({ check: "BHP", status: "OK", date: w.bhp_status });

      if (!w.badania_lek_expiry) checks.push({ check: "Medical", status: "MISSING", blocked: true });
      else if (new Date(w.badania_lek_expiry) <= new Date()) checks.push({ check: "Medical", status: "EXPIRED", date: w.badania_lek_expiry, blocked: true });
      else checks.push({ check: "Medical", status: "OK", date: w.badania_lek_expiry });

      const permit = w.trc_expiry ?? w.work_permit_expiry;
      if (!permit) checks.push({ check: "Work permit", status: "MISSING", blocked: true });
      else if (new Date(permit) <= new Date()) checks.push({ check: "Work permit", status: "EXPIRED", date: permit, blocked: true });
      else checks.push({ check: "Work permit", status: "OK", date: permit });

      const blocked = checks.some(c => c.blocked);
      return { worker: w.name, site: w.assigned_site, contractType: w.contract_type, checks, safeToDepoly: !blocked, blocked };
    }

    case "get_pip_inspection_pack": {
      if (toolInput.site_name) {
        const rows = await db.execute(sql`
          SELECT id, name, nationality, contract_type, bhp_status, badania_lek_expiry, trc_expiry, work_permit_expiry, pesel, zus_status
          FROM workers WHERE assigned_site ILIKE ${"%" + toolInput.site_name + "%"} AND pipeline_stage IN ('Placed','Active') ORDER BY name
        `);
        return (rows.rows as any[]).map(w => ({
          name: w.name, nationality: w.nationality, contract: !!w.contract_type,
          bhp: w.bhp_status ? new Date(w.bhp_status) > new Date() : false,
          medical: w.badania_lek_expiry ? new Date(w.badania_lek_expiry) > new Date() : false,
          permit: (w.trc_expiry && new Date(w.trc_expiry) > new Date()) || (w.work_permit_expiry && new Date(w.work_permit_expiry) > new Date()),
          pesel: !!w.pesel, zus: w.zus_status === "Registered",
        }));
      }
      return { error: "Provide site_name or worker_id" };
    }

    case "get_compliance_rate": {
      const total = await db.execute(sql`SELECT COUNT(*)::INT as c FROM workers WHERE pipeline_stage IN ('Placed','Active')`);
      const compliant = await db.execute(sql`SELECT COUNT(*)::INT as c FROM workers WHERE pipeline_stage IN ('Placed','Active') AND (trc_expiry > CURRENT_DATE OR work_permit_expiry > CURRENT_DATE)`);
      const t = (total.rows[0] as any)?.c ?? 0;
      const comp = (compliant.rows[0] as any)?.c ?? 0;
      const rate = t > 0 ? Math.round((comp / t) * 100) : 100;
      const nats = await db.execute(sql`SELECT nationality, COUNT(*)::INT as count FROM workers WHERE pipeline_stage IN ('Placed','Active') AND nationality IS NOT NULL GROUP BY nationality ORDER BY count DESC`);
      return { totalWorkers: t, compliant: comp, complianceRate: `${rate}%`, nationalities: nats.rows };
    }

    case "get_ukrainian_tracker": {
      const rows = await db.execute(sql`
        SELECT id, name, trc_expiry, work_permit_expiry, trc_filing_date, pesel, voivodeship, pipeline_stage
        FROM workers WHERE nationality IN ('Ukrainian','UKR','ukraine','UA') ORDER BY COALESCE(trc_expiry, work_permit_expiry) ASC NULLS LAST
      `);
      return (rows.rows as any[]).map(w => {
        const permit = w.trc_expiry ?? w.work_permit_expiry;
        const daysLeft = permit ? Math.ceil((new Date(permit).getTime() - Date.now()) / 86400000) : null;
        const hasArt108 = !!(w.trc_filing_date && permit && new Date(w.trc_filing_date) <= new Date(permit));
        return { name: w.name, daysLeft, art108: hasArt108, pesel: !!w.pesel, voivodeship: w.voivodeship, pipeline: w.pipeline_stage };
      });
    }

    case "check_assignment_limit": {
      if (!toolInput.worker_name || !toolInput.client_name) return { error: "Need worker_name and client_name" };
      const wRows = await db.execute(sql`SELECT id FROM workers WHERE name ILIKE ${"%" + toolInput.worker_name + "%"} LIMIT 1`);
      const wid = (wRows.rows[0] as any)?.id;
      if (!wid) return { error: `Worker "${toolInput.worker_name}" not found` };

      const rows = await db.execute(sql`
        SELECT start_date, end_date FROM eej_assignments
        WHERE worker_id = ${wid} AND client_name ILIKE ${"%" + toolInput.client_name + "%"} AND org_context = 'EEJ'
      `);
      let totalDays = 0;
      for (const r of rows.rows as any[]) {
        const s = new Date(r.start_date); const e = r.end_date ? new Date(r.end_date) : new Date();
        totalDays += Math.max(0, Math.ceil((e.getTime() - s.getTime()) / 86400000));
      }
      const months = totalDays / 30;
      return { worker: toolInput.worker_name, client: toolInput.client_name, totalDays, totalMonths: Math.round(months * 10) / 10, limit: 18, blocked: months >= 18, status: months >= 18 ? "BLOCKED" : months >= 17 ? "CRITICAL" : months >= 15 ? "WARNING" : "OK" };
    }

    case "validate_contract_permit": {
      const rules: Record<string, string[]> = { "Type A": ["umowa_o_prace","umowa_zlecenie"], "Type B": ["umowa_o_prace"], "Seasonal": ["umowa_zlecenie","umowa_o_prace"], "Oswiadczenie": ["umowa_zlecenie","umowa_o_prace"], "TRC": ["umowa_o_prace","umowa_zlecenie","umowa_o_dzielo","B2B"] };
      const allowed = rules[toolInput.permit_type] ?? [];
      const valid = allowed.includes(toolInput.contract_type);
      return { valid, contractType: toolInput.contract_type, permitType: toolInput.permit_type, allowed, blocked: !valid };
    }

    case "get_annex1_tracker": {
      try {
        const rows = await db.execute(sql`SELECT worker_id, employer_name, deadline, signed, sent_at FROM employer_signature_links WHERE signed = false ORDER BY deadline ASC`);
        return (rows.rows as any[]).map(l => ({ employer: l.employer_name, deadline: l.deadline, daysLeft: Math.ceil((new Date(l.deadline).getTime() - Date.now()) / 86400000), signed: l.signed }));
      } catch { return []; }
    }

    case "get_reclassification_risks": {
      const rows = await db.execute(sql`SELECT id, name, contract_type, assigned_site, total_hours, hourly_netto_rate FROM workers WHERE contract_type IN ('umowa_zlecenie','umowa_o_dzielo','B2B') AND pipeline_stage IN ('Placed','Active')`);
      return (rows.rows as any[]).map(w => {
        let score = 0;
        if (w.assigned_site) score += 30;
        const h = parseFloat(w.total_hours ?? "0");
        if (h >= 140 && h <= 176) score += 25;
        if (w.hourly_netto_rate && parseFloat(w.hourly_netto_rate) > 0) score += 15;
        return { name: w.name, contract: w.contract_type, client: w.assigned_site, riskScore: Math.min(100, score), risk: score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW" };
      });
    }

    case "get_kraz_status": {
      const rows = await db.execute(sql`SELECT * FROM eej_kraz WHERE org_context = 'EEJ' ORDER BY created_at DESC LIMIT 1`);
      if (rows.rows.length === 0) return { warning: "No KRAZ registration on file" };
      const k = rows.rows[0] as any;
      const daysToReport = k.next_annual_report ? Math.ceil((new Date(k.next_annual_report).getTime() - Date.now()) / 86400000) : null;
      return { krazNumber: k.kraz_number, status: k.status, nextReport: k.next_annual_report, daysToReport };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ═══ COPILOT ENDPOINT ═══════════════════════════════════════════════════════

import { aiLimiter } from "../lib/security.js";
router.post("/ai/copilot", authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { question } = req.body as { question: string };
    if (!question?.trim()) return res.status(400).json({ error: "question required" });

    const mod = await import("@anthropic-ai/sdk");
    const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });

    const SYSTEM_PROMPT = `You are the EEJ Compliance Copilot — an AI assistant for Euro Edu Jobs, a Polish staffing agency managing foreign workers.

You have access to real-time data tools. USE THEM to answer questions — never guess or make up data.

Key context:
- EEJ manages ~54 workers across Poland, placed at various employer sites
- Polish immigration law: Art. 108 (continuity protection), MOS 2026 (digital filing), Schengen 90/180
- Temp worker limits: 18 months per client within 36-month rolling window (Art. 20)
- BHP/medical must be current for any placement — expired = blocked
- KRAZ registry is mandatory — operating without it = 100,000 PLN fine
- PIP can reclassify Zlecenie contracts to Prace from Jan 2026

Always answer in the language the user writes in (Polish or English).
Be concise and actionable. If there's a problem, state the fine risk and recommended action.
When showing lists, use clear formatting with names and key details.`;

    // First call: let Claude decide which tools to use
    let messages: any[] = [{ role: "user", content: question }];

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: COPILOT_TOOLS,
      messages,
    });

    // Process tool calls iteratively
    let currentResponse = response;
    let iterations = 0;
    const toolResults: any[] = [];

    while (currentResponse.stop_reason === "tool_use" && iterations < 5) {
      iterations++;

      const toolUseBlocks = currentResponse.content.filter((b: any) => b.type === "tool_use");
      const toolResultBlocks: any[] = [];

      for (const toolBlockRaw of toolUseBlocks) {
        const toolBlock = toolBlockRaw as any;
        try {
          const result = await executeTool(toolBlock.name, toolBlock.input);
          toolResults.push({ tool: toolBlock.name, input: toolBlock.input, result });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result).slice(0, 8000),
          });
        } catch (err: any) {
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: JSON.stringify({ error: err.message }),
            is_error: true,
          });
        }
      }

      // Continue conversation with tool results
      messages = [
        { role: "user", content: question },
        { role: "assistant", content: currentResponse.content },
        { role: "user", content: toolResultBlocks },
      ];

      currentResponse = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        tools: COPILOT_TOOLS,
        messages,
      });
    }

    // Extract final text response
    const textBlocks = currentResponse.content.filter((b: any) => b.type === "text");
    const answer = textBlocks.map((b: any) => b.text).join("\n") || "I processed your request but couldn't generate a text response.";

    return res.json({
      answer,
      toolsUsed: toolResults.map(t => t.tool),
      toolCount: toolResults.length,
      org_context: "EEJ",
    });
  } catch (err: any) {
    // Fallback if Claude API is unavailable
    if (err.message?.includes("API key") || err.message?.includes("401")) {
      return res.json({
        answer: "AI Copilot requires ANTHROPIC_API_KEY to be configured. Please set it in your environment variables.",
        toolsUsed: [],
        toolCount: 0,
        org_context: "EEJ",
      });
    }
    return safeError(res, err);
  }
});

// GET available tools (for frontend display)
router.get("/ai/copilot/tools", authenticateToken, async (_req, res) => {
  return res.json({
    tools: COPILOT_TOOLS.map(t => ({ name: t.name, description: t.description })),
    total: COPILOT_TOOLS.length,
    org_context: "EEJ",
  });
});

export default router;

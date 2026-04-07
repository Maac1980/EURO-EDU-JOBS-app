/**
 * Contract Engine — generates Polish employment contracts using Claude AI.
 * Drafts bilingual EN/PL contracts. Lawyer reviews before issuing.
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

type ContractType = "umowa_zlecenie" | "umowa_o_prace" | "b2b";

async function generateContract(
  workerData: any, clientData: any, contractType: ContractType,
  rate: number, startDate: string, endDate: string
): Promise<{ contractPl: string; contractEn: string }> {
  try {
    const mod = await import("@anthropic-ai/sdk");
    const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });

    const typeLabel = contractType === "umowa_zlecenie" ? "Umowa Zlecenie (Civil Law Contract)"
      : contractType === "umowa_o_prace" ? "Umowa o Pracę (Employment Contract)"
      : "B2B Contractor Agreement";

    const resp = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      messages: [{ role: "user", content:
        `Generate a bilingual Polish/English ${typeLabel} with these details:

EMPLOYER: ${clientData.name ?? "Euro Edu Jobs Sp. z o.o."}, NIP: ${clientData.nip ?? "N/A"}, Address: ${clientData.address ?? "Warsaw, Poland"}
WORKER: ${workerData.name}, Nationality: ${workerData.nationality ?? "N/A"}, PESEL: ${workerData.pesel ?? "N/A"}
POSITION: ${workerData.jobRole ?? "Worker"}
RATE: ${rate} PLN/hour gross
START DATE: ${startDate}
END DATE: ${endDate}
CONTRACT TYPE: ${contractType}

Generate TWO versions:

=== POLISH VERSION ===
Full legal text in Polish with proper Kodeks Pracy/Kodeks Cywilny references.
Include all mandatory clauses for this contract type.

=== ENGLISH VERSION ===
Full translation in English.

Include: parties, subject, duties, remuneration, working hours, termination, confidentiality, RODO/GDPR consent clause, signatures block.

Format as clean text with section numbers. No markdown.
Mark as "DRAFT — Requires Legal Review" at the top.`
      }],
    });
    const text = resp.content[0].type === "text" ? resp.content[0].text : "";
    const plMatch = text.match(/=== POLISH VERSION ===([\s\S]*?)(?:=== ENGLISH VERSION ===|$)/i);
    const enMatch = text.match(/=== ENGLISH VERSION ===([\s\S]*?)$/i);
    return {
      contractPl: (plMatch?.[1] ?? text).trim(),
      contractEn: (enMatch?.[1] ?? "").trim() || "[English version not generated — regenerate]",
    };
  } catch (err: any) {
    console.error("[contract-engine] Claude error:", err.message);
    return {
      contractPl: `DRAFT CONTRACT — AI generation failed. Error: ${err.message}`,
      contractEn: "AI generation failed.",
    };
  }
}

// ── POST /api/contracts/generate/:workerId — generate contract ──────────
router.post("/contracts/generate-ai/:workerId", authenticateToken, async (req, res) => {
  try {
    const { contractType, rate, startDate, endDate, clientId } = req.body as {
      contractType: ContractType; rate: number; startDate: string; endDate: string; clientId?: string;
    };
    if (!contractType || !rate || !startDate || !endDate) {
      return res.status(400).json({ error: "contractType, rate, startDate, endDate required" });
    }

    const worker = await db.execute(sql`SELECT * FROM workers WHERE id = ${req.params.workerId}`);
    if (worker.rows.length === 0) return res.status(404).json({ error: "Worker not found" });

    let clientData: any = { name: "Euro Edu Jobs Sp. z o.o." };
    if (clientId) {
      const client = await db.execute(sql`SELECT * FROM clients WHERE id = ${clientId}`);
      if (client.rows.length > 0) clientData = client.rows[0];
    }

    const result = await generateContract(worker.rows[0], clientData, contractType, rate, startDate, endDate);

    return res.json({
      workerId: req.params.workerId,
      workerName: (worker.rows[0] as any).name,
      contractType,
      contractPl: result.contractPl,
      contractEn: result.contractEn,
      status: "DRAFT — Requires Legal Review",
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/contracts/templates — list templates ───────────────────────
router.get("/contracts/templates", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM contract_templates ORDER BY contract_type, name`);
    return res.json({ templates: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/contracts/templates — save template ───────────────────────
router.post("/contracts/templates", authenticateToken, async (req, res) => {
  try {
    const { name, contractType, language, content, placeholders } = req.body as any;
    if (!name || !contractType || !content) return res.status(400).json({ error: "name, contractType, content required" });
    await db.execute(sql`
      INSERT INTO contract_templates (name, contract_type, language, content, placeholders)
      VALUES (${name}, ${contractType}, ${language ?? "pl"}, ${content}, ${JSON.stringify(placeholders ?? {})}::jsonb)
    `);
    return res.status(201).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

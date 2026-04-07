/**
 * Document OCR — Claude Vision extracts data from passport/TRC/BHP photos.
 * Returns structured data for lawyer review before auto-filling worker record.
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import fs from "fs";
import path from "path";

const router = Router();

const OCR_PROMPT = `Analyze this Polish immigration/employment document image. Extract ALL of the following fields if visible:

1. document_type: (passport, karta_pobytu, work_permit, bhp_certificate, medical_exam, contract, oswiadczenie, other)
2. full_name: (as written on document)
3. document_number: (passport number, card number, permit number)
4. date_of_birth: (YYYY-MM-DD format)
5. nationality:
6. issue_date: (YYYY-MM-DD)
7. expiry_date: (YYYY-MM-DD)
8. issuing_authority: (which office/voivodship)
9. permit_type: (Type A, Type B, Type C, seasonal, oswiadczenie — if work permit)
10. pesel: (if visible)
11. additional_notes: (any other relevant info)

For each field, also provide a confidence score (0-100).

Return as JSON: { "fields": { "field_name": { "value": "...", "confidence": 85 } } }
If a field is not visible, set value to null and confidence to 0.`;

async function extractWithClaude(imageBase64: string, mimeType: string): Promise<any> {
  try {
    const mod = await import("@anthropic-ai/sdk");
    const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType as any, data: imageBase64 } },
          { type: "text", text: OCR_PROMPT },
        ],
      }],
    });
    const text = resp.content[0].type === "text" ? resp.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "Could not parse response" };
  } catch (err: any) {
    console.error("[document-ocr] Claude Vision error:", err.message);
    return { error: err.message };
  }
}

// ── POST /api/documents/ocr — upload image, extract fields ──────────────
router.post("/documents/ocr", authenticateToken, async (req, res) => {
  try {
    const { image, mimeType, filename } = req.body as { image?: string; mimeType?: string; filename?: string };
    if (!image) return res.status(400).json({ error: "Base64 image data required in 'image' field" });

    const mime = mimeType ?? "image/jpeg";
    const result = await extractWithClaude(image, mime);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    return res.json({
      filename: filename ?? "uploaded_document",
      extractedFields: result.fields ?? result,
      status: "DRAFT — Review extracted data before applying",
      instructions: "POST /api/documents/ocr-apply with workerId and confirmedFields to update worker record",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/documents/ocr-apply — apply confirmed OCR to worker ───────
router.post("/documents/ocr-apply", authenticateToken, async (req, res) => {
  try {
    const { workerId, confirmedFields } = req.body as {
      workerId: string;
      confirmedFields: {
        name?: string; pesel?: string;
        trcExpiry?: string; workPermitExpiry?: string;
        bhpExpiry?: string; medicalExamExpiry?: string;
        passportExpiry?: string; visaType?: string;
      };
    };
    if (!workerId) return res.status(400).json({ error: "workerId required" });

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      name: "name", pesel: "pesel",
      trcExpiry: "trc_expiry", workPermitExpiry: "work_permit_expiry",
      bhpExpiry: "bhp_status", medicalExamExpiry: "badania_lek_expiry",
      visaType: "visa_type",
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      const val = (confirmedFields as any)[key];
      if (val !== undefined && val !== null) {
        sets.push(`${col} = $${idx}`);
        vals.push(val);
        idx++;
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });

    vals.push(workerId);
    await db.execute(sql.raw(`UPDATE workers SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${idx}`, vals));

    return res.json({ success: true, updatedFields: Object.keys(confirmedFields), workerId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

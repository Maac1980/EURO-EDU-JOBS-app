/**
 * MOS 2026 Digital Mandate — April 27 readiness.
 *
 * Task 1: MOS Data Exporter — pre-fill data for MOS portal
 * Task 2: Employer Signature Tracker — monitor digital link signing (7-day alert)
 * Task 3: Digital UPO Vault — extract submission number, lock Art.108 status
 * Task 4: Recruitment Risk Scoring — Schengen 80+ day flag, <10 day mandatory filing
 *
 * NO document manipulation. NO Apatris data. EEJ only.
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { calculateSchengen90180 } from "./schengen-calculator.js";

const router = Router();

// ═══ TABLE SETUP ════════════════════════════════════════════════════════════

async function ensureTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS employer_signature_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      employer_name TEXT NOT NULL,
      employer_nip TEXT,
      link_url TEXT,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      signed BOOLEAN DEFAULT false,
      signed_at TIMESTAMPTZ,
      deadline TIMESTAMPTZ NOT NULL,
      alert_sent BOOLEAN DEFAULT false,
      notes TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // upo_vault centralized in migrate.ts (Commit 3a). employer_signature_links
  // stays here pending Commit 3d centralization.
}

// ═══ TASK 1: MOS DATA EXPORTER ══════════════════════════════════════════════

interface MOSSubmissionSheet {
  worker: {
    fullName: string;
    pesel: string;
    dateOfBirth: string;
    nationality: string;
    passportNumber: string;
    passportExpiry: string;
    currentAddress: string;
  };
  employer: {
    companyName: string;
    nip: string;
    address: string;
    contactPerson: string;
  };
  employment: {
    position: string;
    contractType: string;
    salary: string;
    startDate: string;
    endDate: string;
  };
  application: {
    caseType: string;
    voivodeship: string;
    previousPermitNumber: string;
    previousPermitExpiry: string;
  };
  checklist: Array<{ field: string; value: string; status: "filled" | "missing" | "verify" }>;
  generatedAt: string;
}

router.post("/mos2026/submission-sheet/:workerId", authenticateToken, async (req, res) => {
  try {
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${wid}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    const { voivodeship, employerName, employerNip, employerAddress, contactPerson } = req.body as {
      voivodeship?: string; employerName?: string; employerNip?: string;
      employerAddress?: string; contactPerson?: string;
    };

    // Check employer signature status (Gap 1: block if unsigned)
    let employerSigned = false;
    let signatureStatus = "NOT_CHECKED";
    try {
      await ensureTables();
      const sigRows = await db.execute(sql`
        SELECT signed, deadline FROM employer_signature_links
        WHERE worker_id = ${wid} AND signed = true
        ORDER BY created_at DESC LIMIT 1
      `);
      if (sigRows.rows.length > 0) {
        employerSigned = true;
        signatureStatus = "SIGNED";
      } else {
        const pendingRows = await db.execute(sql`
          SELECT deadline FROM employer_signature_links
          WHERE worker_id = ${wid} AND signed = false
          ORDER BY created_at DESC LIMIT 1
        `);
        if (pendingRows.rows.length > 0) {
          const dl = new Date((pendingRows.rows[0] as any).deadline);
          signatureStatus = dl < new Date() ? "EXPIRED — ANNEX 1 NOT SIGNED (application paralyzed)" : "PENDING — awaiting employer signature";
        } else {
          signatureStatus = "NO_LINK_SENT — employer digital link has not been created";
        }
      }
    } catch { /* table may not exist */ }

    // Build checklist
    const checklist: MOSSubmissionSheet["checklist"] = [
      { field: "Full Name", value: w.name ?? "", status: w.name ? "filled" : "missing" },
      { field: "PESEL", value: w.pesel ?? "", status: w.pesel ? (w.pesel.length === 11 ? "filled" : "verify") : "missing" },
      { field: "Nationality", value: w.nationality ?? "", status: w.nationality ? "filled" : "missing" },
      { field: "Passport Number", value: w.passport_number ?? "", status: w.passport_number ? "filled" : "missing" },
      { field: "Passport Expiry", value: w.passport_expiry ?? "", status: w.passport_expiry ? "filled" : "missing" },
      { field: "Job Role / Position", value: w.job_role ?? "", status: w.job_role ? "filled" : "missing" },
      { field: "Contract Type", value: w.contract_type ?? "", status: w.contract_type ? "filled" : "verify" },
      { field: "Contract End Date", value: w.contract_end_date ?? "", status: w.contract_end_date ? "filled" : "missing" },
      { field: "Assigned Site", value: w.assigned_site ?? "", status: w.assigned_site ? "filled" : "missing" },
      { field: "ZUS Registration", value: w.zus_status ?? "", status: w.zus_status === "Registered" ? "filled" : "missing" },
      { field: "⚠ ZUS/KAS Sync Warning", value: w.zus_status === "Registered" ? "OK — KAS sync will succeed" : "CRITICAL — MOS syncs with KAS on submit. Without ZUS registration, application will be auto-rejected", status: w.zus_status === "Registered" ? "filled" : "verify" },
      { field: "TRC Expiry", value: w.trc_expiry ?? "", status: w.trc_expiry ? "filled" : "missing" },
      { field: "Work Permit Expiry", value: w.work_permit_expiry ?? "", status: w.work_permit_expiry ? "filled" : "missing" },
      { field: "Employer NIP", value: employerNip ?? "", status: employerNip ? "filled" : "missing" },
      { field: "Voivodeship", value: voivodeship ?? "", status: voivodeship ? "filled" : "missing" },
      { field: "⚠ Employer Annex 1 Signature", value: signatureStatus, status: employerSigned ? "filled" : "missing" },
      { field: "⚠ Employer Profil Zaufany / E-Signature", value: "Employer MUST have Profil Zaufany or Qualified Electronic Signature to sign MOS links", status: employerSigned ? "filled" : "verify" },
      { field: "Application Fee (2026)", value: "PLN 400–800 (new 2026 rates — fees quadrupled from pre-2026)", status: "verify" },
    ];

    const missingCount = checklist.filter(c => c.status === "missing").length;
    const verifyCount = checklist.filter(c => c.status === "verify").length;

    // Blockers — things that PREVENT filing
    const blockers: string[] = [];
    if (!employerSigned) blockers.push("BLOCKED: Employer has not signed Annex 1 digital link — application cannot be submitted to MOS");
    if (w.zus_status !== "Registered") blockers.push("RISK: Worker not registered in ZUS — MOS syncs with KAS on submit, may trigger auto-rejection");
    if (!w.pesel) blockers.push("BLOCKED: No PESEL — required for MOS submission");
    if (!w.passport_number) blockers.push("BLOCKED: No passport number on file");

    const sheet: MOSSubmissionSheet = {
      worker: {
        fullName: w.name ?? "",
        pesel: w.pesel ?? "",
        dateOfBirth: "",
        nationality: w.nationality ?? "",
        passportNumber: w.passport_number ?? "",
        passportExpiry: w.passport_expiry ?? "",
        currentAddress: w.assigned_site ?? "",
      },
      employer: {
        companyName: employerName ?? "Euro Edu Jobs Sp. z o.o.",
        nip: employerNip ?? "",
        address: employerAddress ?? "",
        contactPerson: contactPerson ?? "",
      },
      employment: {
        position: w.job_role ?? "",
        contractType: w.contract_type ?? "",
        salary: w.hourly_netto_rate ? `${w.hourly_netto_rate} PLN/h` : "",
        startDate: "",
        endDate: w.contract_end_date ?? "",
      },
      application: {
        caseType: "TRC — Temporary Residence and Work",
        voivodeship: voivodeship ?? "",
        previousPermitNumber: "",
        previousPermitExpiry: w.trc_expiry ?? w.work_permit_expiry ?? "",
      },
      checklist,
      generatedAt: new Date().toISOString(),
    };

    return res.json({
      sheet,
      readiness: blockers.length > 0 ? "BLOCKED" : missingCount === 0 ? "READY" : missingCount <= 2 ? "ALMOST_READY" : "NOT_READY",
      missingFields: missingCount,
      fieldsToVerify: verifyCount,
      blockers,
      employerSignature: { signed: employerSigned, status: signatureStatus },
      feeNote: "2026 MOS fees: TRC PLN 440→800, Work Permit PLN 100→400. Paid within MOS portal.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══ TASK 2: EMPLOYER SIGNATURE TRACKER ═════════════════════════════════════

router.post("/mos2026/signature-link", authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { workerId, employerName, employerNip, linkUrl, deadlineDays, notes } = req.body as {
      workerId: string; employerName: string; employerNip?: string;
      linkUrl?: string; deadlineDays?: number; notes?: string;
    };
    if (!workerId || !employerName) return res.status(400).json({ error: "workerId and employerName required" });

    const days = deadlineDays ?? 30;
    const deadline = new Date(Date.now() + days * 86400000).toISOString();

    const rows = await db.execute(sql`
      INSERT INTO employer_signature_links (worker_id, employer_name, employer_nip, link_url, deadline, notes, created_by)
      VALUES (${workerId}, ${employerName}, ${employerNip ?? null}, ${linkUrl ?? null},
        ${deadline}, ${notes ?? null}, ${(req as any).user?.name ?? "system"})
      RETURNING *
    `);
    return res.json({ link: rows.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/mos2026/signature-link/:id/signed", authenticateToken, async (req, res) => {
  try {
    const lid = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await db.execute(sql`
      UPDATE employer_signature_links SET signed = true, signed_at = NOW() WHERE id = ${lid}
    `);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/mos2026/signature-links", authenticateToken, async (_req, res) => {
  try {
    await ensureTables();
    const rows = await db.execute(sql`
      SELECT sl.*, w.name as worker_name
      FROM employer_signature_links sl
      LEFT JOIN workers w ON w.id = sl.worker_id
      ORDER BY sl.deadline ASC
    `);

    const links = (rows.rows as any[]).map(l => {
      const deadlineDate = new Date(l.deadline);
      const daysLeft = Math.ceil((deadlineDate.getTime() - Date.now()) / 86400000);
      const sentDate = new Date(l.sent_at ?? l.created_at);
      const daysSinceSent = Math.ceil((Date.now() - sentDate.getTime()) / 86400000);

      return {
        ...l,
        daysLeft,
        daysSinceSent,
        needsAlert: !l.signed && daysSinceSent >= 7,
        isOverdue: !l.signed && daysLeft < 0,
        isUrgent: !l.signed && daysLeft >= 0 && daysLeft <= 7,
      };
    });

    return res.json({
      links,
      unsigned: links.filter(l => !l.signed).length,
      overdue: links.filter(l => l.isOverdue).length,
      needsFollowUp: links.filter(l => l.needsAlert).length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══ TASK 3: DIGITAL UPO VAULT ══════════════════════════════════════════════

router.post("/mos2026/upo", authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { workerId, submissionNumber, submissionDate, authority, caseType, fileName, notes } = req.body as {
      workerId: string; submissionNumber: string; submissionDate: string;
      authority?: string; caseType?: string; fileName?: string; notes?: string;
    };
    if (!workerId || !submissionNumber || !submissionDate) {
      return res.status(400).json({ error: "workerId, submissionNumber, and submissionDate required" });
    }

    // Store UPO
    const rows = await db.execute(sql`
      INSERT INTO upo_vault (worker_id, submission_number, submission_date, authority, case_type, file_name, notes)
      VALUES (${workerId}, ${submissionNumber}, ${submissionDate}, ${authority ?? null},
        ${caseType ?? "TRC"}, ${fileName ?? null}, ${notes ?? null})
      RETURNING *
    `);

    // Lock Art. 108 status — this UPO proves filing date
    await db.execute(sql`
      UPDATE upo_vault SET art108_locked = true, locked_at = NOW(),
        locked_by = ${(req as any).user?.name ?? "system"}
      WHERE id = ${(rows.rows[0] as any).id}
    `);

    // Audit
    await db.execute(sql`
      INSERT INTO audit_entries (worker_id, actor, field, new_value, action)
      VALUES (${workerId}, ${(req as any).user?.name ?? "system"}, 'upo_vault',
        ${JSON.stringify({ submissionNumber, submissionDate, art108Locked: true })}::jsonb,
        'UPO_REGISTERED_ART108_LOCKED')
    `);

    return res.json({
      upo: rows.rows[0],
      art108Status: "LOCKED — Worker is legally protected under Art. 108 ust. 1 pkt 2",
      filingDate: submissionDate,
      submissionNumber,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/mos2026/upo/:workerId", authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const rows = await db.execute(sql`
      SELECT * FROM upo_vault WHERE worker_id = ${wid} ORDER BY submission_date DESC
    `);
    return res.json({ records: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══ TASK 4: RECRUITMENT RISK SCORING ════════════════════════════════════════

router.get("/mos2026/recruitment-risk/:workerId", authenticateToken, async (req, res) => {
  try {
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;

    // Get worker
    const wRows = await db.execute(sql`SELECT name, nationality, trc_expiry, work_permit_expiry FROM workers WHERE id = ${wid}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    // Get Schengen calculation (border_crossings centralized in migrate.ts)
    let schengen = { daysUsed: 0, daysRemaining: 90, isOverstay: false, isWarning: false, latestLegalExitDate: "" };
    const crossingRows = await db.execute(sql`
      SELECT crossing_date, direction FROM border_crossings
      WHERE worker_id = ${wid} ORDER BY crossing_date ASC
    `);
    if (crossingRows.rows.length > 0) {
      const crossings = (crossingRows.rows as any[]).map(r => ({
        date: r.crossing_date?.toString().slice(0, 10) ?? "",
        direction: r.direction as "entry" | "exit",
      }));
      schengen = calculateSchengen90180(crossings);
    }

    // Check UPO (Art. 108 protection) — upo_vault centralized in migrate.ts
    const upoRows = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM upo_vault
      WHERE worker_id = ${wid} AND art108_locked = true
    `);
    const hasUpo = ((upoRows.rows[0] as any)?.count ?? 0) > 0;

    // Risk scoring
    const risks: Array<{ level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; message: string }> = [];
    let mandatoryFiling = false;

    if (schengen.daysUsed > 80) {
      risks.push({ level: "HIGH", message: `Schengen: ${schengen.daysUsed}/90 days used — approaching limit` });
    }
    if (schengen.daysRemaining < 10 && schengen.daysRemaining > 0) {
      risks.push({ level: "CRITICAL", message: `MANDATORY MOS FILING: Only ${schengen.daysRemaining} Schengen days remaining` });
      mandatoryFiling = true;
    }
    if (schengen.daysRemaining <= 0 && !hasUpo) {
      risks.push({ level: "CRITICAL", message: "Schengen limit exceeded — worker may be in overstay without Art. 108 protection" });
      mandatoryFiling = true;
    }
    if (schengen.isOverstay && !hasUpo) {
      risks.push({ level: "CRITICAL", message: "OVERSTAY DETECTED — no UPO/Art. 108 protection on file" });
    }
    if (hasUpo) {
      risks.push({ level: "LOW", message: "Art. 108 protection active — UPO on file, Schengen 90/180 not applicable" });
    }

    // Permit expiry check
    const permitExpiry = w.trc_expiry ?? w.work_permit_expiry;
    if (permitExpiry) {
      const daysLeft = Math.ceil((new Date(permitExpiry).getTime() - Date.now()) / 86400000);
      if (daysLeft < 0) risks.push({ level: "CRITICAL", message: `Permit expired ${Math.abs(daysLeft)} days ago` });
      else if (daysLeft < 14) risks.push({ level: "HIGH", message: `Permit expires in ${daysLeft} days` });
    }

    const overallRisk = risks.some(r => r.level === "CRITICAL") ? "CRITICAL"
      : risks.some(r => r.level === "HIGH") ? "HIGH"
      : risks.some(r => r.level === "MEDIUM") ? "MEDIUM" : "LOW";

    return res.json({
      workerId: wid,
      workerName: w.name,
      schengen: {
        daysUsed: schengen.daysUsed,
        daysRemaining: schengen.daysRemaining,
        latestLegalExit: schengen.latestLegalExitDate,
        overstay: schengen.isOverstay,
      },
      art108Protected: hasUpo,
      mandatoryMosFiling: mandatoryFiling,
      overallRisk,
      risks,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

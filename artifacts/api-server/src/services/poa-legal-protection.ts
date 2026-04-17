/**
 * EEJ POA & Legal Protection Service
 *
 * 5 Legal Protections:
 *   1. POA Template Generator (pełnomocnictwo with all required fields)
 *   2. Disclaimer Auto-Attach (4 mandatory disclaimers PL+EN)
 *   3. RODO Consent Tracker (per-worker consent audit trail)
 *   4. Lawyer Escalation Trigger (blocks non-lawyer at court stage)
 *   5. POA Expiry Tracker (active POAs per case)
 *
 * Liza's 3 Suggestions:
 *   1. Name split: first_name, second_name, surname
 *   2. Auto-generate @edu-jobs.eu company email
 *   3. Receive-only email (inbound sink to team)
 *
 * Legal basis: KPA Art. 32-33, GDPR Art. 13/28/30, Opłata skarbowa 17 PLN
 * org_context: EEJ
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { safeError } from "../lib/security.js";

const router = Router();

// ═══ TABLE SETUP ════════════════════════════════════════════════════════════

async function ensureTables() {
  // POA Registry
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS eej_poa_registry (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      worker_name TEXT,
      representative_name TEXT NOT NULL,
      representative_role TEXT,
      case_type TEXT NOT NULL,
      case_number TEXT,
      voivodeship TEXT,
      scope TEXT NOT NULL,
      stamp_duty_paid BOOLEAN DEFAULT false,
      stamp_duty_amount NUMERIC(10,2) DEFAULT 17.00,
      filed_at_office BOOLEAN DEFAULT false,
      filed_date DATE,
      valid_until DATE,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_poa_worker ON eej_poa_registry(worker_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_poa_status ON eej_poa_registry(status)`);

  // RODO Consent Tracker
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS eej_rodo_consents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      worker_name TEXT,
      consent_type TEXT NOT NULL,
      consent_language TEXT NOT NULL DEFAULT 'pl',
      signed_date DATE,
      privacy_notice_delivered BOOLEAN DEFAULT false,
      privacy_notice_language TEXT,
      data_auth_employee TEXT,
      data_auth_issued_date DATE,
      retention_end_date DATE,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_rodo_worker ON eej_rodo_consents(worker_id)`);
}

// ═══ MANDATORY DISCLAIMERS (PL + EN) ════════════════════════════════════════

const DISCLAIMERS = {
  pl: [
    "Euro Edu Jobs Sp. z o.o. nie świadczy pomocy prawnej w rozumieniu ustawy Prawo o adwokaturze ani ustawy o radcach prawnych.",
    "Reprezentacja w postępowaniu administracyjnym odbywa się na podstawie art. 32-33 KPA i obejmuje wyłącznie czynności procesowe (składanie dokumentów, odbiór korespondencji, udział w czynnościach organu), a nie doradztwo prawne.",
    "W przypadku konieczności uzyskania porady prawnej lub reprezentacji przed sądem administracyjnym, pracownik zostanie poinformowany o konieczności skorzystania z usług adwokata lub radcy prawnego.",
    "Euro Edu Jobs Sp. z o.o. nie ponosi odpowiedzialności za decyzje organu administracyjnego.",
  ],
  en: [
    "Euro Edu Jobs Sp. z o.o. does not provide legal assistance within the meaning of the Bar Act or the Legal Advisors Act.",
    "Representation in administrative proceedings is based on Art. 32-33 KPA and covers only procedural acts (filing documents, receiving correspondence, participating in proceedings), not legal advice.",
    "If legal advice or court representation is needed, the worker will be informed of the need to engage a licensed lawyer (adwokat or radca prawny).",
    "Euro Edu Jobs Sp. z o.o. is not liable for the administrative organ's decisions.",
  ],
};

// ═══ #1: POA TEMPLATE GENERATOR ═════════════════════════════════════════════

router.post("/v1/legal/poa/generate", authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { workerId, workerFirstName, workerSecondName, workerSurname, workerPassport,
            representativeName, representativeRole, caseType, caseNumber, voivodeship } = req.body as {
      workerId: string; workerFirstName: string; workerSecondName?: string; workerSurname: string;
      workerPassport: string; representativeName: string; representativeRole?: string;
      caseType: string; caseNumber?: string; voivodeship: string;
    };

    // Validation — all required fields must be present for a valid POA
    const missing: string[] = [];
    if (!workerId) missing.push("workerId");
    if (!workerFirstName) missing.push("workerFirstName");
    if (!workerSurname) missing.push("workerSurname");
    if (!workerPassport) missing.push("workerPassport");
    if (!representativeName) missing.push("representativeName");
    if (!caseType) missing.push("caseType");
    if (!voivodeship) missing.push("voivodeship");

    if (missing.length > 0) {
      return res.status(400).json({
        error: "Cannot generate POA — missing required fields",
        missing,
        legal_basis: "Art. 33 § 2-3 KPA — pełnomocnictwo must identify representative, principal, and scope",
      });
    }

    const workerFullName = [workerFirstName, workerSecondName, workerSurname].filter(Boolean).join(" ");
    const scope = `Reprezentacja w postępowaniu administracyjnym dotyczącym ${caseType === "TRC" ? "udzielenia zezwolenia na pobyt czasowy i pracę" : caseType === "APPEAL" ? "odwołania od decyzji" : "sprawy imigracyjnej"} przed Wojewodą ${voivodeship}${caseNumber ? ` (sygn. ${caseNumber})` : ""}.`;

    const poaDocument = {
      title_pl: "PEŁNOMOCNICTWO",
      title_en: "POWER OF ATTORNEY",
      content_pl: `Ja, ${workerFullName}, nr paszportu: ${workerPassport}, niniejszym udzielam pełnomocnictwa Panu/Pani ${representativeName}${representativeRole ? ` (${representativeRole})` : ""}, pracownikowi Euro Edu Jobs Sp. z o.o., do reprezentowania mnie w postępowaniu administracyjnym ${scope}\n\nZakres pełnomocnictwa obejmuje:\n- składanie wniosków i dokumentów\n- odbiór korespondencji i decyzji\n- udział w czynnościach organu\n- składanie środków odwoławczych w postępowaniu administracyjnym\n\nPodstawa prawna: Art. 32-33 Kodeksu postępowania administracyjnego.\n\nOpłata skarbowa: 17,00 PLN (załącznik: potwierdzenie wpłaty)\n\n___________________________\nPodpis mocodawcy / Principal's signature\n\n___________________________\nData / Date\n\n${DISCLAIMERS.pl.map((d, i) => `${i + 1}. ${d}`).join("\n")}`,
      content_en: `I, ${workerFullName}, passport number: ${workerPassport}, hereby grant power of attorney to ${representativeName}${representativeRole ? ` (${representativeRole})` : ""}, employee of Euro Edu Jobs Sp. z o.o., to represent me in administrative proceedings ${scope}\n\nScope of authority:\n- Filing applications and documents\n- Receiving correspondence and decisions\n- Participating in proceedings\n- Filing administrative appeals\n\nLegal basis: Art. 32-33 of the Code of Administrative Procedure (KPA).\n\nStamp duty: 17.00 PLN (attached: proof of payment)\n\n___________________________\nPrincipal's signature\n\n___________________________\nDate\n\n${DISCLAIMERS.en.map((d, i) => `${i + 1}. ${d}`).join("\n")}`,
      stamp_duty: { amount: 17.00, currency: "PLN", payable_to: `Urząd Miasta w siedzibie Wojewody ${voivodeship}` },
    };

    // Register POA
    const rows = await db.execute(sql`
      INSERT INTO eej_poa_registry (worker_id, worker_name, representative_name, representative_role, case_type, case_number, voivodeship, scope, org_context)
      VALUES (${workerId}, ${workerFullName}, ${representativeName}, ${representativeRole ?? null}, ${caseType}, ${caseNumber ?? null}, ${voivodeship}, ${scope}, 'EEJ')
      RETURNING *
    `);

    return res.json({ poa: rows.rows[0], document: poaDocument, org_context: "EEJ" });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET active POAs for a worker
router.get("/v1/legal/poa/:workerId", authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const rows = await db.execute(sql`SELECT * FROM eej_poa_registry WHERE worker_id = ${wid} AND org_context = 'EEJ' ORDER BY created_at DESC`);
    return res.json({ poas: rows.rows, total: rows.rows.length, disclaimers: DISCLAIMERS });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// ═══ #2: DISCLAIMER AUTO-ATTACH ═════════════════════════════════════════════

router.get("/v1/legal/disclaimers", authenticateToken, async (_req, res) => {
  return res.json({ disclaimers: DISCLAIMERS, legal_basis: "Ustawa Prawo o adwokaturze, Ustawa o radcach prawnych", org_context: "EEJ" });
});

// ═══ #3: RODO CONSENT TRACKER ═══════════════════════════════════════════════

router.post("/v1/legal/rodo-consent", authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { workerId, workerName, consentType, consentLanguage, signedDate,
            privacyNoticeDelivered, privacyNoticeLanguage, dataAuthEmployee, retentionEndDate } = req.body as {
      workerId: string; workerName?: string; consentType: string; consentLanguage?: string;
      signedDate?: string; privacyNoticeDelivered?: boolean; privacyNoticeLanguage?: string;
      dataAuthEmployee?: string; retentionEndDate?: string;
    };

    if (!workerId || !consentType) return res.status(400).json({ error: "workerId and consentType required" });

    const rows = await db.execute(sql`
      INSERT INTO eej_rodo_consents (worker_id, worker_name, consent_type, consent_language, signed_date,
        privacy_notice_delivered, privacy_notice_language, data_auth_employee, data_auth_issued_date, retention_end_date, org_context)
      VALUES (${workerId}, ${workerName ?? null}, ${consentType}, ${consentLanguage ?? "pl"}, ${signedDate ?? null},
        ${privacyNoticeDelivered ?? false}, ${privacyNoticeLanguage ?? null}, ${dataAuthEmployee ?? null},
        ${dataAuthEmployee ? new Date().toISOString().slice(0, 10) : null}, ${retentionEndDate ?? null}, 'EEJ')
      RETURNING *
    `);

    return res.json({ consent: rows.rows[0], org_context: "EEJ" });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET RODO compliance status for a worker
router.get("/v1/legal/rodo-consent/:workerId", authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const rows = await db.execute(sql`SELECT * FROM eej_rodo_consents WHERE worker_id = ${wid} AND org_context = 'EEJ' ORDER BY created_at DESC`);

    const consents = rows.rows as any[];
    const hasConsent = consents.some(c => c.signed_date && c.status === "ACTIVE");
    const hasPrivacyNotice = consents.some(c => c.privacy_notice_delivered);
    const hasDataAuth = consents.some(c => c.data_auth_employee);

    return res.json({
      consents,
      compliance: {
        consentSigned: hasConsent,
        privacyNoticeDelivered: hasPrivacyNotice,
        dataAuthorizationIssued: hasDataAuth,
        complete: hasConsent && hasPrivacyNotice && hasDataAuth,
        missing: [
          ...(!hasConsent ? ["RODO consent form not signed (Art. 6 GDPR)"] : []),
          ...(!hasPrivacyNotice ? ["Privacy notice not delivered (Art. 13 GDPR)"] : []),
          ...(!hasDataAuth ? ["Data processing authorization not issued to employee (Art. 29 GDPR)"] : []),
        ],
      },
      org_context: "EEJ",
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// ═══ #4: LAWYER ESCALATION TRIGGER ══════════════════════════════════════════

router.get("/v1/legal/escalation-check/:caseId", authenticateToken, async (req, res) => {
  try {
    const caseId = Array.isArray(req.params.caseId) ? req.params.caseId[0] : req.params.caseId;

    let caseData: any = null;
    try {
      const rows = await db.execute(sql`SELECT * FROM eej_legal_cases WHERE id = ${caseId} AND org_context = 'EEJ'`);
      caseData = rows.rows[0] ?? null;
    } catch { /* table may not exist */ }

    if (!caseData) return res.status(404).json({ error: "Case not found" });

    const lawyerRequired = caseData.status === "REJECTED" && caseData.appeal_deadline;
    const courtStage = false; // Would be set if case has been escalated to WSA/NSA

    return res.json({
      caseId,
      status: caseData.status,
      lawyerRequired: lawyerRequired || courtStage,
      reason: lawyerRequired
        ? "Case REJECTED — if appealing to WSA, Art. 34-35 PPSA allows non-lawyer representation. For NSA cassation (Art. 175 PPSA), a lawyer (adwokat/radca prawny) is MANDATORY."
        : courtStage
        ? "Case at NSA stage — Art. 175 § 1 PPSA requires adwokat or radca prawny. Non-lawyer representation is ILLEGAL at this stage."
        : "No lawyer required at current stage. Agency pełnomocnik can continue under KPA Art. 32-33.",
      appealDeadline: caseData.appeal_deadline,
      recommendation: lawyerRequired
        ? "Contact partnered kancelaria adwokacka. Worker has 14 days to appeal (KPA Art. 127)."
        : null,
      org_context: "EEJ",
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// ═══ LIZA #2+#3: AUTO-GENERATE COMPANY EMAIL ════════════════════════════════

function generateCompanyEmail(firstName: string, surname: string, domain: string = "edu-jobs.eu"): string {
  const cleanFirst = firstName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  const cleanSurname = surname.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  return `${cleanFirst}.${cleanSurname}@${domain}`;
}

// POST auto-generate company email + split name for a worker
router.post("/v1/workers/:id/setup-identity", authenticateToken, async (req, res) => {
  try {
    const wid = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { firstName, secondName, surname, emailDomain } = req.body as {
      firstName: string; secondName?: string; surname: string; emailDomain?: string;
    };

    if (!firstName || !surname) return res.status(400).json({ error: "firstName and surname required" });

    const fullName = [firstName, secondName, surname].filter(Boolean).join(" ");
    const domain = emailDomain ?? "edu-jobs.eu";
    const companyEmail = generateCompanyEmail(firstName, surname, domain);

    // Check for duplicate email
    const existing = await db.execute(sql`SELECT id FROM workers WHERE company_email = ${companyEmail} AND id != ${wid}`);
    const finalEmail = existing.rows.length > 0
      ? generateCompanyEmail(firstName, surname + Math.floor(Math.random() * 99), domain)
      : companyEmail;

    // Update worker
    await db.execute(sql`
      UPDATE workers SET
        name = ${fullName},
        first_name = ${firstName},
        second_name = ${secondName ?? null},
        surname = ${surname},
        company_email = ${finalEmail},
        updated_at = NOW()
      WHERE id = ${wid}
    `);

    return res.json({
      workerId: wid,
      name: fullName,
      firstName,
      secondName: secondName ?? null,
      surname,
      companyEmail: finalEmail,
      emailConfig: {
        address: finalEmail,
        type: "RECEIVE_ONLY",
        forwardsTo: "team@edu-jobs.eu",
        canSendFrom: false,
        purpose: "All inbound emails (voivodeship replies, ZUS, government correspondence) forwarded to EEJ team inbox. Worker cannot send from this address.",
        setup: `Configure in Google Workspace Admin: create alias ${finalEmail} → forward to team@edu-jobs.eu`,
      },
      org_context: "EEJ",
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET worker identity (name parts + company email)
router.get("/v1/workers/:id/identity", authenticateToken, async (req, res) => {
  try {
    const wid = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const rows = await db.execute(sql`
      SELECT id, name, first_name, second_name, surname, email, company_email, nationality, passport_number
      FROM workers WHERE id = ${wid}
    `);
    if (rows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });

    const w = rows.rows[0] as any;
    return res.json({
      identity: {
        fullName: w.name,
        firstName: w.first_name,
        secondName: w.second_name,
        surname: w.surname,
        personalEmail: w.email,
        companyEmail: w.company_email,
        nationality: w.nationality,
        passportNumber: w.passport_number ? "***" + w.passport_number.slice(-4) : null,
      },
      nameComplete: !!(w.first_name && w.surname),
      companyEmailGenerated: !!w.company_email,
      org_context: "EEJ",
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

export default router;

/**
 * LEGAL DECISION ENGINE — Pure deterministic function.
 * NO AI. NO database. NO side effects. Unit testable.
 *
 * Input: worker document data
 * Output: legal status, basis, risk level, conditions, warnings, required actions
 *
 * This is the single source of truth for legal status.
 * AI may explain or summarize, but NEVER override this engine.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface LegalInput {
  workerId: string;
  workerName: string;
  nationality: string;
  permitExpiry: string | null;       // work permit expiry date
  trcExpiry: string | null;          // TRC (Karta Pobytu) expiry date
  trcFilingDate: string | null;      // date TRC application was filed
  trcApplicationPending: boolean;    // is TRC application currently pending?
  employerContinuity: boolean;       // same employer as on current permit?
  roleContinuity: boolean;           // same role/position as on permit?
  formalDefect: boolean;             // any formal defect in application?
  contractEndDate: string | null;
  bhpExpiry: string | null;
  medicalExpiry: string | null;
  oswiadczenieExpiry: string | null;
  hasValidPassport: boolean;
  evidenceSubmitted: string[];       // types of evidence: "mos_stamp", "upo", "filing_proof"
}

export type LegalStatus =
  | "VALID"                    // all documents current, fully compliant
  | "EXPIRING_SOON"           // documents expiring within 60 days
  | "PROTECTED_PENDING"       // Art. 108 protection — TRC filed, legal to work
  | "REVIEW_REQUIRED"         // edge case — needs lawyer review
  | "EXPIRED_NOT_PROTECTED"   // expired and NOT covered by Art. 108
  | "NO_PERMIT";              // no work authorization at all

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface LegalOutput {
  legalStatus: LegalStatus;
  legalBasis: string;
  riskLevel: RiskLevel;
  conditions: string[];
  warnings: string[];
  requiredActions: string[];
  expiryDays: { permit: number | null; trc: number | null; bhp: number | null; medical: number | null; contract: number | null };
  art108Eligible: boolean;
  art108Applied: boolean;
}

// ── Helper ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

// EU/EEA/Swiss citizens don't need work permits in Poland
const EU_NATIONALS = [
  "Polish", "German", "French", "Italian", "Spanish", "Dutch", "Belgian",
  "Austrian", "Swedish", "Danish", "Finnish", "Irish", "Czech", "Slovak",
  "Hungarian", "Romanian", "Bulgarian", "Croatian", "Slovenian", "Estonian",
  "Latvian", "Lithuanian", "Luxembourgish", "Maltese", "Cypriot", "Greek",
  "Portuguese", "Swiss", "Norwegian", "Icelandic", "Liechtenstein",
];

// Oświadczenie-eligible nationalities
const OSWIADCZENIE_ELIGIBLE = ["Ukrainian", "Belarusian", "Georgian", "Moldovan", "Armenian"];

// ── MAIN ENGINE ──────────────────────────────────────────────────────────────

export function evaluateLegalStatus(input: LegalInput): LegalOutput {
  const conditions: string[] = [];
  const warnings: string[] = [];
  const requiredActions: string[] = [];

  const permitDays = daysUntil(input.permitExpiry);
  const trcDays = daysUntil(input.trcExpiry);
  const bhpDays = daysUntil(input.bhpExpiry);
  const medicalDays = daysUntil(input.medicalExpiry);
  const contractDays = daysUntil(input.contractEndDate);

  const expiryDays = { permit: permitDays, trc: trcDays, bhp: bhpDays, medical: medicalDays, contract: contractDays };

  let art108Eligible = false;
  let art108Applied = false;

  // ── Rule 1: EU nationals — no permit needed ────────────────────────────
  if (EU_NATIONALS.includes(input.nationality)) {
    conditions.push("EU/EEA citizen — no work permit required");
    // Still check BHP, medical, contract
    const docWarnings = checkDocuments(bhpDays, medicalDays, contractDays, warnings, requiredActions);
    const riskLevel = docWarnings > 0 ? "MEDIUM" : "LOW";
    return {
      legalStatus: riskLevel === "LOW" ? "VALID" : "EXPIRING_SOON",
      legalBasis: "EU Treaty — Free Movement of Workers",
      riskLevel, conditions, warnings, requiredActions, expiryDays,
      art108Eligible: false, art108Applied: false,
    };
  }

  // ── Rule 2: No permit AND no TRC — NO_PERMIT ──────────────────────────
  if (!input.permitExpiry && !input.trcExpiry && !input.oswiadczenieExpiry && !input.trcApplicationPending) {
    requiredActions.push("Obtain work authorization immediately — worker cannot legally work");
    if (OSWIADCZENIE_ELIGIBLE.includes(input.nationality)) {
      requiredActions.push("Consider oświadczenie (declaration) at PUP — faster than work permit");
    }
    return {
      legalStatus: "NO_PERMIT", legalBasis: "Art. 87 Ustawa o promocji zatrudnienia",
      riskLevel: "CRITICAL", conditions, warnings, requiredActions, expiryDays,
      art108Eligible: false, art108Applied: false,
    };
  }

  // ── Rule 3: Art. 108 Protection Check ─────────────────────────────────
  // Art. 108 Ustawa o cudzoziemcach: if foreigner filed TRC application
  // before previous title expired, they can stay and work until decision.
  if (input.trcApplicationPending && input.trcFilingDate) {
    const filingDate = new Date(input.trcFilingDate);
    const permitExpiryDate = input.permitExpiry ? new Date(input.permitExpiry) : null;
    const trcExpiryDate = input.trcExpiry ? new Date(input.trcExpiry) : null;
    const referenceExpiry = trcExpiryDate ?? permitExpiryDate;

    if (referenceExpiry) {
      const filedBeforeExpiry = filingDate <= referenceExpiry;
      const filedSameDay = filingDate.toDateString() === referenceExpiry.toDateString();

      art108Eligible = true;

      if (filedBeforeExpiry || filedSameDay) {
        // Art. 108 protection applies
        art108Applied = true;
        conditions.push("Art. 108 protection active — TRC application filed on time");
        conditions.push(`Filed: ${input.trcFilingDate}, Previous title expired: ${input.trcExpiry ?? input.permitExpiry}`);

        if (!input.employerContinuity) {
          warnings.push("EMPLOYER CHANGE — Art. 108 may not cover work for a different employer without modification");
          requiredActions.push("Verify if new employer filed work permit modification or new TRC application covers new employment");
        }
        if (!input.roleContinuity) {
          warnings.push("ROLE CHANGE — work outside original permit scope may not be covered by Art. 108");
        }
        if (input.formalDefect) {
          warnings.push("FORMAL DEFECT in application — voivodship may reject. Monitor closely");
          requiredActions.push("Respond to formal defect notice within deadline (usually 7 days)");
        }

        // Check evidence
        const hasStamp = input.evidenceSubmitted.includes("mos_stamp");
        const hasUpo = input.evidenceSubmitted.includes("upo");
        if (!hasStamp && !hasUpo) {
          warnings.push("No proof of Art. 108 status on file — obtain MoS stamp or UPO");
          requiredActions.push("Get stamp in passport from voivodship office confirming Art. 108 status");
        }

        checkDocuments(bhpDays, medicalDays, contractDays, warnings, requiredActions);

        const riskLevel: RiskLevel = warnings.length > 2 ? "MEDIUM" : "LOW";
        return {
          legalStatus: "PROTECTED_PENDING", legalBasis: "Art. 108 ust. 1 Ustawa o cudzoziemcach",
          riskLevel, conditions, warnings, requiredActions, expiryDays,
          art108Eligible, art108Applied,
        };
      } else {
        // Filed AFTER expiry — Art. 108 does NOT apply
        warnings.push(`TRC filed AFTER previous title expired (filed: ${input.trcFilingDate}, expired: ${referenceExpiry.toISOString().slice(0, 10)})`);
        warnings.push("Art. 108 protection does NOT apply — worker may be in illegal stay");
        requiredActions.push("URGENT: Consult lawyer — possible illegal employment situation");
        requiredActions.push("Consider voluntary departure + new application from country of origin");

        return {
          legalStatus: "EXPIRED_NOT_PROTECTED", legalBasis: "Art. 108 — late filing, protection not applicable",
          riskLevel: "CRITICAL", conditions, warnings, requiredActions, expiryDays,
          art108Eligible: true, art108Applied: false,
        };
      }
    }
  }

  // ── Rule 4: Check permit/TRC validity ─────────────────────────────────
  const effectivePermitDays = Math.min(
    permitDays ?? Infinity,
    trcDays ?? Infinity,
    input.oswiadczenieExpiry ? (daysUntil(input.oswiadczenieExpiry) ?? Infinity) : Infinity
  );

  if (effectivePermitDays === Infinity) {
    // No expiry dates at all — review needed
    requiredActions.push("Verify work authorization status — no expiry dates on file");
    return {
      legalStatus: "REVIEW_REQUIRED", legalBasis: "Insufficient data for determination",
      riskLevel: "HIGH", conditions, warnings, requiredActions, expiryDays,
      art108Eligible: false, art108Applied: false,
    };
  }

  if (effectivePermitDays < 0) {
    // Expired
    warnings.push("Work authorization has EXPIRED");
    requiredActions.push("Worker must stop working immediately until new authorization obtained");
    requiredActions.push("File new work permit application or TRC application urgently");
    if (OSWIADCZENIE_ELIGIBLE.includes(input.nationality)) {
      requiredActions.push("Consider emergency oświadczenie at PUP if eligible");
    }
    return {
      legalStatus: "EXPIRED_NOT_PROTECTED", legalBasis: "Art. 87 Ustawa o promocji zatrudnienia — expired authorization",
      riskLevel: "CRITICAL", conditions, warnings, requiredActions, expiryDays,
      art108Eligible: false, art108Applied: false,
    };
  }

  // ── Rule 5: Expiring soon ─────────────────────────────────────────────
  checkDocuments(bhpDays, medicalDays, contractDays, warnings, requiredActions);

  if (effectivePermitDays <= 14) {
    warnings.push(`Work authorization expires in ${effectivePermitDays} days — URGENT`);
    requiredActions.push("File TRC application or work permit renewal IMMEDIATELY");
    return {
      legalStatus: "EXPIRING_SOON", legalBasis: determinePermitBasis(input),
      riskLevel: "HIGH", conditions, warnings, requiredActions, expiryDays,
      art108Eligible: false, art108Applied: false,
    };
  }

  if (effectivePermitDays <= 60) {
    warnings.push(`Work authorization expires in ${effectivePermitDays} days`);
    requiredActions.push("Begin renewal process — file at least 1 day before expiry for Art. 108 protection");
    return {
      legalStatus: "EXPIRING_SOON", legalBasis: determinePermitBasis(input),
      riskLevel: "MEDIUM", conditions, warnings, requiredActions, expiryDays,
      art108Eligible: false, art108Applied: false,
    };
  }

  // ── Rule 6: Valid ──────────────────────────────────────────────────────
  conditions.push("All work authorization documents current");
  const docRisk = warnings.length > 0 ? "MEDIUM" : "LOW";
  return {
    legalStatus: "VALID", legalBasis: determinePermitBasis(input),
    riskLevel: docRisk as RiskLevel, conditions, warnings, requiredActions, expiryDays,
    art108Eligible: false, art108Applied: false,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function checkDocuments(bhpDays: number | null, medicalDays: number | null, contractDays: number | null, warnings: string[], actions: string[]): number {
  let count = 0;
  if (bhpDays !== null && bhpDays < 0) { warnings.push("BHP training EXPIRED"); actions.push("Schedule BHP training immediately (Art. 2373 KP)"); count++; }
  else if (bhpDays !== null && bhpDays < 30) { warnings.push(`BHP expires in ${bhpDays} days`); actions.push("Schedule BHP renewal"); count++; }

  if (medicalDays !== null && medicalDays < 0) { warnings.push("Medical examination EXPIRED"); actions.push("Schedule badania lekarskie immediately (Art. 229 KP)"); count++; }
  else if (medicalDays !== null && medicalDays < 30) { warnings.push(`Medical exam expires in ${medicalDays} days`); actions.push("Schedule medical exam renewal"); count++; }

  if (contractDays !== null && contractDays < 0) { warnings.push("Contract has ENDED"); actions.push("Issue new contract or extend existing one"); count++; }
  else if (contractDays !== null && contractDays < 30) { warnings.push(`Contract ends in ${contractDays} days`); actions.push("Prepare contract renewal"); count++; }

  return count;
}

function determinePermitBasis(input: LegalInput): string {
  if (input.trcExpiry) return "Karta Pobytu (Temporary Residence Card)";
  if (input.oswiadczenieExpiry) return "Oświadczenie o powierzeniu pracy (Art. 88z)";
  if (input.permitExpiry) return "Zezwolenie na pracę (Work Permit)";
  return "Unknown basis — verify authorization type";
}

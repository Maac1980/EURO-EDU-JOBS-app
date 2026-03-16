import type { AirtableRecord } from "./airtable.js";

export interface Attachment {
  id: string;
  url: string;
  filename: string;
  size?: number | null;
  type?: string | null;
}

export interface Worker {
  id: string;
  name: string;
  specialization: string;
  trcExpiry: string | null;
  workPermitExpiry: string | null;
  bhpStatus: string | null;
  contractEndDate: string | null;
  email: string | null;
  phone: string | null;
  complianceStatus: "critical" | "warning" | "compliant" | "non-compliant";
  daysUntilNextExpiry: number | null;
  passportAttachments: Attachment[];
  contractAttachments: Attachment[];
  yearsOfExperience: string | null;
  highestQualification: string | null;
  siteLocation: string | null;
  totalHours: number | null;
  hourlyNettoRate: number | null;
  advancePayment: number | null;
  penalties: number | null;
  // ── Polish legal compliance fields ──────────────────────────────────────
  badaniaLekExpiry: string | null;       // Badania Lekarskie (medical exam) expiry
  oswiadczenieExpiry: string | null;     // Oświadczenie o Powierzeniu Pracy expiry
  iso9606Process: string | null;         // EN ISO 9606 welding process (MIG/MAG/TIG/MMA/FCAW)
  iso9606Material: string | null;        // Material group (e.g. FM1, FM4)
  iso9606Thickness: string | null;       // Thickness range (e.g. 3-12mm)
  iso9606Position: string | null;        // Welding position (PA/PB/PC/PF)
  pesel: string | null;                  // Polish national ID
  nip: string | null;                    // Tax ID
  zusStatus: string | null;             // ZUS registration (Registered/Unregistered/Unknown)
  udtCertExpiry: string | null;          // UDT technical inspection cert expiry
  visaType: string | null;              // Visa/residence type
  rodoConsentDate: string | null;        // RODO/GDPR consent date
  // ── New fields ───────────────────────────────────────────────────────────
  iban: string | null;                   // Bank account (IBAN) for payroll
  contractType: string | null;           // umowa o pracę / zlecenie / dzieło / B2B
  nationality: string | null;            // Country of origin
  pipelineStage: string | null;          // New / Screening / Interview / Offer Sent / Placed / Active / Released / Blacklisted
}

function getString(val: unknown): string | null {
  if (typeof val === "string" && val.trim() !== "") return val.trim();
  return null;
}

function getNumber(val: unknown): number | null {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return null;
}

function getDate(val: unknown): string | null {
  if (typeof val === "string" && val.trim() !== "") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return null;
}

function getAttachments(val: unknown): Attachment[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
    .map((a) => ({
      id: String(a.id ?? ""),
      url: String(a.url ?? ""),
      filename: String(a.filename ?? "Attachment"),
      size: typeof a.size === "number" ? a.size : null,
      type: typeof a.type === "string" ? a.type : null,
    }))
    .filter((a) => a.id && a.url);
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const expiry = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function computeStatus(worker: Partial<Worker>): {
  status: "critical" | "warning" | "compliant" | "non-compliant";
  daysUntilNextExpiry: number | null;
} {
  const bhp = worker.bhpStatus?.toLowerCase();

  // Non-compliant if BHP is expired
  if (bhp === "expired") {
    return { status: "non-compliant", daysUntilNextExpiry: null };
  }

  const expiryDays = [
    daysUntil(worker.trcExpiry ?? null),
    daysUntil(worker.workPermitExpiry ?? null),
    daysUntil(worker.contractEndDate ?? null),
    daysUntil(worker.badaniaLekExpiry ?? null),
    daysUntil(worker.oswiadczenieExpiry ?? null),
    daysUntil(worker.udtCertExpiry ?? null),
  ].filter((d): d is number => d !== null);

  if (expiryDays.length === 0) {
    return { status: "compliant", daysUntilNextExpiry: null };
  }

  const minDays = Math.min(...expiryDays);

  // Already expired
  if (minDays < 0) {
    return { status: "non-compliant", daysUntilNextExpiry: minDays };
  }

  if (minDays < 30) {
    return { status: "critical", daysUntilNextExpiry: minDays };
  }

  if (minDays < 60) {
    return { status: "warning", daysUntilNextExpiry: minDays };
  }

  return { status: "compliant", daysUntilNextExpiry: minDays };
}

// Flexible field mapping — tries multiple common field name patterns
function resolveField(
  fields: Record<string, unknown>,
  candidates: string[]
): unknown {
  for (const key of candidates) {
    if (key in fields) return fields[key];
    // Case-insensitive match
    const lower = key.toLowerCase();
    const match = Object.keys(fields).find((k) => k.toLowerCase() === lower);
    if (match) return fields[match];
  }
  return undefined;
}

export function mapRecordToWorker(record: AirtableRecord): Worker {
  const f = record.fields;

  const name = getString(
    resolveField(f, ["Name", "Full Name", "Worker Name", "Welder Name", "Employee Name"])
  ) ?? "Unknown";

  const specialization = getString(
    resolveField(f, ["Job Role", "JobRole", "JOB ROLE", "Specialization", "Type", "Welding Type", "Skill", "Role"])
  ) ?? "";

  const trcExpiry = getDate(
    resolveField(f, ["TRC Expiry", "TRC_Expiry", "TRCExpiry", "TRC Expiration", "TRC"])
  );

  const workPermitExpiry = getDate(
    resolveField(f, [
      "Work Permit Expiry",
      "Work_Permit_Expiry",
      "WorkPermitExpiry",
      "Work Permit",
      "Permit Expiry",
      "Permit Expiration",
      "PASSPORT",
      "Passport",
      "WORK PERMIT",
    ])
  );

  const bhpStatus = getString(
    resolveField(f, ["BHP EXPIRY", "BHP Expiry", "BHP_Expiry", "BHPExpiry", "BHP Status", "BHP_Status", "BHPStatus", "BHP", "Safety Status"])
  );

  const contractEndDate = getDate(
    resolveField(f, [
      "Contract End Date",
      "Contract_End_Date",
      "ContractEndDate",
      "Contract End",
      "Contract Expiry",
      "Contract",
    ])
  );

  const email = getString(
    resolveField(f, ["Email", "Email Address", "Contact Email", "Work Email"])
  );

  const phone = getString(
    resolveField(f, ["Phone", "Phone Number", "Mobile", "Contact Number"])
  );

  const passportAttachments = getAttachments(
    resolveField(f, ["Passport", "Passport Attachment", "Passport Document"])
  );

  const contractAttachments = getAttachments(
    resolveField(f, ["Contract", "Contract Attachment", "Contract Document", "Contract File"])
  );

  const yearsOfExperience = getString(
    resolveField(f, ["Experience", "EXPERIENCE", "Years of Experience", "YearsOfExperience", "Years Experience"])
  );

  const highestQualification = getString(
    resolveField(f, ["Qualification", "QUALIFICATION", "Highest Qualification", "HighestQualification", "Education"])
  );

  const siteLocation = getString(
    resolveField(f, ["Assigned Site", "ASSIGNED SITE", "AssignedSite", "Site Location", "Assigned To", "SiteLocation", "AssignedTo", "Site", "Location"])
  );

  const totalHours = getNumber(
    resolveField(f, ["TOTAL HOURS", "Total Hours", "TotalHours", "Hours Worked", "Hours"])
  );

  const hourlyNettoRate = getNumber(
    resolveField(f, ["HOURLY NETTO RATE", "Hourly Netto Rate", "Hourly Rate", "HourlyNettoRate", "Rate"])
  );

  const advancePayment = getNumber(
    resolveField(f, ["ADVANCE PAYMENT", "Advance Payment", "AdvancePayment", "Zaliczka", "Advance"])
  );
  const penalties = getNumber(
    resolveField(f, ["PENALTIES", "Penalties", "Kary", "Deductions"])
  );

  // ── New Polish legal compliance fields ────────────────────────────────────
  const badaniaLekExpiry = getDate(
    resolveField(f, ["BADANIA LEKARSKIE", "Badania Lekarskie", "BadaniaLek", "Medical Exam Expiry", "Badania"])
  );

  const oswiadczenieExpiry = getDate(
    resolveField(f, ["OSWIADCZENIE EXPIRY", "Oswiadczenie Expiry", "Oswiadczenie", "Work Declaration Expiry"])
  );

  const iso9606Process = getString(
    resolveField(f, ["ISO9606 PROCESS", "Iso9606 Process", "Welding Process", "ISO Process"])
  );

  const iso9606Material = getString(
    resolveField(f, ["ISO9606 MATERIAL", "Iso9606 Material", "Welding Material", "ISO Material"])
  );

  const iso9606Thickness = getString(
    resolveField(f, ["ISO9606 THICKNESS", "Iso9606 Thickness", "Welding Thickness", "ISO Thickness"])
  );

  const iso9606Position = getString(
    resolveField(f, ["ISO9606 POSITION", "Iso9606 Position", "Welding Position", "ISO Position"])
  );

  const pesel = getString(
    resolveField(f, ["PESEL", "Pesel"])
  );

  const nip = getString(
    resolveField(f, ["NIP", "Nip", "Tax ID", "TaxID"])
  );

  const zusStatus = getString(
    resolveField(f, ["ZUS STATUS", "Zus Status", "ZusStatus", "ZUS"])
  );

  const udtCertExpiry = getDate(
    resolveField(f, ["UDT CERT EXPIRY", "Udt Cert Expiry", "UDT Expiry", "UDT"])
  );

  const visaType = getString(
    resolveField(f, ["VISA TYPE", "Visa Type", "VisaType", "Visa", "Residence Type"])
  );

  const rodoConsentDate = getDate(
    resolveField(f, ["RODO CONSENT", "Rodo Consent", "RODO", "GDPR Consent", "Consent Date"])
  );

  const iban = getString(
    resolveField(f, ["IBAN", "Bank Account", "BankAccount", "Account Number", "IBAN Number"])
  );

  const contractType = getString(
    resolveField(f, ["CONTRACT TYPE", "Contract Type", "ContractType", "Umowa", "Employment Type"])
  );

  const nationality = getString(
    resolveField(f, ["NATIONALITY", "Nationality", "Country", "Country of Origin", "Obywatelstwo"])
  );

  const pipelineStage = getString(
    resolveField(f, ["PIPELINE STAGE", "Pipeline Stage", "PipelineStage", "Stage", "Status Stage", "Recruitment Stage"])
  );

  const partial: Partial<Worker> = {
    trcExpiry,
    workPermitExpiry,
    bhpStatus,
    contractEndDate,
    badaniaLekExpiry,
    oswiadczenieExpiry,
    udtCertExpiry,
  };

  const { status: complianceStatus, daysUntilNextExpiry } = computeStatus(partial);

  return {
    id: record.id,
    name,
    specialization,
    trcExpiry,
    workPermitExpiry,
    bhpStatus,
    contractEndDate,
    email,
    phone,
    complianceStatus,
    daysUntilNextExpiry,
    passportAttachments,
    contractAttachments,
    yearsOfExperience,
    highestQualification,
    siteLocation,
    hourlyNettoRate,
    advancePayment,
    penalties,
    totalHours,
    badaniaLekExpiry,
    oswiadczenieExpiry,
    iso9606Process,
    iso9606Material,
    iso9606Thickness,
    iso9606Position,
    pesel,
    nip,
    zusStatus,
    udtCertExpiry,
    visaType,
    rodoConsentDate,
    iban,
    contractType,
    nationality,
    pipelineStage,
  };
}

export function filterWorkers(
  workers: Worker[],
  search?: string,
  specialization?: string,
  status?: string
): Worker[] {
  return workers.filter((w) => {
    if (search && !w.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (specialization && specialization !== "all" && w.specialization !== specialization) return false;
    if (status && status !== "all" && w.complianceStatus !== status) return false;
    return true;
  });
}

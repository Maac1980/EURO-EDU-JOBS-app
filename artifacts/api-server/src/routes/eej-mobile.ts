import { Router } from "express";
import { fetchAllRecords, createRecord, updateRecord } from "../lib/airtable.js";
import { mapRecordToWorker, type Worker } from "../lib/compliance.js";
import { isMockMode } from "../lib/mockData.js";

const router = Router();

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const expiry = new Date(dateStr);
  if (isNaN(expiry.getTime())) return null;
  const now = new Date();
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function nationalityToFlag(nationality: string | null): string {
  if (!nationality) return "🌍";
  const n = nationality.toLowerCase();
  const map: Record<string, string> = {
    ukraine: "🇺🇦", ukrainian: "🇺🇦",
    poland: "🇵🇱", polish: "🇵🇱",
    georgia: "🇬🇪", georgian: "🇬🇪",
    moldova: "🇲🇩", moldovan: "🇲🇩",
    belarus: "🇧🇾", belarusian: "🇧🇾",
    russia: "🇷🇺", russian: "🇷🇺",
    uzbekistan: "🇺🇿", uzbek: "🇺🇿",
    kazakhstan: "🇰🇿", kazakh: "🇰🇿",
    romania: "🇷🇴", romanian: "🇷🇴",
    bulgaria: "🇧🇬", bulgarian: "🇧🇬",
    vietnam: "🇻🇳", vietnamese: "🇻🇳",
    nepal: "🇳🇵", nepali: "🇳🇵",
    india: "🇮🇳", indian: "🇮🇳",
    philippines: "🇵🇭", filipino: "🇵🇭",
    pakistan: "🇵🇰", pakistani: "🇵🇰",
    turkey: "🇹🇷", turkish: "🇹🇷",
    egypt: "🇪🇬", egyptian: "🇪🇬",
    germany: "🇩🇪", german: "🇩🇪",
    france: "🇫🇷", french: "🇫🇷",
    italy: "🇮🇹", italian: "🇮🇹",
    spain: "🇪🇸", spanish: "🇪🇸",
    czech: "🇨🇿", slovakia: "🇸🇰", slovak: "🇸🇰",
    hungary: "🇭🇺", hungarian: "🇭🇺",
    morocco: "🇲🇦", moroccan: "🇲🇦",
    saudi: "🇸🇦",
    jordan: "🇯🇴", jordanian: "🇯🇴",
    syria: "🇸🇾", syrian: "🇸🇾",
    iraq: "🇮🇶", iraqi: "🇮🇶",
    ethiopia: "🇪🇹", ethiopian: "🇪🇹",
    nigeria: "🇳🇬", nigerian: "🇳🇬",
  };
  for (const [key, flag] of Object.entries(map)) {
    if (n.includes(key)) return flag;
  }
  return "🌍";
}

function workerToCandidate(worker: Worker) {
  const statusMap = {
    critical:        { status: "expiring" as const, label: "Expiring Soon" },
    warning:         { status: "expiring" as const, label: "Review Needed" },
    compliant:       { status: "cleared"  as const, label: "Documents Cleared" },
    "non-compliant": { status: "missing"  as const, label: "Docs Missing" },
  };
  const mapped = statusMap[worker.complianceStatus] ?? { status: "pending" as const, label: "In Progress" };

  const bhpDate =
    worker.bhpStatus && /^\d{4}-\d{2}-\d{2}/.test(worker.bhpStatus)
      ? worker.bhpStatus
      : null;

  const docFields: Array<{ name: string; expiry: string | null }> = [
    { name: "TRC Residence Card",  expiry: worker.trcExpiry },
    { name: "Work Permit",         expiry: worker.workPermitExpiry },
    { name: "BHP Certificate",     expiry: bhpDate },
    { name: "Medical Certificate", expiry: worker.badaniaLekExpiry },
    { name: "Work Declaration",    expiry: worker.oswiadczenieExpiry },
    { name: "UDT Certificate",     expiry: worker.udtCertExpiry },
    { name: "Employment Contract", expiry: worker.contractEndDate },
  ];

  const documents = docFields
    .filter((d) => d.expiry !== null)
    .map((d) => {
      const days = daysUntil(d.expiry);
      let docStatus: "approved" | "pending" | "rejected" | "not_uploaded" = "approved";
      if (days !== null) {
        if (days < 0) docStatus = "rejected";
        else if (days < 30) docStatus = "pending";
      }
      return {
        id: d.name.toLowerCase().replace(/\s+/g, "_"),
        name: d.name,
        status: docStatus,
        uploadedAt: undefined as string | undefined,
        expiresAt: d.expiry ?? undefined,
      };
    });

  if (worker.passportAttachments.length > 0) {
    documents.push({
      id: "passport",
      name: "Passport",
      status: "approved" as const,
      uploadedAt: undefined,
      expiresAt: undefined,
    });
  }

  const visaDays = daysUntil(worker.trcExpiry) ?? daysUntil(worker.workPermitExpiry);

  return {
    id: worker.id,
    name: worker.name,
    role: worker.specialization || "Worker",
    location: worker.siteLocation || "Poland",
    status: mapped.status,
    statusLabel: mapped.label,
    flag: nationalityToFlag(worker.nationality),
    nationality: worker.nationality ?? "",
    phone: worker.phone ?? "",
    email: worker.email ?? "",
    visaDaysLeft: visaDays !== null ? visaDays : undefined,
    documents,
    siteLocation: worker.siteLocation ?? undefined,
    contractType: worker.contractType ?? undefined,
    contractEndDate: worker.contractEndDate ?? undefined,
    pipelineStage: worker.pipelineStage ?? undefined,
    yearsOfExperience: worker.yearsOfExperience ?? undefined,
    visaType: worker.visaType ?? undefined,
    pesel: worker.pesel ?? undefined,
    nip: worker.nip ?? undefined,
    iban: worker.iban ?? undefined,
    rodoConsentDate: worker.rodoConsentDate ?? undefined,
    trcExpiry: worker.trcExpiry ?? undefined,
    workPermitExpiry: worker.workPermitExpiry ?? undefined,
    bhpExpiry: bhpDate ?? undefined,
    badaniaLekExpiry: worker.badaniaLekExpiry ?? undefined,
    oswiadczenieExpiry: worker.oswiadczenieExpiry ?? undefined,
    udtCertExpiry: worker.udtCertExpiry ?? undefined,
    hourlyNettoRate: worker.hourlyNettoRate ?? undefined,
    totalHours: worker.totalHours ?? undefined,
    advancePayment: worker.advancePayment ?? undefined,
    zusStatus: worker.zusStatus ?? undefined,
  };
}

// GET /api/eej/candidates — all Airtable workers as Candidate objects
router.get("/eej/candidates", async (_req, res) => {
  try {
    if (isMockMode()) {
      return res.json({ candidates: [], source: "mock-disabled" });
    }
    const records = await fetchAllRecords();
    const workers = records
      .map(mapRecordToWorker)
      .filter((w) => w.name && w.name !== "Unknown" && w.name.trim() !== "");
    const candidates = workers.map(workerToCandidate);
    return res.json({ candidates, total: candidates.length });
  } catch (err) {
    console.error("[eej/candidates] GET error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load candidates" });
  }
});

// POST /api/eej/candidates — create new worker in Airtable
// Field names must match the JOB AGENCY table exactly (all-caps, confirmed via meta API)
router.post("/eej/candidates", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "Name is required." });

    // Only include fields that actually exist in the Airtable JOB AGENCY table.
    // Field names verified via meta API — all are UPPERCASE.
    const fields: Record<string, unknown> = { NAME: name };

    // singleLineText fields
    if (body.role)      fields["JOB ROLE"]      = body.role;
    if (body.pesel)     fields["PESEL"]          = body.pesel;
    if (body.nip)       fields["NIP"]            = body.nip;
    if (body.visaType)  fields["VISA TYPE"]      = body.visaType;
    if (body.zusStatus) fields["ZUS STATUS"]     = body.zusStatus;

    // email / phone fields
    if (body.email)  fields["EMAIL"]  = body.email;
    if (body.phone)  fields["PHONE"]  = body.phone;

    // ASSIGNED SITE — prefers siteLocation (company name), falls back to location (city)
    const assignedSite = body.siteLocation || body.location;
    if (assignedSite) fields["ASSIGNED SITE"] = assignedSite;

    // date fields (Airtable requires ISO 8601 date strings: YYYY-MM-DD)
    if (body.trcExpiry)           fields["TRC"]                = body.trcExpiry;
    if (body.workPermitExpiry)    fields["PASSPORT"]           = body.workPermitExpiry;
    if (body.contractEndDate)     fields["CONTRACT END DATE"]  = body.contractEndDate;
    if (body.badaniaLekExpiry)    fields["BADANIA LEKARSKIE"]  = body.badaniaLekExpiry;
    if (body.oswiadczenieExpiry)  fields["OSWIADCZENIE EXPIRY"] = body.oswiadczenieExpiry;
    if (body.udtCertExpiry)       fields["UDT CERT EXPIRY"]   = body.udtCertExpiry;
    if (body.rodoConsentDate)     fields["RODO CONSENT"]       = body.rodoConsentDate;

    // number fields
    if (body.hourlyNettoRate != null && body.hourlyNettoRate !== "") {
      fields["HOURLY NETTO RATE"] = Number(body.hourlyNettoRate);
    }

    console.log("[eej/candidates] POST — sending to Airtable:", JSON.stringify(fields));

    const record = await createRecord(fields);
    const worker = mapRecordToWorker(record);
    const candidate = workerToCandidate(worker);
    return res.status(201).json({ candidate });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[eej/candidates] POST error:", msg);
    return res.status(500).json({ error: msg });
  }
});

// PATCH /api/eej/candidates/:id — update a candidate record in Airtable
router.patch("/eej/candidates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const fields: Record<string, unknown> = {};

    // Use exact UPPERCASE Airtable field names (verified via meta API)
    if (body.phone)               fields["PHONE"]               = body.phone;
    if (body.email)               fields["EMAIL"]               = body.email;
    if (body.siteLocation)        fields["ASSIGNED SITE"]       = body.siteLocation;
    if (body.trcExpiry)           fields["TRC"]                 = body.trcExpiry;
    if (body.workPermitExpiry)    fields["PASSPORT"]            = body.workPermitExpiry;
    if (body.contractEndDate)     fields["CONTRACT END DATE"]   = body.contractEndDate;
    if (body.badaniaLekExpiry)    fields["BADANIA LEKARSKIE"]   = body.badaniaLekExpiry;
    if (body.oswiadczenieExpiry)  fields["OSWIADCZENIE EXPIRY"] = body.oswiadczenieExpiry;
    if (body.udtCertExpiry)       fields["UDT CERT EXPIRY"]    = body.udtCertExpiry;
    if (body.visaType)            fields["VISA TYPE"]           = body.visaType;
    if (body.zusStatus)           fields["ZUS STATUS"]          = body.zusStatus;
    if (body.pesel)               fields["PESEL"]               = body.pesel;
    if (body.nip)                 fields["NIP"]                 = body.nip;
    if (body.hourlyNettoRate != null && body.hourlyNettoRate !== "") {
      fields["HOURLY NETTO RATE"] = Number(body.hourlyNettoRate);
    }

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: "No updatable fields provided." });
    }

    console.log(`[eej/candidates] PATCH ${id} — sending to Airtable:`, JSON.stringify(fields));

    const record = await updateRecord(id, fields);
    const worker = mapRecordToWorker(record);
    const candidate = workerToCandidate(worker);
    return res.json({ candidate });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[eej/candidates] PATCH error:", msg);
    return res.status(500).json({ error: msg });
  }
});

export default router;

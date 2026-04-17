import { Router } from "express";
import { db, schema } from "../db/index.js";
import { and, eq } from "drizzle-orm";
import { toWorker, type Worker } from "../lib/compliance.js";
import { authenticateToken } from "../lib/authMiddleware.js";
import { requireTenant } from "../lib/tenancy.js";
import { validatePesel, validateNip, validateIban, validateEmail, safeError } from "../lib/security.js";
import { encryptIfPresent, decrypt, maskSensitive } from "../lib/encryption.js";

const PRIVILEGED_MOBILE_ROLES = new Set(["admin", "executive", "legal", "T1", "T2"]);
function canSeeFullMobilePII(role: string | undefined): boolean {
  return !!role && PRIVILEGED_MOBILE_ROLES.has(role);
}

const router = Router();

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const expiry = new Date(dateStr);
  if (isNaN(expiry.getTime())) return null;
  return Math.ceil((expiry.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
}

function nationalityToFlag(nationality: string | null): string {
  if (!nationality) return "";
  const n = nationality.toLowerCase();
  const map: Record<string, string> = {
    ukraine: "UA", polish: "PL", georgia: "GE", moldova: "MD", india: "IN",
    nepal: "NP", pakistan: "PK", philippines: "PH", romania: "RO", germany: "DE",
  };
  for (const [key, code] of Object.entries(map)) {
    if (n.includes(key)) return code;
  }
  return "";
}

function workerToCandidate(worker: Worker, viewerRole?: string) {
  const full = canSeeFullMobilePII(viewerRole);
  const peselView = worker.pesel ? (full ? decrypt(worker.pesel) : maskSensitive(worker.pesel)) : undefined;
  const ibanView = worker.iban ? (full ? decrypt(worker.iban) : maskSensitive(worker.iban)) : undefined;
  const statusMap = {
    critical: { status: "expiring" as const, label: "Expiring Soon" },
    warning: { status: "expiring" as const, label: "Review Needed" },
    compliant: { status: "cleared" as const, label: "Documents Cleared" },
    "non-compliant": { status: "missing" as const, label: "Docs Missing" },
  };
  const mapped = statusMap[worker.complianceStatus] ?? { status: "pending" as const, label: "In Progress" };
  const bhpDate = worker.bhpStatus && /^\d{4}-\d{2}-\d{2}/.test(worker.bhpStatus) ? worker.bhpStatus : null;

  const docFields: Array<{ name: string; expiry: string | null }> = [
    { name: "TRC Residence Card", expiry: worker.trcExpiry },
    { name: "Work Permit", expiry: worker.workPermitExpiry },
    { name: "BHP Certificate", expiry: bhpDate },
    { name: "Medical Certificate", expiry: worker.badaniaLekExpiry },
    { name: "Work Declaration", expiry: worker.oswiadczenieExpiry },
    { name: "UDT Certificate", expiry: worker.udtCertExpiry },
    { name: "Employment Contract", expiry: worker.contractEndDate },
  ];

  const documents = docFields.filter(d => d.expiry !== null).map(d => {
    const days = daysUntil(d.expiry);
    let docStatus: "approved" | "pending" | "rejected" | "not_uploaded" = "approved";
    if (days !== null) {
      if (days < 0) docStatus = "rejected";
      else if (days < 30) docStatus = "pending";
    }
    return { id: d.name.toLowerCase().replace(/\s+/g, "_"), name: d.name, status: docStatus, expiresAt: d.expiry ?? undefined };
  });

  const visaDays = daysUntil(worker.trcExpiry) ?? daysUntil(worker.workPermitExpiry);
  return {
    id: worker.id, name: worker.name, role: worker.jobRole || "Worker",
    location: worker.assignedSite || "Poland", status: mapped.status, statusLabel: mapped.label,
    flag: nationalityToFlag(worker.nationality), nationality: worker.nationality ?? "",
    phone: worker.phone ?? "", email: worker.email ?? "", visaDaysLeft: visaDays ?? undefined,
    documents, siteLocation: worker.assignedSite ?? undefined,
    contractType: worker.contractType ?? undefined, contractEndDate: worker.contractEndDate ?? undefined,
    pipelineStage: worker.pipelineStage ?? undefined, yearsOfExperience: worker.experience ?? undefined,
    visaType: worker.visaType ?? undefined, pesel: peselView ?? undefined, nip: worker.nip ?? undefined,
    iban: ibanView ?? undefined, rodoConsentDate: worker.rodoConsentDate ?? undefined,
    trcExpiry: worker.trcExpiry ?? undefined, workPermitExpiry: worker.workPermitExpiry ?? undefined,
    bhpExpiry: bhpDate ?? undefined, badaniaLekExpiry: worker.badaniaLekExpiry ?? undefined,
    oswiadczenieExpiry: worker.oswiadczenieExpiry ?? undefined, udtCertExpiry: worker.udtCertExpiry ?? undefined,
    hourlyNettoRate: worker.hourlyNettoRate ?? undefined, totalHours: worker.totalHours ?? undefined,
    advancePayment: worker.advancePayment ?? undefined, zusStatus: worker.zusStatus ?? undefined,
  };
}

router.get("/eej/candidates", authenticateToken, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const rows = await db.select().from(schema.workers).where(eq(schema.workers.tenantId, tenantId));
    const workers = rows.filter(w => w.name && w.name.trim() !== "").map(r => toWorker(r));
    const role = req.user?.role;
    return res.json({ candidates: workers.map(w => workerToCandidate(w, role)), total: workers.length });
  } catch (err) {
    return safeError(res, err);
  }
});

router.post("/eej/candidates", authenticateToken, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "Name is required." });

    // Input validation
    const peselCheck = validatePesel(body.pesel as string);
    if (!peselCheck.valid) return res.status(400).json({ error: peselCheck.error });
    const nipCheck = validateNip(body.nip as string);
    if (!nipCheck.valid) return res.status(400).json({ error: nipCheck.error });
    const emailCheck = validateEmail(body.email as string);
    if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.error });

    const tenantId = requireTenant(req);
    const fields: any = { name, tenantId };
    if (body.role) fields.jobRole = body.role;
    if (body.email) fields.email = body.email;
    if (body.phone) fields.phone = body.phone;
    if (body.siteLocation || body.location) fields.assignedSite = body.siteLocation || body.location;
    if (body.trcExpiry) fields.trcExpiry = body.trcExpiry;
    if (body.workPermitExpiry) fields.workPermitExpiry = body.workPermitExpiry;
    if (body.contractEndDate) fields.contractEndDate = body.contractEndDate;
    if (body.pesel) fields.pesel = encryptIfPresent(String(body.pesel));
    if (body.nip) fields.nip = body.nip;
    if (body.visaType) fields.visaType = body.visaType;
    if (body.zusStatus) fields.zusStatus = body.zusStatus;
    if (body.badaniaLekExpiry) fields.badaniaLekExpiry = body.badaniaLekExpiry;
    if (body.oswiadczenieExpiry) fields.oswiadczenieExpiry = body.oswiadczenieExpiry;
    if (body.udtCertExpiry) fields.udtCertExpiry = body.udtCertExpiry;
    if (body.rodoConsentDate) fields.rodoConsentDate = body.rodoConsentDate;
    if (body.hourlyNettoRate != null) fields.hourlyNettoRate = Number(body.hourlyNettoRate);
    if (body.iban) fields.iban = encryptIfPresent(String(body.iban).toUpperCase());

    const [record] = await db.insert(schema.workers).values(fields).returning();
    return res.status(201).json({ candidate: workerToCandidate(toWorker(record), req.user?.role) });
  } catch (err) {
    return safeError(res, err);
  }
});

router.patch("/eej/candidates/:id", authenticateToken, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const fields: any = { updatedAt: new Date() };
    if (body.phone) fields.phone = body.phone;
    if (body.email) fields.email = body.email;
    if (body.siteLocation) fields.assignedSite = body.siteLocation;
    if (body.trcExpiry) fields.trcExpiry = body.trcExpiry;
    if (body.workPermitExpiry) fields.workPermitExpiry = body.workPermitExpiry;
    if (body.contractEndDate) fields.contractEndDate = body.contractEndDate;
    if (body.badaniaLekExpiry) fields.badaniaLekExpiry = body.badaniaLekExpiry;
    if (body.oswiadczenieExpiry) fields.oswiadczenieExpiry = body.oswiadczenieExpiry;
    if (body.udtCertExpiry) fields.udtCertExpiry = body.udtCertExpiry;
    if (body.visaType) fields.visaType = body.visaType;
    if (body.zusStatus) fields.zusStatus = body.zusStatus;
    if (body.pesel) fields.pesel = encryptIfPresent(String(body.pesel));
    if (body.nip) fields.nip = body.nip;
    if (body.iban) fields.iban = encryptIfPresent(String(body.iban).toUpperCase());
    if (body.hourlyNettoRate != null) fields.hourlyNettoRate = Number(body.hourlyNettoRate);
    if (Object.keys(fields).length <= 1) return res.status(400).json({ error: "No updatable fields." });

    const tenantId = requireTenant(req);
    const [record] = await db.update(schema.workers).set(fields).where(
      and(eq(schema.workers.id, String(req.params.id)), eq(schema.workers.tenantId, tenantId))
    ).returning();
    if (!record) return res.status(404).json({ error: "Worker not found." });
    return res.json({ candidate: workerToCandidate(toWorker(record), req.user?.role) });
  } catch (err) {
    return safeError(res, err);
  }
});

export default router;

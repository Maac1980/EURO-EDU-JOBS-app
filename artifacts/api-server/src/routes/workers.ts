import { Router, type IRouter } from "express";
import multer from "multer";
import { analyzeImage, analyzeText } from "../lib/ai.js";
import { db, schema } from "../db/index.js";
import { eq, sql, ilike, and, desc } from "drizzle-orm";
import { appendAuditEntry } from "./audit.js";
import { toWorker, filterWorkers, type Worker } from "../lib/compliance.js";
import { authenticateToken, requireAdmin, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";
import { requireTenant } from "../lib/tenancy.js";
import { encryptIfPresent, projectWorkerPII } from "../lib/encryption.js";

const VALID_PLACEMENT_TYPES = new Set(["agency_leased", "direct_outsourcing"]);
function validatePlacementType(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const v = String(value);
  if (!VALID_PLACEMENT_TYPES.has(v)) return "__invalid__";
  return v;
}

interface ScannedPassport {
  type: "passport";
  name: string | null;
  dateOfBirth: string | null;
  passportExpiry: string | null;
  passportNumber: string | null;
  nationality: string | null;
}

interface ScannedContract {
  type: "contract";
  contractEndDate: string | null;
  workerName: string | null;
}

interface ScannedCV {
  type: "cv";
  yearsOfExperience: string | null;
  highestQualification: string | null;
}

type ScannedData = ScannedPassport | ScannedContract | ScannedCV;

async function scanDocument(fileBuffer: Buffer, mimeType: string, docType: "passport" | "contract"): Promise<ScannedData | null> {
  const imageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!imageTypes.includes(mimeType)) return null;
  try {
    const base64 = fileBuffer.toString("base64");
    const prompt = docType === "passport"
      ? `Extract data from this passport. Return ONLY valid JSON:\n{"name":"full name","dateOfBirth":"YYYY-MM-DD or null","passportExpiry":"YYYY-MM-DD or null","passportNumber":"number or null","nationality":"nationality or null"}`
      : `Extract data from this employment contract. Return ONLY valid JSON:\n{"contractEndDate":"YYYY-MM-DD or null","workerName":"full name or null"}`;
    const result = await analyzeImage(base64, mimeType, prompt);
    if (!result) return null;
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return docType === "passport" ? { type: "passport", ...parsed } : { type: "contract", ...parsed };
  } catch (e) {
    console.error("[scanDocument] AI error:", e);
    return null;
  }
}

async function scanCV(fileBuffer: Buffer, mimeType: string): Promise<ScannedCV | null> {
  const imageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!imageTypes.includes(mimeType)) return null;
  try {
    const base64 = fileBuffer.toString("base64");
    const result = await analyzeImage(base64, mimeType, `Analyze this CV/Resume. Return ONLY valid JSON:\n{"yearsOfExperience":"string or null","highestQualification":"string or null"}`);
    if (!result) return null;
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return { type: "cv", yearsOfExperience: parsed.yearsOfExperience ?? null, highestQualification: parsed.highestQualification ?? null };
  } catch (e) {
    console.error("[scanCV] AI error:", e);
    return null;
  }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router: IRouter = Router();

// POST /apply — Public candidate application (website integration)
// Rate limited: 5 requests per hour per IP to prevent spam
import { applyLimiter } from "../lib/security.js";
router.post("/apply", applyLimiter, upload.fields([
  { name: "cv", maxCount: 1 },
  { name: "documents", maxCount: 5 },
]), async (req, res) => {
  try {
    const { name, email, phone, nationality, jobType, jobId } = req.body as Record<string, string>;
    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({ error: "Name and Email are required." });
    }

    // Build worker fields
    const fields: any = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      pipelineStage: "New",
    };
    if (phone?.trim()) fields.phone = phone.trim();
    if (nationality?.trim()) fields.nationality = nationality.trim();
    if (jobType?.trim()) fields.jobRole = jobType.trim();

    const placementTypeRaw = (req.body as Record<string, unknown>).placementType;
    const placementType = validatePlacementType(placementTypeRaw);
    if (placementType === "__invalid__") {
      return res.status(400).json({ error: "Invalid placementType. Must be 'agency_leased' or 'direct_outsourcing'." });
    }
    if (placementType) fields.placementType = placementType;

    // AI scan CV if provided
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const cvFile = files?.cv?.[0];
    if (cvFile) {
      try {
        const cvScan = await scanCV(cvFile.buffer, cvFile.mimetype);
        if (cvScan) {
          if (cvScan.yearsOfExperience) fields.experience = cvScan.yearsOfExperience;
          if (cvScan.highestQualification) fields.qualification = cvScan.highestQualification;
        }
      } catch (scanErr) {
        console.warn("[apply] CV scan failed (non-fatal):", scanErr);
      }
    }

    // Insert worker
    const [newWorker] = await db.insert(schema.workers).values(fields).returning();

    // Upload CV to R2 storage
    if (cvFile) {
      try {
        const { uploadFile, isStorageConfigured } = await import("../lib/storage.js");
        if (isStorageConfigured()) {
          const key = `applications/${newWorker.id}/cv-${Date.now()}-${cvFile.originalname}`;
          await uploadFile(key, cvFile.buffer, cvFile.mimetype);
          await db.insert(schema.fileAttachments).values({
            workerId: newWorker.id,
            fieldName: "cv",
            filename: cvFile.originalname,
            mimeType: cvFile.mimetype,
            size: cvFile.size,
            storageKey: key,
          });
        }
      } catch (uploadErr) {
        console.warn("[apply] CV upload to R2 failed (non-fatal):", uploadErr);
      }
    }

    // Upload additional documents to R2
    const docFiles = files?.documents ?? [];
    for (const doc of docFiles) {
      try {
        const { uploadFile, isStorageConfigured } = await import("../lib/storage.js");
        if (isStorageConfigured()) {
          const key = `applications/${newWorker.id}/doc-${Date.now()}-${doc.originalname}`;
          await uploadFile(key, doc.buffer, doc.mimetype);
          await db.insert(schema.fileAttachments).values({
            workerId: newWorker.id,
            fieldName: "other",
            filename: doc.originalname,
            mimeType: doc.mimetype,
            size: doc.size,
            storageKey: key,
          });
        }
      } catch (uploadErr) {
        console.warn("[apply] Document upload to R2 failed (non-fatal):", uploadErr);
      }
    }

    // Create job application if jobId provided
    if (jobId) {
      try {
        await db.insert(schema.jobApplications).values({
          jobId,
          workerId: newWorker.id,
          stage: "New",
          matchScore: "0",
          matchReasons: [],
        });
      } catch (appErr) {
        console.warn("[apply] Job application creation failed (non-fatal):", appErr);
      }
    }

    // Log notification for dashboard bell
    const { appendNotification } = await import("../lib/notificationLog.js");
    appendNotification(
      newWorker.id,
      name.trim(),
      "application",
      `New application from ${name.trim()} (${email.trim()}) — ${jobType ?? "General"} role`,
      "website"
    );

    // Send confirmation email to candidate
    try {
      const { sendEmail } = await import("../lib/alerter.js");
      const fromAddr = process.env.SMTP_FROM ?? process.env.BREVO_SMTP_USER ?? "noreply@euro-edu-jobs.eu";
      await sendEmail({
        from: fromAddr,
        to: email.trim(),
        subject: "Application Received — Euro Edu Jobs",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#1B2A4A;padding:24px;text-align:center">
              <h1 style="color:#FFD600;margin:0;font-size:24px">Euro Edu Jobs</h1>
            </div>
            <div style="padding:24px;background:#ffffff">
              <h2 style="color:#1B2A4A">Thank you, ${name.trim()}!</h2>
              <p>We have received your application${jobType ? ` for the <strong>${jobType}</strong> position` : ""}.</p>
              <p>Our team will review your profile and documents. You will hear from us within 3-5 business days.</p>
              <p style="color:#6B7280;font-size:13px">If you have any questions, reply to this email or contact us at <a href="mailto:anna.b@edu-jobs.eu">anna.b@edu-jobs.eu</a></p>
            </div>
            <div style="background:#F3F4F6;padding:16px;text-align:center;font-size:12px;color:#9CA3AF">
              Euro Edu Jobs Sp. z o.o. — Workforce Solutions
            </div>
          </div>
        `,
      });
    } catch (emailErr) {
      console.warn("[apply] Candidate confirmation email failed:", emailErr);
    }

    // Send notification email to admin
    try {
      const { sendEmail } = await import("../lib/alerter.js");
      const fromAddr = process.env.SMTP_FROM ?? process.env.BREVO_SMTP_USER ?? "noreply@euro-edu-jobs.eu";
      const adminEmail = process.env.ALERT_EMAIL_TO ?? "anna.b@edu-jobs.eu";
      await sendEmail({
        from: fromAddr,
        to: adminEmail,
        subject: `New Application: ${name.trim()} — ${jobType ?? "General"}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#1B2A4A;padding:24px">
              <h1 style="color:#FFD600;margin:0;font-size:20px">New Application Received</h1>
            </div>
            <div style="padding:24px;background:#ffffff">
              <table style="width:100%;font-size:14px;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#6B7280;width:120px">Name:</td><td style="padding:8px 0;font-weight:bold">${name.trim()}</td></tr>
                <tr><td style="padding:8px 0;color:#6B7280">Email:</td><td style="padding:8px 0">${email.trim()}</td></tr>
                ${phone ? `<tr><td style="padding:8px 0;color:#6B7280">Phone:</td><td style="padding:8px 0">${phone.trim()}</td></tr>` : ""}
                ${nationality ? `<tr><td style="padding:8px 0;color:#6B7280">Nationality:</td><td style="padding:8px 0">${nationality.trim()}</td></tr>` : ""}
                ${jobType ? `<tr><td style="padding:8px 0;color:#6B7280">Position:</td><td style="padding:8px 0">${jobType.trim()}</td></tr>` : ""}
                <tr><td style="padding:8px 0;color:#6B7280">CV Attached:</td><td style="padding:8px 0">${cvFile ? "Yes" : "No"}</td></tr>
                <tr><td style="padding:8px 0;color:#6B7280">Documents:</td><td style="padding:8px 0">${docFiles.length} file(s)</td></tr>
              </table>
              <p style="margin-top:16px"><a href="${process.env.APP_URL ?? "https://euro-edu-jobs.com"}/eej-mobile/" style="background:#1B2A4A;color:#FFD600;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">View in Dashboard</a></p>
            </div>
          </div>
        `,
      });
    } catch (emailErr) {
      console.warn("[apply] Admin notification email failed:", emailErr);
    }

    // Push to Airtable webhook (backup)
    const webhookUrl = process.env.AIRTABLE_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            phone: phone?.trim() ?? "",
            nationality: nationality?.trim() ?? "",
            jobType: jobType?.trim() ?? "",
            workerId: newWorker.id,
            appliedAt: new Date().toISOString(),
          }),
        });
      } catch (webhookErr) {
        console.warn("[apply] Airtable webhook failed (non-fatal):", webhookErr);
      }
    }

    return res.json({ success: true, id: newWorker.id, message: "Application submitted successfully" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[apply] Error:", message);
    return res.status(500).json({ error: message });
  }
});

// POST /workers/bulk-import
router.post("/workers/bulk-import", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const rows = req.body.workers as Record<string, unknown>[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No worker rows provided." });
    }
    const results: { name: string; success: boolean; error?: string }[] = [];

    for (const row of rows) {
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!name) { results.push({ name: "(blank)", success: false, error: "Name is required" }); continue; }

      const fields: any = { name };
      if (row.specialization) fields.jobRole = row.specialization;
      if (row.email) fields.email = row.email;
      if (row.phone) fields.phone = row.phone;
      if (row.siteLocation) fields.assignedSite = row.siteLocation;
      if (row.hourlyNettoRate) fields.hourlyNettoRate = Number(row.hourlyNettoRate) || 0;
      if (row.trcExpiry) fields.trcExpiry = row.trcExpiry;
      if (row.workPermitExpiry) fields.workPermitExpiry = row.workPermitExpiry;
      if (row.contractEndDate) fields.contractEndDate = row.contractEndDate;
      if (row.bhpStatus) fields.bhpStatus = row.bhpStatus;
      if (row.yearsOfExperience) fields.experience = row.yearsOfExperience;
      if (row.highestQualification) fields.qualification = row.highestQualification;
      if (row.nationality) fields.nationality = row.nationality;
      if (row.contractType) fields.contractType = row.contractType;
      if (row.iban) fields.iban = String(row.iban).toUpperCase();
      if (row.pesel) fields.pesel = row.pesel;
      if (row.nip) fields.nip = row.nip;
      if (row.visaType) fields.visaType = row.visaType;
      if (row.badaniaLekExpiry) fields.badaniaLekExpiry = row.badaniaLekExpiry;
      if (row.pipelineStage) fields.pipelineStage = row.pipelineStage;

      try {
        const [rec] = await db.insert(schema.workers).values(fields).returning();
        appendAuditEntry({ workerId: rec.id, actor: req.user?.email ?? "admin", field: "ALL", newValue: fields, action: "create" });
        results.push({ name, success: true });
      } catch (e) {
        results.push({ name, success: false, error: e instanceof Error ? e.message : "Unknown error" });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    return res.status(200).json({ succeeded, failed, results });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to bulk import." });
  }
});

// POST /workers — create a new worker
router.post("/workers", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "Worker name is required." });

    const tenantId = requireTenant(req);
    const fields: any = { name, tenantId };
    if (body.specialization) fields.jobRole = body.specialization;
    if (body.email) fields.email = body.email;
    if (body.phone) fields.phone = body.phone;
    if (body.siteLocation) fields.assignedSite = body.siteLocation;
    if (body.hourlyNettoRate) fields.hourlyNettoRate = Number(body.hourlyNettoRate);
    if (body.trcExpiry) fields.trcExpiry = body.trcExpiry;
    if (body.workPermitExpiry) fields.workPermitExpiry = body.workPermitExpiry;
    if (body.contractEndDate) fields.contractEndDate = body.contractEndDate;
    if (body.iban) fields.iban = encryptIfPresent(String(body.iban).toUpperCase());
    if (body.nationality) fields.nationality = body.nationality;
    if (body.visaType) fields.visaType = body.visaType;
    if (body.pesel) fields.pesel = encryptIfPresent(String(body.pesel));
    if (body.bhpExpiry) fields.bhpStatus = body.bhpExpiry;
    if (body.medicalExpiry) fields.badaniaLekExpiry = body.medicalExpiry;
    if (body.pipelineStage) fields.pipelineStage = body.pipelineStage;

    const adminPlacementType = validatePlacementType(body.placementType);
    if (adminPlacementType === "__invalid__") {
      return res.status(400).json({ error: "Invalid placementType. Must be 'agency_leased' or 'direct_outsourcing'." });
    }
    if (adminPlacementType) fields.placementType = adminPlacementType;

    const [newRecord] = await db.insert(schema.workers).values(fields).returning();
    const worker = projectWorkerPII(toWorker(newRecord), req.user?.role);
    appendAuditEntry({ workerId: newRecord.id, actor: req.user?.email ?? "admin", field: "ALL", newValue: { ...fields, pesel: fields.pesel ? "[encrypted]" : undefined, iban: fields.iban ? "[encrypted]" : undefined }, action: "create" });
    appendAuditEntry({
      workerId: newRecord.id,
      actor: req.user?.email ?? "admin",
      field: "PLACEMENT_TYPE",
      oldValue: null,
      newValue: newRecord.placementType,
      action: "create",
    });
    return res.status(201).json({ worker });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create worker." });
  }
});

// GET /workers
router.get("/workers", authenticateToken, async (req, res) => {
  try {
    const { search, specialization, status } = req.query as Record<string, string>;
    const tenantId = requireTenant(req);
    const rows = await db.select().from(schema.workers)
      .where(eq(schema.workers.tenantId, tenantId))
      .orderBy(schema.workers.name);
    let allWorkers = rows.filter(w => w.name && w.name.trim() !== "").map(r => toWorker(r));

    let filtered = filterWorkers(allWorkers, search, specialization, status);

    // Managers scoped to their assigned site
    if (req.user?.role === "manager" && req.user.site) {
      const managerSite = req.user.site.toLowerCase();
      filtered = filtered.filter(w => w.assignedSite?.toLowerCase() === managerSite);
    }

    // T23 — nationality_scope filter. When caller's JWT carries
    // nationalityScope (set on system_users for specific liaison roles, e.g.,
    // Yana's "Ukrainian" scope), restrict listing to that nationality.
    // Absent/NULL on JWT = no scope filter (default: see all nationalities).
    const scope = req.user?.nationalityScope;
    if (scope) {
      filtered = filtered.filter(w => w.nationality === scope);
    }

    // Pagination (offset/limit) — default cap 100, max 500
    const total = filtered.length;
    const offset = Math.max(parseInt((req.query as any).offset ?? "0", 10) || 0, 0);
    const rawLimit = parseInt((req.query as any).limit ?? "100", 10);
    const limit = Math.min(isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit, 500);
    const paginated = filtered.slice(offset, offset + limit).map(w => projectWorkerPII(w, req.user?.role));

    res.json({ workers: paginated, total, offset, limit });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// GET /workers/stats
router.get("/workers/stats", authenticateToken, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const rows = await db.select().from(schema.workers).where(eq(schema.workers.tenantId, tenantId));
    const workers = rows.map(r => toWorker(r));
    res.json({
      total: workers.length,
      critical: workers.filter(w => w.complianceStatus === "critical").length,
      warning: workers.filter(w => w.complianceStatus === "warning").length,
      compliant: workers.filter(w => w.complianceStatus === "compliant").length,
      nonCompliant: workers.filter(w => w.complianceStatus === "non-compliant").length,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// GET /workers/report
router.get("/workers/report", authenticateToken, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const rows = await db.select().from(schema.workers).where(eq(schema.workers.tenantId, tenantId));
    const workers = rows.map(r => toWorker(r));
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    interface ExpiringDocument {
      workerId: string;
      workerName: string;
      specialization: string;
      documentType: string;
      expiryDate: string;
      daysUntilExpiry: number;
      status: string;
    }

    function checkDoc(worker: Worker, docType: string, expiry: string | null): ExpiringDocument | null {
      if (!expiry) return null;
      const expiryDate = new Date(expiry);
      const days = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        workerId: worker.id,
        workerName: worker.name,
        specialization: worker.jobRole ?? "",
        documentType: docType,
        expiryDate: expiry,
        daysUntilExpiry: days,
        status: days < 0 ? "expired" : days < 30 ? "critical" : days < 60 ? "warning" : "safe",
      };
    }

    const allExpiring: ExpiringDocument[] = [];
    for (const w of workers) {
      const docs = [
        checkDoc(w, "TRC", w.trcExpiry),
        checkDoc(w, "Work Permit", w.workPermitExpiry),
        checkDoc(w, "Contract", w.contractEndDate),
      ];
      for (const doc of docs) {
        if (doc && doc.daysUntilExpiry < 60) allExpiring.push(doc);
      }
    }

    const expiringThisWeek = allExpiring.filter(d => {
      const expiryDate = new Date(d.expiryDate);
      return expiryDate >= now && expiryDate <= oneWeekFromNow;
    });
    const critical = allExpiring.filter(d => d.status === "critical" || d.status === "expired");
    const warning = allExpiring.filter(d => d.status === "warning");

    res.json({
      generatedAt: now.toISOString(),
      totalWorkers: workers.length,
      expiringThisWeek,
      critical,
      warning,
      summary: `As of ${now.toLocaleDateString()}, ${workers.length} workers. ${critical.length} critical, ${warning.length} warning, ${expiringThisWeek.length} expiring this week.`,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// GET /workers/:id
router.get("/workers/:id", authenticateToken, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const [row] = await db.select().from(schema.workers).where(
      and(eq(schema.workers.id, String(req.params.id)), eq(schema.workers.tenantId, tenantId))
    );
    if (!row) return res.status(404).json({ error: "Worker not found" });
    return res.json(projectWorkerPII(toWorker(row), req.user?.role));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// GET /workers/:id/cockpit — Unified worker view
// One call returns worker + adjacent state so the mobile app can render the
// full worker page without sequential fetches. Tenant-scoped. PII masked per
// viewer role. Built as a read-aggregator on top of existing modules — no new
// tables, no schema changes.
router.get("/workers/:id/cockpit", authenticateToken, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const workerId = String(req.params.id);

    // 1. Worker row (foundational — return 404 if not in this tenant)
    const [workerRow] = await db.select().from(schema.workers).where(
      and(eq(schema.workers.id, workerId), eq(schema.workers.tenantId, tenantId))
    );
    if (!workerRow) return res.status(404).json({ error: "Worker not found" });

    const worker = projectWorkerPII(toWorker(workerRow), req.user?.role);

    // 2. Latest TRC case (Liza's domain) + doc completion counts.
    // worker_id is nullable on trc_cases; cases without a worker won't appear here.
    const trcResult = await db.execute(sql`
      SELECT c.*,
        (SELECT COUNT(*)::int FROM trc_documents d WHERE d.case_id = c.id) AS total_documents,
        (SELECT COUNT(*)::int FROM trc_documents d WHERE d.case_id = c.id AND d.is_uploaded = true) AS uploaded_documents,
        (SELECT COUNT(*)::int FROM trc_documents d WHERE d.case_id = c.id AND d.is_required = true AND d.is_uploaded = false) AS missing_documents
      FROM trc_cases c
      WHERE c.worker_id = ${workerId}
      ORDER BY c.created_at DESC
      LIMIT 1
    `);
    const trcCase = trcResult.rows[0] ?? null;

    // 3. Latest work permit application (Anna's domain).
    const [workPermit] = await db
      .select()
      .from(schema.workPermitApplications)
      .where(
        and(
          eq(schema.workPermitApplications.workerId, workerId),
          eq(schema.workPermitApplications.tenantId, tenantId),
        ),
      )
      .orderBy(desc(schema.workPermitApplications.createdAt))
      .limit(1);

    // 4. Documents — file_attachments is the canonical FK'd document store.
    const documents = await db
      .select()
      .from(schema.fileAttachments)
      .where(eq(schema.fileAttachments.workerId, workerId))
      .orderBy(desc(schema.fileAttachments.uploadedAt));

    // 5. Notes — worker_notes (general) + trc_case_notes (case-specific).
    const workerNotes = await db
      .select()
      .from(schema.workerNotes)
      .where(eq(schema.workerNotes.workerId, workerId))
      .orderBy(desc(schema.workerNotes.updatedAt))
      .limit(20);

    let trcNotes: Array<Record<string, unknown>> = [];
    if (trcCase) {
      const notesResult = await db.execute(sql`
        SELECT * FROM trc_case_notes WHERE case_id = ${trcCase.id as string}
        ORDER BY created_at DESC LIMIT 20
      `);
      trcNotes = notesResult.rows as Array<Record<string, unknown>>;
    }

    // 6. Recent payroll (last 6 records).
    const payroll = await db
      .select()
      .from(schema.payrollRecords)
      .where(eq(schema.payrollRecords.workerId, workerId))
      .orderBy(desc(schema.payrollRecords.createdAt))
      .limit(6);

    // 7. Recent job applications (placement signals for Karan/Marj/Yana).
    const jobApplications = await db
      .select()
      .from(schema.jobApplications)
      .where(eq(schema.jobApplications.workerId, workerId))
      .orderBy(desc(schema.jobApplications.appliedAt))
      .limit(10);

    // 8. Audit history — audit_entries.worker_id is text-typed, no FK; raw query.
    const auditResult = await db.execute(sql`
      SELECT * FROM audit_entries WHERE worker_id = ${workerId}
      ORDER BY timestamp DESC LIMIT 20
    `);

    // 8b. AI reasoning log — what the AI has decided about this worker (scans,
    // summaries, applied updates). Visible alongside audit history for Liza/Anna.
    const reasoningResult = await db.execute(sql`
      SELECT id, decision_type, input_summary, output, confidence,
             decided_action, reviewed_by, model, created_at
      FROM ai_reasoning_log
      WHERE worker_id = ${workerId}
      ORDER BY created_at DESC LIMIT 10
    `);

    // 8c. WhatsApp messages — Yana (UA-liaison) and Anna check these daily.
    // Last 10 messages either direction, tenant-scoped.
    const whatsappMessages = await db
      .select({
        id: schema.whatsappMessages.id,
        direction: schema.whatsappMessages.direction,
        status: schema.whatsappMessages.status,
        body: schema.whatsappMessages.body,
        sentAt: schema.whatsappMessages.sentAt,
        receivedAt: schema.whatsappMessages.receivedAt,
        createdAt: schema.whatsappMessages.createdAt,
        twilioMessageSid: schema.whatsappMessages.twilioMessageSid,
      })
      .from(schema.whatsappMessages)
      .where(
        and(
          eq(schema.whatsappMessages.workerId, workerId),
          eq(schema.whatsappMessages.tenantId, tenantId),
        ),
      )
      .orderBy(desc(schema.whatsappMessages.createdAt))
      .limit(10);

    // 9. Compute alerts from expiry dates + missing-doc counts.
    const alerts: Array<{ level: "red" | "amber"; field: string; message: string; date?: string }> = [];
    const today = new Date();
    const checkExpiry = (field: string, dateStr: string | null | undefined, label: string) => {
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;
      const daysLeft = Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
      if (daysLeft < 0) {
        alerts.push({ level: "red", field, message: `${label} EXPIRED`, date: dateStr });
      } else if (daysLeft <= 30) {
        alerts.push({ level: "red", field, message: `${label} expires in ${daysLeft}d`, date: dateStr });
      } else if (daysLeft <= 60) {
        alerts.push({ level: "amber", field, message: `${label} expires in ${daysLeft}d`, date: dateStr });
      }
    };
    checkExpiry("trcExpiry", workerRow.trcExpiry, "TRC");
    checkExpiry("workPermitExpiry", workerRow.workPermitExpiry, "Work permit");
    checkExpiry("badaniaLekExpiry", workerRow.badaniaLekExpiry, "Medical exam");
    checkExpiry("oswiadczenieExpiry", workerRow.oswiadczenieExpiry, "Oświadczenie");
    checkExpiry("udtCertExpiry", workerRow.udtCertExpiry, "UDT cert");
    checkExpiry("contractEndDate", workerRow.contractEndDate, "Contract");

    if (trcCase && Number(trcCase.missing_documents) > 0) {
      alerts.push({
        level: "amber",
        field: "trcDocuments",
        message: `${trcCase.missing_documents} TRC document(s) missing`,
      });
    }

    return res.json({
      worker,
      trcCase,
      workPermit: workPermit ?? null,
      documents,
      notes: { worker: workerNotes, trc: trcNotes },
      payroll,
      jobApplications,
      auditHistory: auditResult.rows,
      aiReasoning: reasoningResult.rows,
      whatsappMessages,
      alerts,
      meta: {
        generatedAt: new Date().toISOString(),
        viewerRole: req.user?.role,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to load cockpit data",
    });
  }
});

// GET /workers/:id/ai-summary — AI-generated 3-sentence summary tuned to the
// viewer's role. Legal viewer hears about TRC/compliance first; executive
// hears about revenue/contracts; operations hears about placement/contact.
// Returns 503 if ANTHROPIC_API_KEY is unset — UI shows a graceful fallback.
router.get("/workers/:id/ai-summary", authenticateToken, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const workerId = String(req.params.id);
    const viewerRole = req.user?.role;

    const [workerRow] = await db
      .select()
      .from(schema.workers)
      .where(and(eq(schema.workers.id, workerId), eq(schema.workers.tenantId, tenantId)));
    if (!workerRow) return res.status(404).json({ error: "Worker not found" });

    // Pull the minimum slice that informs the summary — TRC case if any,
    // permit if any. The rest is on workerRow itself.
    const trcResult = await db.execute(sql`
      SELECT status, permit_type, voivodeship, application_date, appointment_date, renewal_deadline,
        (SELECT COUNT(*)::int FROM trc_documents d
          WHERE d.case_id = c.id AND d.is_required = true AND d.is_uploaded = false) AS missing_documents
      FROM trc_cases c
      WHERE c.worker_id = ${workerId}
      ORDER BY c.created_at DESC LIMIT 1
    `);
    const trcCase = trcResult.rows[0] ?? null;

    const [workPermit] = await db
      .select({
        permitType: schema.workPermitApplications.permitType,
        status: schema.workPermitApplications.status,
        submittedAt: schema.workPermitApplications.submittedAt,
        decisionDate: schema.workPermitApplications.decisionDate,
        expiryDate: schema.workPermitApplications.expiryDate,
      })
      .from(schema.workPermitApplications)
      .where(
        and(
          eq(schema.workPermitApplications.workerId, workerId),
          eq(schema.workPermitApplications.tenantId, tenantId),
        ),
      )
      .orderBy(desc(schema.workPermitApplications.createdAt))
      .limit(1);

    const today = new Date().toISOString().split("T")[0];
    const context = {
      today,
      worker: {
        name: workerRow.name,
        nationality: workerRow.nationality,
        jobRole: workerRow.jobRole,
        assignedSite: workerRow.assignedSite,
        voivodeship: workerRow.voivodeship,
        pipelineStage: workerRow.pipelineStage,
        contractType: workerRow.contractType,
        contractEndDate: workerRow.contractEndDate,
        trcExpiry: workerRow.trcExpiry,
        workPermitExpiry: workerRow.workPermitExpiry,
        badaniaLekExpiry: workerRow.badaniaLekExpiry,
        oswiadczenieExpiry: workerRow.oswiadczenieExpiry,
        udtCertExpiry: workerRow.udtCertExpiry,
        bhpStatus: workerRow.bhpStatus,
        zusStatus: workerRow.zusStatus,
        visaType: workerRow.visaType,
      },
      trc: trcCase,
      workPermit: workPermit ?? null,
    };

    // Role-tuned system prompts. AI now returns JSON with a 3-sentence summary
    // PLUS a structured list of suggested actions. Each action is a single
    // concrete next-step the viewer can take with one tap in the cockpit:
    // scan_document (renewal), send_whatsapp (reminder), open_trc / open_permit
    // / open_payroll (deep-link), add_note (reminder to self), or none
    // (informational only). The frontend renders these as tappable buttons.
    //
    // This is the "AI as writer / orchestrator" pattern: Liza opens a worker,
    // sees not just "TRC expires in 7 days" but a concrete "Scan the renewal
    // document" button that opens the right flow. The lawyer becomes the
    // editor, not the typist.
    const ACTION_TYPES = "scan_document | send_whatsapp | open_trc | open_permit | open_payroll | add_note | none";
    const TEMPLATE_NAMES = [
      "trc_expiry_reminder_pl",
      "trc_expiry_reminder_en",
      "documents_missing_pl",
      "documents_missing_en",
      "application_received",
      "permit_status_update",
      "payment_reminder",
    ].join(" | ");
    const baseFormat =
      ` Return ONLY valid JSON, no preamble or markdown, in this exact shape:
{
  "summary": "three short sentences, action-oriented, written in plain English",
  "actions": [
    {
      "label": "human-readable button text (4-6 words)",
      "actionType": "${ACTION_TYPES}",
      "priority": "high | med | low",
      "reasoning": "one short sentence — why this action, why now",
      "templateHint": "optional — only when actionType is send_whatsapp, suggest one of: ${TEMPLATE_NAMES}. Prefer the _pl variant for Ukrainian/Polish workers (most workers speak Polish); _en for others. Omit the field if no good match."
    }
  ]
}

Max 3 actions. Order from highest priority first. If nothing urgent applies, return an empty actions array. Use the provided 'today' date to reason about expiries.`;

    const systemPrompts: Record<string, string> = {
      legal:
        "You are advising a Polish immigration lawyer on a foreign worker's case. " +
        "Lead with the most legally-pressing item (TRC expiry, missing TRC documents, " +
        "appointment dates, work-permit renewal). Prefer suggested actions of type " +
        "scan_document (when a renewal document is needed), send_whatsapp (when the " +
        "worker needs to submit something), or open_trc (deep-edit the case)." +
        baseFormat,
      executive:
        "You are advising the staffing-agency executive on a worker's status. Lead " +
        "with what affects revenue or risk: contract end date, ZUS status, expensive " +
        "expiries, placement state. Prefer suggested actions of type open_payroll, " +
        "open_permit, or add_note (decision reminders for yourself)." +
        baseFormat,
      operations:
        "You are advising the recruitment-operations lead on a worker. Lead with " +
        "placement readiness, site assignment, contact recency, document completeness " +
        "for deployment. Prefer suggested actions of type send_whatsapp (chase the " +
        "worker), scan_document (when a doc is missing), or add_note (followup)." +
        baseFormat,
      candidate:
        "You are summarising the worker's own status for themselves. Lead with what " +
        "they need to do or know next (documents to provide, dates to remember). " +
        "Actions should mostly be 'none' (informational) since workers can't trigger " +
        "internal flows; suggest scan_document only if they can upload it themselves." +
        baseFormat,
    };
    const systemPrompt = systemPrompts[viewerRole ?? "operations"] ?? systemPrompts.operations;

    const raw = await analyzeText(
      `Worker situation as of ${today}:\n\n${JSON.stringify(context, null, 2)}`,
      systemPrompt,
    );

    if (!raw) {
      return res.status(503).json({
        error: "AI summary unavailable. Verify ANTHROPIC_API_KEY is set.",
      });
    }

    // Defensive parse — Claude usually returns clean JSON but tolerate
    // surrounding prose by finding the first {...} block.
    let parsed: { summary?: string; actions?: unknown[] } = {};
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch {
      // Fall back to plain-text summary, no actions.
      parsed = { summary: raw.trim(), actions: [] };
    }
    const summary = (parsed.summary ?? raw).trim();
    const validActionTypes = new Set([
      "scan_document", "send_whatsapp", "open_trc", "open_permit", "open_payroll", "add_note", "none",
    ]);
    const validPriorities = new Set(["high", "med", "low"]);
    const actions = Array.isArray(parsed.actions)
      ? (parsed.actions as Array<Record<string, unknown>>)
          .filter((a) =>
            typeof a === "object" &&
            a !== null &&
            typeof a.label === "string" &&
            typeof a.actionType === "string" &&
            validActionTypes.has(a.actionType),
          )
          .map((a) => ({
            label: String(a.label),
            actionType: String(a.actionType),
            priority: validPriorities.has(String(a.priority)) ? String(a.priority) : "med",
            reasoning: typeof a.reasoning === "string" ? a.reasoning : null,
            // templateHint only carried when actionType === 'send_whatsapp';
            // any value here is best-effort, the cockpit verifies that the
            // suggested name exists in the active templates list before pre-
            // selecting it.
            templateHint:
              a.actionType === "send_whatsapp" && typeof a.templateHint === "string"
                ? a.templateHint
                : null,
          }))
          .slice(0, 3)
      : [];

    // Log the reasoning for provenance — Liza can later trace why AI suggested
    // a particular action via the AI history panel / AiAuditTab.
    try {
      await db.insert(schema.aiReasoningLog).values({
        decisionType: "ai_summary",
        workerId,
        inputSummary: `ai-summary for role=${viewerRole}`,
        inputHash: null,
        output: { summary, actions } as Record<string, unknown>,
        confidence: null,
        decidedAction: "applied",
        reviewedBy: req.user?.email ?? null,
        model: "claude-sonnet-4-6",
        tenantId,
      });
    } catch {
      // Logging is non-critical; never fail the request if reasoning insert fails.
    }

    return res.json({
      summary,
      actions,
      generatedAt: new Date().toISOString(),
      viewerRole,
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to generate AI summary",
    });
  }
});

// ── Document scanning loop — AI as ambient layer ─────────────────────────────
// POST /workers/scan-document
//   Upload a document image. Claude vision identifies the doc type and
//   extracts the entities. Backend then fuzzy-matches against existing
//   workers in the tenant and returns top candidates with confidence.
//   Does NOT mutate state — pure read + AI. The caller decides what to do.
//
// POST /workers/scan-document/apply
//   Caller posts the extracted entities + target workerId (or null = create).
//   Backend updates the worker (or creates one) and writes a reasoning log
//   entry. State changes here, audit + reasoning log entries written.
//
// This pair is the "scan a doc, system updates itself" loop from the
// audit conversation. Two-step (scan + apply) so the human stays in the
// loop on identity resolution — AI suggests, human confirms.

interface ScannedEntities {
  docType: "passport" | "trc" | "work_permit" | "bhp" | "contract" | "cv" | "medical" | "other";
  personName: string | null;
  documentNumber: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  expiryDate: string | null;
  issueDate: string | null;
  issuingAuthority: string | null;
  additionalFields: Record<string, string | null>;
  rawText: string | null;
  confidence: number;
}

/**
 * P5 backend-widen: route uploads through normalizeForClaudeVision so the
 * file picker's HEIC / PDF / DOCX / GIF support is end-to-end. JPEG/PNG/
 * WebP/GIF pass through as image; HEIC is decoded to JPEG; PDF and DOCX
 * become text blocks the model reads alongside the prompt.
 *
 * FriendlyError from the normalizer propagates up to the route handler,
 * which maps it via mapErrorToFriendlyResponse so the frontend gets a
 * shaped {error, code, userMessage} body with the right HTTP status.
 * Scanned image-only PDFs hit PDF_SCAN_NOT_SUPPORTED — a 415 with a
 * "re-upload as photo" message, the path chat-Claude flagged.
 */
async function extractEntitiesFromDocument(
  fileBuffer: Buffer,
  mimeType: string,
  fileName?: string,
): Promise<ScannedEntities | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const { normalizeForClaudeVision } = await import("../services/document-format.js");
  const { anthropic } = await import("../lib/ai.js");

  const base64 = fileBuffer.toString("base64");
  const normalized = await normalizeForClaudeVision(base64, mimeType, fileName);
  const items = Array.isArray(normalized) ? normalized : [normalized];

  const prompt = `Analyse this document. Return ONLY valid JSON in this exact shape:
{
  "docType": "passport" | "trc" | "work_permit" | "bhp" | "contract" | "cv" | "medical" | "other",
  "personName": "full name as written on document, or null",
  "documentNumber": "passport/permit/cert number, or null",
  "dateOfBirth": "YYYY-MM-DD or null",
  "nationality": "nationality / country, or null",
  "expiryDate": "YYYY-MM-DD or null",
  "issueDate": "YYYY-MM-DD or null",
  "issuingAuthority": "issuing body name or null",
  "additionalFields": { "any_other_relevant_field": "value" },
  "rawText": "first 500 chars of text you can read, or null",
  "confidence": 0.0 to 1.0
}

Polish-specific document types:
- "trc" = Karta Pobytu (Temporary Residence Card)
- "work_permit" = Zezwolenie na pracę (Type A/B/C)
- "bhp" = BHP / Badania lekarskie (safety / medical certificate)
- "oswiadczenie" → use "work_permit"

If the document type is unclear, use "other" and put your best guess in additionalFields.documentTypeGuess.
Return ONLY the JSON object, no preamble.`;

  // Build content blocks the same way smart-document.ts does — image blocks
  // for visual inputs, text blocks for normalized PDF/DOCX text.
  const contentBlocks: Array<Record<string, unknown>> = items.map((n) =>
    n.kind === "image"
      ? { type: "image", source: { type: "base64", media_type: n.mediaType, data: n.base64 } }
      : { type: "text", text: `[Document content${n.pageCount ? ` — ${n.pageCount} page(s)` : ""}, source: ${n.sourceFormat}]\n\n${n.text}` },
  );
  contentBlocks.push({ type: "text", text: prompt });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [{ role: "user", content: contentBlocks as any }],
    });
    const textBlock = response.content.find((b: any) => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "{}";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as ScannedEntities;
  } catch (err) {
    // Re-throw so the route can map via mapErrorToFriendlyResponse instead
    // of swallowing the failure as "null entities."
    throw err;
  }
}

// Score how well a worker matches the extracted entities. 0-1, where >0.7 is
// "very likely" and >0.4 is "possibly". Boost on exact passport number, name
// similarity, and nationality alignment.
function scoreWorkerMatch(
  worker: typeof schema.workers.$inferSelect,
  entities: ScannedEntities,
): number {
  let score = 0;
  let signals = 0;

  if (entities.personName && worker.name) {
    const a = entities.personName.toLowerCase().trim();
    const b = worker.name.toLowerCase().trim();
    if (a === b) {
      score += 1.0;
    } else if (a.includes(b) || b.includes(a)) {
      score += 0.7;
    } else {
      // Token overlap — splits both names and counts shared tokens.
      const at = new Set(a.split(/\s+/));
      const bt = new Set(b.split(/\s+/));
      const overlap = [...at].filter((x) => bt.has(x)).length;
      const denom = Math.max(at.size, bt.size);
      if (denom > 0) score += (overlap / denom) * 0.6;
    }
    signals += 1;
  }

  if (entities.nationality && worker.nationality) {
    if (entities.nationality.toLowerCase().includes(worker.nationality.toLowerCase()) ||
        worker.nationality.toLowerCase().includes(entities.nationality.toLowerCase())) {
      score += 0.3;
    }
    signals += 1;
  }

  // Document-number match against worker.pesel or worker fields — if exact,
  // very strong signal.
  if (entities.documentNumber) {
    const num = entities.documentNumber.toLowerCase().replace(/\s/g, "");
    if (worker.pesel && worker.pesel.toLowerCase().replace(/\s/g, "") === num) {
      score += 1.5;
      signals += 1;
    }
  }

  // Normalise: divide by the max possible score given how many signals were
  // available. Keeps "name + nationality + number all match" at ~1.0 and
  // "only name matches" at ~0.5.
  return signals > 0 ? Math.min(1.0, score / Math.max(1, signals)) : 0;
}

const scanUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post(
  "/workers/scan-document",
  authenticateToken,
  requireCoordinatorOrAdmin,
  scanUpload.single("file"),
  async (req, res) => {
    try {
      const tenantId = requireTenant(req);
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded (field name 'file')." });

      const entities = await extractEntitiesFromDocument(file.buffer, file.mimetype, file.originalname);
      if (!entities) {
        return res.status(422).json({
          error: "Could not extract entities from this document.",
          code: "EXTRACTION_EMPTY",
          userMessage: "We couldn't read this document. Verify the file is clear, or contact support if it keeps happening.",
        });
      }

      // Score every worker in this tenant. For small tenants this is fine;
      // for larger ones we'd add an indexed pre-filter on name similarity.
      const workers = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.tenantId, tenantId));

      const scored = workers
        .map((w) => ({ worker: w, score: scoreWorkerMatch(w, entities) }))
        .filter((s) => s.score > 0.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ worker, score }) => ({
          id: worker.id,
          name: worker.name,
          nationality: worker.nationality,
          jobRole: worker.jobRole,
          pipelineStage: worker.pipelineStage,
          score: Math.round(score * 1000) / 1000,
        }));

      // Log the extraction reasoning even though no state changed yet —
      // gives Liza a paper trail of what the AI saw before she acted on it.
      const { createHash } = await import("crypto");
      const inputHash = createHash("sha256")
        .update(file.buffer)
        .digest("hex");
      await db.insert(schema.aiReasoningLog).values({
        decisionType: "document_extraction",
        workerId: null,
        inputSummary: `${file.originalname ?? "upload"} (${file.mimetype}, ${file.size}B)`,
        inputHash,
        output: {
          entities,
          topMatches: scored,
        } as Record<string, unknown>,
        confidence: entities.confidence.toFixed(3),
        decidedAction: "pending_review",
        reviewedBy: req.user?.email ?? null,
        model: "claude-sonnet-4-6",
        tenantId,
      });

      return res.json({
        entities,
        matches: scored,
        inputHash,
        meta: { extractedAt: new Date().toISOString() },
      });
    } catch (err) {
      // P5 backend-widen — map FriendlyError (and Anthropic SDK errors) to a
      // shaped {error, code, userMessage} body so the mobile UI can render
      // the friendly text instead of "Document scan failed".
      const { mapErrorToFriendlyResponse } = await import("../services/document-format.js");
      const mapped = mapErrorToFriendlyResponse(err);
      return res.status(mapped.httpStatus).json(mapped.body);
    }
  },
);

// Map extracted entities to worker fields. Conservative — only writes fields
// that the document clearly establishes, never overwrites existing non-null
// values without explicit human confirmation (apply endpoint sets
// allowOverwrite=true to opt in to overwriting).
function applyEntitiesToWorker(
  entities: ScannedEntities,
  current: Partial<typeof schema.workers.$inferInsert>,
  allowOverwrite: boolean,
): { updates: Record<string, unknown>; appliedFields: string[] } {
  const updates: Record<string, unknown> = {};
  const appliedFields: string[] = [];
  const set = (field: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    const existing = (current as Record<string, unknown>)[field];
    if (existing && existing !== "" && !allowOverwrite) return;
    updates[field] = value;
    appliedFields.push(field);
  };

  if (entities.personName) set("name", entities.personName);
  if (entities.nationality) set("nationality", entities.nationality);

  switch (entities.docType) {
    case "trc":
      if (entities.expiryDate) set("trcExpiry", entities.expiryDate);
      break;
    case "work_permit":
      if (entities.expiryDate) set("workPermitExpiry", entities.expiryDate);
      break;
    case "bhp":
      if (entities.expiryDate) set("badaniaLekExpiry", entities.expiryDate);
      // bhpStatus is text — set to "valid" if we have a recent issue date.
      if (entities.issueDate) set("bhpStatus", "valid");
      break;
    case "passport":
      // No direct field; passport number could go to additionalFields review.
      break;
    case "medical":
      if (entities.expiryDate) set("badaniaLekExpiry", entities.expiryDate);
      break;
  }

  return { updates, appliedFields };
}

router.post(
  "/workers/scan-document/apply",
  authenticateToken,
  requireCoordinatorOrAdmin,
  async (req, res) => {
    try {
      const tenantId = requireTenant(req);
      const body = req.body as {
        entities: ScannedEntities;
        workerId?: string | null;
        createNew?: boolean;
        allowOverwrite?: boolean;
        inputHash?: string;
        storageKey?: string;
        filename?: string;
      };

      if (!body?.entities) return res.status(400).json({ error: "entities required" });

      let targetWorkerId: string;
      let didCreate = false;

      if (body.createNew) {
        // Auto-create a worker from the extracted entities. Bare minimum to
        // get them into the pipeline as 'New' — Karan/Marj will enrich later.
        if (!body.entities.personName) {
          return res.status(400).json({ error: "Cannot create worker: entities.personName missing." });
        }
        const [created] = await db
          .insert(schema.workers)
          .values({
            name: body.entities.personName,
            nationality: body.entities.nationality ?? undefined,
            pipelineStage: "New",
            tenantId,
          })
          .returning({ id: schema.workers.id });
        targetWorkerId = created.id;
        didCreate = true;
        appendAuditEntry({
          workerId: targetWorkerId,
          actor: req.user?.email ?? "ai-scan",
          field: "CREATED_FROM_SCAN",
          newValue: { source: body.filename ?? "document_scan" } as Record<string, unknown>,
          action: "create",
        });
      } else {
        if (!body.workerId) return res.status(400).json({ error: "workerId or createNew=true required" });
        // Verify the worker exists in this tenant.
        const [w] = await db.select({ id: schema.workers.id }).from(schema.workers).where(
          and(eq(schema.workers.id, body.workerId), eq(schema.workers.tenantId, tenantId)),
        );
        if (!w) return res.status(404).json({ error: "Worker not found in this tenant." });
        targetWorkerId = w.id;
      }

      // Load the current worker to inform conservative update logic.
      const [currentWorker] = await db.select().from(schema.workers).where(
        eq(schema.workers.id, targetWorkerId),
      );

      const { updates, appliedFields } = applyEntitiesToWorker(
        body.entities,
        currentWorker,
        body.allowOverwrite === true,
      );

      if (appliedFields.length > 0) {
        await db.update(schema.workers)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(schema.workers.id, targetWorkerId));
        appendAuditEntry({
          workerId: targetWorkerId,
          actor: req.user?.email ?? "ai-scan",
          field: appliedFields.join(", "),
          newValue: updates as Record<string, unknown>,
          action: didCreate ? "create" : "update",
        });
      }

      // Reasoning log entry — what the AI proposed, what we applied, who approved.
      await db.insert(schema.aiReasoningLog).values({
        decisionType: didCreate ? "worker_auto_create" : "field_update",
        workerId: targetWorkerId,
        inputSummary: body.filename ?? "document_scan",
        inputHash: body.inputHash ?? null,
        output: {
          entities: body.entities,
          appliedFields,
          updates,
          createdNew: didCreate,
        } as Record<string, unknown>,
        confidence: body.entities.confidence?.toFixed(3) ?? null,
        decidedAction: "applied",
        reviewedBy: req.user?.email ?? null,
        model: "claude-sonnet-4-6",
        tenantId,
      });

      return res.json({
        workerId: targetWorkerId,
        created: didCreate,
        appliedFields,
        updates,
      });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to apply scan",
      });
    }
  },
);

// PATCH /workers/:id
router.patch("/workers/:id", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const updates: any = { updatedAt: new Date() };

    // Map field names to DB columns
    const fieldMap: Record<string, string> = {
      trcExpiry: "trcExpiry", workPermitExpiry: "workPermitExpiry", bhpStatus: "bhpStatus",
      contractEndDate: "contractEndDate", email: "email", phone: "phone",
      specialization: "jobRole", yearsOfExperience: "experience", highestQualification: "qualification",
      siteLocation: "assignedSite", badaniaLekExpiry: "badaniaLekExpiry", oswiadczenieExpiry: "oswiadczenieExpiry",
      iso9606Process: "iso9606Process", iso9606Material: "iso9606Material",
      iso9606Thickness: "iso9606Thickness", iso9606Position: "iso9606Position",
      pesel: "pesel", nip: "nip", zusStatus: "zusStatus", udtCertExpiry: "udtCertExpiry",
      visaType: "visaType", rodoConsentDate: "rodoConsentDate", iban: "iban",
      contractType: "contractType", nationality: "nationality", pipelineStage: "pipelineStage",
    };

    for (const [key, dbCol] of Object.entries(fieldMap)) {
      if (body[key] !== undefined) {
        const val = body[key];
        if ((dbCol === "pesel" || dbCol === "iban") && val) {
          updates[dbCol] = encryptIfPresent(String(val));
        } else {
          updates[dbCol] = val || null;
        }
      }
    }

    let placementTypeChange: { old: string | null; new: string } | null = null;
    if (body.placementType !== undefined) {
      const newPlacement = validatePlacementType(body.placementType);
      if (newPlacement === "__invalid__") {
        return res.status(400).json({ error: "Invalid placementType. Must be 'agency_leased' or 'direct_outsourcing'." });
      }
      if (newPlacement) {
        const tenantIdForLookup = requireTenant(req);
        const [existing] = await db.select({ placementType: schema.workers.placementType }).from(schema.workers).where(
          and(eq(schema.workers.id, String(req.params.id)), eq(schema.workers.tenantId, tenantIdForLookup))
        );
        if (existing && existing.placementType !== newPlacement) {
          placementTypeChange = { old: existing.placementType, new: newPlacement };
          updates.placementType = newPlacement;
        }
      }
    }

    // Numeric fields
    for (const numField of ["hourlyNettoRate", "advancePayment", "totalHours", "penalties"]) {
      if (body[numField] !== undefined) {
        const val = Number(body[numField]);
        if (!isNaN(val) && val >= 0) updates[numField] = numField === "totalHours" ? Math.round(val * 10) / 10 : val;
      }
    }

    const tenantId = requireTenant(req);
    const [updated] = await db.update(schema.workers).set(updates).where(
      and(eq(schema.workers.id, String(req.params.id)), eq(schema.workers.tenantId, tenantId))
    ).returning();
    if (!updated) return res.status(404).json({ error: "Worker not found" });

    const auditValue = { ...updates } as Record<string, unknown>;
    if (auditValue.pesel) auditValue.pesel = "[encrypted]";
    if (auditValue.iban) auditValue.iban = "[encrypted]";
    appendAuditEntry({
      workerId: String(req.params.id),
      actor: req.user?.email ?? "admin",
      field: Object.keys(updates).filter(k => k !== "updatedAt").join(", "),
      newValue: auditValue,
      action: "update",
    });
    if (placementTypeChange) {
      appendAuditEntry({
        workerId: String(req.params.id),
        actor: req.user?.email ?? "admin",
        field: "PLACEMENT_TYPE",
        oldValue: placementTypeChange.old,
        newValue: placementTypeChange.new,
        action: "update",
      });
    }
    return res.json(projectWorkerPII(toWorker(updated), req.user?.role));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// POST /workers/:id/send-upload-link-whatsapp — PENDING-1 (May 14).
// Sends the worker their /worker/:workerId/update self-upload URL via
// WhatsApp. Liza/Karan/Marj/Yana use this when an existing worker needs
// to add or refresh missing documents — TRC scan, BHP certificate, etc.
// The /worker/:workerId/update landing page + backend + AI pipeline
// were built April 14 (commit 039adb5); this surface is the team-side
// entry point that was missing.
//
// Mirrors /portal/send-whatsapp/:recordId pattern in routes/portal.ts.
// Upload URL is currently public (no token); security tightening to a
// per-link signed token is queued as iteration item.
router.post("/workers/:id/send-upload-link-whatsapp", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return res.status(503).json({ error: "WhatsApp not configured." });
  }
  try {
    const tenantId = requireTenant(req);
    const workerId = String(req.params.id);
    const [worker] = await db.select().from(schema.workers).where(
      and(eq(schema.workers.id, workerId), eq(schema.workers.tenantId, tenantId)),
    );
    if (!worker) return res.status(404).json({ error: "Worker not found." });
    if (!worker.phone) return res.status(400).json({ error: "Worker has no phone number." });

    // Compose URL: prefer APP_URL (production), fall back to client-supplied
    // origin in body (dev/staging) so the message points at the right host.
    const origin = (req.body?.origin as string | undefined)?.replace(/\/$/, "")
                ?? (process.env.APP_URL ?? "").replace(/\/$/, "");
    if (!origin) {
      return res.status(500).json({ error: "Server has no APP_URL and no origin provided." });
    }
    const uploadUrl = `${origin}/worker/${workerId}/update`;

    // Polish-language body (Ukrainian/Polish workers are the majority per
    // STRATEGIC_RECOMMENDATIONS day-17 docs). Future: localize per worker
    // nationality once template translation is set up (FUTURE.md item).
    const { sendWhatsAppMessage } = await import("../lib/alerter.js");
    const waBody = `Cze\u015b\u0107 ${worker.name}\n\nPrze\u015blij swoje dokumenty (paszport, TRC, badania, BHP, umowa):\n${uploadUrl}\n\n\u2014 EURO EDU JOBS`;
    await sendWhatsAppMessage(worker.phone, waBody);

    appendAuditEntry({
      workerId,
      actor: req.user?.email ?? "unknown",
      field: "UPLOAD_LINK_SENT",
      newValue: { phone: worker.phone, url: uploadUrl },
      action: "SEND_WHATSAPP",
    });

    return res.json({ success: true, sentTo: worker.phone, workerName: worker.name, url: uploadUrl });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send WhatsApp" });
  }
});

// DELETE /workers/:id
router.delete("/workers/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const [deleted] = await db.delete(schema.workers).where(
      and(eq(schema.workers.id, String(req.params.id)), eq(schema.workers.tenantId, tenantId))
    ).returning();
    if (!deleted) return res.status(404).json({ error: "Worker not found" });
    appendAuditEntry({ workerId: String(req.params.id), actor: req.user?.email ?? "admin", field: "ALL", action: "delete" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// POST /workers/:id/upload — Upload document (passport/contract/cv)
router.post("/workers/:id/upload", authenticateToken, upload.single("file"), async (req, res) => {
  try {
    const id = String(req.params.id);
    const docType = req.body?.docType as string ?? "passport";

    // Verify worker exists and belongs to the acting tenant.
    const tenantId = requireTenant(req);
    const [worker] = await db.select().from(schema.workers).where(
      and(eq(schema.workers.id, id), eq(schema.workers.tenantId, tenantId))
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Store file metadata in DB (actual file storage handled by S3 layer later)
    const storageKey = `workers/${id}/${docType}/${Date.now()}_${req.file.originalname}`;
    const [attachment] = await db.insert(schema.fileAttachments).values({
      workerId: id,
      fieldName: docType,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      storageKey,
    }).returning();

    // AI scan if applicable
    let scanned: ScannedData | null = null;
    if (docType === "passport" || docType === "contract") {
      scanned = await scanDocument(req.file.buffer, req.file.mimetype, docType);
      if (scanned) {
        const autoUpdates: any = {};
        if (scanned.type === "passport") {
          if (scanned.passportExpiry) autoUpdates.workPermitExpiry = scanned.passportExpiry;
          if (scanned.nationality) autoUpdates.nationality = scanned.nationality;
        } else if (scanned.type === "contract") {
          if (scanned.contractEndDate) autoUpdates.contractEndDate = scanned.contractEndDate;
        }
        if (Object.keys(autoUpdates).length > 0) {
          await db.update(schema.workers).set({ ...autoUpdates, updatedAt: new Date() }).where(
            and(eq(schema.workers.id, id), eq(schema.workers.tenantId, tenantId))
          );
        }
      }
    } else if (docType === "cv") {
      const cvData = await scanCV(req.file.buffer, req.file.mimetype);
      if (cvData) {
        const autoUpdates: any = {};
        if (cvData.yearsOfExperience) autoUpdates.experience = cvData.yearsOfExperience;
        if (cvData.highestQualification) autoUpdates.qualification = cvData.highestQualification;
        if (Object.keys(autoUpdates).length > 0) {
          await db.update(schema.workers).set({ ...autoUpdates, updatedAt: new Date() }).where(
            and(eq(schema.workers.id, id), eq(schema.workers.tenantId, tenantId))
          );
        }
        scanned = cvData;
      }
    }

    return res.json({ attachment, scanned });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

// POST /workers/bulk-create — AI Smart Bulk Upload
const bulkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function scanBulkDocument(
  fileBuffer: Buffer, mimeType: string, category: string
): Promise<Record<string, string | null>> {
  const imageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!imageTypes.includes(mimeType)) return {};
  const prompts: Record<string, string> = {
    passport: `Extract from this passport image. Return ONLY valid JSON:\n{"name":"full name or null","dateOfBirth":"YYYY-MM-DD or null","passportExpiry":"YYYY-MM-DD or null","nationality":"nationality or null"}`,
    bhp: `Extract from this BHP/safety certificate. Return ONLY valid JSON:\n{"name":"worker full name or null","bhpExpiry":"YYYY-MM-DD or null"}`,
    certificate: `Extract from this TRC/welding certificate. Return ONLY valid JSON:\n{"name":"worker full name or null","trcExpiry":"YYYY-MM-DD or null","specialization":"welding process keyword or null"}`,
    contract: `Extract from this employment contract. Return ONLY valid JSON:\n{"name":"worker full name or null","contractEndDate":"YYYY-MM-DD or null"}`,
    cv: `Analyze this CV/Resume. Return ONLY valid JSON:\n{"name":"candidate full name or null","yearsOfExperience":"string or null","highestQualification":"string or null"}`,
  };
  try {
    const base64 = fileBuffer.toString("base64");
    const result = await analyzeImage(base64, mimeType, prompts[category] ?? prompts.cv);
    if (!result) return {};
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    return JSON.parse(jsonMatch[0]) as Record<string, string | null>;
  } catch (e) {
    console.error(`[scanBulkDocument] AI error for ${category}:`, e);
    return {};
  }
}

router.post("/workers/bulk-create", bulkUpload.fields([
  { name: "passport", maxCount: 1 },
  { name: "bhp", maxCount: 1 },
  { name: "certificate", maxCount: 1 },
  { name: "contract", maxCount: 1 },
  { name: "cv", maxCount: 1 },
]), async (req, res) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const scans = await Promise.all([
      files?.passport?.[0] ? scanBulkDocument(files.passport[0].buffer, files.passport[0].mimetype, "passport") : Promise.resolve({}),
      files?.bhp?.[0] ? scanBulkDocument(files.bhp[0].buffer, files.bhp[0].mimetype, "bhp") : Promise.resolve({}),
      files?.certificate?.[0] ? scanBulkDocument(files.certificate[0].buffer, files.certificate[0].mimetype, "certificate") : Promise.resolve({}),
      files?.contract?.[0] ? scanBulkDocument(files.contract[0].buffer, files.contract[0].mimetype, "contract") : Promise.resolve({}),
      files?.cv?.[0] ? scanBulkDocument(files.cv[0].buffer, files.cv[0].mimetype, "cv") : Promise.resolve({}),
    ]);
    const [passportData, bhpData, certData, contractData, cvData] = scans;
    const merged: Record<string, string | null> = { ...cvData, ...bhpData, ...contractData, ...certData, ...passportData };

    const fields: any = {};
    if (merged.name) fields.name = merged.name;
    if ((passportData as any).nationality) fields.nationality = (passportData as any).nationality;
    if ((passportData as any).passportExpiry) fields.workPermitExpiry = (passportData as any).passportExpiry;
    if ((certData as any).trcExpiry) fields.trcExpiry = (certData as any).trcExpiry;
    if ((bhpData as any).bhpExpiry) fields.bhpStatus = (bhpData as any).bhpExpiry;
    if ((contractData as any).contractEndDate) fields.contractEndDate = (contractData as any).contractEndDate;

    const manualProfession = typeof req.body?.profession === "string" ? req.body.profession.trim() : "";
    const aiSpec = typeof (certData as any).specialization === "string" ? (certData as any).specialization.trim() : "";
    if (manualProfession || aiSpec) fields.jobRole = manualProfession || aiSpec;
    if ((cvData as any).yearsOfExperience) fields.experience = (cvData as any).yearsOfExperience;
    if ((cvData as any).highestQualification) fields.qualification = (cvData as any).highestQualification;

    if (!fields.name) fields.name = "New Worker";

    const [newRecord] = await db.insert(schema.workers).values(fields).returning();

    // Store file attachments
    for (const [category, fieldName] of Object.entries({ passport: "passport", bhp: "bhp", certificate: "certificate", contract: "contract", cv: "cv" })) {
      const file = files?.[category]?.[0];
      if (file) {
        await db.insert(schema.fileAttachments).values({
          workerId: newRecord.id,
          fieldName,
          filename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          storageKey: `workers/${newRecord.id}/${fieldName}/${Date.now()}_${file.originalname}`,
        }).catch(e => console.warn(`[bulk-create] Attachment save failed for ${fieldName}:`, e));
      }
    }

    res.json({ worker: toWorker(newRecord), extracted: merged });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;

import { Router, type IRouter } from "express";
import multer from "multer";
import { analyzeImage } from "../lib/ai.js";
import { db, schema } from "../db/index.js";
import { eq, sql, ilike, and } from "drizzle-orm";
import { appendAuditEntry } from "./audit.js";
import { toWorker, filterWorkers, type Worker } from "../lib/compliance.js";
import { authenticateToken, requireAdmin, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";

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
router.post("/apply", upload.fields([
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
          matchScore: 0,
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

    const fields: any = { name };
    if (body.specialization) fields.jobRole = body.specialization;
    if (body.email) fields.email = body.email;
    if (body.phone) fields.phone = body.phone;
    if (body.siteLocation) fields.assignedSite = body.siteLocation;
    if (body.hourlyNettoRate) fields.hourlyNettoRate = Number(body.hourlyNettoRate);
    if (body.trcExpiry) fields.trcExpiry = body.trcExpiry;
    if (body.workPermitExpiry) fields.workPermitExpiry = body.workPermitExpiry;
    if (body.contractEndDate) fields.contractEndDate = body.contractEndDate;
    if (body.iban) fields.iban = String(body.iban).toUpperCase();
    if (body.nationality) fields.nationality = body.nationality;
    if (body.visaType) fields.visaType = body.visaType;
    if (body.pesel) fields.pesel = body.pesel;
    if (body.bhpExpiry) fields.bhpStatus = body.bhpExpiry;
    if (body.medicalExpiry) fields.badaniaLekExpiry = body.medicalExpiry;
    if (body.pipelineStage) fields.pipelineStage = body.pipelineStage;

    const [newRecord] = await db.insert(schema.workers).values(fields).returning();
    const worker = toWorker(newRecord);
    appendAuditEntry({ workerId: newRecord.id, actor: req.user?.email ?? "admin", field: "ALL", newValue: fields, action: "create" });
    return res.status(201).json({ worker });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create worker." });
  }
});

// GET /workers
router.get("/workers", authenticateToken, async (req, res) => {
  try {
    const { search, specialization, status } = req.query as Record<string, string>;
    const rows = await db.select().from(schema.workers).orderBy(schema.workers.name);
    let allWorkers = rows.filter(w => w.name && w.name.trim() !== "").map(r => toWorker(r));

    let filtered = filterWorkers(allWorkers, search, specialization, status);

    // Managers scoped to their assigned site
    if (req.user?.role === "manager" && req.user.site) {
      const managerSite = req.user.site.toLowerCase();
      filtered = filtered.filter(w => w.assignedSite?.toLowerCase() === managerSite);
    }
    res.json({ workers: filtered, total: filtered.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// GET /workers/stats
router.get("/workers/stats", async (_req, res) => {
  try {
    const rows = await db.select().from(schema.workers);
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
router.get("/workers/report", async (_req, res) => {
  try {
    const rows = await db.select().from(schema.workers);
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
router.get("/workers/:id", async (req, res) => {
  try {
    const [row] = await db.select().from(schema.workers).where(eq(schema.workers.id, String(req.params.id)));
    if (!row) return res.status(404).json({ error: "Worker not found" });
    return res.json(toWorker(row));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

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
      if (body[key] !== undefined) updates[dbCol] = body[key] || null;
    }

    // Numeric fields
    for (const numField of ["hourlyNettoRate", "advancePayment", "totalHours", "penalties"]) {
      if (body[numField] !== undefined) {
        const val = Number(body[numField]);
        if (!isNaN(val) && val >= 0) updates[numField] = numField === "totalHours" ? Math.round(val * 10) / 10 : val;
      }
    }

    const [updated] = await db.update(schema.workers).set(updates).where(eq(schema.workers.id, String(req.params.id))).returning();
    if (!updated) return res.status(404).json({ error: "Worker not found" });

    appendAuditEntry({
      workerId: String(req.params.id),
      actor: req.user?.email ?? "admin",
      field: Object.keys(updates).filter(k => k !== "updatedAt").join(", "),
      newValue: updates,
      action: "update",
    });
    return res.json(toWorker(updated));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// DELETE /workers/:id
router.delete("/workers/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [deleted] = await db.delete(schema.workers).where(eq(schema.workers.id, String(req.params.id))).returning();
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

    // Verify worker exists
    const [worker] = await db.select().from(schema.workers).where(eq(schema.workers.id, id));
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
          await db.update(schema.workers).set({ ...autoUpdates, updatedAt: new Date() }).where(eq(schema.workers.id, id));
        }
      }
    } else if (docType === "cv") {
      const cvData = await scanCV(req.file.buffer, req.file.mimetype);
      if (cvData) {
        const autoUpdates: any = {};
        if (cvData.yearsOfExperience) autoUpdates.experience = cvData.yearsOfExperience;
        if (cvData.highestQualification) autoUpdates.qualification = cvData.highestQualification;
        if (Object.keys(autoUpdates).length > 0) {
          await db.update(schema.workers).set({ ...autoUpdates, updatedAt: new Date() }).where(eq(schema.workers.id, id));
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

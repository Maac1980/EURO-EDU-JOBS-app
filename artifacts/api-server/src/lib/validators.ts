import { z } from "zod";

// ── Sanitization helpers ─────────────────────────────────────────────────────
function sanitizeString(val: string): string {
  return val.replace(/<[^>]*>/g, "").trim();
}

const safeString = z.string().transform(sanitizeString);
const safeEmail = z.string().email().transform(s => s.toLowerCase().trim());
const safePhone = z.string().transform(s => s.replace(/[^\d+\-() ]/g, "").trim());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format").optional().nullable();
const positiveNumber = z.number().min(0).optional();

// ── Auth ─────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: safeEmail,
  password: z.string().min(1, "Password is required"),
  totpToken: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

// ── Workers ──────────────────────────────────────────────────────────────────
export const createWorkerSchema = z.object({
  name: safeString.pipe(z.string().min(1, "Worker name is required")),
  email: safeEmail.optional(),
  phone: safePhone.optional(),
  specialization: safeString.optional(),
  siteLocation: safeString.optional(),
  hourlyNettoRate: positiveNumber,
  trcExpiry: isoDate,
  workPermitExpiry: isoDate,
  contractEndDate: isoDate,
  iban: safeString.optional(),
  nationality: safeString.optional(),
  pipelineStage: safeString.optional(),
});

export const updateWorkerSchema = z.object({
  trcExpiry: isoDate,
  workPermitExpiry: isoDate,
  bhpStatus: safeString.optional().nullable(),
  contractEndDate: isoDate,
  email: safeEmail.optional().nullable(),
  phone: safePhone.optional().nullable(),
  specialization: safeString.optional(),
  yearsOfExperience: safeString.optional(),
  highestQualification: safeString.optional(),
  siteLocation: safeString.optional().nullable(),
  hourlyNettoRate: positiveNumber,
  advancePayment: positiveNumber,
  totalHours: positiveNumber,
  penalties: positiveNumber,
  badaniaLekExpiry: isoDate,
  oswiadczenieExpiry: isoDate,
  iso9606Process: safeString.optional(),
  iso9606Material: safeString.optional(),
  iso9606Thickness: safeString.optional(),
  iso9606Position: safeString.optional(),
  pesel: safeString.optional(),
  nip: safeString.optional(),
  zusStatus: safeString.optional(),
  udtCertExpiry: isoDate,
  visaType: safeString.optional(),
  rodoConsentDate: isoDate,
  iban: safeString.optional(),
  contractType: safeString.optional(),
  nationality: safeString.optional(),
  pipelineStage: safeString.optional(),
}).partial();

export const applySchema = z.object({
  name: safeString.pipe(z.string().min(1, "Name is required")),
  email: safeEmail,
  phone: safePhone.optional(),
});

export const bulkImportSchema = z.object({
  workers: z.array(z.object({
    name: safeString.pipe(z.string().min(1)),
  }).passthrough()).min(1, "At least one worker required"),
});

// ── Admin/Users ──────────────────────────────────────────────────────────────
export const createUserSchema = z.object({
  email: safeEmail,
  name: safeString.pipe(z.string().min(1)),
  role: z.enum(["admin", "coordinator", "manager"]),
  site: safeString.optional().nullable(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const updateUserSchema = z.object({
  email: safeEmail.optional(),
  name: safeString.optional(),
  role: z.enum(["admin", "coordinator", "manager"]).optional(),
  site: safeString.optional().nullable(),
  password: z.string().min(8).optional(),
}).partial();

// ── Clients ──────────────────────────────────────────────────────────────────
export const createClientSchema = z.object({
  name: safeString.pipe(z.string().min(1, "Client name is required")),
  contactPerson: safeString.optional(),
  email: safeEmail.optional(),
  phone: safePhone.optional(),
  address: safeString.optional(),
  nip: safeString.optional(),
  billingRate: z.number().optional().nullable(),
  notes: safeString.optional(),
});

// ── Payroll ──────────────────────────────────────────────────────────────────
export const payrollBatchSchema = z.object({
  updates: z.array(z.object({
    workerId: z.string().uuid(),
    totalHours: z.number().min(0).optional(),
    advancePayment: z.number().min(0).optional(),
    penalties: z.number().min(0).optional(),
    hourlyNettoRate: z.number().min(0).optional(),
    siteLocation: safeString.optional(),
  })),
});

export const closeMonthSchema = z.object({
  monthYear: z.string().regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM format"),
});

// ── Portal ───────────────────────────────────────────────────────────────────
export const portalHoursSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  hours: z.number().min(0).max(24),
});

// ── 2FA ──────────────────────────────────────────────────────────────────────
export const totpTokenSchema = z.object({
  token: z.string().length(6, "TOTP code must be 6 digits"),
});

// ── Worker Notes ─────────────────────────────────────────────────────────────
export const workerNoteSchema = z.object({
  content: z.string().max(4000).optional(),
});

// ── EEJ Auth ─────────────────────────────────────────────────────────────────
export const eejLoginSchema = z.object({
  email: safeEmail,
  password: z.string().min(1),
});

export const createSystemUserSchema = z.object({
  name: safeString.pipe(z.string().min(1)),
  email: safeEmail,
  password: z.string().min(8),
  role: z.enum(["T1", "T2", "T3", "T4"]),
});

// ── Job Postings (ATS) ──────────────────────────────────────────────────────
export const createJobPostingSchema = z.object({
  title: safeString.pipe(z.string().min(1, "Job title is required")),
  description: safeString.optional(),
  requirements: safeString.optional(),
  location: safeString.optional(),
  clientId: z.string().uuid().optional().nullable(),
  salaryMin: z.number().min(0).optional(),
  salaryMax: z.number().min(0).optional(),
  currency: z.string().default("PLN"),
  contractType: safeString.optional(),
  isPublished: z.boolean().default(false),
  closingDate: isoDate,
});

export const updateJobPostingSchema = createJobPostingSchema.partial();

// ── Job Applications ────────────────────────────────────────────────────────
export const createApplicationSchema = z.object({
  jobId: z.string().uuid(),
  workerId: z.string().uuid(),
  notes: safeString.optional(),
});

export const updateApplicationStageSchema = z.object({
  stage: z.enum(["New", "Screening", "Interview", "Offer", "Placed", "Active", "Released", "Blacklisted"]),
  notes: safeString.optional(),
});

// ── Interviews ──────────────────────────────────────────────────────────────
export const createInterviewSchema = z.object({
  applicationId: z.string().uuid(),
  workerId: z.string().uuid(),
  jobId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  duration: z.number().min(5).max(480).default(30),
  location: safeString.optional(),
  interviewerName: safeString.optional(),
  interviewerEmail: safeEmail.optional(),
});

export const updateInterviewSchema = z.object({
  status: z.enum(["scheduled", "completed", "cancelled", "no_show"]).optional(),
  feedback: safeString.optional(),
  rating: z.number().min(1).max(5).optional(),
  scheduledAt: z.string().datetime().optional(),
}).partial();

// ── Invoices ────────────────────────────────────────────────────────────────
export const createInvoiceSchema = z.object({
  clientId: z.string().uuid(),
  monthYear: z.string().regex(/^\d{4}-\d{2}$/),
  items: z.array(z.object({
    workerId: z.string().uuid(),
    workerName: z.string(),
    hours: z.number().min(0),
    rate: z.number().min(0),
    amount: z.number().min(0),
  })).min(1),
  vatRate: z.number().min(0).max(1).default(0.23),
  dueDate: isoDate,
  notes: safeString.optional(),
});

// ── GDPR ────────────────────────────────────────────────────────────────────
export const gdprRequestSchema = z.object({
  workerId: z.string().uuid(),
  requestType: z.enum(["export", "erasure", "consent_withdrawal"]),
  notes: safeString.optional(),
});

// ── Validation middleware helper ─────────────────────────────────────────────
import { Request, Response, NextFunction } from "express";

export function validate<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join("."),
        message: e.message,
      }));
      res.status(400).json({ error: "Validation failed", details: errors });
      return;
    }
    req.body = result.data;
    next();
  };
}

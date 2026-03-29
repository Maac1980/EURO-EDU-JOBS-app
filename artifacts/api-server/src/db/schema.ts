import { pgTable, text, integer, real, timestamp, boolean, uuid, pgEnum, date, jsonb } from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────────────────────────
export const complianceStatusEnum = pgEnum("compliance_status", ["critical", "warning", "compliant", "non-compliant"]);
export const userRoleEnum = pgEnum("user_role", ["admin", "coordinator", "manager"]);
export const mobileRoleEnum = pgEnum("mobile_role", ["T1", "T2", "T3", "T4"]);
export const pipelineStageEnum = pgEnum("pipeline_stage", [
  "New", "Screening", "Interview", "Offer", "Placed", "Active", "Released", "Blacklisted"
]);
export const contractTypeEnum = pgEnum("contract_type", [
  "umowa_o_prace", "umowa_zlecenie", "umowa_o_dzielo", "B2B", "other"
]);
export const documentZoneEnum = pgEnum("document_zone", ["green", "yellow", "red", "expired"]);
export const notificationChannelEnum = pgEnum("notification_channel", ["email", "whatsapp", "sms"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid", "overdue", "cancelled"]);
export const interviewStatusEnum = pgEnum("interview_status", ["scheduled", "completed", "cancelled", "no_show"]);

// ── Workers (replaces Airtable main table) ───────────────────────────────────
export const workers = pgTable("workers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  jobRole: text("job_role"),
  nationality: text("nationality"),
  experience: text("experience"),
  qualification: text("qualification"),
  assignedSite: text("assigned_site"),

  // Document expiry dates
  trcExpiry: date("trc_expiry"),
  workPermitExpiry: date("work_permit_expiry"),
  bhpStatus: text("bhp_status"),
  contractEndDate: date("contract_end_date"),
  badaniaLekExpiry: date("badania_lek_expiry"),
  oswiadczenieExpiry: date("oswiadczenie_expiry"),
  udtCertExpiry: date("udt_cert_expiry"),

  // Polish legal compliance
  pesel: text("pesel"),
  nip: text("nip"),
  zusStatus: text("zus_status"),
  visaType: text("visa_type"),
  rodoConsentDate: date("rodo_consent_date"),

  // ISO 9606 welding certs
  iso9606Process: text("iso9606_process"),
  iso9606Material: text("iso9606_material"),
  iso9606Thickness: text("iso9606_thickness"),
  iso9606Position: text("iso9606_position"),

  // Payroll
  hourlyNettoRate: real("hourly_netto_rate").default(0),
  totalHours: real("total_hours").default(0),
  advancePayment: real("advance_payment").default(0),
  penalties: real("penalties").default(0),
  iban: text("iban"),

  // Contract & pipeline
  contractType: text("contract_type"),
  pipelineStage: text("pipeline_stage").default("New"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  // GDPR
  gdprConsentGiven: boolean("gdpr_consent_given").default(false),
  gdprConsentDate: timestamp("gdpr_consent_date"),
  gdprDataExportedAt: timestamp("gdpr_data_exported_at"),
  gdprErasureRequestedAt: timestamp("gdpr_erasure_requested_at"),
  gdprErasedAt: timestamp("gdpr_erased_at"),
});

// ── Dashboard Users (replaces users.json) ─────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("manager"), // admin, coordinator, manager
  site: text("site"),
  passwordHash: text("password_hash"),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Mobile System Users (replaces Airtable System_Users) ──────────────────────
export const systemUsers = pgTable("system_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("T3"), // T1, T2, T3, T4
  designation: text("designation"),
  shortName: text("short_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Clients (replaces clients.json) ──────────────────────────────────────────
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  nip: text("nip"),
  billingRate: real("billing_rate"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Audit Trail (replaces audit.json) ─────────────────────────────────────────
export const auditEntries = pgTable("audit_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: text("worker_id"),
  workerName: text("worker_name"),
  actor: text("actor").notNull(),
  field: text("field").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  action: text("action"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// ── Payroll Records (replaces payroll-records.json) ──────────────────────────
export const payrollRecords = pgTable("payroll_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  workerName: text("worker_name").notNull(),
  monthYear: text("month_year").notNull(),
  totalHours: real("total_hours").notNull().default(0),
  hourlyRate: real("hourly_rate").notNull().default(0),
  advancesDeducted: real("advances_deducted").default(0),
  penaltiesDeducted: real("penalties_deducted").default(0),
  grossPay: real("gross_pay").notNull().default(0),
  finalNettoPayout: real("final_netto_payout").notNull().default(0),
  zusBaseSalary: real("zus_base_salary").default(0),
  siteLocation: text("site_location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Notifications (replaces notifications.json) ─────────────────────────────
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: text("worker_id"),
  workerName: text("worker_name"),
  channel: text("channel").notNull(),
  message: text("message").notNull(),
  actor: text("actor").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

// ── Worker Notes (replaces worker-notes.json) ────────────────────────────────
export const workerNotes = pgTable("worker_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  content: text("content"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Portal Daily Logs (replaces portal-logs/*.json) ─────────────────────────
export const portalDailyLogs = pgTable("portal_daily_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  hours: real("hours").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

// ── File Attachments (replaces Airtable attachments) ─────────────────────────
export const fileAttachments = pgTable("file_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  fieldName: text("field_name").notNull(), // "passport", "contract", "cv", "bhp", etc.
  filename: text("filename").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"),
  storageKey: text("storage_key").notNull(), // S3/R2 key or local path
  storageUrl: text("storage_url"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// ── Alert Results (replaces last-alert-result.json) ──────────────────────────
export const alertResults = pgTable("alert_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  ranAt: timestamp("ran_at").defaultNow().notNull(),
  result: jsonb("result").notNull(),
});

// ── Admin Profile (replaces admin-profile.json) ──────────────────────────────
export const adminProfile = pgTable("admin_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull().default("Anna"),
  email: text("email").notNull().default("anna.b@edu-jobs.eu"),
  phone: text("phone").default(""),
  role: text("role").default("Administrator"),
});

// ── Job Postings (NEW - for ATS) ─────────────────────────────────────────────
export const jobPostings = pgTable("job_postings", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  requirements: text("requirements"),
  location: text("location"),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  salaryMin: real("salary_min"),
  salaryMax: real("salary_max"),
  currency: text("currency").default("PLN"),
  contractType: text("contract_type"),
  isPublished: boolean("is_published").default(false),
  closingDate: date("closing_date"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Job Applications (NEW - links workers to job postings) ───────────────────
export const jobApplications = pgTable("job_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => jobPostings.id, { onDelete: "cascade" }),
  workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  stage: text("stage").default("New"),
  matchScore: real("match_score"),
  matchReasons: jsonb("match_reasons"),
  notes: text("notes"),
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Interviews (NEW - for ATS) ───────────────────────────────────────────────
export const interviews = pgTable("interviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => jobApplications.id, { onDelete: "cascade" }),
  workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").notNull().references(() => jobPostings.id, { onDelete: "cascade" }),
  scheduledAt: timestamp("scheduled_at").notNull(),
  duration: integer("duration").default(30), // minutes
  location: text("location"), // room, video link, etc.
  interviewerName: text("interviewer_name"),
  interviewerEmail: text("interviewer_email"),
  status: text("status").default("scheduled"), // scheduled, completed, cancelled, no_show
  feedback: text("feedback"),
  rating: integer("rating"), // 1-5
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Invoices (NEW - client billing) ──────────────────────────────────────────
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
  monthYear: text("month_year").notNull(),
  items: jsonb("items").notNull(), // array of {workerId, workerName, hours, rate, amount}
  subtotal: real("subtotal").notNull(),
  vatRate: real("vat_rate").default(0.23),
  vatAmount: real("vat_amount").notNull(),
  total: real("total").notNull(),
  status: text("status").default("draft"), // draft, sent, paid, overdue, cancelled
  dueDate: date("due_date"),
  paidAt: timestamp("paid_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── GDPR Requests (NEW - for compliance) ─────────────────────────────────────
export const gdprRequests = pgTable("gdpr_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  requestType: text("request_type").notNull(), // "export", "erasure", "consent_withdrawal"
  status: text("status").default("pending"), // pending, processing, completed, rejected
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  processedBy: text("processed_by"),
  notes: text("notes"),
});

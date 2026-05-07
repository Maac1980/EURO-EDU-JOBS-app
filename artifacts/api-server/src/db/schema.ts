import { pgTable, text, integer, real, numeric, timestamp, boolean, uuid, pgEnum, date, jsonb } from "drizzle-orm/pg-core";

// ── Tenants (multi-tenant root) ─────────────────────────────────────────────
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  contactEmail: text("contact_email"),
  countryCode: text("country_code").default("PL"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
export const clientStageEnum = pgEnum("client_stage", ["LEAD", "NEGOTIATING", "SIGNED", "STALE", "LOST"]);
export const dealCurrencyEnum = pgEnum("deal_currency", ["PLN", "EUR"]);
export const dealStageEnum = pgEnum("deal_stage", ["OPEN", "WON", "LOST"]);
export const whatsappDirectionEnum = pgEnum("whatsapp_direction", ["inbound", "outbound"]);
export const whatsappStatusEnum = pgEnum("whatsapp_status", [
  "DRAFT", "APPROVED", "SENT", "FAILED", "RECEIVED", "DISCARDED",
]);
export const whatsappTriggerEventEnum = pgEnum("whatsapp_trigger_event", [
  "application_received",
  "permit_update",
  "payment_reminder",
  "expiry_nudge",
  "manual",
  "inbound_reply",
  "system",
]);
export const placementTypeEnum = pgEnum("placement_type", ["agency_leased", "direct_outsourcing"]);

// ── Workers (replaces Airtable main table) ───────────────────────────────────
export const workers = pgTable("workers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  firstName: text("first_name"),
  secondName: text("second_name"),
  surname: text("surname"),
  email: text("email"),
  companyEmail: text("company_email"),
  phone: text("phone"),
  jobRole: text("job_role"),
  nationality: text("nationality"),
  experience: text("experience"),
  qualification: text("qualification"),
  assignedSite: text("assigned_site"),
  voivodeship: text("voivodeship"),

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
  hourlyNettoRate: numeric("hourly_netto_rate", { precision: 10, scale: 2 }).default("0"),
  totalHours: numeric("total_hours", { precision: 8, scale: 2 }).default("0"),
  advancePayment: numeric("advance_payment", { precision: 10, scale: 2 }).default("0"),
  penalties: numeric("penalties", { precision: 10, scale: 2 }).default("0"),
  iban: text("iban"),

  // Contract & pipeline
  contractType: text("contract_type"),
  placementType: text("placement_type").notNull().default("agency_leased"),
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

  // Multi-tenant isolation
  tenantId: text("tenant_id").notNull().default("production").references(() => tenants.slug, { onDelete: "restrict" }),
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
  tenantId: text("tenant_id").notNull().default("production").references(() => tenants.slug, { onDelete: "restrict" }),
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
  billingRate: numeric("billing_rate", { precision: 10, scale: 2 }),
  notes: text("notes"),
  stage: clientStageEnum("stage").notNull().default("LEAD"),
  source: text("source"),
  tenantId: text("tenant_id").notNull().default("production").references(() => tenants.slug, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Client Activities (CRM interaction log) ──────────────────────────────────
export const clientActivities = pgTable("client_activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  userId: uuid("user_id"),
  actorName: text("actor_name"),
  kind: text("kind").notNull().default("note"),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  tenantId: text("tenant_id").notNull().default("production").references(() => tenants.slug, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Client Deals (CRM pipeline, per-currency) ────────────────────────────────
export const clientDeals = pgTable("client_deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: dealCurrencyEnum("currency").notNull().default("PLN"),
  probabilityPct: integer("probability_pct").notNull().default(50),
  expectedCloseDate: date("expected_close_date"),
  stage: dealStageEnum("stage").notNull().default("OPEN"),
  invoiceId: uuid("invoice_id"),
  tenantId: text("tenant_id").notNull().default("production").references(() => tenants.slug, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── WhatsApp Templates (Twilio content-SID catalog per tenant) ───────────────
// Index definitions (including UNIQUE(tenant_id, name)) live in migrate.ts per
// EEJ convention. DB CHECK on variables JSONB shape also added in Task C.
export const whatsappTemplates = pgTable("whatsapp_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull().default("production").references(() => tenants.slug, { onDelete: "restrict" }),
  name: text("name").notNull(),
  contentSid: text("content_sid"),
  language: text("language").notNull().default("pl"),
  bodyPreview: text("body_preview").notNull(),
  // variables is expected to be string[] of variable names ("workerName" etc.).
  // Enforced at DB level by CHECK (jsonb_typeof='array') in migrate.ts;
  // runtime validation by Zod in route handlers (Step 3b).
  variables: jsonb("variables").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Callers must set updatedAt manually on PATCH — no $onUpdate in EEJ convention
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── WhatsApp Messages (inbound + outbound; DRAFT → APPROVED → SENT) ──────────
// Indexes + CHECK (outbound requires recipient) live in migrate.ts.
// Partial unique index on twilio_message_sid (for inbound idempotency) in
// migrate.ts. approvedBy intentionally has no FK — actor identity is
// snapshotted so user deletion doesn't cascade-null approval trails
// (matches clientActivities.userId pattern).
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull().default("production").references(() => tenants.slug, { onDelete: "restrict" }),
  direction: whatsappDirectionEnum("direction").notNull(),
  status: whatsappStatusEnum("status").notNull().default("DRAFT"),
  workerId: uuid("worker_id").references(() => workers.id, { onDelete: "set null" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  // TODO(pii-encryption): phone is PII. Align with workers.phone / clients.phone
  // encryption strategy (tracked in STEP3-FOLLOWUPS.md).
  phone: text("phone").notNull(),
  body: text("body").notNull(),
  templateId: uuid("template_id").references(() => whatsappTemplates.id, { onDelete: "set null" }),
  templateVariables: jsonb("template_variables"),
  twilioMessageSid: text("twilio_message_sid"),
  triggerEvent: whatsappTriggerEventEnum("trigger_event"),
  isTestLabel: boolean("is_test_label").notNull().default(false),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  failedReason: text("failed_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  totalHours: numeric("total_hours", { precision: 8, scale: 2 }).notNull().default("0"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).notNull().default("0"),
  advancesDeducted: numeric("advances_deducted", { precision: 10, scale: 2 }).default("0"),
  penaltiesDeducted: numeric("penalties_deducted", { precision: 10, scale: 2 }).default("0"),
  grossPay: numeric("gross_pay", { precision: 10, scale: 2 }).notNull().default("0"),
  finalNettoPayout: numeric("final_netto_payout", { precision: 10, scale: 2 }).notNull().default("0"),
  zusBaseSalary: numeric("zus_base_salary", { precision: 10, scale: 2 }).default("0"),
  siteLocation: text("site_location"),
  tenantId: text("tenant_id").notNull().default("production").references(() => tenants.slug, { onDelete: "restrict" }),
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
  salaryMin: numeric("salary_min", { precision: 10, scale: 2 }),
  salaryMax: numeric("salary_max", { precision: 10, scale: 2 }),
  currency: text("currency").default("PLN"),
  contractType: text("contract_type"),
  isPublished: boolean("is_published").default(false),
  closingDate: date("closing_date"),
  createdBy: uuid("created_by").references(() => users.id),
  tenantId: text("tenant_id").notNull().default("production").references(() => tenants.slug, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Job Applications (NEW - links workers to job postings) ───────────────────
export const jobApplications = pgTable("job_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => jobPostings.id, { onDelete: "cascade" }),
  workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  stage: text("stage").default("New"),
  matchScore: numeric("match_score", { precision: 5, scale: 2 }),
  matchReasons: jsonb("match_reasons"),
  notes: text("notes"),
  tenantId: text("tenant_id").notNull().default("production").references(() => tenants.slug, { onDelete: "restrict" }),
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
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  vatRate: numeric("vat_rate", { precision: 4, scale: 2 }).default("0.23"),
  vatAmount: numeric("vat_amount", { precision: 12, scale: 2 }).notNull(),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("PLN"),
  status: text("status").default("draft"), // draft, sent, paid, overdue, cancelled
  dueDate: date("due_date"),
  paidAt: timestamp("paid_at"),
  notes: text("notes"),
  tenantId: text("tenant_id").notNull().default("production").references(() => tenants.slug, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Work Permit Applications (NEW - permit tracker) ──────────────────────────
export const workPermitApplications = pgTable("work_permit_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  permitType: text("permit_type").notNull(), // type_a, type_b, type_c, seasonal, oswiadczenie
  status: text("status").default("preparing"), // preparing, submitted, under_review, approved, rejected, expired
  applicationNumber: text("application_number"),
  portal: text("portal").default("mos"), // mos, praca.gov.pl
  documents: jsonb("documents"), // checklist array
  governmentFee: numeric("government_fee", { precision: 10, scale: 2 }),
  reportingDeadline: date("reporting_deadline"),
  submittedAt: timestamp("submitted_at"),
  decisionDate: date("decision_date"),
  expiryDate: date("expiry_date"),
  notes: text("notes"),
  tenantId: text("tenant_id").notNull().default("production").references(() => tenants.slug, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Regulatory Updates (NEW - compliance intelligence) ────────────────────────
export const regulatoryUpdates = pgTable("regulatory_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  fullText: text("full_text"),
  category: text("category"), // work_permits, zus, tax, labor_code, immigration
  severity: text("severity").default("info"), // info, warning, critical
  fineAmount: text("fine_amount"),
  aiAnalysis: text("ai_analysis"),
  // Impact assessment
  workersAffected: integer("workers_affected"),
  costImpact: text("cost_impact"), // "increase PLN 50/worker/month"
  deadlineChange: text("deadline_change"), // "new deadline 2026-04-01"
  actionRequired: jsonb("action_required"), // ["step1", "step2"]
  sourceUrls: jsonb("source_urls"), // [{url, title}]
  readByAdmin: boolean("read_by_admin").default(false),
  emailSent: boolean("email_sent").default(false),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

// ── Agencies (NEW - multi-tenant billing) ─────────────────────────────────────
export const agencies = pgTable("agencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  contactPerson: text("contact_person"),
  nip: text("nip"),
  plan: text("plan").default("starter"),
  workerLimit: integer("worker_limit").default(25),
  billingStatus: text("billing_status").default("trialing"), // trialing, active, past_due, cancelled
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── GPS Check-ins (NEW - worker location tracking) ────────────────────────────
export const gpsCheckins = pgTable("gps_checkins", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: text("worker_id").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  accuracy: real("accuracy"),
  siteId: text("site_id"),
  checkType: text("check_type").default("check_in"), // check_in, check_out
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// ── Immigration Search History ────────────────────────────────────────────────
export const immigrationSearches = pgTable("immigration_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"), // who asked
  question: text("question").notNull(),
  language: text("language").default("en"), // "en" or "pl"
  perplexityResponse: text("perplexity_response"), // raw search result
  aiAnswer: text("ai_answer"), // Claude plain-language answer
  sourceUrls: jsonb("source_urls"), // [{url, title, date}]
  confidence: text("confidence"), // "high", "medium", "low"
  actionItems: jsonb("action_items"), // ["step1", "step2"]
  searchedAt: timestamp("searched_at").defaultNow().notNull(),
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

// ── Legal Operations Tables ──────────────────────────────────────────────────

export const legalSnapshots = pgTable("legal_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  caseId: uuid("case_id"),
  legalStatus: text("legal_status").notNull(),
  legalBasis: text("legal_basis"),
  riskLevel: text("risk_level").default("MEDIUM"),
  conditions: jsonb("conditions"),
  warnings: jsonb("warnings"),
  requiredActions: jsonb("required_actions"),
  permitExpiry: date("permit_expiry"),
  trcFilingDate: date("trc_filing_date"),
  employerContinuity: boolean("employer_continuity").default(false),
  roleContinuity: boolean("role_continuity").default(false),
  formalDefect: boolean("formal_defect").default(false),
  nationality: text("nationality"),
  evidenceIds: jsonb("evidence_ids"),
  snapshotData: jsonb("snapshot_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by"),
});

export const legalEvidence = pgTable("legal_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  caseId: uuid("case_id"),
  evidenceType: text("evidence_type").notNull(),
  filename: text("filename"),
  storageKey: text("storage_key"),
  storageUrl: text("storage_url"),
  ocrResult: jsonb("ocr_result"),
  ocrConfidence: integer("ocr_confidence"),
  manualData: jsonb("manual_data"),
  mismatchFlags: jsonb("mismatch_flags"),
  extractedFilingDate: date("extracted_filing_date"),
  extractedReference: text("extracted_reference"),
  extractedAuthority: text("extracted_authority"),
  verified: boolean("verified").default(false),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const legalDocuments = pgTable("legal_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").references(() => workers.id, { onDelete: "set null" }),
  caseId: uuid("case_id"),
  templateId: uuid("template_id"),
  docType: text("doc_type").notNull(),
  language: text("language").default("pl"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  status: text("status").default("draft"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  sentAt: timestamp("sent_at"),
  linkedSnapshotId: uuid("linked_snapshot_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const legalSuggestions = pgTable("legal_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  caseId: uuid("case_id"),
  suggestionType: text("suggestion_type").notNull(),
  reason: text("reason").notNull(),
  priority: integer("priority").default(50),
  status: text("status").default("pending"),
  dismissedBy: text("dismissed_by"),
  dismissedAt: timestamp("dismissed_at"),
  actedOnAt: timestamp("acted_on_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const legalApprovals = pgTable("legal_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  action: text("action").notNull(),
  roleRequired: text("role_required").default("case_manager"),
  status: text("status").default("pending"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  aiRequest: text("ai_request"),
  aiResponse: text("ai_response"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const legalNotifications = pgTable("legal_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").references(() => workers.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  caseId: uuid("case_id"),
  channel: text("channel").default("internal"),
  messageType: text("message_type").notNull(),
  message: text("message").notNull(),
  recipientType: text("recipient_type").default("worker"),
  status: text("status").default("pending"),
  sentAt: timestamp("sent_at"),
  aiGenerated: boolean("ai_generated").default(false),
  approved: boolean("approved").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── A1 certificates (EU social security documents for posted Polish workers) ──
export const a1Certificates = pgTable("a1_certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  workerName: text("worker_name"),
  certificateNumber: text("certificate_number").notNull(),
  issuingCountry: text("issuing_country").notNull().default("PL"),
  issuingAuthority: text("issuing_authority"),
  hostCountry: text("host_country").notNull(),
  employerName: text("employer_name"),
  employerNip: text("employer_nip"),
  postingPurpose: text("posting_purpose"),
  signedDate: date("signed_date"),
  validFrom: date("valid_from"),
  validUntil: date("valid_until"),
  status: text("status").notNull().default("active"),
  tenantId: text("tenant_id").notNull().default("production").references(() => tenants.slug, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

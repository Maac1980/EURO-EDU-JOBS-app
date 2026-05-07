import { db, schema } from "./index.js";
import { sql } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

export async function runMigrations(): Promise<void> {
  console.log("[db] Running migrations...");

  // Create enums (idempotent)
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE compliance_status AS ENUM ('critical', 'warning', 'compliant', 'non-compliant');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('admin', 'coordinator', 'manager');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE mobile_role AS ENUM ('T1', 'T2', 'T3', 'T4');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // Create all tables (idempotent via IF NOT EXISTS)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS workers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      job_role TEXT,
      nationality TEXT,
      experience TEXT,
      qualification TEXT,
      assigned_site TEXT,
      trc_expiry DATE,
      work_permit_expiry DATE,
      bhp_status TEXT,
      contract_end_date DATE,
      badania_lek_expiry DATE,
      oswiadczenie_expiry DATE,
      udt_cert_expiry DATE,
      pesel TEXT,
      nip TEXT,
      zus_status TEXT,
      visa_type TEXT,
      rodo_consent_date DATE,
      iso9606_process TEXT,
      iso9606_material TEXT,
      iso9606_thickness TEXT,
      iso9606_position TEXT,
      hourly_netto_rate REAL DEFAULT 0,
      total_hours REAL DEFAULT 0,
      advance_payment REAL DEFAULT 0,
      penalties REAL DEFAULT 0,
      iban TEXT,
      contract_type TEXT,
      pipeline_stage TEXT DEFAULT 'New',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      gdpr_consent_given BOOLEAN DEFAULT FALSE,
      gdpr_consent_date TIMESTAMP,
      gdpr_data_exported_at TIMESTAMP,
      gdpr_erasure_requested_at TIMESTAMP,
      gdpr_erased_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'manager',
      site TEXT,
      password_hash TEXT,
      two_factor_secret TEXT,
      two_factor_enabled BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'T3',
      designation TEXT,
      short_name TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      contact_person TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      nip TEXT,
      billing_rate REAL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT,
      worker_name TEXT,
      actor TEXT NOT NULL,
      field TEXT NOT NULL,
      old_value JSONB,
      new_value JSONB,
      action TEXT,
      timestamp TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payroll_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      worker_name TEXT NOT NULL,
      month_year TEXT NOT NULL,
      total_hours REAL NOT NULL DEFAULT 0,
      hourly_rate REAL NOT NULL DEFAULT 0,
      advances_deducted REAL DEFAULT 0,
      penalties_deducted REAL DEFAULT 0,
      gross_pay REAL NOT NULL DEFAULT 0,
      final_netto_payout REAL NOT NULL DEFAULT 0,
      zus_base_salary REAL DEFAULT 0,
      site_location TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT,
      worker_name TEXT,
      channel TEXT NOT NULL,
      message TEXT NOT NULL,
      actor TEXT NOT NULL,
      sent_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worker_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      content TEXT,
      updated_by TEXT,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portal_daily_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      hours REAL NOT NULL,
      submitted_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      storage_key TEXT NOT NULL,
      storage_url TEXT,
      uploaded_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ran_at TIMESTAMP DEFAULT NOW() NOT NULL,
      result JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_profile (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL DEFAULT 'Anna',
      email TEXT NOT NULL DEFAULT 'anna.b@edu-jobs.eu',
      phone TEXT DEFAULT '',
      role TEXT DEFAULT 'Administrator'
    );

    CREATE TABLE IF NOT EXISTS job_postings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      requirements TEXT,
      location TEXT,
      client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      salary_min REAL,
      salary_max REAL,
      currency TEXT DEFAULT 'PLN',
      contract_type TEXT,
      is_published BOOLEAN DEFAULT FALSE,
      closing_date DATE,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      stage TEXT DEFAULT 'New',
      match_score REAL,
      match_reasons JSONB,
      notes TEXT,
      applied_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS interviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      application_id UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      job_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
      scheduled_at TIMESTAMP NOT NULL,
      duration INTEGER DEFAULT 30,
      location TEXT,
      interviewer_name TEXT,
      interviewer_email TEXT,
      status TEXT DEFAULT 'scheduled',
      feedback TEXT,
      rating INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number TEXT NOT NULL UNIQUE,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      month_year TEXT NOT NULL,
      items JSONB NOT NULL,
      subtotal REAL NOT NULL,
      vat_rate REAL DEFAULT 0.23,
      vat_amount REAL NOT NULL,
      total REAL NOT NULL,
      status TEXT DEFAULT 'draft',
      due_date DATE,
      paid_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gdpr_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      request_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      requested_at TIMESTAMP DEFAULT NOW() NOT NULL,
      completed_at TIMESTAMP,
      processed_by TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS work_permit_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      permit_type TEXT NOT NULL,
      status TEXT DEFAULT 'preparing',
      application_number TEXT,
      portal TEXT DEFAULT 'mos',
      documents JSONB,
      government_fee REAL,
      reporting_deadline DATE,
      submitted_at TIMESTAMP,
      decision_date DATE,
      expiry_date DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS regulatory_updates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      full_text TEXT,
      category TEXT,
      severity TEXT DEFAULT 'info',
      fine_amount TEXT,
      ai_analysis TEXT,
      workers_affected INTEGER,
      cost_impact TEXT,
      deadline_change TEXT,
      action_required JSONB,
      source_urls JSONB,
      read_by_admin BOOLEAN DEFAULT FALSE,
      email_sent BOOLEAN DEFAULT FALSE,
      fetched_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS immigration_searches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT,
      question TEXT NOT NULL,
      language TEXT DEFAULT 'en',
      perplexity_response TEXT,
      ai_answer TEXT,
      source_urls JSONB,
      confidence TEXT,
      action_items JSONB,
      searched_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      contact_person TEXT,
      nip TEXT,
      plan TEXT DEFAULT 'starter',
      worker_limit INTEGER DEFAULT 25,
      billing_status TEXT DEFAULT 'trialing',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      trial_ends_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gps_checkins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy REAL,
      site_id TEXT,
      check_type TEXT DEFAULT 'check_in',
      timestamp TIMESTAMP DEFAULT NOW() NOT NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_work_permit_worker ON work_permit_applications(worker_id);
    CREATE INDEX IF NOT EXISTS idx_work_permit_status ON work_permit_applications(status);
    CREATE INDEX IF NOT EXISTS idx_regulatory_fetched ON regulatory_updates(fetched_at);
    CREATE INDEX IF NOT EXISTS idx_agencies_email ON agencies(email);
    CREATE INDEX IF NOT EXISTS idx_agencies_stripe ON agencies(stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_gps_checkins_worker ON gps_checkins(worker_id);
    CREATE INDEX IF NOT EXISTS idx_gps_checkins_timestamp ON gps_checkins(timestamp);
    CREATE INDEX IF NOT EXISTS idx_workers_email ON workers(email);
    CREATE INDEX IF NOT EXISTS idx_workers_pipeline ON workers(pipeline_stage);
    CREATE INDEX IF NOT EXISTS idx_workers_assigned_site ON workers(assigned_site);
    CREATE INDEX IF NOT EXISTS idx_audit_worker ON audit_entries(worker_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_entries(timestamp);
    CREATE INDEX IF NOT EXISTS idx_payroll_worker ON payroll_records(worker_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_month ON payroll_records(month_year);
    CREATE INDEX IF NOT EXISTS idx_notifications_sent ON notifications(sent_at);
    CREATE INDEX IF NOT EXISTS idx_portal_logs_worker ON portal_daily_logs(worker_id);
    CREATE INDEX IF NOT EXISTS idx_file_attachments_worker ON file_attachments(worker_id);
    CREATE INDEX IF NOT EXISTS idx_job_postings_published ON job_postings(is_published);
    CREATE INDEX IF NOT EXISTS idx_job_applications_job ON job_applications(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_applications_worker ON job_applications(worker_id);
    CREATE INDEX IF NOT EXISTS idx_interviews_scheduled ON interviews(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_gdpr_requests_worker ON gdpr_requests(worker_id);
    CREATE INDEX IF NOT EXISTS idx_immigration_searches_user ON immigration_searches(user_id);
    CREATE INDEX IF NOT EXISTS idx_immigration_searches_date ON immigration_searches(searched_at);
    CREATE INDEX IF NOT EXISTS idx_regulatory_category ON regulatory_updates(category);
    CREATE INDEX IF NOT EXISTS idx_regulatory_severity ON regulatory_updates(severity);

    CREATE TABLE IF NOT EXISTS legal_cases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
      case_type TEXT NOT NULL,
      severity TEXT DEFAULT 'warning',
      status TEXT DEFAULT 'open',
      title TEXT NOT NULL,
      description TEXT,
      ai_recommendation TEXT,
      ai_sources JSONB,
      ai_confidence INTEGER,
      lawyer_notes TEXT,
      lawyer_decision TEXT,
      decided_by TEXT,
      decided_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_legal_cases_worker ON legal_cases(worker_id);
    CREATE INDEX IF NOT EXISTS idx_legal_cases_status ON legal_cases(status);

    CREATE TABLE IF NOT EXISTS legal_articles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_url TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      law_reference TEXT,
      keywords TEXT,
      verified_by TEXT,
      last_verified TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_legal_articles_category ON legal_articles(category);

    CREATE TABLE IF NOT EXISTS contract_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      contract_type TEXT NOT NULL,
      language TEXT DEFAULT 'pl',
      content TEXT NOT NULL,
      placeholders JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_sessions (
      session TEXT PRIMARY KEY,
      otp_hash TEXT NOT NULL,
      user_data JSONB NOT NULL,
      expires_at TIMESTAMP NOT NULL
    );

    -- ═══ PHASE 1: Domain Separation ═══
    -- 4 distinct status dimensions per worker (never mixed)
    DO $$ BEGIN
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS recruitment_stage TEXT DEFAULT 'NEW';
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS worker_status TEXT DEFAULT 'BENCH';
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS compliance_status_v2 TEXT DEFAULT 'PENDING_REVIEW';
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS legal_case_status TEXT DEFAULT 'NOT_STARTED';
      -- Legal Tracking Card fields
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS residence_basis TEXT;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS right_to_work_basis TEXT;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS permit_type TEXT;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS permit_number TEXT;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS permit_issue_date DATE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS permit_authority TEXT;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS contract_signed_date DATE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS contract_submitted_to_authority DATE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS salary_consistency_ok BOOLEAN DEFAULT TRUE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS role_consistency_ok BOOLEAN DEFAULT TRUE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS location_consistency_ok BOOLEAN DEFAULT TRUE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS hours_fte_consistency_ok BOOLEAN DEFAULT TRUE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS residence_doc_on_file BOOLEAN DEFAULT FALSE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS work_auth_doc_on_file BOOLEAN DEFAULT FALSE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS translation_required BOOLEAN DEFAULT FALSE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS translation_completed BOOLEAN DEFAULT FALSE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS sworn_translation_required BOOLEAN DEFAULT FALSE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS sworn_translation_completed BOOLEAN DEFAULT FALSE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS mandatory_docs_complete BOOLEAN DEFAULT FALSE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS last_verification_date DATE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS next_review_date DATE;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'MEDIUM';
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS retention_until DATE;
      -- Phase 2: Voivodeship tracking for recruitment regional sorting
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS voivodeship TEXT;
      -- Liza: Split name into first/second/surname for official documents
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS first_name TEXT;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS second_name TEXT;
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS surname TEXT;
      -- Liza: Auto-generated company email (receive-only, forwards to team)
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS company_email TEXT;
      -- Gap 4: agency-vs-direct-outsourcing legal vehicle classifier
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS placement_type TEXT NOT NULL DEFAULT 'agency_leased';
    END $$;

    -- Gap 4: CHECK constraint for placement_type (idempotent)
    DO $$ BEGIN
      ALTER TABLE workers ADD CONSTRAINT workers_placement_type_check
        CHECK (placement_type IN ('agency_leased', 'direct_outsourcing'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- Index for voivodeship filtering
    CREATE INDEX IF NOT EXISTS idx_workers_voivodeship ON workers(voivodeship);

    -- Phase 2: Fix REAL → NUMERIC(10,2) for monetary columns (prevents floating point rounding)
    DO $$ BEGIN
      ALTER TABLE workers ALTER COLUMN hourly_netto_rate TYPE NUMERIC(10,2) USING hourly_netto_rate::NUMERIC(10,2);
      ALTER TABLE workers ALTER COLUMN advance_payment TYPE NUMERIC(10,2) USING advance_payment::NUMERIC(10,2);
      ALTER TABLE workers ALTER COLUMN penalties TYPE NUMERIC(10,2) USING penalties::NUMERIC(10,2);
      ALTER TABLE workers ALTER COLUMN total_hours TYPE NUMERIC(8,2) USING total_hours::NUMERIC(8,2);
    EXCEPTION WHEN others THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TABLE payroll_records ALTER COLUMN hourly_rate TYPE NUMERIC(10,2) USING hourly_rate::NUMERIC(10,2);
      ALTER TABLE payroll_records ALTER COLUMN gross_pay TYPE NUMERIC(10,2) USING gross_pay::NUMERIC(10,2);
      ALTER TABLE payroll_records ALTER COLUMN final_netto_payout TYPE NUMERIC(10,2) USING final_netto_payout::NUMERIC(10,2);
      ALTER TABLE payroll_records ALTER COLUMN advances_deducted TYPE NUMERIC(10,2) USING advances_deducted::NUMERIC(10,2);
      ALTER TABLE payroll_records ALTER COLUMN penalties_deducted TYPE NUMERIC(10,2) USING penalties_deducted::NUMERIC(10,2);
      ALTER TABLE payroll_records ALTER COLUMN zus_base_salary TYPE NUMERIC(10,2) USING zus_base_salary::NUMERIC(10,2);
      ALTER TABLE payroll_records ALTER COLUMN total_hours TYPE NUMERIC(8,2) USING total_hours::NUMERIC(8,2);
    EXCEPTION WHEN others THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TABLE invoices ALTER COLUMN subtotal TYPE NUMERIC(12,2) USING subtotal::NUMERIC(12,2);
      ALTER TABLE invoices ALTER COLUMN vat_rate TYPE NUMERIC(4,2) USING vat_rate::NUMERIC(4,2);
      ALTER TABLE invoices ALTER COLUMN vat_amount TYPE NUMERIC(12,2) USING vat_amount::NUMERIC(12,2);
      ALTER TABLE invoices ALTER COLUMN total TYPE NUMERIC(12,2) USING total::NUMERIC(12,2);
    EXCEPTION WHEN others THEN NULL; END $$;

    -- Clients billing rate — REAL → NUMERIC(10,2)
    DO $$ BEGIN
      ALTER TABLE clients ALTER COLUMN billing_rate TYPE NUMERIC(10,2) USING billing_rate::NUMERIC(10,2);
    EXCEPTION WHEN others THEN NULL; END $$;

    -- Job postings salary bands — REAL → NUMERIC(10,2)
    DO $$ BEGIN
      ALTER TABLE job_postings ALTER COLUMN salary_min TYPE NUMERIC(10,2) USING salary_min::NUMERIC(10,2);
      ALTER TABLE job_postings ALTER COLUMN salary_max TYPE NUMERIC(10,2) USING salary_max::NUMERIC(10,2);
    EXCEPTION WHEN others THEN NULL; END $$;

    -- Portal daily log hours — REAL → NUMERIC(8,2)
    DO $$ BEGIN
      ALTER TABLE portal_daily_logs ALTER COLUMN hours TYPE NUMERIC(8,2) USING hours::NUMERIC(8,2);
    EXCEPTION WHEN others THEN NULL; END $$;

    -- Enrich contract_templates with suggestion metadata
    DO $$ BEGIN
      ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'inne';
      ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS applicable_when JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS required_worker_fields JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS description TEXT;
    END $$;

    -- Add tenant_id for test data isolation
    DO $$ BEGIN
      ALTER TABLE workers ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'production';
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'production';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'production';
      ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'production';
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'production';
      ALTER TABLE work_permit_applications ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'production';
      -- Stage 4.5: bring recruitment/ATS surface into tenant-isolation regime
      ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'production';
      ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'production';
      ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'production';
      ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS next_action TEXT;
      ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS blockers JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS linked_evidence_count INTEGER DEFAULT 0;
    END $$;
    CREATE INDEX IF NOT EXISTS idx_workers_tenant ON workers(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_records_tenant ON payroll_records(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_permits_tenant ON work_permit_applications(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_job_postings_tenant ON job_postings(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_job_applications_tenant ON job_applications(tenant_id);

    -- Worker onboarding checklist
    CREATE TABLE IF NOT EXISTS onboarding_checklists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      step_name TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      completed_at TIMESTAMP,
      completed_by TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_onboarding_worker ON onboarding_checklists(worker_id);

    -- CRM deals
    CREATE TABLE IF NOT EXISTS crm_deals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      stage TEXT DEFAULT 'lead',
      value REAL DEFAULT 0,
      workers_needed INTEGER DEFAULT 0,
      probability INTEGER DEFAULT 50,
      expected_close DATE,
      notes TEXT,
      assigned_to TEXT,
      tenant_id TEXT DEFAULT 'production',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals(stage);

    -- GPS geofence sites
    CREATE TABLE IF NOT EXISTS geofence_sites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius_meters INTEGER DEFAULT 200,
      tenant_id TEXT DEFAULT 'production',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    -- Extend legal_cases with TRC/case management fields
    DO $$ BEGIN
      ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS trc_case_id UUID;
      ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS case_manager TEXT;
      ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS client_comm_status TEXT DEFAULT 'none';
      ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS doc_completeness INTEGER DEFAULT 0;
      ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS appeal_deadline DATE;
      ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS rejection_text TEXT;
      ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS rejection_classification JSONB;
      ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS priority_score INTEGER DEFAULT 50;
    END $$;

    CREATE TABLE IF NOT EXISTS legal_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      case_id UUID REFERENCES legal_cases(id) ON DELETE SET NULL,
      legal_status TEXT NOT NULL,
      legal_basis TEXT,
      risk_level TEXT DEFAULT 'MEDIUM',
      conditions JSONB,
      warnings JSONB,
      required_actions JSONB,
      permit_expiry DATE,
      trc_filing_date DATE,
      employer_continuity BOOLEAN DEFAULT FALSE,
      role_continuity BOOLEAN DEFAULT FALSE,
      formal_defect BOOLEAN DEFAULT FALSE,
      nationality TEXT,
      evidence_ids JSONB,
      snapshot_data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      created_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_legal_snapshots_worker ON legal_snapshots(worker_id);
    CREATE INDEX IF NOT EXISTS idx_legal_snapshots_status ON legal_snapshots(legal_status);

    CREATE TABLE IF NOT EXISTS legal_evidence (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      case_id UUID REFERENCES legal_cases(id) ON DELETE SET NULL,
      evidence_type TEXT NOT NULL,
      filename TEXT,
      storage_key TEXT,
      storage_url TEXT,
      ocr_result JSONB,
      ocr_confidence INTEGER,
      manual_data JSONB,
      mismatch_flags JSONB,
      extracted_filing_date DATE,
      extracted_reference TEXT,
      extracted_authority TEXT,
      verified BOOLEAN DEFAULT FALSE,
      verified_by TEXT,
      verified_at TIMESTAMP,
      uploaded_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_legal_evidence_worker ON legal_evidence(worker_id);
    CREATE INDEX IF NOT EXISTS idx_legal_evidence_case ON legal_evidence(case_id);

    -- Extend legal_evidence for working documents (moved post-CREATE for fresh-DB safety)
    DO $$ BEGIN
      ALTER TABLE legal_evidence ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE legal_evidence ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'uploaded';
      ALTER TABLE legal_evidence ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
    END $$;

    -- A1 certificates (EU social security documents for posted Polish workers)
    -- Closes ghost-table query at services/pip-readiness.service.ts (Posted Workers risk detection)
    CREATE TABLE IF NOT EXISTS a1_certificates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      worker_name TEXT,
      certificate_number TEXT NOT NULL,
      issuing_country TEXT NOT NULL DEFAULT 'PL',
      issuing_authority TEXT,
      host_country TEXT NOT NULL,
      employer_name TEXT,
      employer_nip TEXT,
      posting_purpose TEXT,
      signed_date DATE,
      valid_from DATE,
      valid_until DATE,
      status TEXT NOT NULL DEFAULT 'active',
      tenant_id TEXT NOT NULL DEFAULT 'production',
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_a1_certificates_worker ON a1_certificates(worker_id);
    CREATE INDEX IF NOT EXISTS idx_a1_certificates_tenant ON a1_certificates(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_a1_certificates_status ON a1_certificates(status);
    CREATE INDEX IF NOT EXISTS idx_a1_certificates_expiry ON a1_certificates(valid_until);

    CREATE TABLE IF NOT EXISTS legal_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
      case_id UUID REFERENCES legal_cases(id) ON DELETE SET NULL,
      template_id UUID REFERENCES contract_templates(id) ON DELETE SET NULL,
      doc_type TEXT NOT NULL,
      language TEXT DEFAULT 'pl',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      approved_by TEXT,
      approved_at TIMESTAMP,
      sent_at TIMESTAMP,
      linked_snapshot_id UUID,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_legal_documents_worker ON legal_documents(worker_id);
    CREATE INDEX IF NOT EXISTS idx_legal_documents_status ON legal_documents(status);

    CREATE TABLE IF NOT EXISTS legal_suggestions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      case_id UUID REFERENCES legal_cases(id) ON DELETE SET NULL,
      suggestion_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      priority INTEGER DEFAULT 50,
      status TEXT DEFAULT 'pending',
      dismissed_by TEXT,
      dismissed_at TIMESTAMP,
      acted_on_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_suggestions_dedup ON legal_suggestions(worker_id, suggestion_type, status) WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS legal_approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      target_type TEXT NOT NULL,
      target_id UUID NOT NULL,
      action TEXT NOT NULL,
      role_required TEXT DEFAULT 'case_manager',
      status TEXT DEFAULT 'pending',
      approved_by TEXT,
      approved_at TIMESTAMP,
      notes TEXT,
      ai_request TEXT,
      ai_response TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_legal_approvals_status ON legal_approvals(status);

    CREATE TABLE IF NOT EXISTS legal_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
      client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      case_id UUID REFERENCES legal_cases(id) ON DELETE SET NULL,
      channel TEXT DEFAULT 'internal',
      message_type TEXT NOT NULL,
      message TEXT NOT NULL,
      recipient_type TEXT DEFAULT 'worker',
      status TEXT DEFAULT 'pending',
      sent_at TIMESTAMP,
      ai_generated BOOLEAN DEFAULT FALSE,
      approved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_legal_notifications_worker ON legal_notifications(worker_id);

    CREATE TABLE IF NOT EXISTS communication_outputs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
      case_id UUID REFERENCES legal_cases(id) ON DELETE SET NULL,
      comm_type TEXT NOT NULL,
      content TEXT NOT NULL,
      content_edited TEXT,
      is_approved BOOLEAN DEFAULT FALSE,
      approved_by TEXT,
      approved_at TIMESTAMP,
      generated_by TEXT DEFAULT 'ai',
      generated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      sent_at TIMESTAMP,
      snapshot_id UUID,
      audit_log JSONB DEFAULT '[]'::jsonb
    );
    CREATE INDEX IF NOT EXISTS idx_comm_outputs_worker ON communication_outputs(worker_id);
    CREATE INDEX IF NOT EXISTS idx_comm_outputs_approved ON communication_outputs(is_approved);

    -- Document action log (append-only)
    CREATE TABLE IF NOT EXISTS document_action_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
      document_id UUID,
      document_type TEXT,
      action TEXT NOT NULL,
      actor TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_doc_action_log_worker ON document_action_log(worker_id);
    CREATE INDEX IF NOT EXISTS idx_doc_action_log_doc ON document_action_log(document_id);

    -- Add status to legal_evidence for consistency
    DO $$ BEGIN
      ALTER TABLE legal_evidence ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'uploaded';
    END $$;
  `);

  // ═══ Stage 4: Formal tenants table + FK integrity ═══
  // Slug-based FKs preserve every existing `WHERE tenant_id = 'production'` query
  // while giving a canonical catalog of tenants and referential integrity.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      contact_email TEXT,
      country_code TEXT DEFAULT 'PL',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
  `);

  await db.execute(sql`
    INSERT INTO tenants (slug, name, contact_email)
    VALUES ('production', 'Euro Edu Jobs Production', 'anna.b@edu-jobs.eu')
    ON CONFLICT (slug) DO NOTHING;

    INSERT INTO tenants (slug, name, status, contact_email)
    VALUES ('test', 'Test Data (Isolated)', 'active', NULL)
    ON CONFLICT (slug) DO NOTHING;
  `);

  // Add FK constraints idempotently: tenant_id (TEXT) -> tenants(slug).
  // Each DO block is guarded on pg_constraint to be re-runnable.
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workers_tenant_slug_fk') THEN
        ALTER TABLE workers
          ADD CONSTRAINT workers_tenant_slug_fk
          FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT;
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_tenant_slug_fk') THEN
        ALTER TABLE users
          ADD CONSTRAINT users_tenant_slug_fk
          FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT;
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_tenant_slug_fk') THEN
        ALTER TABLE clients
          ADD CONSTRAINT clients_tenant_slug_fk
          FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT;
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_records_tenant_slug_fk') THEN
        ALTER TABLE payroll_records
          ADD CONSTRAINT payroll_records_tenant_slug_fk
          FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT;
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_tenant_slug_fk') THEN
        ALTER TABLE invoices
          ADD CONSTRAINT invoices_tenant_slug_fk
          FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT;
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_permit_applications_tenant_slug_fk') THEN
        ALTER TABLE work_permit_applications
          ADD CONSTRAINT work_permit_applications_tenant_slug_fk
          FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT;
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$;

    -- Stage 4.5: FK constraints for recruitment/ATS surface
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_postings_tenant_slug_fk') THEN
        ALTER TABLE job_postings
          ADD CONSTRAINT job_postings_tenant_slug_fk
          FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT;
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_tenant_slug_fk') THEN
        ALTER TABLE job_applications
          ADD CONSTRAINT job_applications_tenant_slug_fk
          FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT;
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$;

    -- Stage 4 FK: a1_certificates → tenants(slug)
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a1_certificates_tenant_slug_fk') THEN
        ALTER TABLE a1_certificates
          ADD CONSTRAINT a1_certificates_tenant_slug_fk
          FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT;
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$;
  `);

  // Stage 4.5: defensive backfill — ensures any pre-existing rows (created before
  // the column existed via ALTER ADD COLUMN with DEFAULT) are explicitly assigned.
  // The DEFAULT 'production' clause already populates these rows on ALTER, but the
  // explicit UPDATE is the canonical Stage 4 discipline.
  await db.execute(sql`
    UPDATE job_postings SET tenant_id = 'production' WHERE tenant_id IS NULL;
    UPDATE job_applications SET tenant_id = 'production' WHERE tenant_id IS NULL;
  `);

  // ═══ Step 2: CRM enhancements (clients.stage, activities, deals, invoice currency) ═══
  // Enums — CREATE TYPE has no IF NOT EXISTS; use DO-block exception pattern.
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE client_stage AS ENUM ('LEAD', 'NEGOTIATING', 'SIGNED', 'STALE', 'LOST');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE deal_currency AS ENUM ('PLN', 'EUR');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE deal_stage AS ENUM ('OPEN', 'WON', 'LOST');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // clients: add stage + source (idempotent)
  await db.execute(sql`
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS stage client_stage NOT NULL DEFAULT 'LEAD';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS source TEXT;
  `);

  // invoices.currency — JS-side existence check (matches Stage 4 TZ pattern)
  try {
    const invCurrencyCheck = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'currency'
    `);
    if (invCurrencyCheck.rows.length === 0) {
      await db.execute(sql`ALTER TABLE invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'PLN'`);
      console.log("[db] Added invoices.currency (default PLN)");
    }
  } catch (e) {
    console.warn("[db] invoices.currency migration skipped:", e instanceof Error ? e.message : e);
  }

  // client_activities (append-only)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_activities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      user_id UUID,
      actor_name TEXT,
      kind TEXT NOT NULL DEFAULT 'note',
      content TEXT NOT NULL,
      metadata JSONB,
      tenant_id TEXT NOT NULL DEFAULT 'production' REFERENCES tenants(slug) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_client_activities_client_created ON client_activities(client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_client_activities_tenant ON client_activities(tenant_id);
  `);

  // client_deals
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_deals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      estimated_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
      currency deal_currency NOT NULL DEFAULT 'PLN',
      probability_pct INTEGER NOT NULL DEFAULT 50,
      expected_close_date DATE,
      stage deal_stage NOT NULL DEFAULT 'OPEN',
      invoice_id UUID,
      tenant_id TEXT NOT NULL DEFAULT 'production' REFERENCES tenants(slug) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_client_deals_tenant_client ON client_deals(tenant_id, client_id);
    CREATE INDEX IF NOT EXISTS idx_client_deals_tenant_stage ON client_deals(tenant_id, stage);
    CREATE INDEX IF NOT EXISTS idx_client_deals_tenant_expected_close ON client_deals(tenant_id, expected_close_date);

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_deals_invoice_fk') THEN
        ALTER TABLE client_deals
          ADD CONSTRAINT client_deals_invoice_fk
          FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$;
  `);

  // ── WhatsApp: enum types (idempotent) ────────────────────────────────────────
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE whatsapp_direction AS ENUM ('inbound', 'outbound');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE whatsapp_status AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'FAILED', 'RECEIVED', 'DISCARDED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE whatsapp_trigger_event AS ENUM (
        'application_received',
        'permit_update',
        'payment_reminder',
        'expiry_nudge',
        'manual',
        'inbound_reply',
        'system'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // ── WhatsApp: templates (Twilio content-SID catalog, per tenant) ─────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS whatsapp_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL DEFAULT 'production' REFERENCES tenants(slug) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      content_sid TEXT,
      language TEXT NOT NULL DEFAULT 'pl',
      body_preview TEXT NOT NULL,
      variables JSONB NOT NULL DEFAULT '[]'::jsonb,
      active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT whatsapp_templates_variables_is_array
        CHECK (jsonb_typeof(variables) = 'array')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_templates_tenant_name
      ON whatsapp_templates(tenant_id, name);
  `);

  // ── WhatsApp: messages (inbound + outbound; DRAFT → APPROVED → SENT state) ───
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL DEFAULT 'production' REFERENCES tenants(slug) ON DELETE RESTRICT,
      direction whatsapp_direction NOT NULL,
      status whatsapp_status NOT NULL DEFAULT 'DRAFT',
      worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
      client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      phone TEXT NOT NULL,
      body TEXT NOT NULL,
      template_id UUID REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
      template_variables JSONB,
      twilio_message_sid TEXT,
      trigger_event whatsapp_trigger_event,
      is_test_label BOOLEAN NOT NULL DEFAULT FALSE,
      approved_by UUID,
      approved_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      failed_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT whatsapp_messages_outbound_requires_recipient
        CHECK (direction = 'inbound' OR worker_id IS NOT NULL OR client_id IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_status_created
      ON whatsapp_messages(tenant_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_direction_unread
      ON whatsapp_messages(tenant_id, direction, read_at)
      WHERE read_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_twilio_sid
      ON whatsapp_messages(twilio_message_sid)
      WHERE twilio_message_sid IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone
      ON whatsapp_messages(phone);
  `);

  // NOTE: Template body updates should go through the Twilio console, not by
  // modifying this seed. ON CONFLICT DO NOTHING means re-running migrations
  // will NOT overwrite existing template text. Twilio content SIDs become the
  // source of truth once provisioned.
  // Scope note: seed targets only the 'production' tenant. The 'test' tenant
  // (seeded at lines 786-788) intentionally has no WhatsApp templates — test
  // workers are blocked from external communication per CLAUDE.md.
  await db.execute(sql`
    INSERT INTO whatsapp_templates (tenant_id, name, language, body_preview, variables, active)
    VALUES
      ('production', 'application_received', 'pl',
        'Dziekujemy za aplikacje, {{workerName}}. Skontaktujemy sie w ciagu 48h.',
        '["workerName"]'::jsonb, FALSE),
      ('production', 'permit_status_update', 'pl',
        'Status Twojego zezwolenia: {{permitStatus}}. Data: {{updateDate}}.',
        '["permitStatus","updateDate"]'::jsonb, FALSE),
      ('production', 'payment_reminder', 'pl',
        'Przypominamy o fakturze {{invoiceNumber}} na kwote {{amount}} {{currency}}. Termin: {{dueDate}}.',
        '["invoiceNumber","amount","currency","dueDate"]'::jsonb, FALSE)
    ON CONFLICT (tenant_id, name) DO NOTHING;
  `);

  // ═══ Pattern B centralization — Commit 3a (10 independent tables) ═══════════
  // Tables previously created lazily by request-time helpers; centralized here
  // for deterministic schema state across fresh-DB recreates and PITR restores.
  // Per Item 2.3 Phase B Plan, Stage 4 tenant_id NOT added (Option B); existing
  // org_context column preserved where present. Helpers + defensive catches
  // removed in services/ files in the same commit.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS eej_payroll_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      worker_name TEXT,
      month_year TEXT NOT NULL,
      hours NUMERIC(8,2) NOT NULL DEFAULT 0,
      hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
      gross NUMERIC(10,2) NOT NULL DEFAULT 0,
      employee_zus NUMERIC(10,2) NOT NULL DEFAULT 0,
      health NUMERIC(10,2) NOT NULL DEFAULT 0,
      pit NUMERIC(10,2) NOT NULL DEFAULT 0,
      net NUMERIC(10,2) NOT NULL DEFAULT 0,
      employer_zus NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
      advances NUMERIC(10,2) NOT NULL DEFAULT 0,
      penalties NUMERIC(10,2) NOT NULL DEFAULT 0,
      final_payout NUMERIC(10,2) NOT NULL DEFAULT 0,
      contract_type TEXT DEFAULT 'umowa_zlecenie',
      iban TEXT,
      locked BOOLEAN DEFAULT false,
      locked_by TEXT,
      locked_at TIMESTAMPTZ,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_eej_payroll_worker ON eej_payroll_ledger(worker_id);
    CREATE INDEX IF NOT EXISTS idx_eej_payroll_month ON eej_payroll_ledger(month_year);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_eej_payroll_dedup ON eej_payroll_ledger(worker_id, month_year);

    CREATE TABLE IF NOT EXISTS border_crossings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      crossing_date DATE NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('entry', 'exit')),
      country TEXT DEFAULT 'PL',
      notes TEXT,
      entered_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS smart_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'UNKNOWN',
      confidence REAL DEFAULT 0,
      rationale TEXT DEFAULT '',
      extracted_data JSONB DEFAULT '{}'::jsonb,
      legal_articles JSONB DEFAULT '[]'::jsonb,
      legal_impact JSONB DEFAULT '{}'::jsonb,
      ai_context JSONB DEFAULT '{}'::jsonb,
      draft_text TEXT,
      draft_type TEXT,
      draft_metadata JSONB DEFAULT '{}'::jsonb,
      mos_relevant BOOLEAN DEFAULT false,
      is_rejection BOOLEAN DEFAULT false,
      is_application BOOLEAN DEFAULT false,
      status TEXT DEFAULT 'analyzed',
      analyzed_by TEXT DEFAULT 'claude',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS eej_notification_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      channel TEXT NOT NULL DEFAULT 'internal_log',
      priority TEXT NOT NULL DEFAULT 'medium',
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      worker_id TEXT,
      worker_name TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      sent BOOLEAN DEFAULT false,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_eej_notif_worker ON eej_notification_log(worker_id);
    CREATE INDEX IF NOT EXISTS idx_eej_notif_trigger ON eej_notification_log(trigger_type);
    CREATE INDEX IF NOT EXISTS idx_eej_notif_priority ON eej_notification_log(priority);

    CREATE TABLE IF NOT EXISTS eej_billing_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stripe_event_id TEXT UNIQUE,
      event_type TEXT NOT NULL,
      employer_name TEXT,
      employer_email TEXT,
      amount INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'pln',
      status TEXT NOT NULL DEFAULT 'received',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_invoice_id TEXT,
      plan_name TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_billing_event_type ON eej_billing_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_billing_employer ON eej_billing_events(employer_name);
    CREATE INDEX IF NOT EXISTS idx_billing_status ON eej_billing_events(status);
    CREATE INDEX IF NOT EXISTS idx_billing_stripe_id ON eej_billing_events(stripe_event_id);

    CREATE TABLE IF NOT EXISTS eej_escalation_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      worker_name TEXT,
      threshold TEXT NOT NULL,
      days_remaining INT,
      previous_stage TEXT,
      new_stage TEXT DEFAULT 'Action Required',
      notification_id TEXT,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_esc_worker ON eej_escalation_log(worker_id);
    CREATE INDEX IF NOT EXISTS idx_esc_threshold ON eej_escalation_log(threshold);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_esc_dedup ON eej_escalation_log(worker_id, threshold);

    CREATE TABLE IF NOT EXISTS digital_safe (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      case_id TEXT,
      doc_category TEXT NOT NULL DEFAULT 'MOS_CERTIFICATE',
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INT DEFAULT 0,
      description TEXT,
      source TEXT DEFAULT 'manual_upload',
      uploaded_by TEXT NOT NULL,
      verified BOOLEAN DEFAULT false,
      verified_by TEXT,
      verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS intelligence_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      worker_id TEXT,
      worker_name TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      data JSONB DEFAULT '{}'::jsonb,
      acknowledged BOOLEAN DEFAULT false,
      acknowledged_by TEXT,
      acknowledged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ocr_feedback_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id TEXT,
      worker_id TEXT,
      doc_type TEXT NOT NULL,
      field_name TEXT NOT NULL,
      ocr_value TEXT,
      corrected_value TEXT NOT NULL,
      error_type TEXT NOT NULL DEFAULT 'extraction_error',
      severity TEXT NOT NULL DEFAULT 'medium',
      notes TEXT,
      logged_by TEXT NOT NULL DEFAULT 'anna',
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      resolved BOOLEAN DEFAULT false,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ocr_feedback_doc_type ON ocr_feedback_log(doc_type);
    CREATE INDEX IF NOT EXISTS idx_ocr_feedback_field ON ocr_feedback_log(field_name);
    CREATE INDEX IF NOT EXISTS idx_ocr_feedback_resolved ON ocr_feedback_log(resolved);
    CREATE INDEX IF NOT EXISTS idx_ocr_feedback_org ON ocr_feedback_log(org_context);

    CREATE TABLE IF NOT EXISTS upo_vault (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      submission_number TEXT NOT NULL,
      submission_date DATE NOT NULL,
      authority TEXT,
      case_type TEXT DEFAULT 'TRC',
      file_name TEXT,
      art108_locked BOOLEAN DEFAULT false,
      locked_at TIMESTAMPTZ,
      locked_by TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ─── Commit 3b: TRC FK chain (3 tables) + agency-compliance (4 tables) ───
    -- FK ordering: trc_cases must precede trc_documents + trc_case_notes
    CREATE TABLE IF NOT EXISTS trc_cases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID REFERENCES workers(id),
      worker_name TEXT NOT NULL,
      nationality TEXT,
      employer TEXT,
      permit_type TEXT NOT NULL DEFAULT 'TRC',
      status TEXT NOT NULL DEFAULT 'documents_gathering',
      application_date DATE,
      submission_date DATE,
      expected_decision_date DATE,
      actual_decision_date DATE,
      voivodeship TEXT,
      appointment_date DATE,
      renewal_deadline DATE,
      service_fee NUMERIC(10,2) DEFAULT 0,
      payment_status TEXT DEFAULT 'unpaid',
      esspass_status TEXT DEFAULT 'not_applicable',
      notes TEXT DEFAULT '',
      ai_checklist JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trc_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id UUID REFERENCES trc_cases(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      document_name TEXT NOT NULL,
      is_required BOOLEAN DEFAULT true,
      is_uploaded BOOLEAN DEFAULT false,
      is_verified BOOLEAN DEFAULT false,
      uploaded_at TIMESTAMPTZ,
      verified_by TEXT,
      storage_key TEXT,
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trc_case_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id UUID REFERENCES trc_cases(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Agency compliance tables. Gap 4 art_20_enforced inlined into eej_assignments
    -- CREATE (per Decision 2: column belongs in CREATE TABLE definition).
    CREATE TABLE IF NOT EXISTS eej_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      worker_name TEXT,
      client_id TEXT,
      client_name TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE,
      days_worked INT DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      alert_15m BOOLEAN DEFAULT false,
      alert_17m BOOLEAN DEFAULT false,
      blocked_18m BOOLEAN DEFAULT false,
      art_20_enforced BOOLEAN NOT NULL DEFAULT TRUE,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_eej_assign_worker ON eej_assignments(worker_id);
    CREATE INDEX IF NOT EXISTS idx_eej_assign_client ON eej_assignments(client_name);

    CREATE TABLE IF NOT EXISTS eej_kraz (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kraz_number TEXT NOT NULL,
      registered_at DATE NOT NULL,
      valid_until DATE,
      marshal_office TEXT,
      voivodeship TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      last_annual_report DATE,
      next_annual_report DATE,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS eej_compliance_deadlines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      worker_name TEXT,
      deadline_type TEXT NOT NULL,
      deadline_date DATE NOT NULL,
      reference_event TEXT,
      reference_date DATE,
      status TEXT NOT NULL DEFAULT 'PENDING',
      completed_at TIMESTAMPTZ,
      completed_by TEXT,
      legal_basis TEXT,
      fine_risk TEXT,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_eej_deadlines_worker ON eej_compliance_deadlines(worker_id);
    CREATE INDEX IF NOT EXISTS idx_eej_deadlines_date ON eej_compliance_deadlines(deadline_date);
    CREATE INDEX IF NOT EXISTS idx_eej_deadlines_status ON eej_compliance_deadlines(status);

    CREATE TABLE IF NOT EXISTS eej_retention_schedule (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT,
      document_type TEXT NOT NULL,
      document_id TEXT,
      document_name TEXT,
      retention_category TEXT NOT NULL,
      retention_years INT NOT NULL,
      employment_end_date DATE,
      delete_after DATE,
      status TEXT NOT NULL DEFAULT 'RETAINED',
      deleted_at TIMESTAMPTZ,
      legal_basis TEXT,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_eej_retention_delete ON eej_retention_schedule(delete_after);
    CREATE INDEX IF NOT EXISTS idx_eej_retention_status ON eej_retention_schedule(status);

    -- ─── Commit 3c: legal-intelligence (5 tables) + legal-case-engine (3 tables) ───
    -- Note: eej_case_generated_docs.case_id and eej_case_notebook.case_id are
    -- intentionally soft references (no FK), so order between these is flexible.
    CREATE TABLE IF NOT EXISTS research_memos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      memo_type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      perplexity_answer TEXT DEFAULT '',
      sources JSONB DEFAULT '[]'::jsonb,
      summary TEXT DEFAULT '',
      action_items JSONB DEFAULT '[]'::jsonb,
      owner TEXT DEFAULT '',
      linked_worker_id TEXT,
      linked_case_id TEXT,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS appeal_outputs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      case_id TEXT,
      rejection_text TEXT,
      appeal_draft_pl TEXT DEFAULT '',
      appeal_draft_en TEXT DEFAULT '',
      worker_explanation TEXT DEFAULT '',
      client_explanation TEXT DEFAULT '',
      appeal_grounds JSONB DEFAULT '[]'::jsonb,
      missing_evidence JSONB DEFAULT '[]'::jsonb,
      relevant_articles JSONB DEFAULT '[]'::jsonb,
      lawyer_note TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      provider_status JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS poa_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      case_id TEXT,
      poa_type TEXT NOT NULL,
      content_pl TEXT NOT NULL,
      representative_name TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS authority_drafts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      case_id TEXT,
      draft_type TEXT NOT NULL,
      content_pl TEXT DEFAULT '',
      content_en TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS case_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id TEXT NOT NULL,
      task_key TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT DEFAULT 'not_started',
      required BOOLEAN DEFAULT true,
      notes TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(case_id, task_key)
    );

    CREATE TABLE IF NOT EXISTS eej_legal_cases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      worker_name TEXT,
      case_type TEXT NOT NULL DEFAULT 'TRC',
      status TEXT NOT NULL DEFAULT 'NEW',
      appeal_deadline DATE,
      next_action TEXT,
      blocker_type TEXT NOT NULL DEFAULT 'NONE',
      blocker_reason TEXT,
      stage_entered_at TIMESTAMPTZ DEFAULT NOW(),
      sla_deadline TIMESTAMPTZ,
      voivodeship TEXT,
      mos_fee_pln NUMERIC(10,2),
      notes TEXT,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_eej_cases_worker ON eej_legal_cases(worker_id);
    CREATE INDEX IF NOT EXISTS idx_eej_cases_status ON eej_legal_cases(status);
    CREATE INDEX IF NOT EXISTS idx_eej_cases_sla ON eej_legal_cases(sla_deadline);

    CREATE TABLE IF NOT EXISTS eej_case_generated_docs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id UUID NOT NULL,
      doc_type TEXT NOT NULL,
      title_pl TEXT NOT NULL,
      title_en TEXT NOT NULL,
      content_pl TEXT,
      content_en TEXT,
      stage_trigger TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_eej_docs_case ON eej_case_generated_docs(case_id);
    CREATE INDEX IF NOT EXISTS idx_eej_docs_status ON eej_case_generated_docs(status);

    CREATE TABLE IF NOT EXISTS eej_case_notebook (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id UUID NOT NULL,
      entry_type TEXT NOT NULL DEFAULT 'manual',
      title TEXT NOT NULL,
      content TEXT,
      author TEXT NOT NULL DEFAULT 'system',
      search_vector TSVECTOR,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_eej_notebook_case ON eej_case_notebook(case_id);
    CREATE INDEX IF NOT EXISTS idx_eej_notebook_search ON eej_case_notebook USING GIN(search_vector);

    -- ─── Commit 3d: knowledge-graph + POA + signature (FINAL Pattern B closure) ───
    -- FK ordering: kg_nodes precedes kg_edges (which has 2 FKs to kg_nodes).
    -- kg_nodes PK is TEXT (intentional — graph IDs are domain-specific strings).
    CREATE TABLE IF NOT EXISTS kg_nodes (
      id TEXT PRIMARY KEY,
      node_type TEXT NOT NULL,
      label TEXT NOT NULL,
      properties JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_kg_nodes_type ON kg_nodes(node_type);

    CREATE TABLE IF NOT EXISTS kg_edges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
      edge_type TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      properties JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(source_id, target_id, edge_type)
    );
    CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON kg_edges(source_id);
    CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON kg_edges(target_id);
    CREATE INDEX IF NOT EXISTS idx_kg_edges_type ON kg_edges(edge_type);

    CREATE TABLE IF NOT EXISTS kg_patterns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pattern_type TEXT NOT NULL,
      description TEXT NOT NULL,
      conditions JSONB DEFAULT '{}'::jsonb,
      outcome TEXT NOT NULL,
      frequency INT DEFAULT 1,
      confidence REAL DEFAULT 0.5,
      example_worker_ids JSONB DEFAULT '[]'::jsonb,
      legal_articles JSONB DEFAULT '[]'::jsonb,
      voivodeships JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

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
    );
    CREATE INDEX IF NOT EXISTS idx_eej_poa_worker ON eej_poa_registry(worker_id);
    CREATE INDEX IF NOT EXISTS idx_eej_poa_status ON eej_poa_registry(status);

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
    );
    CREATE INDEX IF NOT EXISTS idx_eej_rodo_worker ON eej_rodo_consents(worker_id);

    CREATE TABLE IF NOT EXISTS employer_signature_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      employer_name TEXT NOT NULL,
      employer_nip TEXT,
      link_url TEXT,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      signed BOOLEAN DEFAULT false,
      signed_at TIMESTAMPTZ,
      deadline TIMESTAMPTZ NOT NULL,
      alert_sent BOOLEAN DEFAULT false,
      notes TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // 3c trigger: auto-populate eej_case_notebook.search_vector for full-text search.
  // Separate db.execute() because DROP TRIGGER ... ON eej_case_notebook requires
  // the table to exist (created in the block above). CREATE OR REPLACE FUNCTION
  // and DROP TRIGGER IF EXISTS + CREATE TRIGGER are both idempotent.
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION eej_notebook_search_update() RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector := to_tsvector('simple', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS eej_notebook_search_trigger ON eej_case_notebook;
    CREATE TRIGGER eej_notebook_search_trigger BEFORE INSERT OR UPDATE ON eej_case_notebook
      FOR EACH ROW EXECUTE FUNCTION eej_notebook_search_update();
  `);

  // ═══ Stage 4: TIMESTAMP → TIMESTAMPTZ uniformity ═══
  // Convert existing naive timestamps to UTC using Europe/Warsaw as the source
  // zone. Idempotent: only converts columns currently 'timestamp without time zone'.
  const TIMESTAMP_COLS: [string, string][] = [
    ["workers", "created_at"], ["workers", "updated_at"],
    ["workers", "gdpr_consent_date"], ["workers", "gdpr_data_exported_at"],
    ["workers", "gdpr_erasure_requested_at"], ["workers", "gdpr_erased_at"],
    ["users", "created_at"], ["users", "updated_at"],
    ["system_users", "created_at"],
    ["clients", "created_at"], ["clients", "updated_at"],
    ["audit_entries", "timestamp"],
    ["payroll_records", "created_at"],
    ["notifications", "sent_at"],
    ["worker_notes", "updated_at"],
    ["portal_daily_logs", "submitted_at"],
    ["file_attachments", "uploaded_at"],
    ["alert_results", "ran_at"],
    ["job_postings", "created_at"], ["job_postings", "updated_at"],
    ["job_applications", "applied_at"], ["job_applications", "updated_at"],
    ["interviews", "scheduled_at"], ["interviews", "created_at"], ["interviews", "updated_at"],
    ["invoices", "paid_at"], ["invoices", "created_at"], ["invoices", "updated_at"],
    ["gdpr_requests", "requested_at"], ["gdpr_requests", "completed_at"],
    ["work_permit_applications", "submitted_at"],
    ["work_permit_applications", "created_at"], ["work_permit_applications", "updated_at"],
    ["regulatory_updates", "fetched_at"],
    ["immigration_searches", "searched_at"],
    ["agencies", "trial_ends_at"], ["agencies", "created_at"], ["agencies", "updated_at"],
    ["gps_checkins", "timestamp"],
    ["legal_cases", "decided_at"], ["legal_cases", "created_at"], ["legal_cases", "updated_at"],
    ["legal_articles", "last_verified"], ["legal_articles", "created_at"],
    ["contract_templates", "created_at"], ["contract_templates", "updated_at"],
    ["otp_sessions", "expires_at"],
    ["onboarding_checklists", "completed_at"], ["onboarding_checklists", "created_at"],
    ["crm_deals", "created_at"], ["crm_deals", "updated_at"],
    ["geofence_sites", "created_at"],
    ["legal_snapshots", "created_at"],
    ["legal_evidence", "verified_at"], ["legal_evidence", "uploaded_at"],
    ["legal_documents", "approved_at"], ["legal_documents", "sent_at"],
    ["legal_documents", "created_at"], ["legal_documents", "updated_at"],
    ["legal_suggestions", "dismissed_at"], ["legal_suggestions", "acted_on_at"],
    ["legal_suggestions", "created_at"],
    ["legal_approvals", "approved_at"], ["legal_approvals", "created_at"],
    ["legal_notifications", "sent_at"], ["legal_notifications", "created_at"],
    ["communication_outputs", "approved_at"], ["communication_outputs", "generated_at"],
    ["communication_outputs", "sent_at"],
    ["document_action_log", "created_at"],
  ];
  const IDENT_RE = /^[a-z_][a-z0-9_]*$/;
  let tzConverted = 0, tzSkipped = 0, tzErrors = 0;
  for (const [table, col] of TIMESTAMP_COLS) {
    if (!IDENT_RE.test(table) || !IDENT_RE.test(col)) {
      console.warn(`[db] skipping TZ migration — unsafe identifier: ${table}.${col}`);
      continue;
    }
    try {
      const check = await db.execute(sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = ${table} AND column_name = ${col}
      `);
      const dataType = (check.rows[0] as { data_type?: string } | undefined)?.data_type;
      if (!dataType) { tzSkipped++; continue; }
      if (dataType !== "timestamp without time zone") { tzSkipped++; continue; }
      await db.execute(sql.raw(
        `ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE TIMESTAMPTZ USING "${col}" AT TIME ZONE 'Europe/Warsaw'`
      ));
      tzConverted++;
    } catch (e) {
      tzErrors++;
      console.warn(`[db] TIMESTAMPTZ migration failed for ${table}.${col}:`, e instanceof Error ? e.message : e);
    }
  }
  if (tzConverted > 0 || tzErrors > 0) {
    console.log(`[db] TIMESTAMPTZ migration: ${tzConverted} converted, ${tzSkipped} already TZ / not present, ${tzErrors} errors`);
  }

  // ═══ Stage 4: PII backfill (plaintext PESEL/IBAN → AES-GCM) ═══
  // One-shot backfill for legacy rows written before the encryption layer.
  try {
    const { rows: legacyRows } = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM workers
      WHERE (pesel IS NOT NULL AND pesel NOT LIKE 'enc:v1:%')
         OR (iban IS NOT NULL AND iban NOT LIKE 'enc:v1:%')
    `);
    const pending = (legacyRows[0] as { cnt: number } | undefined)?.cnt ?? 0;
    if (pending > 0) {
      console.warn(`[db] Found ${pending} worker row(s) with plaintext PII — running backfill`);
      const { backfillPII } = await import("../lib/pii-backfill.js");
      const result = await backfillPII();
      console.log(`[db] PII backfill: scanned=${result.scanned}, encrypted=${result.encrypted}, skipped=${result.skipped}, errors=${result.errors}`);
    }
  } catch (e) {
    console.warn("[db] PII backfill skipped:", e instanceof Error ? e.message : e);
  }

  console.log("[db] Tables created successfully");
}

export async function seedInitialData(): Promise<void> {
  console.log("[db] Seeding initial data...");

  // Seed admin user if not exists
  const existingAdmin = await db.select().from(schema.users).where(
    sql`${schema.users.email} = 'anna.b@edu-jobs.eu'`
  );

  if (existingAdmin.length === 0) {
    await db.insert(schema.users).values({
      email: "anna.b@edu-jobs.eu",
      name: "Anna Bondarenko",
      role: "admin",
      site: null,
      passwordHash: null, // Admin uses EEJ_ADMIN_PASSWORD env var
    });
    console.log("[db] Seeded admin user: anna.b@edu-jobs.eu");
  }

  // Seed admin profile if not exists
  const existingProfile = await db.select().from(schema.adminProfile);
  if (existingProfile.length === 0) {
    await db.insert(schema.adminProfile).values({
      fullName: "Anna Bondarenko",
      email: "anna.b@edu-jobs.eu",
      phone: "",
      role: "Administrator",
    });
    console.log("[db] Seeded admin profile");
  }

  // Seed system users (EEJ mobile) only when EEJ_SEED_PASSWORD is set.
  // Never hardcode credentials — production systems must bootstrap via env var,
  // then rotate user passwords through the in-app change-password flow.
  const INITIAL_PASSWORD = process.env.EEJ_SEED_PASSWORD;
  if (!INITIAL_PASSWORD) {
    console.warn("[db] EEJ_SEED_PASSWORD not set — skipping system user seed (set this env var once to bootstrap)");
  } else {
    const seedUsers = [
      { name: "Anna Bondarenko", email: "anna.b@edu-jobs.eu", role: "T1", designation: "Executive Board & Finance", shortName: "Executive" },
      { name: "Anna Bondarenko", email: "ceo@euro-edu-jobs.eu", role: "T1", designation: "Executive Board & Finance", shortName: "Executive" },
      { name: "Marta Wi\u015Bniewska", email: "legal@euro-edu-jobs.eu", role: "T2", designation: "Head of Legal & Client Relations", shortName: "Legal & Compliance" },
      { name: "Piotr Nowak", email: "ops@euro-edu-jobs.eu", role: "T3", designation: "Workforce & Commercial Operations", shortName: "Operations" },
    ];

    for (const u of seedUsers) {
      const existing = await db.select().from(schema.systemUsers).where(
        sql`${schema.systemUsers.email} = ${u.email}`
      );
      if (existing.length === 0) {
        const hash = await hashPassword(INITIAL_PASSWORD);
        await db.insert(schema.systemUsers).values({
          name: u.name,
          email: u.email,
          passwordHash: hash,
          role: u.role,
          designation: u.designation,
          shortName: u.shortName,
        });
        console.log(`[db] Seeded system user: ${u.email} (${u.role})`);
      }
    }
  }

  // ── Seed sample workers if < 5 exist ──────────────────────────────────────
  const workerCount = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM workers`);
  const wCnt = (workerCount.rows[0] as { cnt: number }).cnt;
  if (wCnt < 5) {
    await db.execute(sql`
      INSERT INTO workers (name, email, phone, job_role, nationality, experience, qualification, assigned_site, hourly_netto_rate, contract_type, contract_end_date, trc_expiry, work_permit_expiry, bhp_status, pesel, visa_type, pipeline_stage)
      VALUES
        ('Mariusz Kowalski', 'mariusz.k@example.com', '+48501000001', 'Welder', 'Polish', '8 years', 'ISO 9606', 'Wroclaw-Site-A', 35.00, 'umowa_o_prace', '2027-06-30', NULL, NULL, 'valid', '90010112345', NULL, 'Active'),
        ('Daria Shevchenko', 'daria.s@example.com', '+48501000002', 'Healthcare Assistant', 'Ukrainian', '3 years', 'Nursing Diploma', 'Warsaw-MediCare', 32.00, 'umowa_zlecenie', '2026-09-15', '2026-08-01', '2026-07-15', 'valid', NULL, 'type_a', 'Active'),
        ('Ahmed Al-Rashid', 'ahmed.r@example.com', '+48501000003', 'Construction Worker', 'Egyptian', '5 years', 'BHP Certificate', 'Wroclaw-Site-B', 28.50, 'umowa_zlecenie', '2026-05-31', '2026-04-20', '2026-04-15', 'expired', NULL, 'seasonal', 'Active'),
        ('Natalia Petrenko', 'natalia.p@example.com', '+48501000004', 'HR Coordinator', 'Ukrainian', '4 years', 'BA Human Resources', 'Warsaw-HQ', 40.00, 'umowa_o_prace', '2027-12-31', '2027-03-01', '2027-03-01', 'valid', NULL, 'type_a', 'Active'),
        ('Oleksandr Bondar', 'oleksandr.b@example.com', '+48501000005', 'Electrician', 'Ukrainian', '6 years', 'SEP Certificate', 'Poznan-LogiTrans', 33.00, 'umowa_zlecenie', '2026-07-31', '2026-06-10', '2026-06-10', 'valid', NULL, 'oswiadczenie', 'Active'),
        ('Andreea Moldovan', 'andreea.m@example.com', '+48501000006', 'Warehouse Operative', 'Romanian', '2 years', 'Forklift License', 'Poznan-LogiTrans', 26.00, 'umowa_zlecenie', '2026-12-31', NULL, NULL, 'valid', NULL, NULL, 'Placed'),
        ('Giorgi Kvaratskhelia', 'giorgi.k@example.com', '+48501000007', 'Welder', 'Georgian', '7 years', 'ISO 9606 TIG/MIG', 'Wroclaw-Site-A', 38.00, 'umowa_o_prace', '2027-03-31', '2026-12-15', '2026-12-15', 'valid', NULL, 'type_a', 'Active'),
        ('Elena Raducanu', 'elena.r@example.com', '+48501000008', 'Quality Inspector', 'Romanian', '4 years', 'ISO 9001 Auditor', 'Wroclaw-Site-B', 36.00, 'umowa_o_prace', '2027-06-30', NULL, NULL, 'valid', '92050567890', NULL, 'Active'),
        ('Rajesh Nair', 'rajesh.n@example.com', '+48501000009', 'IT Support', 'Indian', '5 years', 'CompTIA A+', 'Warsaw-HQ', 42.00, 'umowa_zlecenie', '2026-08-31', '2026-05-01', '2026-05-01', 'pending', NULL, 'type_b', 'Screening'),
        ('Nguyen Thi Lan', 'nguyen.l@example.com', '+48501000010', 'Cook', 'Vietnamese', '3 years', 'Culinary Certificate', 'Warsaw-Restaurant', 27.00, 'umowa_zlecenie', '2026-11-30', '2027-01-15', '2027-01-15', 'valid', NULL, 'type_a', 'Active')
      ON CONFLICT DO NOTHING
    `);
    console.log("[db] Seeded 10 sample workers");
  }

  // ── Seed sample job postings ─────────────────────────────────────────────
  const jobCount = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM job_postings`);
  const jCnt = (jobCount.rows[0] as { cnt: number }).cnt;
  if (jCnt === 0) {
    await db.execute(sql`
      INSERT INTO job_postings (title, description, requirements, location, salary_min, salary_max, currency, contract_type, is_published)
      VALUES
        ('Construction Worker', 'General construction duties including bricklaying, concrete work, and site maintenance. Experience with Polish building codes preferred.', 'BHP certificate, min 1 year experience, physical fitness', 'Wroclaw', 28, 35, 'PLN', 'umowa_zlecenie', true),
        ('Healthcare Assistant', 'Providing patient care support in a private clinic. Duties include patient intake, basic medical procedures, and documentation.', 'Medical training certificate, Polish B1 level, valid work permit', 'Warsaw', 32, 40, 'PLN', 'umowa_o_prace', true),
        ('Warehouse Operative', 'Order picking, packing, and inventory management in a modern logistics center. Forklift operation required.', 'Forklift license (UDT), BHP certificate, ability to lift 20kg', 'Poznan', 25, 30, 'PLN', 'umowa_zlecenie', true)
    `);
    console.log("[db] Seeded 3 sample job postings");
  }

  // ── Seed sample invoices ─────────────────────────────────────────────────
  const invCount = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM invoices`);
  const iCnt = (invCount.rows[0] as { cnt: number }).cnt;
  if (iCnt === 0) {
    // We need client IDs — seed clients first if needed
    const clientCount = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM clients`);
    const cCnt = (clientCount.rows[0] as { cnt: number }).cnt;
    if (cCnt === 0) {
      await db.execute(sql`
        INSERT INTO clients (name, contact_person, email, phone, nip, billing_rate)
        VALUES
          ('BuildPro Sp. z o.o.', 'Jan Majewski', 'jan@buildpro.pl', '+48221000001', '5271234567', 45.00),
          ('MediCare Polska', 'Agnieszka Kowalczyk', 'a.kowalczyk@medicare.pl', '+48221000002', '5271234568', 55.00),
          ('LogiTrans S.A.', 'Tomasz Wisniak', 't.wisniak@logitrans.pl', '+48221000003', '5271234569', 35.00)
      `);
      console.log("[db] Seeded 3 sample clients");
    }
    // Get client IDs
    const buildpro = await db.execute(sql`SELECT id FROM clients WHERE name = 'BuildPro Sp. z o.o.' LIMIT 1`);
    const medicare = await db.execute(sql`SELECT id FROM clients WHERE name = 'MediCare Polska' LIMIT 1`);
    const logitrans = await db.execute(sql`SELECT id FROM clients WHERE name = 'LogiTrans S.A.' LIMIT 1`);
    if (buildpro.rows.length > 0 && medicare.rows.length > 0 && logitrans.rows.length > 0) {
      const bId = (buildpro.rows[0] as { id: string }).id;
      const mId = (medicare.rows[0] as { id: string }).id;
      const lId = (logitrans.rows[0] as { id: string }).id;
      await db.execute(sql`
        INSERT INTO invoices (invoice_number, client_id, month_year, items, subtotal, vat_rate, vat_amount, total, status, due_date, paid_at)
        VALUES
          ('EEJ-202603-0001', ${bId}, '2026-03', '[]'::jsonb, 36585.37, 0.23, 8414.63, 45000.00, 'paid', '2026-03-31', '2026-03-25'),
          ('EEJ-202603-0002', ${mId}, '2026-03', '[]'::jsonb, 22764.23, 0.23, 5235.77, 28000.00, 'sent', '2026-04-15', NULL),
          ('EEJ-202603-0003', ${lId}, '2026-03', '[]'::jsonb, 12195.12, 0.23, 2804.88, 15000.00, 'draft', '2026-04-30', NULL)
      `);
      console.log("[db] Seeded 3 sample invoices");
    }
  }

  // ── Seed regulatory updates ──────────────────────────────────────────────
  const regCount = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM regulatory_updates`);
  const rCnt = (regCount.rows[0] as { cnt: number }).cnt;
  if (rCnt === 0) {
    await db.execute(sql`
      INSERT INTO regulatory_updates (source, title, summary, category, severity, fine_amount, action_required, workers_affected, cost_impact, deadline_change)
      VALUES
        ('Dziennik Ustaw', 'New Work Permit Processing Requirements', 'The Ministry of Family and Social Policy has introduced updated documentation requirements for Type A work permits effective April 2026. All applications must now include employer ZUS compliance certificates.', 'work_permits', 'warning', NULL, '["Update permit application templates", "Obtain ZUS compliance certificates for all active employers", "Notify affected workers of potential processing delays"]'::jsonb, 15, 'increase PLN 200/application', 'new deadline 2026-04-15'),
        ('ZUS Portal', 'ZUS Contribution Rate Increase for 2026 Q2', 'Social insurance (ZUS) contribution rates for accident insurance have been revised upward by 0.2 percentage points for construction sector employers, effective 2026-04-01.', 'zus', 'critical', 'PLN 5,000-30,000 per violation', '["Recalculate payroll for all construction workers", "Update billing rates for construction clients", "File amended ZUS DRA declarations"]'::jsonb, 25, 'increase PLN 45/worker/month', NULL),
        ('MOS Portal', 'MOS Foreigners Portal Scheduled Maintenance', 'The MOS (Modulo Obslugi Spraw) portal for foreigner affairs will undergo planned maintenance from March 30 to April 2, 2026. All residence permit and work permit applications must be submitted before or after this window.', 'immigration', 'info', NULL, '["Submit pending applications before March 30", "Reschedule any planned submissions", "Inform affected workers"]'::jsonb, 8, NULL, 'portal offline 2026-03-30 to 2026-04-02'),
        ('PIP (Labour Inspectorate)', 'Increased Fines for BHP Non-Compliance', 'The National Labour Inspectorate (PIP) has announced enhanced enforcement of BHP (occupational health and safety) requirements. Fines for missing or expired BHP certificates have been doubled effective immediately.', 'labor_code', 'critical', 'PLN 10,000-50,000 per worker', '["Audit all worker BHP certificate expiry dates", "Schedule immediate BHP training for expired certificates", "Update compliance dashboard alerts"]'::jsonb, 12, 'risk PLN 120,000 total exposure', NULL),
        ('Urzad ds. Cudzoziemcow', '7-Day Reporting Rule Enforcement Update', 'Immigration authorities have reiterated strict enforcement of the 7-day reporting obligation for employers hiring foreign workers. Employers must report commencement of work within 7 days of the work permit start date or face administrative penalties.', 'immigration', 'warning', 'PLN 2,000-10,000 per violation', '["Review all recent hires for 7-day compliance", "Set up automated reminders for new work permit activations", "Train coordinators on reporting procedures"]'::jsonb, 20, 'risk PLN 40,000 if non-compliant', 'strict enforcement from 2026-04-01')
    `);
    console.log("[db] Seeded 5 regulatory updates");
  }

  console.log("[db] Seeding complete");
}

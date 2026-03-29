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

    -- Indexes
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
  `);

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
      name: "Anna Brzozowska",
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
      fullName: "Anna Brzozowska",
      email: "anna.b@edu-jobs.eu",
      phone: "",
      role: "Administrator",
    });
    console.log("[db] Seeded admin profile");
  }

  // Seed system users (EEJ mobile) if not exist
  const INITIAL_PASSWORD = "EEJ2026!";
  const seedUsers = [
    { name: "Anna Brzozowska", email: "anna.b@edu-jobs.eu", role: "T1", designation: "Executive Board & Finance", shortName: "Executive" },
    { name: "Anna Brzozowska", email: "ceo@euro-edu-jobs.eu", role: "T1", designation: "Executive Board & Finance", shortName: "Executive" },
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

  console.log("[db] Seeding complete");
}

# EURO-EDU-JOBS (EEJ) Platform

## Business Purpose
EEJ is a Polish labor compliance, recruitment, and workforce management platform for Euro Edu Jobs — a staffing agency managing foreign workers in Poland. It handles the full lifecycle: recruitment (job board, ATS pipeline), compliance (work permits, TRC, BHP, contracts), payroll (ZUS/PIT calculations), regulatory intelligence (Polish law monitoring), and workforce tracking (GPS, timesheets).

## GitHub Repository
`Maac1980/EURO-EDU-JOBS-app`

## Deployment
- **Primary:** Fly.io app `eej-jobs-api` (region `ams`, 2 machines)
- **Deploy command:** `~/.fly/bin/flyctl deploy -a eej-jobs-api`
- **Build:** `pnpm build` (builds api-server + eej-mobile + apatris-dashboard)
- **Run:** `node artifacts/api-server/dist/index.cjs`
- **Health Check:** `GET /api/healthz` → https://eej-jobs-api.fly.dev/api/healthz
- **Port:** 8080 internal → 443 external (HTTPS via Fly, force_https = true)
- **Secrets:** set via `flyctl secrets set -a eej-jobs-api KEY=value` (see Environment Variables)

## Tech Stack

### Backend
- **Runtime:** Node.js 24, TypeScript, Express 5
- **Database:** PostgreSQL (Drizzle ORM, 22 tables)
- **Auth:** JWT (15min tokens + refresh), Airtable user management, TOTP 2FA
- **Security:** Helmet, CORS, express-rate-limit
- **AI:** Anthropic Claude (document OCR, compliance copilot), Perplexity (regulatory search)
- **Email:** Brevo SMTP / Resend / Nodemailer
- **SMS:** Twilio (SMS + WhatsApp)
- **Storage:** Cloudflare R2 (S3-compatible)
- **Payments:** Stripe (agency subscriptions)
- **Maps:** Mapbox (GPS tracking)
- **Scheduling:** node-cron (daily regulatory scans, compliance alerts)
- **Logging:** Pino, Sentry

### Frontend (EEJ Mobile App)
- **Location:** `eej-mobile-HIDDEN/`
- **Framework:** React 19, Vite 8, TypeScript
- **Styling:** Tailwind CSS 4, Radix UI components
- **State:** TanStack React Query, React Context
- **Routing:** State-based tab navigation (no URL routing)
- **Design:** Mobile-first PWA (430px container)
- **RBAC:** 4-tier (T1 Executive, T2 Legal, T3 Operations, T4 Candidate)

### Monorepo Structure
```
/                          # pnpm workspace root
├── artifacts/
│   ├── api-server/        # Express API (95+ endpoints)
│   ├── eej-mobile/        # Replit artifact version
│   ├── apatris-dashboard/ # Dashboard app
│   └── mockup-sandbox/    # UI staging
├── eej-mobile-HIDDEN/     # Main mobile app source
├── lib/
│   ├── db/                # Drizzle schema & migrations
│   ├── api-zod/           # Shared Zod schemas
│   └── api-client-react/  # React API hooks
└── scripts/               # Deployment scripts
```

## Features Built

### Recruitment & ATS
1. **Job Board** — Public job listings with search, salary, location
2. **ATS Pipeline** — 8-stage Kanban (New → Screening → Interview → Offer → Placed → Active → Released → Blacklisted)
3. **Smart Matching** — AI candidate-job matching (score 0-100 based on role, experience, docs, location)
4. **Interview Scheduling** — Schedule, feedback, pass/fail tracking
5. **Public Application** — Landing page with CV upload + AI extraction

### Worker Management
6. **Worker Database** — Full profiles (60+ fields: contact, docs, rates, compliance)
7. **Candidate List** — Search, filter by status (cleared/expiring/missing/pending)
8. **Bulk Import** — CSV import, AI-powered document scanning (passport/BHP/CV)
9. **Worker Notes** — Internal notes per worker

### Compliance & Documents
10. **Document Tracking** — 8+ expiry fields with color zones (green >60d, yellow 30-60d, red <30d, expired)
11. **Compliance Alerts** — Email/WhatsApp notifications for expiring docs
12. **AI Document Scanning** — Claude OCR for passport, contract, CV auto-fill
13. **GDPR Tools** — Data export, right to be forgotten, RODO consent tracking

### Payroll & Finance
14. **ZUS Calculator** — Full Polish payroll calc (Umowa Zlecenie + Umowa o Prace)
15. **Payroll Records** — Monthly payroll with ZUS/PIT breakdown
16. **Invoicing** — Faktura VAT generation (PDF), status tracking (draft/sent/paid)
17. **Stripe Billing** — Agency subscription plans (Starter/Professional/Enterprise)

### Immigration & Regulatory
18. **Work Permit Tracker** — Type A/B/C/Seasonal/Oswiadczenie, document checklists, 7-day deadlines
19. **Regulatory Intelligence** — AI-powered daily scans of Polish gov sources (praca.gov.pl, ZUS, PIP, Sejm)
20. **Immigration Search Engine** — Perplexity + Claude analysis with sources, confidence scores
21. **Compliance Copilot** — Streaming AI Q&A on Polish labor law

### Operations
22. **GPS Tracking** — Worker check-in/out with Mapbox, site geofencing
23. **Contract Generation** — Polish labor contracts (Zlecenie/Prace) as PDF
24. **Worker Portal** — Self-service hour tracking with 30-day JWT tokens
25. **Audit Logging** — Immutable trail of all system actions

### Platform
26. **Multi-Role Dashboard** — Role-specific home pages (Executive, Legal, Operations, Candidate)
27. **Platform Modules** — ZUS Ledger, Timesheets, PIP Compliance, B2B Contracts, BHP Medical
28. **Notification System** — Email, WhatsApp, SMS alerts
29. **Client Management** — Client records with NIP, billing rates

## Environment Variables

### Required
```
DATABASE_URL=postgresql://user:password@localhost:5432/eej
JWT_SECRET=<random-64-char-hex>
EEJ_ADMIN_EMAIL=anna.b@edu-jobs.eu
EEJ_ADMIN_PASSWORD=<admin-password>
```

### AI Services
```
ANTHROPIC_API_KEY=sk-ant-api-...
PERPLEXITY_API_KEY=pplx-...
```

### Email (Brevo SMTP)
```
BREVO_SMTP_USER=<brevo-login>
BREVO_SMTP_PASS=<brevo-password>
ALERT_EMAIL_TO=admin@edu-jobs.eu
```

### SMS (Twilio)
```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=<token>
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_SMS_FROM=+1234567890
```

### Storage (Cloudflare R2)
```
R2_ACCOUNT_ID=<account>
R2_ACCESS_KEY_ID=<key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET_NAME=eej-documents
```

### Payments (Stripe)
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Maps
```
MAPBOX_PUBLIC_TOKEN=pk.eyJ1...
```

### Scheduling
```
ALERT_CRON=0 8 * * *
REGULATORY_CRON=0 7 * * *
```

## Database
- PostgreSQL with Drizzle ORM
- 22 tables including: workers, job_postings, job_applications, interviews, invoices, work_permit_applications, regulatory_updates, immigration_searches, gps_checkins, payroll_records, audit_entries, notifications
- Push schema: `cd lib/db && pnpm push`

## API Structure
- 95+ endpoints across 26 route files in `artifacts/api-server/src/routes/`
- Key route groups: auth, workers, jobs, applications, interviews, contracts, invoices, permits, regulatory, immigration, gps, payroll, compliance, gdpr, billing, admin, portal, notifications, audit

## Airtable Integration
- `System_Users` table for multi-tenant user management
- 4 seed users: T1 Executive, T2 Legal, T3 Operations (password: EEJ2026!)
- Fields: Name, Email, Password_Hash, Role, Designation, Short_Name

## Mobile App Navigation
- Bottom nav: Home, Candidates, Jobs, Alerts, More
- "More" menu grid links to: ATS Pipeline, Interviews, Contracts, Invoices, Regulatory Intelligence, Immigration Search, Work Permits, GPS Tracking, ZUS Calculator, Profile
- State-based tab switching (no URL routing)

---

## ROADMAP — Phase 1-3 Execution Plan

### Owner: Manish Shetty
### Companies: EEJ (Euro Edu Jobs), Apatris, IWS, STPG
### Workers: 200+ foreign workers across Poland

---

## RULES (MUST FOLLOW)
- Always use pnpm not npm
- Always build dist before pushing
- Always test ZUS formula: 160h × 31.40 = 3929.05 net
- Never use DROP TABLE or DROP COLUMN — only CREATE TABLE IF NOT EXISTS / ALTER TABLE ... IF EXISTS
- Never break existing features
- Use DATABASE_URL for EEJ database connection
- Push to `master` branch for EEJ
- After every change: build dist → copy to artifacts → commit → push
- Deploy: `~/.fly/bin/flyctl deploy -a eej-jobs-api` (Fly.io, region `ams`)
- Vite base must be "/" not "/eej-mobile/"
- .gitignore must NOT contain "dist" — frontend dist must stay tracked

## STAGE 4 SECURITY STANDARDS (MUST FOLLOW)
- All PESEL / IBAN writes pass through `lib/encryption.ts` (`encrypt()`) — AES-256-GCM, format `enc:v1:<iv>:<tag>:<ciphertext>`
- Reads use `decrypt()` which tolerates legacy plaintext (backward compat)
- Role masking: T1/T2 see plaintext; T3/T4 see `***-****-NNNN` via `projectWorkerPII()` or `workerToCandidate(row, viewerRole)`
- Audit log never stores raw PII — use `"[encrypted]"` sentinel on changes
- All queries to tenanted tables (workers, users, clients, payroll_records, invoices, work_permit_applications) MUST filter by `tenant_id`
- Use `requireTenant(req)` + `scopedWhere(tenantId, col)` from `lib/tenancy.ts`
- Tenants table is authoritative — `tenant_id` columns are FK to `tenants(slug)`
- Audit log is INSERT-ONLY — do NOT add DELETE or UPDATE endpoints on `audit_entries`
- Money columns must be `NUMERIC(10,2)` — never REAL or FLOAT
- All timestamp columns must be `TIMESTAMPTZ` — convert via `AT TIME ZONE 'Europe/Warsaw'`
- No hardcoded passwords anywhere — use env vars (`EEJ_ADMIN_PASSWORD`, `EEJ_SEED_PASSWORD`, `EEJ_ENCRYPTION_KEY`)
- Stripe webhooks require `STRIPE_WEBHOOK_SECRET` — reject without signature
- CORS allowlist via `ALLOWED_ORIGINS` env — no wildcards
- Required Fly secrets: JWT_SECRET, DATABASE_URL, EEJ_ADMIN_PASSWORD, EEJ_ENCRYPTION_KEY, ANTHROPIC_API_KEY, PERPLEXITY_API_KEY, BREVO_SMTP_USER, BREVO_SMTP_PASS

## DECISION MAKING (MUST FOLLOW)
- Never ask "shall I proceed?" or "which option do you prefer?"
- Always pick the best option yourself and execute it
- If genuinely ambiguous (50/50 with real consequences), state your choice and why in one line, then execute
- Never present numbered options for the user to choose from
- Never stop to ask for approval mid-task
- Just build it

## EXECUTION STYLE (MUST FOLLOW)
- Read CLAUDE.md before starting any task
- Execute without stopping
- Test before pushing to GitHub
- Always push AND fly deploy (not just git push): `~/.fly/bin/flyctl deploy -a eej-jobs-api`
- Commit after each logical unit, not in one big batch
- If something fails, fix it and continue — don't stop to ask

## VALIDATION FRAMEWORK (RUN AFTER EVERY BUILD)
After every build, run this validation before saying "done":

### Step 1 — Functional Test
- Happy path: does the feature work end-to-end?
- Missing data: what happens with empty/null inputs?
- Edge case: duplicate data, expired dates, wrong format

### Step 2 — Logic Check
- No conflicts between new and existing code
- No duplicate functions across files
- AI layer isolated from decision logic
- All outputs default to DRAFT

### Step 3 — Safety Check
- No unsafe automatic external actions (WhatsApp, email, SMS)
- Approval layer respected — nothing sent without explicit approval
- Test workers blocked from external communication
- Safe fallback on failure (no crash, no data loss)

### Step 4 — Regression Check
- Login still works
- Dashboard still serves
- Mobile app still serves
- Workers API returns data
- Existing features not broken

### Step 5 — Security Check
- New endpoints use authenticateToken
- No sensitive data exposed without auth
- Test data isolated by tenant_id

### Step 6 — Performance Check
- No N+1 query patterns (loop with DB call inside)
- Scalable for 200-500 workers

### Step 7 — Report (REQUIRED)
Output a clear report with:
1. What works (with evidence)
2. What is broken (with detail)
3. Critical issues (fix now)
4. High issues (fix soon)
5. Medium/low issues
6. What needs manual testing

DO NOT say "build succeeded" or "everything works" without running this validation and showing evidence.

---

## PHASE 1 — WEEK 1: Core Business Tools (21 Features)

### 1. CRM Module
- Client list: company name, NIP, contact person, email, phone
- Deal pipeline: Lead → Proposal → Negotiation → Won → Active
- Activity log per client
- Link clients to workers
- Dashboard widget showing pipeline value

### 2. Client Portal
- Read-only access for clients to see worker compliance
- Secure token-based access

### 3. Worker Self-Service Portal
- Workers login, see documents, submit hours, upload docs

### 4. Google Workspace Integration
- Gmail alerts, Calendar scheduling, Drive storage, Chat notifications

### 5. WhatsApp Alerts via Twilio
- Document expiry reminders, payslip delivery, shift notifications

### 6. AI Contract Generator
- Umowa Zlecenie / Umowa o Pracę from worker data, PDF with signatures

### 7. Worker Matching AI
- Match workers to client requests by skill, location, documents

### 8. Predictive Compliance
- 30/60/90 day expiry prediction, risk scoring, PIP readiness

### 9. Salary Prediction AI
- Market rate comparison, retention suggestions

### 10. Legal Change Predictor
- Monitor Dz.U., predict legislation impact

### 11. Revenue Forecasting
- Monthly revenue prediction, utilization tracking, margin analysis

### 12. Onboarding Checklist
- Step-by-step new worker setup with document collection

### 13. Invoice Auto-Send
- Monthly Faktura VAT generation and auto-send

### 14. Salary Advance Request
- Worker requests advance, manager approves, auto-deducted from payroll

### 15. Voice Check-in
- Twilio Voice API for phone-based check-in/out

### 16. Worker Mood Tracker
- Weekly pulse survey, site mood scores

### 17. ESSPASS Integration
- EU digital social security pass tracking

### 18. ZUS/DRA Tax Filing Auto
- Generate ZUS DRA declarations, XML export for e-Płatnik

### 19. Multi-Country Support
- Ireland, Germany, Czech Republic payroll and permits

### 20. Site Safety AI
- Photo scanning for PPE violations

### 21. Competitor Price Monitor
- Track market pricing, alert on changes

---

## PHASE 2 — ENTERPRISE ARCHITECTURE

### Model Routing
- Gemini Flash for fast queries
- Claude Sonnet for complex reasoning
- Llama on AWS Bedrock for private data
- Claude Vision for document scanning
- Perplexity for real-time search

### Sub-Agent Architecture
- Parallel sub-agents: Compliance, Payroll, Immigration, Notification

### AWS Bedrock
- Private model hosting for PESEL/IBAN/passport data

### Google Vertex AI
- AutoML worker matching, demand forecasting, salary prediction

### MCP Servers
- google-workspace, twilio, stripe, neon, github

---

## PHASE 3 — SaaS PLATFORM
- Multi-tenant: any agency can sign up
- Starter €199, Professional €499, Enterprise €999
- White-label option
- Public API + webhook system

# EURO EDU JOBS — Compliance & Recruitment Portal

## Overview

Full-stack international recruitment and compliance management portal (EEJ brand). Built as a pnpm workspace monorepo with TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 19 + Vite + Tailwind CSS v4
- **API framework**: Express 5
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **External Data**: Airtable (via REST API, server-side)

## Brand Identity

- **Primary Color**: `#E9FF70` (Lime Yellow)
- **Foreground on Lime**: `#333333` (Dark Grey)
- **Portal Name**: EURO EDU JOBS (EEJ)

## Structure

```text
artifacts/
├── api-server/           # Express API server — Airtable proxy + compliance logic
└── apatris-dashboard/    # React + Vite frontend — compliance + recruitment dashboard
lib/
├── api-spec/             # OpenAPI spec + Orval codegen config
├── api-client-react/     # Generated React Query hooks
├── api-zod/              # Generated Zod schemas from OpenAPI
└── db/                   # Drizzle ORM (not used — Airtable is the data source)
```

## Key Features

- **Login screen** — Credentials configurable via `VITE_ADMIN_EMAIL` / `VITE_ADMIN_PASSWORD` secrets; defaults to `admin@euro-edu-jobs.eu` / `eej2024`
- **Public Apply Form** — `/apply` route — no auth required; EEJ branding; submits to Airtable with AI CV screening
- **4 Stats Cards** — Total Workers, Critical (<30 days), Upcoming Renewals (30-60 days), Non-Compliant
- **Deployment Tab** — Per-site breakdown, deployed/bench/total stats, "Assigned To" column with lime badges
- **Settings Tab** — Airtable Schema Sync button, Email Alert config reference, Portal Credentials section
- **Worker Table** — Searchable, filterable; columns: Name, Job Role, TRC Expiry, Work Permit, BHP, Experience, Qualification, **Total Hours** (lime badge), Assigned To, Status, Actions
- **Color-coded rows** — Red (critical), Orange (warning), Green (safe)
- **Worker Profile Panel** — Click row for full profile + Document Vault
- **Candidate Edit Panel** — EDIT button → slide-over with doc uploads (Passport/TRC/BHP), Job Role, Experience, Qualification, **Hours Tracker** (Add Shift Hours → accumulates to TOTAL HOURS in Airtable), Assign To Site
- **Action Buttons** — Notify, Renew, EDIT per row
- **Compliance Report** — Generate report button with modal summary
- **AI Smart Upload** — Bulk upload with CV/Resume scan zone; extracts Experience and Qualification
- **AI CV Screening** — Extracts Experience and Qualification from CV/Resume images
- **Automatic Expiry Alerts** — Background cron job (daily at 08:00) checks TRC/BHP/Work Permit expiry dates; emails admin if any candidate's document expires within 14 days

## Airtable Integration

Secrets required:
- `AIRTABLE_API_KEY` — Personal Access Token (**CURRENTLY MISSING — must be added to Replit Secrets**)
- `AIRTABLE_BASE_ID` — Base ID (starts with `app`) — set
- `AIRTABLE_TABLE_NAME` — Table name (default: `Welders`)

### EEJ Preferred Field Names (written on save):
- `Job Role` — candidate profession / welding process
- `Experience` — years of experience string
- `Qualification` — highest academic degree
- `Assigned Site` — deployment site location
- `Email` — email address
- `Phone` — phone number
- `Name` — full name
- `TRC Expiry` — TRC document expiry date
- `Work Permit Expiry` — work permit expiry date
- `BHP EXPIRY` — BHP document expiry date
- `BHP Status` — BHP compliance status text
- `Contract End Date` — contract end date
- `Passport` (attachment) — passport scan
- `Certificate` (attachment) — TRC scan
- `BHP Certificate` (attachment) — BHP scan
- `Contract` (attachment) — contract document

### Flexible Read Resolution (tries both new and old names):
- Job Role / Specialization / Type / Welding Type / Skill / Role
- Experience / Years of Experience / YearsOfExperience
- Qualification / Highest Qualification / HighestQualification / Education
- Assigned Site / Site Location / Assigned To / SiteLocation

### Schema Management:
- `POST /api/workers/admin/ensure-schema` — creates missing EEJ fields via Airtable Metadata API
- `GET /api/workers/admin/schema` — inspect current table schema
- Settings tab in dashboard has a "Sync Airtable Schema" button to trigger this

## Hours Tracker

- `TOTAL HOURS` field added to `EEJ_DESIRED_FIELDS` (number, precision 1 decimal)
- `PATCH /api/workers/:id` with `{ shiftHours: N }` → reads current total from Airtable, adds N, writes new total back
- Frontend: "Add Shift Hours" input in the EDIT slide-over panel (accumulates — never replaces)
- Dashboard table shows Total Hours as a lime badge

## Automatic Expiry Alert System

File: `artifacts/api-server/src/lib/alerter.ts`

Required secrets:
- `AIRTABLE_API_KEY` — data access
- `ALERT_EMAIL_TO` — recipient address
- `SMTP_HOST` — e.g. `smtp.gmail.com`
- `SMTP_PORT` — e.g. `587`
- `SMTP_USER` — SMTP username / Gmail address
- `SMTP_PASS` — SMTP password or App Password
- `SMTP_FROM` — optional sender address

Behaviour:
- Runs once 15s after server start (to catch issues immediately)
- Then daily at 08:00 via cron
- Checks TRC Expiry, BHP Expiry (date-format bhpStatus), Work Permit Expiry
- Threshold: 14 days
- Email: EEJ-branded HTML table with Candidate Name, Document Type, Expiry Date, Days Left

## Credentials System

Frontend credentials are now configurable via Vite env vars:
- `VITE_ADMIN_EMAIL` (default: `admin@euro-edu-jobs.eu`)
- `VITE_ADMIN_PASSWORD` (default: `eej2024`)
- Set these in Replit Secrets to override; `apatris.com` credentials completely removed

## Compliance Logic

- **Critical**: any document expires in < 30 days
- **Warning**: any document expires in 30-60 days
- **Non-Compliant**: BHP Status = "Expired" OR any document already expired
- **Compliant**: all documents > 60 days from expiry

## Candidate Self-Service Portal

Workers get a unique, shareable link to view their own profile and submit hours:

- **URL**: `/portal?token=<JWT>` — public, no admin auth required
- **Token generation**: Admin clicks the 🔗 button in WorkerProfilePanel → copies URL to clipboard
- **Token lifespan**: 30 days (JWT signed with `JWT_SECRET`, payload `{ workerId, type: "portal" }`)
- **Worker can see**: name, job role, site, compliance status, all document expiry dates, payout estimate
- **Worker can do**: submit/update their total hours for the month
- **Payout estimate**: gross (hours × rate) − advance = final payout (zł), live-calculated
- **Audit logged**: every self-service hours update is recorded in `audit.json`

## Audit Trail

File: `artifacts/api-server/data/audit.json` (auto-created, max 2000 entries, rotating)

- Every admin `PATCH /api/workers/:id` is logged with fields changed
- Every candidate portal hours update is logged with `actor: "candidate-portal"`
- Viewable in Settings tab → "Audit Trail" section (expandable, newest first, lazy load)
- `GET /api/audit` — admin only (Bearer JWT required)
- `DELETE /api/audit` — clears the log (admin only)

## API Endpoints

All at `/api`:
- `POST /apply` — Public candidate application (no auth); creates Airtable record with AI CV screening
- `GET /workers` — list all workers (with search/specialization/status filters)
- `GET /workers/stats` — dashboard stats
- `GET /workers/report` — compliance report
- `POST /workers/bulk-create` — AI Smart Upload (passport, bhp, cert, contract, cv)
- `GET /workers/:id` — worker detail
- `PATCH /workers/:id` — update worker fields (writes to EEJ field names, audit logged)
- `POST /workers/:id/upload` — upload & AI-scan document
- `POST /workers/:id/notify` — send notification
- `POST /workers/admin/ensure-schema` — create missing Airtable fields
- `GET /workers/admin/schema` — view table schema
- `GET /api/portal/token/:recordId` — (admin) generate worker's self-service portal link
- `GET /api/portal/me?token=xxx` — (candidate) fetch own profile
- `PATCH /api/portal/hours?token=xxx` — (candidate) update total hours
- `GET /api/compliance/trend` — 8-week weekly compliance snapshots
- `GET /api/compliance/report/pdf?site=optional` — stream branded A4 PDF report
- `GET /api/audit` — (admin) read audit log
- `DELETE /api/audit` — (admin) clear audit log

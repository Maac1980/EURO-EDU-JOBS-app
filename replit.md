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

### Polish Legal Compliance Fields (Added)
All new fields map to Airtable via PATCH route and are included in compliance status calculation and daily alerter scans:
- **Badania Lekarskie** (`BADANIA LEKARSKIE`) — Medical exam expiry, Kodeks Pracy Art. 229. Triggers red/yellow alerts.
- **Oświadczenie** (`OSWIADCZENIE EXPIRY`) — Work declaration expiry for non-EU workers. Triggers alerts.
- **EN ISO 9606** (`ISO9606 PROCESS/MATERIAL/THICKNESS/POSITION`) — Full welding cert breakdown.
- **PESEL / NIP** — National ID and tax ID for ZUS/PIP compliance.
- **ZUS Status** (`ZUS STATUS`) — Registered / Unregistered / Unknown flag.
- **UDT Cert Expiry** (`UDT CERT EXPIRY`) — Lifting/pressure vessel cert. Triggers alerts.
- **Visa Type** (`VISA TYPE`) — Residence/visa classification (highlights Tourist visa as warning).
- **RODO Consent Date** (`RODO CONSENT`) — GDPR/RODO consent record date.

### PIP Inspection Mode
Clean one-page read-only modal per worker (`PIPInspectionModal.tsx`) accessed via the "PIP Inspection Mode" button in any worker profile panel. Shows all 5 compliance sections in Polish for labor inspectors:
1. Identyfikacja pracownika (PESEL, NIP, visa, ZUS)
2. Dokumenty obowiązkowe (Badania, Oświadczenie, TRC, Work Permit, BHP, Contract)
3. Certyfikaty UDT (if applicable)
4. EN ISO 9606 Kwalifikacja spawacza
5. RODO/GDPR consent

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

## Monthly Payroll Engine

### Airtable Payroll Fields (all created by `ensure-schema`):
- `HOURLY NETTO RATE` — currency, 2dp, zł symbol
- `TOTAL HOURS` — number, 1dp (current month hours)
- `ADVANCE PAYMENT` — currency, 2dp, zł
- `PENALTIES` — currency, 2dp, zł

### API Endpoints (payroll):
- `GET /api/payroll/workers` — all workers with payroll fields (coordinator+admin)
- `PATCH /api/payroll/workers/batch` — bulk update hours/advance/penalties in Airtable (coordinator+admin)
- `POST /api/payroll/close-month` — snapshot to ledger, reset fields in Airtable (admin only); 409 if month already closed
- `GET /api/payroll/history/:workerId` — ledger history for one worker (any auth)
- `GET /api/payroll/summary` — all ledger records (coordinator+admin)

### Ledger Storage:
- File: `artifacts/api-server/data/payroll-records.json` — `{ records: PayrollRecord[] }`
- `PayrollRecord` fields: id, workerId, workerName, monthYear, totalHours, hourlyRate, advancesDeducted, penaltiesDeducted, grossPay, finalNettoPayout, zusBaseSalary, siteLocation, createdAt

### Frontend:
- `PayrollRunPage.tsx` — full-page editable grid, live netto calc, search/sort, save + close-month buttons
- `PayrollHistoryTab.tsx` — per-worker history tab in `CandidateEditPanel`
- `SettlementPrintModal.tsx` — A4 print/PDF with EEJ branding, monthly breakdown table, ZUS note, signatures

## Role-Based Access Control (RBAC)

### Roles & Permissions:
| Feature | Admin | Coordinator | Manager |
|---|---|---|---|
| All tabs | ✅ | Most | Compliance only |
| Add Worker | ✅ | ✅ | ❌ |
| Delete Worker | ✅ | ❌ | ❌ |
| Edit Worker | ✅ | ✅ | View only |
| Payroll tab | ✅ | ✅ | ❌ |
| Close Month | ✅ | ❌ | ❌ |
| Settings tab | ✅ | ❌ | ❌ |
| Multi-site | ✅ | ✅ | Own site only |

### Backend Auth:
- `artifacts/api-server/src/lib/authMiddleware.ts` — `authenticateToken`, `requireAdmin`, `requireCoordinatorOrAdmin`
- JWT 24h, payload: `{ id, email, name, role, site }`
- Admin: `anna.b@edu-jobs.eu` / `EEJ_ADMIN_PASSWORD` env var
- Team users in `artifacts/api-server/data/users.json`

### Team Management:
- Settings tab → Team Access (admin only)
- `TeamManagementCard.tsx` — create/edit/delete coordinator and manager accounts
- `GET/POST/PATCH/DELETE /api/admin/users` — user CRUD (admin only)

## Extended Legal & Operational Fields (Added)

All fields stored in Airtable via PATCH route (`/api/workers/:id`):
- **IBAN** (`IBAN`) — worker bank account for salary transfer
- **Contract Type** (`CONTRACT TYPE`) — Umowa o pracę / Zlecenie / B2B / Delegacja
- **Nationality** (`NATIONALITY`) — free text
- **Pipeline Stage** (`PIPELINE STAGE`) — New / Screening / Interview / Offer Sent / Placed / Active / Released / Blacklisted

Pipeline Stage column added to Dashboard compliance table with colour-coded badges.
Pipeline Stage filter dropdown added to Dashboard filter bar.

## Security Features

### Email OTP for Admin Logins
Every admin-role user must complete a 6-digit email OTP step on every login:
1. Enter email + password → server generates OTP, emails it, returns 202 `requiresEmailOtp: true`
2. Login screen shows OTP input field (green banner, large monospace digits)
3. Submit OTP → validated against in-memory store (10-min TTL), then JWT issued
- OTP store: module-level `Map<userId, { otp, expiresAt }>` in `auth.ts`
- Email sent via `sendLoginOtp()` in `alerter.ts` — branded HTML email with OTP in dark box
- Non-admin users continue to use TOTP (authenticator app) if enabled

### 2FA (TOTP)
- `POST /api/2fa/setup` — generates TOTP secret + QR data URL (speakeasy)
- `POST /api/2fa/verify` — verifies token and enables 2FA (`twoFactorEnabled: true` in users.json)
- `POST /api/2fa/disable` — verifies current token then disables 2FA
- `GET /api/2fa/status` — returns `{ enabled: bool }` for current user
- Login flow returns HTTP 202 + `requires2FA: true` if user has 2FA enabled; client re-submits with `totpToken`
- Settings tab → `TwoFactorCard.tsx` — self-service QR setup, verify step, and disable flow

### Session Timeout
- 30 minutes of inactivity → automatic logout
- Activity events: mousemove, keydown, click, scroll
- Warning dialog appears at 5 minutes remaining (via `window.confirm`)
- Implemented in `auth.tsx` `AuthProvider`

### GDPR / Right to Erasure
- `POST /api/workers/:id/gdpr-erase` — admin only; wipes: name → "GDPR_ERASED", email/phone/PESEL/NIP/IBAN → null; logs to audit.json
- CandidateEditPanel shows GDPR Erase button (admin-only, two-step confirm before firing)

## ZUS/PIT Toggle (Payroll)

In `PayrollRunPage.tsx`:
- Toggle button: **ZUS pracownika 11,26%** (Emerytalne 9,76% + Rentowe 1,5%, no chorobowe, no PIT-2)
- `ZUS_RATE = 0.1126` constant; deducted from gross pay in `calcNetto(row, withZus)`
- When active: summary card 3 shows ZUS total in red; netto column reflects deduction
- Affects all calculated netto totals including table footer and close-month preview
- `withZus` state is local to the payroll page — does not affect the persisted `finalNettoPayout` in ledger records

## Bank CSV Export for Polish Transfers

- `GET /api/payroll/bank-export?monthYear=YYYY-MM` — admin only
- Returns BOM-prefixed CSV: `Numer konta (IBAN);Nazwa odbiorcy;Kwota (PLN);Tytuł przelewu`
- Amount uses Polish decimal comma format (e.g. `1234,56`)
- IBANs fetched live from Airtable worker records
- **"Eksport przelewów CSV"** button in `PayrollRunPage.tsx` downloads the file via blob URL

## Mobile Card View

In `Dashboard.tsx` compliance tab:
- `div.md:hidden` — card grid shown on phones/small screens
- `div.hidden.md:block` — original table shown on tablets/desktops
- Each card shows: worker name, specialization, compliance status badge, pipeline stage badge, TRC/WP/BHP expiry badges (colour-coded by days), site location, and EDIT / PROFIL action buttons
- Filters (search, status, site, pipeline) apply to both views

## Worker QR Code

**Button location:** top-right toolbar of `WorkerProfilePanel` — lime QR icon button, appears alongside the portal link and edit buttons.

**Modal — `WorkerQRModal.tsx`:**
- Compact 320px modal, EEJ dark style with lime border
- Header: "Worker QR" label + close button
- Worker name, specialization, site (or "Bench")
- Compliance status badge (green / amber / red background)
- 168×168 SVG QR code (white background, dark modules, M error correction)
- Small hint: "scan → opens full worker profile"
- 4-column document countdown grid: TRC, Work Permit, Medical, BHP — shows days remaining in colour (green ≥60d, amber <60d, red <30d, EXPIRED in red, N/A in grey)
- **Download QR (SVG)** button — serializes the `<svg>` element and downloads as `eej-qr-<worker-name>.svg`

**QR URL format:** `https://<domain><basePath>/?worker=<workerId>`

**`?worker=` URL param handling:**
- `selectedWorkerId` in Dashboard initialised from `new URLSearchParams(window.location.search).get("worker")` — opens the profile panel immediately on page load
- `useEffect` on mount calls `window.history.replaceState` to strip the param from the URL (keeps browser history clean)
- If the user is not logged in when scanning, `ProtectedRoute` saves the full query string (`?worker=ID`) to `sessionStorage["eej_return_to"]` before redirecting to `/login`
- After successful login, `Login.tsx` checks `sessionStorage["eej_return_to"]`, navigates there via `window.location.href`, and clears the key — the profile opens automatically

## Notification History Log

Every worker notification sent through the dashboard is persisted to `data/notifications.json` (max 500 entries, newest first).

**Backend:**
- `artifacts/api-server/src/lib/notificationLog.ts` — `appendNotification()`, `getNotifications()`, `clearNotifications()`; auto-creates the JSON file on first write
- `POST /api/workers/:id/notify` — now requires auth; records `workerId`, `workerName`, `channel`, `message`, `actor` (email from JWT), `sentAt` (ISO) 
- `GET /api/notifications?limit=N` — returns `{ notifications, total }`; all authenticated roles can read
- `DELETE /api/notifications` — admin only; wipes the full log

**Frontend — `NotificationHistoryCard.tsx`:**
- Collapsible card at the bottom of the Alerts tab
- Click header to load; shows entry count badge and chevron
- Each entry: channel icon (blue envelope for email, yellow chat for SMS), worker name, channel badge, relative timestamp, message text (2-line clamp), sender email
- Search/filter by worker name, "Odśwież" refresh button, admin-only "Wyczyść log" delete button
- Scrollable list (max-h-96) with footer note when log > 100 entries

## ZUS Report Export

- `GET /api/compliance/zus-export` — returns BOM-prefixed CSV with columns: Imię i Nazwisko, PESEL, NIP, Rodzaj umowy, Godziny, Podstawa ZUS
- Dashboard Alerts tab has "ZUS Export CSV" download button

## Client / Employer Database

- `data/clients.json` — persistent client records: id, name, address, vatId, contactName, contactEmail, contactPhone, notes, createdAt
- `GET/POST /api/clients` — list all / create new (coordinator+)
- `GET/PATCH/DELETE /api/clients/:id` — read / update / delete (delete: admin only)
- `ClientManagementCard.tsx` in Settings tab — full CRUD UI

## Worker Direct Expiry Reminders

- `sendWorkerExpiryReminders()` in `alerter.ts` — emails each worker (if email is set) when their own doc expires ≤ 30 days
- Runs daily at 09:00 via cron (separate from admin alerter at 08:00)
- `POST /api/compliance/trigger-worker-reminders` — manual trigger button in Dashboard Alerts tab

## Document Viewer

In `WorkerProfilePanel.tsx`, the Document Vault section renders `AttachmentCard` components for all Airtable attachment fields:
- Passport attachments (`passportAttachments`)
- Contract attachments (`contractAttachments`)
Each card shows filename and links to the Airtable-hosted file URL. Upload buttons also present for each doc type.

## Payslip PDF & Email

- `buildPayslipBuffer(record)` — internal helper; generates branded A4 PDF as a Buffer (shared between GET and email)
- `GET /api/payroll/payslip/:workerId/:monthYear` — streams PDF to browser (uses `buildPayslipBuffer`)
- `POST /api/payroll/close-month` — after saving ledger, fires background payslip emails to all workers who have an email address; uses `sendPayslipEmail()` from `alerter.ts`
- `sendPayslipEmail(email, name, monthYear, pdfBuffer)` — SMTP email with PDF attachment

## API Endpoints

All at `/api`:
- `POST /apply` — Public candidate application (no auth); creates Airtable record with AI CV screening
- `GET /workers` — list all workers (with search/specialization/status filters)
- `GET /workers/stats` — dashboard stats
- `GET /workers/report` — compliance report
- `POST /workers/bulk-create` — AI Smart Upload (passport, bhp, cert, contract, cv)
- `GET /workers/:id` — worker detail
- `PATCH /workers/:id` — update worker fields (writes to EEJ field names, audit logged)
- `POST /workers/:id/gdpr-erase` — (admin) wipe PII fields + audit log
- `POST /workers/:id/upload` — upload & AI-scan document
- `POST /workers/:id/notify` — send notification
- `POST /workers/admin/ensure-schema` — create missing Airtable fields
- `GET /workers/admin/schema` — view table schema
- `GET /api/portal/token/:recordId` — (admin) generate worker's self-service portal link
- `GET /api/portal/me?token=xxx` — (candidate) fetch own profile
- `PATCH /api/portal/hours?token=xxx` — (candidate) update total hours
- `GET /api/compliance/trend` — 8-week weekly compliance snapshots
- `GET /api/compliance/report/pdf?site=optional` — stream branded A4 PDF report
- `GET /api/compliance/zus-export` — (admin) ZUS CSV export with BOM
- `POST /api/compliance/trigger-worker-reminders` — (admin) manual trigger for worker expiry emails
- `GET /api/payroll/payslip/:workerId/:monthYear` — stream PDF payslip
- `GET /api/clients` — list all clients
- `POST /api/clients` — create client (coordinator+)
- `GET/PATCH/DELETE /api/clients/:id` — client detail / update / delete
- `GET /api/2fa/status` — current user 2FA status
- `POST /api/2fa/setup` — generate TOTP secret + QR
- `POST /api/2fa/verify` — verify token and enable 2FA
- `POST /api/2fa/disable` — disable 2FA (requires current token)
- `GET /api/audit` — (admin) read audit log
- `DELETE /api/audit` — (admin) clear audit log

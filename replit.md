# Apatris Compliance Dashboard

## Overview

Full-stack compliance portal for managing 200+ welders. Built as a pnpm workspace monorepo with TypeScript.

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

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/       # Express API server — Airtable proxy + compliance logic
│   └── apatris-dashboard/# React + Vite frontend — compliance dashboard
├── lib/
│   ├── api-spec/         # OpenAPI spec + Orval codegen config
│   ├── api-client-react/ # Generated React Query hooks
│   ├── api-zod/          # Generated Zod schemas from OpenAPI
│   └── db/               # Drizzle ORM (not used — Airtable is the data source)
├── scripts/              # Utility scripts
└── pnpm-workspace.yaml
```

## Key Features

- **Login screen** — `admin@apatris.com` / `apatris2024`
- **Public Apply Form** — `/apply` route — no auth required; EEJ branding; submits to Airtable CANDIDATES table with AI CV screening
- **4 Stats Cards** — Total Workers, Critical (<30 days), Upcoming Renewals (30-60 days), Non-Compliant
- **Worker Table** — Searchable, filterable by Specialization (TIG/MIG/ARC) and Compliance Status; includes Experience and Qualification columns
- **Color-coded rows** — Red (critical), Orange (warning), Green (safe)
- **Side Panel** — Click any row for full worker profile + Document Vault; footer has "Update Status" button
- **Action Buttons** — Notify Worker (email/SMS) and Update Status per row; all buttons use Agency Blue (#1e40af)
- **Compliance Report** — Generate report button with modal summary
- **AI Smart Upload** — Bulk upload with CV/Resume scan zone; extracts Experience and Qualification alongside compliance docs
- **AI CV Screening** — Extracts Years of Experience and Highest Qualification from CV/Resume images

## Airtable Integration

Secrets required:
- `AIRTABLE_API_KEY` — Personal Access Token
- `AIRTABLE_BASE_ID` — Base ID (starts with `app`)
- `AIRTABLE_TABLE_NAME` — Table name (default: `Welders`)

Expected Airtable field names (flexible mapping):
- Name / Full Name / Worker Name
- Specialization / Type / Welding Type
- TRC Expiry / TRC_Expiry
- Work Permit Expiry / Work_Permit_Expiry
- BHP Status / BHP_Status
- Contract End Date / Contract_End_Date
- Email, Phone
- Passport (attachment field)
- Contract (attachment field)

## Compliance Logic

- **Critical**: any document expires in < 30 days
- **Warning**: any document expires in 30-60 days
- **Non-Compliant**: BHP Status = "Expired" OR any document already expired
- **Compliant**: all documents > 60 days from expiry

## Airtable Fields for AI Screening

New fields (set by AI scanning):
- `Years of Experience` / `Experience` / `YearsOfExperience`
- `Highest Qualification` / `Qualification` / `HighestQualification`

## API Endpoints

All at `/api`:
- `POST /apply` — Public candidate application (no auth); creates Airtable record with AI CV screening
- `GET /workers` — list all workers (with search/specialization/status filters)
- `GET /workers/stats` — dashboard stats
- `GET /workers/report` — compliance report
- `POST /workers/bulk-create` — AI Smart Upload (passport, bhp, cert, contract, cv)
- `GET /workers/:id` — worker detail
- `PATCH /workers/:id` — update worker fields including yearsOfExperience, highestQualification
- `POST /workers/:id/upload` — upload & AI-scan document
- `POST /workers/:id/notify` — send notification

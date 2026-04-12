# EEJ × Apatris — Architecture Boundaries

**Owner:** Manish Shetty
**Companies:** Euro Edu Jobs (EEJ), Apatris Sp. z o.o., IWS, STPG
**Last Updated:** 2026-04-12
**Status:** Production — both platforms deployed independently

---

## 1. Platform Identity

| | **EEJ (Euro Edu Jobs)** | **Apatris** |
|---|---|---|
| **Role** | Foundation / Infrastructure | Advanced Intelligence / Strategy |
| **Identity** | Recruitment-first workforce platform | Compliance-grade legal operations |
| **Tagline** | "Your Reliable Partners in Europe" | "Precision Welding Outsourcing" |
| **Repo** | `Maac1980/EURO-EDU-JOBS-app` (master) | `Maac1980/Apatris-Compliance-Hub` (main) |
| **Deployment** | Fly.io `eej-jobs-api` + Replit | Fly.io `apatris-api` |
| **URL** | eej-jobs-api.fly.dev | apatris-api.fly.dev |
| **Database** | Neon PostgreSQL (EEJ) | Neon PostgreSQL (Apatris) |

---

## 2. Target Users

| | **EEJ** | **Apatris** |
|---|---|---|
| **Primary User** | Agency operations team (Anna Bondarenko + coordinators) | Site coordinators + welding supervisors |
| **Secondary User** | Legal team, clients/employers | Admin team, PIP inspectors |
| **Worker Interaction** | Self-service portal, mobile app | Worker profile panel, QR check-in |
| **Client Interaction** | Planned (client portal) | Limited (compliance reports) |
| **Roles** | admin, coordinator, manager | Admin, Coordinator (site-based) |

---

## 3. Core Engines

| Engine | **EEJ** | **Apatris** |
|---|---|---|
| **Recruitment** | ATS pipeline (8 stages), job board, matching AI, interviews | Not present |
| **Payroll** | ZUS calculator (locked formula), payroll records, payslips, invoices | ZUS calculator (same formula), payroll, payslips |
| **Compliance** | Legal decision engine (deterministic), document tracking, expiry alerts | Document tracking, expiry color zones |
| **Legal Intelligence** | Full stack: Smart Ingest → Knowledge Graph → Legal Answer Engine → Command Center → MOS Package | Basic: legal-engine, legal-operations, legal-brief-pipeline |
| **Immigration** | Smart Document Ingest (AI OCR), Appeal Assistant, POA Generator, Authority Drafting, TRC Workspace, MOS 2026 | TRC service, work permits, regulatory monitoring |
| **AI Layer** | Claude (reasoning/drafting) + Perplexity (research) + Intelligence Router + Knowledge Graph | Claude (OCR, copilot) + Perplexity (research) |
| **Communication** | Planned (Twilio WhatsApp/SMS) | Planned |
| **GPS** | Check-in/out, geofencing | Check-in/out |

---

## 4. Data Ownership

| Data Domain | **EEJ Owns** | **Apatris Owns** |
|---|---|---|
| **Worker Records** | ✓ Primary (100+ workers, full profiles) | ✓ Primary (welders, 60+ fields) |
| **Recruitment Pipeline** | ✓ Job postings, applications, interviews, candidates | ✗ Not present |
| **Legal Cases** | ✓ legal_cases, smart_documents, appeal_outputs, kg_nodes | ✗ Simplified legal_cases |
| **Knowledge Graph** | ✓ kg_nodes, kg_edges, kg_patterns | ✗ Not present |
| **Intelligence Alerts** | ✓ intelligence_alerts, real-time SSE | ✗ Not present |
| **Payroll Records** | ✓ payroll_records, invoices | ✓ payroll_records, invoices |
| **Document Vault** | ✓ smart_documents, worker_files | ✓ R2 attachments, worker uploads |
| **Audit Trail** | ✓ audit_entries | ✓ audit_entries |
| **GPS/Geofencing** | ✓ gps_checkins | ✓ gps_checkins |
| **Welding Certifications** | ✗ Basic fields only | ✓ Full ISO 9606 (process, material, thickness, position) |
| **Client/CRM** | ✓ clients, CRM pipeline | ✓ clients (simpler) |

---

## 5. Compliance Focus

| Compliance Area | **EEJ** | **Apatris** |
|---|---|---|
| **Immigration Law** | Deep: Art. 108, KPA appeals, MOS 2026 digital filing, 21 doc types, case patterns | Basic: TRC tracking, permit expiry |
| **ZUS/Tax** | ZUS calculator (Zlecenie + Pracę), PIT-2, sickness | Same ZUS calculator (shared formula) |
| **Labour Law** | Contract types, employer declarations, posting notifications | BHP certificates, medical exams, UDT |
| **PIP Readiness** | PIP readiness score, inspection report generator | PIP inspection card, readiness check |
| **GDPR/RODO** | GDPR tools (export, erasure, consent tracking) | RODO consent date tracking |
| **Posted Workers** | Planned | Basic tracking |

---

## 6. Technology Stack Comparison

| Layer | **EEJ** | **Apatris** |
|---|---|---|
| **Runtime** | Node.js 24, Express 5, TypeScript | Node.js 24, Express 5, TypeScript |
| **Database** | PostgreSQL + Drizzle ORM | PostgreSQL + Drizzle ORM + raw pg |
| **ORM Pattern** | `db.execute(sql\`...\`)` | Mixed: Drizzle schema + `query()`/`queryOne()` |
| **Auth** | JWT + sessionStorage/localStorage | JWT + Airtable users + 2FA (TOTP) |
| **Frontend** | React 19, Vite 8, Tailwind, Radix UI, Wouter | React 19, Vite 8, Tailwind, Radix UI, Wouter |
| **AI** | Claude Sonnet 4 + Perplexity Sonar | Claude Sonnet 4 + Perplexity Sonar |
| **Build** | esbuild (tsx build.ts) | esbuild (tsx build.ts) |
| **Hosting** | Fly.io (2 machines, IAD) | Fly.io (2 machines, IAD) |
| **Cron** | node-cron (daily legal scan) | setInterval scheduler (daily chain of 12+ jobs) |

---

## 7. Integration Bridge

### Current State: **No Integration**

EEJ and Apatris are fully independent. They share:
- Same hosting provider (Fly.io)
- Same database provider (Neon PostgreSQL) — but **different databases**
- Same AI providers (Anthropic, Perplexity) — but **different API keys**
- Same ZUS calculation formula (locked, regression-tested)
- Same tech stack (React, Express, TypeScript, Drizzle)

### Future Integration Options (if needed)

| Pattern | How | When |
|---|---|---|
| **Shared Worker Sync** | REST API bridge: EEJ pushes worker updates to Apatris, or vice versa | When a worker is managed in both systems |
| **Shared ZUS Engine** | npm package extracted from KnowledgeCenter.tsx | When formula needs to stay in sync |
| **Shared Auth** | OAuth2 / OIDC provider serving both apps | When single sign-on is needed |
| **Event Bridge** | EEJ Intelligence Router emits events → Apatris subscribes via webhook | When Apatris needs EEJ intelligence data |
| **Shared Document Store** | Common R2 bucket with namespace prefixing | When documents need to be visible in both |

### Rules for Integration

1. **Never share a database** — each platform owns its data
2. **Never import code across repos** — shared logic becomes an npm package
3. **API-only communication** — no direct DB queries between systems
4. **Each platform must work independently** — if the bridge fails, both systems continue
5. **Data flows one way per sync** — no bidirectional real-time sync (creates conflicts)

---

## 8. Feature Ownership Matrix

| Feature | Owner | Other Platform |
|---|---|---|
| Job Board / ATS Pipeline | **EEJ** | Not present in Apatris |
| Smart Document Ingest (AI OCR) | **EEJ** | Apatris has simpler document-ocr |
| Knowledge Graph | **EEJ** | Not present in Apatris |
| Legal Answer Engine | **EEJ** | Apatris has legal-copilot (simpler) |
| Intelligence Router (real-time) | **EEJ** | Not present in Apatris |
| MOS Package Generator | **EEJ** | Apatris has mos-engine (simpler) |
| Legal Command Center | **EEJ** | Not present in Apatris |
| Case Strategy PDF | **EEJ** | Not present in Apatris |
| Welding Certifications (ISO 9606) | **Apatris** | EEJ has basic fields |
| Site-based Worker Management | **Apatris** | EEJ has site assignment |
| Worker Profile 5-Tab Panel | **Apatris** | EEJ has worker list + edit |
| Final Settlement PDF | **Apatris** | EEJ has payroll records |
| Bulk CSV Import | Both | Both |
| ZUS Calculator | Both (same formula) | Both (same formula) |
| Compliance Alerts | Both | Both |
| GPS Tracking | Both | Both |

---

## 9. Deployment Architecture

```
┌─────────────────────────────────────────────────┐
│                   FLY.IO                         │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────┐     │
│  │   eej-jobs-api   │  │   apatris-api    │     │
│  │   (2 machines)   │  │   (2 machines)   │     │
│  │   IAD region     │  │   IAD region     │     │
│  │                  │  │                  │     │
│  │  EEJ Dashboard   │  │ Apatris Dashb.   │     │
│  │  EEJ Mobile App  │  │                  │     │
│  │  Legal Intel.     │  │ Worker Profiles  │     │
│  │  Knowledge Graph  │  │ Welding Certs    │     │
│  │  MOS Package      │  │ PIP Reports      │     │
│  └────────┬─────────┘  └────────┬─────────┘     │
│           │                     │                │
└───────────┼─────────────────────┼────────────────┘
            │                     │
            ▼                     ▼
     ┌──────────────┐     ┌──────────────┐
     │  Neon PG     │     │  Neon PG     │
     │  (EEJ DB)   │     │ (Apatris DB) │
     └──────────────┘     └──────────────┘
            │                     │
            ▼                     ▼
     ┌──────────────┐     ┌──────────────┐
     │  Anthropic   │     │  Anthropic   │
     │  Perplexity  │     │  Perplexity  │
     └──────────────┘     └──────────────┘
```

---

## 10. Decision Framework

**"Should this feature go in EEJ or Apatris?"**

| If the feature is about... | Build in... | Reason |
|---|---|---|
| Recruitment, hiring, job matching | **EEJ** | Recruitment-first platform |
| Immigration law, appeals, MOS filing | **EEJ** | Legal intelligence layer |
| AI document understanding | **EEJ** | Smart Ingest + Knowledge Graph |
| Welding certifications, ISO 9606 | **Apatris** | Industrial compliance |
| Site-specific worker management | **Apatris** | Site coordinator workflow |
| Payroll / ZUS calculation | **Both** (same formula) | Core business operation |
| Worker document tracking | **Both** | Needed in both contexts |
| Client portal | **EEJ** | Agency-facing feature |
| PIP inspection readiness | **Both** | Regulatory requirement |

---

*This document defines the boundary. If you're unsure where a feature belongs, check this matrix first.*

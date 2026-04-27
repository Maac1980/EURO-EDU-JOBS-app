# EEJ ↔ APATRIS Consolidation Audit

**Date:** 2026-04-27
**Author:** EEJ Claude Code
**Scope:** Compare current EEJ and APATRIS implementations of overlapping legal-immigration functionality, identify what consolidates to APATRIS, what stays in EEJ, what's hybrid, and produce the priority list for the EEJ side of the build.
**Companion:** `docs/architecture-boundaries.md` (committed 2026-04-12, pre-Step-3) — this audit extends and updates that boundary doc.
**Authorization:** Cross-repo read of APATRIS at `/Users/manishshetty/Desktop/Apatris-Compliance-Hub` was explicitly authorized for this audit purpose; reverts to the EEJ-only / APATRIS-only routine boundary after this audit closes.

---

## 1. Frame

This audit informs three decisions:

1. **Consolidation map** — which EEJ modules should sunset in favor of APATRIS once APATRIS Layer 0+ ships, which stay EEJ-domain, and which are hybrid.
2. **EEJ priorities for tomorrow's session** — top 3-5 items ranked by impact and urgency.
3. **Cross-platform open questions** — items that need APATRIS-side perspective to validate before either platform commits to consolidation.

The strategic frame established in conversation: **APATRIS becomes the legal immigration engine; EEJ adopts APATRIS for legal immigration work when APATRIS is mature**. This audit operationalizes that frame against current code on both sides.

This is the EEJ-side of a planned two-document audit. The APATRIS-side response document will validate or contest the recommendations here using first-hand APATRIS evidence.

---

## 2. EEJ current state

### Production

- **Fly app:** `eej-jobs-api` (region `ams`, 2 machines healthy)
- **Live version:** **v99** (deployed 2026-04-27, ~1 hour ago)
- **Origin/master HEAD:** `3c0695c` (Step 3 closure documentation commit)
- **Working tree:** clean

### Recent significant work (chronological)

| Phase | Versions | What shipped |
|---|---|---|
| Stage 4 (Apr 17-18) | v85-v92 | Tenant isolation, PII encryption (PESEL/IBAN AES-256-GCM), TIMESTAMPTZ uniformity, audit immutability, rate-limiter trust-proxy fix |
| Step 1 (Apr 17) | within Stage 4 | T1 Executive dashboard — `/admin/stats` aggregator + mobile `ExecutiveHome.tsx` |
| Step 2 (Apr 17) | adf1451 | CRM module — clients.stage + client_activities + client_deals + dual-currency pipeline (PLN/EUR) |
| Step 3a (Apr 27 morning) | v97 | WhatsApp schema (whatsapp_messages, whatsapp_templates, 3 enums, 5 indexes, 2 CHECK constraints, 3-row template seed) |
| Step 3b (Apr 27 morning) | v97 | Drafter service + feature flag (`WHATSAPP_AUTOMATION_ENABLED`) + manual draft endpoints |
| Step 3c (Apr 27 afternoon) | v98 | Inbound webhook (`POST /api/webhooks/whatsapp`) with Twilio signature verification |
| Step 3d (Apr 27 evening) | v99 | Approve/send + read/list endpoints + `/admin/stats` counters + audit trail (whatsapp_messages.approved_by/at + client_activities + notifications) |

Step 3 totals: ~1,800 LOC across 16 commits (4 sub-phases × 4 tasks each), 168 vitest tests passing end-to-end against a Docker test DB, full Path 2a verification discipline applied to every deploy.

### Module inventory (current HEAD `3c0695c`)

**Legal/immigration overlap zone (consolidation candidates — see Section 4):**

- `services/legal-engine.ts`, `legal-case-engine.ts`, `legal-decision-engine.ts`, `legal-operations.ts`, `legal-tracking-card.ts`, `legal-completions.ts`, `legal-brief-pipeline.ts`, `legal-intelligence.ts`, `legal-answer-engine.ts`, `legal-kb.service.ts`, `case-engine.ts`, `poa-legal-protection.ts` — 12 legal/case engine files
- `services/immigration.service.ts`, `mos-engine.ts`, `mos-package.ts`, `mos-2026-mandate.ts`, `schengen-calculator.ts` — 5 immigration/MOS files
- `services/document-ocr.ts`, `document-hardening.ts`, `document-logging.ts`, `smart-document.ts`, `smart-ingest.ts`, `working-documents.ts`, `first-contact-verification.ts`, `knowledge-graph.ts` — 8 document-handling files
- `routes/permits.ts`, `trc-service.ts`, `regulatory.ts`, `compliance.ts`, `gdpr.ts` — 5 routes
- mobile tabs: `MyDocsTab`, `MyStatusTab`, `MyUPOTab`, `WorkPermitTab`, `TRCServiceTab`, `MySchengenTab`, `ImmigrationSearchTab`, `RegulatoryTab`, `GDPRTab` — 9 worker-facing tabs

**EEJ-only domain (see Section 5):** recruitment/ATS, payroll/ZUS, CRM, client management, GPS tracking, agency compliance, billing/Stripe, workforce mobile portal, WhatsApp messaging (Step 3), AI copilot, T1 dashboard, auth/portal — covering ~30+ files across services and routes.

### Follow-up backlog (`STEP3-FOLLOWUPS.md`, 84 lines)

- Legacy `lib/alerter.ts::normalizePhone` migration to strict `lib/phone.ts`
- PII-encrypt `phone` platform-wide (workers/clients/whatsapp_messages)
- Structural validator for `whatsapp_messages.templateVariables` keys vs `whatsapp_templates.variables`
- Audit `tenant_id DEFAULT 'production'` across all tenant-scoped tables
- `$onUpdate` sweep for `updated_at` columns
- Audit other test files for `DATABASE_URL ??= TEST_DATABASE_URL ?? stub` precedence pattern
- **Provision a persistent Neon test branch for EEJ to match APATRIS** — explicit recurring follow-up
- **Fix `migrate.ts` `legal_evidence` ordering bug** — pre-existing latent bug surfaced during Step 3 deploy verification
- Twilio console webhook URL configuration (Step 3c follow-up)
- Step 3 closure note (Step 3d follow-up)

---

## 3. APATRIS current state

Read first-hand from `/Users/manishshetty/Desktop/Apatris-Compliance-Hub` and `flyctl`.

### Production

- **Fly app:** `apatris-api` (region `iad`, 2 machines healthy, 1/1 checks passing)
- **Live version:** **v295** (deployed 2026-04-24, ~3 days ago)
- **APATRIS git HEAD:** `edcdc76` (counsel packet contacts populated 2026-04-28)
- **Production health:** `https://apatris-api.fly.dev/api/healthz` → HTTP 200 (300ms)

Recent commits (`edcdc76` and 9 prior) are entirely **documentation work** on the counsel handoff packet — Section 8 verbatim seven questions, Section 11 engagement contacts, version cleanup. The most recent CODE deploy (v295) shipped Apr 24, three days before this audit.

### The five-layer architecture (per `MASTER_PLAN.md` `f1c0152`)

> "The build proceeds in five layers (Layer 0 plus Layers 1-4). Each layer is the foundation for the next. Skipping a layer means the layer above ships onto sand."

| Layer | Purpose | Status |
|---|---|---|
| **Layer 0** | Legal comprehension foundation — Polish-law spine (`legal_articles` table), comprehension verification (LLM-judge tests), source linkage enforcement, refusal mode, AI/lawyer boundary protection | **pre-build** — design and testability docs committed; build gated on EU AI Act counsel review |
| Layer 1 | Fix the writes — `case_reference`, `linkDocument`, `case_notebook_entries` populate; eliminate the empty-tables-with-schema problem | designed (`CHECK_LAYER1_CASE_REFERENCE.md`), deferred until Layer 0 v1 ships |
| Layer 2 | Evidence chain at send-time — every outbound communication writes `outbound_communications` with sender, recipient, time, delivery method, proof of delivery | designed, deferred |
| Layer 3 | Scenarios engine — three to five candidate paths per case, each with mandatory legal basis citation, merit argument text, prerequisites, time/earnings/cost forecasts, viability score | designed, deferred |
| Layer 4 | Consent loop — `client_path_selections` table records which path was generated, recommended, chosen, when, how, with consent context | designed, deferred |

**Current operational reality:** APATRIS at v295 has substantial existing code (131 routes, 72 services in `artifacts/api-server/src/`), 29 of which are legal/case/document services. The 5-layer plan documents what NEEDS to be built; the existing code is the pre-Layer-0 substrate that the master plan calls out as "shipped to production at version v295" but is being treated as the launchpad, not the destination. The "AI inference layer has not yet been built" framing in the counsel handoff packet (`bd61ee3`, Section 3) refers to the Layer 0+ AI build, not the existing services.

### The non-negotiable principles (per `MASTER_PLAN.md` Sections 1-2)

These principles structurally distinguish APATRIS from EEJ:

1. **Human review is the structural gate.** AI output cannot reach a client or authority without lawyer approval. The gate is encoded in the system, not relied upon as discipline.
2. **No false hope. No false certainty.** Confidence scores honest, risks surfaced, uncertainty named.
3. **Source linkage.** Every claim in AI-generated output traces to a specific document, statute, or regulation. Claims without sources do not ship.
4. **Case-centered architecture.** Every document, event, draft, communication ties to the case it belongs to.
5. **Evidence chain integrity.** What was sent / when / why / by whom / to whom — and same for received.
6. **Audit trail completeness.** Built to be evidentially valid.
7. **Refusal to fabricate.** When AI lacks inputs to produce meaningful output, it refuses rather than producing fluent fiction.
8. **Law as argument-construction.** Two-sided form by structural design.
9. **AI completes; lawyer edits and sends.** Boundary is structural, not preferential.
10. **Continuous learning across three streams.** Stream A in-flight engagement during lawyer editing; Stream B outcome attribution after closure; Stream C continuous Polish-law refresh.
11. **Lawyer as adversarial tester.** Probes embedded in production work.
12. **Honest confidence calibration.** False high-confidence is obstruction; false low-confidence is obsequiousness.
13. **Legitimacy by construction.** Scenarios engine generates only legally accessible paths.
14. **Informed consent as data.** Client path choice recorded with timestamp + consent context.
15. **Polish authoritative, English bridge.** Polish primary; English toggle on every result page.
16. **Numbers must be calibrated or refused.** Use qualitative bands until calibration data exists.
17. **Classifications backed by structured reasoning.** Boolean/categorical judgments carry non-nullable reasoning text.
18. **Eight-step discipline.** Ideas → review → suggestions → decision → build → test → fix → retest.
19. **The build outlives the builder.** Every component documented and reusable.

### EU AI Act research verdict (per `EU_AI_ACT_ARTICLE_6_RESEARCH.md` `bf4d92b`)

- **Verdict:** APATRIS likely **NOT** classified as high-risk under Article 6(2) via Annex III(7), because Annex III(7) requires "intended use **by or on behalf of competent public authorities**." APATRIS is private applicant-side legal services — structurally adversarial to or independent from authorities, not deployed by them.
- **Confidence:** **ESTIMATE-medium**. Verdict requires counsel confirmation before Layer 0 v1 build proceeds.
- **Polish-specific:** Polish AI implementation law accepted by Council of Ministers 2026-03-31, in Sejm review (not enacted). KRiBSI primary supervisory authority. UODO advisory + supplemental supervisory in justice/border/police domains.
- **Architectural impact:** no BLOCKING items for v1. Two MUST-RESOLVE-BEFORE-BUILD items (Article 6(4) non-high-risk-assessment record; Article 50 disclosure surface). Several SHOULD-RESOLVE-DURING-BUILD items.
- **Counsel review:** mandatory before v1 build. Seven specific questions in Section 13 of the research doc, surfaced verbatim into Section 8 of the counsel handoff packet.

### Bilingual architecture (per `LANGUAGE_TOGGLE_VERIFICATION.md`, commit `41dedd1`)

- **Principle:** Polish authoritative, English bridge — toggle on every result page, accessible in zero or one clicks. Where translations diverge, Polish prevails.
- **Implementation reality:** 1.7% of result pages (2 of 115) have a working toggle. ~92% (106 pages) have NO i18n at all — English-only hard-coded strings. i18n defaults to English globally (principle violation).
- **Tier 1 remediation** (~4-8 hours): toggle availability + foundational defaults across all result pages.
- **Tier 2** (multi-month): per-page content translation across 106 pages without i18n.

### Counsel handoff packet (per `COUNSEL_HANDOFF_PACKET.md` v1.0)

- **Status:** v1.0 — internally complete, counsel-ready. Sections 1-11 finished with seven verbatim questions in Section 8.
- **Engagement contacts** (`COUNSEL_PACKET_CONTACTS.md`):
  - Primary: Manish Shetty, Founder and Partner, manish@apatris.pl
  - Backup: Akshay Gandhi, Partner and Board Member, akshay@apatris.pl
  - Mailing: ul. Chłodna 51, Warsaw, Poland
- **Estimated counsel review time:** 5-15 hours depending on specialization (EU AI Act, RODO/GDPR, Polish administrative law)
- **Status of release:** **NOT YET RELEASED** — pre-outreach action items in Section 11 flag contact details to be populated; that step is now done as of `edcdc76`. Layer 0 v1 build is gated on counsel review completing.

### APATRIS code surface

- **131 routes** across `artifacts/api-server/src/routes/` — substantially larger than EEJ's 32
- **72 services** across `artifacts/api-server/src/services/` — larger than EEJ's 49
- **29 legal/case/document services** specifically: `case-doc-generator`, `case-intelligence`, `case-notebook`, `case-sync`, `daily-legal-scan`, `document-intake-hardening`, `document-intake`, `document-intelligence`, `knowledge-graph`, `legal-ai-explanation`, `legal-answer`, `legal-approval`, `legal-brief-pipeline`, `legal-case`, `legal-copilot`, `legal-document`, `legal-engine`, `legal-evidence-ocr`, `legal-intelligence`, `legal-queue`, `legal-research`, `legal-status`, `mos-engine`, `mos-package`, `smart-document`, `worker-legal-view` (plus 3 `.test.ts` files)

The shapes overlap substantially with EEJ's `services/legal-*`, `mos-*`, `case-*`, `document-*`, `smart-*` files (Section 4).

---

## 4. Conceptual overlap zones

For each zone: what EEJ has, what APATRIS has, consolidation candidate.

### 4.1 Legal case management

| | EEJ (`3c0695c`) | APATRIS (`edcdc76`) |
|---|---|---|
| Files | `services/legal-case-engine.ts`, `case-engine.ts`, `legal-engine.ts`, `legal-decision-engine.ts`, `legal-operations.ts`, `legal-tracking-card.ts` | `services/legal-case.service.ts`, `case-intelligence.service.ts`, `case-notebook.service.ts`, `case-sync.service.ts`, `legal-engine.ts`, `legal-queue.service.ts`, `legal-status.service.ts`, `legal-approval.service.ts` |
| Schema | EEJ has `legal_cases` table on prod (Stage 4 tenant-scoped) | APATRIS has `trc_cases`, `case_notebook_entries`, `case_generated_docs`, `case_reference` (NULL on all 5 prod rows per `CHECK_LAYER1_CASE_REFERENCE.md`) — schema-without-data-flow problem |
| State machine | EEJ's legal-decision-engine is documented as "PURE function, NO AI, NO database, NO side effects" — deterministic | APATRIS Layer 0 design names two-sided argument construction, refusal mode, source-linked claims as the structural target |
| Lawyer gate | None structural — EEJ services produce text; mobile tabs show worker status | APATRIS principle 9: "AI completes; lawyer edits and sends. Boundary is structural, not preferential." Layer 0 v1 includes 5-layer structural prevention of AI-side send. |
| **Consolidation candidate** | EEJ deprecates legal-case-engine + legal-engine + legal-operations once APATRIS Layer 0 v1 ships. EEJ's pure-function legal-decision-engine may survive as a checker but the AI-generating-text paths sunset. | APATRIS owns this domain |

### 4.2 Immigration intelligence

| | EEJ | APATRIS |
|---|---|---|
| Files | `services/immigration.service.ts`, `legal-intelligence.ts`, `legal-answer-engine.ts`, `legal-completions.ts`, `routes/regulatory.ts`, `routes/permits.ts`, `routes/trc-service.ts` | `services/legal-intelligence.service.ts`, `legal-answer.service.ts`, `legal-research.service.ts`, `legal-copilot.service.ts`, `legal-ai-explanation.service.ts`, `daily-legal-scan.service.ts` |
| Knowledge base | EEJ has `regulatory_updates` table, scraped from praca.gov.pl/ZUS/PIP/Sejm | APATRIS has `legal_knowledge` (12 prod rows), `legal_articles` (designed, not yet built) — Layer 0 spec calls for ~80-150 article corpus |
| AI surface | EEJ uses Claude + Perplexity inline; no source linkage enforcement | APATRIS Layer 0 design enforces source linkage as schema constraint (4-layer: schema + prompt + validator + drift detection) |
| **Consolidation candidate** | EEJ deprecates the immigration AI paths once APATRIS Layer 0 v1 ships. EEJ keeps `regulatory_updates` ingest as a feed for Apatris consumption (not as the AI brain). | APATRIS owns this domain |

### 4.3 TRC service

| | EEJ | APATRIS |
|---|---|---|
| Files | `routes/trc-service.ts` (in EEJ routes) | `services/legal-status.service.ts`, `legal-evidence-ocr.service.ts`, `worker-legal-view.service.ts`, plus `trc_cases` table |
| Schema | EEJ has `work_permit_applications` (with `tenant_id`, Stage 4-scoped) | APATRIS has `trc_cases` with `case_reference`, plus document linker logic in `document-intake.service.ts` |
| **Consolidation candidate** | EEJ's TRC service is a thin route layer over `work_permit_applications`; could be retained as a passthrough that proxies to APATRIS, OR deprecated and replaced by APATRIS's case management surface accessible via SSO | Hybrid — EEJ may proxy in the short term |

### 4.4 Work permits (Type A/B/C, Oświadczenie, Seasonal)

| | EEJ | APATRIS |
|---|---|---|
| Files | `routes/permits.ts` + `work_permit_applications` table | not as direct a match — APATRIS uses `trc_cases` as the unified case container |
| Behavior | EEJ has CRUD + 7-day deadline tracking + document checklists | APATRIS has document-intake linker + case-centered workflow |
| **Consolidation candidate** | Hybrid: EEJ retains for non-TRC permit types not yet covered by APATRIS; APATRIS absorbs TRC-card permits as part of legal case management | Hybrid; redraw boundary when APATRIS Layer 1+ ships |

### 4.5 MOS (Ministerstwo Spraw Zagranicznych) modules

| | EEJ | APATRIS |
|---|---|---|
| Files | `services/mos-engine.ts`, `mos-package.ts`, `mos-2026-mandate.ts` (with explicit comment "NO Apatris data. EEJ only.") | `services/mos-engine.service.ts`, `mos-package.service.ts` |
| Branding | EEJ's `mos-2026-mandate.ts` declares EEJ-only and explicitly excludes Apatris data | APATRIS has parallel implementation |
| **Consolidation candidate** | EEJ retains its `mos-2026-mandate.ts` (already explicitly EEJ-only); the legacy `mos-engine.ts` + `mos-package.ts` deprecate in favor of APATRIS's Layer 1+ once shipped | Mostly APATRIS, but EEJ keeps the MOS-2026 mandate-specific module |

### 4.6 Document handling for legal documents

| | EEJ | APATRIS |
|---|---|---|
| Files | `services/document-ocr.ts`, `document-hardening.ts`, `document-logging.ts`, `smart-document.ts`, `smart-ingest.ts`, `working-documents.ts`, `first-contact-verification.ts` (939 LOC monolithic) | `services/document-intake.service.ts`, `document-intake-hardening.service.ts`, `document-intelligence.service.ts`, `legal-document.service.ts`, `legal-evidence-ocr.service.ts`, `case-doc-generator.service.ts`, `smart-document.service.ts` |
| Discipline | EEJ uses Claude Vision OCR + Knowledge Graph sync; no source linkage requirement | APATRIS Layer 1 calls for `linkDocument` to populate `linked_case_id` on every upload (currently 0/20 prod rows linked — broken-on-prod gap that Layer 1 fixes) |
| **Consolidation candidate** | **HYBRID**: EEJ continues to ingest recruitment-domain documents (CVs, contracts, BHP certs); APATRIS owns legal-evidence-domain documents (TRC application packets, authority correspondence, court filings). Boundary at the document type. | Hybrid — see Section 7 |

### 4.7 Lawyer review surfaces

| | EEJ | APATRIS |
|---|---|---|
| Files | `services/poa-legal-protection.ts` (POA + RODO consent tracker), `legal-tracking-card.ts` | `services/legal-approval.service.ts`, `legal-queue.service.ts`, `legal-copilot.service.ts` (with future Layer 0 v2 in-flight engagement, post-edit verification, probe support) |
| Discipline | EEJ has no structural lawyer gate — drafts produced by AI services can flow to mobile worker tabs without lawyer approval | APATRIS principle 1: "Human review is the structural gate. AI output cannot reach a client or authority without lawyer approval." Layer 0 v1 includes structural send-prevention. |
| **Consolidation candidate** | EEJ has no equivalent surface and shouldn't try to build one. APATRIS owns the lawyer review surface for legal-immigration domain. | APATRIS owns |

### 4.8 Worker-facing legal status (mobile tabs)

| | EEJ | APATRIS |
|---|---|---|
| Files | mobile `MyDocsTab.tsx`, `MyStatusTab.tsx`, `MyUPOTab.tsx`, `WorkPermitTab.tsx`, `TRCServiceTab.tsx`, `MySchengenTab.tsx`, `ImmigrationSearchTab.tsx`, `RegulatoryTab.tsx`, `GDPRTab.tsx` | APATRIS has separate `workforce-app/` plus `worker-legal-view.service.ts` for the data layer |
| User flow | EEJ shows worker their own document expiries, work permit status, Schengen day count, upcoming TRC dates | APATRIS shows worker their case status (not yet documented in detail; would need Layer 4 consent loop to be meaningful) |
| **Consolidation candidate** | Hybrid: EEJ retains the worker-facing mobile tabs as the "always-with-you" daily-driver UX (the tabs are wired into the EEJ portal and compliance flows). When APATRIS Layer 4 ships, those tabs may consume APATRIS data via API, but the surface stays EEJ-branded. | Hybrid — EEJ owns the surface; APATRIS owns the data once it's the source of truth |

### 4.9 Regulatory updates as legal-domain content

| | EEJ | APATRIS |
|---|---|---|
| Files | `routes/regulatory.ts`, `regulatory_updates` table, `enhanced-daily-scan.ts` | `services/daily-legal-scan.service.ts` |
| Source | EEJ scrapes praca.gov.pl, ZUS, PIP, Sejm via Perplexity | APATRIS has its own daily scan service |
| **Consolidation candidate** | EEJ retains the regulatory ingest for compliance dashboard purposes (T1 dashboard "Regulatory Intelligence" widget); APATRIS may consume the same feed or run its own. Defer decision; both sides currently have working code. | Defer — both keep their feeds for now |

---

## 5. EEJ-only domain

These remain entirely EEJ — not part of any consolidation:

| Domain | EEJ files | Why EEJ-only |
|---|---|---|
| Recruitment / ATS / candidate workflow | `routes/jobs.ts`, `interviews.ts`, `eej-mobile.ts`, `workers.ts` (apply), `eej-auth.ts`, mobile `ATSPipelineTab`, `ApplicationsTab`, `JobBoardTab`, `CandidatesList`, `CandidateDetail`, `BulkUploadTab` | EEJ is the recruitment-first platform per `docs/architecture-boundaries.md` §1 ("Identity: Recruitment-first workforce platform"). APATRIS does not address recruitment. |
| Payroll / ZUS calculation | `routes/payroll.ts`, `services/payroll-ledger.ts`, `lib/payroll.ts`, `lib/country-compliance.ts` (PL/CZ/RO), `routes/elixir.ts`, mobile `PayrollTab`, `NetPerHourTab`, `PayTransparencyTab`, `SalaryBenchmarkTab` | Polish payroll + ZUS is EEJ workforce ops domain. APATRIS's master plan does not cover payroll. |
| CRM / client management / dual-currency pipeline | `routes/clients.ts`, `routes/crm.ts`, mobile `ClientsTab`, Step 2 schema (`clients.stage`, `client_activities`, `client_deals` PLN/EUR) | EEJ commercial/sales side. APATRIS targets a different lawyer-buyer market. |
| Stripe billing / agency subscriptions | `routes/billing.ts`, `services/stripe-webhooks.ts`, `eej_billing_events` table, mobile `PricingTab` | EEJ SaaS monetization. APATRIS has its own (not surveyed). |
| GPS tracking / workforce mobility | `routes/gps.ts`, `gps_checkins` table, mobile `GPSTrackingTab`, `ShiftScheduleTab`, `WorkerCalendarTab`, `SkillsAssessmentTab` | EEJ workforce ops; ground-level worker location and timesheet. APATRIS does not address. |
| Agency compliance ops | `routes/agency.ts`, `services/agency-compliance-engine.ts`, `agency-protection.ts`, `authority-packs.ts`, `escalation-engine.ts`, `fines-prevention.ts`, `consistency-checker.ts`, `enhanced-daily-scan.ts`, mobile `AgencySettingsTab`, `AlertsTab` | EEJ agency-side compliance posture (PIP-readiness operational, fines prevention). APATRIS's case-centered architecture is a different shape — the agency-protection layer is EEJ. |
| WhatsApp messaging (Step 3) | `routes/whatsapp.ts`, `services/whatsapp-drafter.ts`, `whatsapp-webhook.ts`, `lib/twilio-signature.ts`, `lib/flags.ts`, `whatsapp_messages` + `whatsapp_templates` tables | EEJ operational notifications (recruitment/payroll/permit-update messaging). APATRIS does not have a WhatsApp implementation. |
| AI copilot / dashboard intelligence | `services/eej-copilot.ts`, `intelligence-router.ts`, `lib/ai.ts`, `lib/complianceAI.ts`, mobile `AiCopilotChat`, `AiAuditTab` | EEJ T1 executive dashboard AI (compliance summary, regulatory copilot). Recruitment-side AI per CLAUDE.md Phase 1. |
| T1 dashboard | `routes/admin.ts` (`/admin/stats`), mobile `ExecutiveHome`, `LegalHome`, `OperationsHome` | EEJ's "Anna B's one screen" UX. Step 1 deliverable. |
| Auth / portal / encryption / tenancy | `routes/auth.ts`, `eej-auth.ts`, `twofa.ts`, `portal.ts`, `lib/encryption.ts`, `lib/tenancy.ts`, `lib/authMiddleware.ts`, `lib/security.ts`, `lib/pii-backfill.ts` | EEJ-internal infrastructure. APATRIS has its own (5-tier RBAC per master plan). |
| Notifications log / legacy direct-send | `routes/notifications.ts`, `lib/notificationLog.ts`, `lib/alerter.ts` | EEJ ops infrastructure. The Step 3 WhatsApp work introduced a parallel draft-queue path; legacy direct-send remains for compliance cron + worker reminder cron. |

---

## 6. APATRIS-only domain

What APATRIS has that EEJ does not need (and arguably cannot have without becoming a different product):

| APATRIS asset | Why EEJ doesn't need it |
|---|---|
| Lawyer-as-structural-gate enforcement | EEJ's recruitment-first identity does not have the same applicant-side legal-services obligation. EEJ's existing legal-* services produce informational text, not authority-bound submissions. The structural lawyer gate belongs to platforms that submit to authorities, not to platforms that inform recruiters. |
| Layer 0 legal comprehension foundation (`legal_articles` spine, comprehension tests, source-linkage validator, refusal mode) | EEJ's current legal-* paths are advisory; APATRIS's are submission-bound. The Layer 0 testability discipline (LLM-judge scoring, halt-on-comprehension-failure) is overkill for EEJ's compliance-summary use case. |
| Two-sided argument construction (Layer 0 v2) | EEJ doesn't draft legal arguments. |
| Stream A (in-flight engagement during lawyer editing), Stream B (outcome attribution), Stream C (continuous Polish-law refresh) | EEJ has no lawyer in the loop. |
| Lawyer-as-adversarial-tester pattern + comprehension probe support | Same. |
| Polish authoritative bilingual architecture (toggle on every result page, Polish prevails on divergence) | EEJ has Polish locale support (`eej-mobile-HIDDEN/src/locales/pl.json`) but EEJ's recruitment users (Anna B + coordinators) work in English; the toggle discipline isn't load-bearing. |
| EU AI Act Article 6 conformity research + counsel handoff packet at v1.0 | EEJ has its **own** EU AI Act exposure — recruitment scoring under Annex III §4(a) — which is a **different** Annex III category than APATRIS's. APATRIS's research does NOT carry over. EEJ needs its own. (Section 9.) |
| Constitutional pre-build discipline (5-layer architecture, eight-step build loop, master plan committed before code) | EEJ's existing services are post-hoc — Stage 4 + Step 1-3 hardening built on top of pre-existing code. EEJ's STEP3_PLAN.md is the closest equivalent (forward-plan committed before build), but it's a sub-phase plan, not a constitutional document. |
| Counsel handoff packet (5-15 hour read for EU AI Act + RODO + Polish admin law specialists) | EEJ would need its own counsel packet for its own Annex III §4(a) recruitment-scoring exposure (Section 9). |
| Five-tier RBAC with comprehension verification at Layer 0 | EEJ has 4-tier RBAC (T1-T4); the comprehension verification is APATRIS-only. |

---

## 7. Hybrid domain

Modules where the boundary is genuinely unclear or both platforms legitimately need their own implementation:

### 7.1 Document handling

- **EEJ owns:** recruitment documents (CVs, BHP certificates, identity documents at intake, contracts in Polish, payroll docs, GDPR consent forms). Volume: high. Workflow: ingest, OCR, extract, verify, attach to worker record, expiry track.
- **APATRIS owns:** legal evidence documents (TRC application packets, authority correspondence including UPO and decision letters, court filings, signed POAs, authority-issued case references). Volume: lower per case but each is load-bearing. Workflow: ingest, link to case, OCR, extract authority reference, route to lawyer for review.
- **Boundary:** by document **type**, not by document **storage**. Both platforms read from the same R2 bucket presumably; the application-layer logic differs.
- **Consolidation:** EEJ's `services/document-ocr.ts`, `document-hardening.ts`, `document-logging.ts`, `smart-document.ts` stay (recruitment domain). EEJ's `working-documents.ts`, `first-contact-verification.ts` (939 LOC) MAY have legal-evidence ingest paths embedded; needs file-level audit to split. EEJ's `smart-ingest.ts` (588 LOC) sync-to-Knowledge-Graph likely deprecates in favor of APATRIS's Layer 0 spine.

### 7.2 Worker-facing mobile portal

- **EEJ owns:** the mobile UI surface (`eej-mobile-HIDDEN/`) — tabs, navigation, branding, auth, candidate intake. This is EEJ's distinguishing daily-driver UX.
- **APATRIS owns:** the legal case data once it becomes the source of truth.
- **Boundary:** UI surface vs data source. The tabs (`MyDocsTab`, `WorkPermitTab`, etc.) consume legal data via API; the data source can shift to APATRIS without changing the UI layer.
- **Consolidation:** keep EEJ's mobile UI; have it call APATRIS's read API for legal case data once Layer 4 (consent loop) ships and the data is canonical there. SSO between platforms required.

### 7.3 Regulatory updates ingest

- **EEJ has:** `regulatory_updates` table + `services/enhanced-daily-scan.ts` — daily Perplexity scan of Polish gov sources.
- **APATRIS has:** `services/daily-legal-scan.service.ts` — likely the same intent.
- **Boundary:** unclear. Could consolidate to one feed. Defer until APATRIS Layer 0 v1 ships and the spine (`legal_articles`) is the authoritative legal-knowledge-store.
- **Consolidation:** monitor; choose one feed by 2026 Q3 to reduce duplication.

### 7.4 Knowledge graph

- **EEJ:** `services/knowledge-graph.ts` (smart-ingest sync target)
- **APATRIS:** `services/knowledge-graph.service.ts` (legal-knowledge structured spine)
- **Boundary:** EEJ's KG appears to be a recruitment-side abstraction; APATRIS's is the Layer 0 legal-articles spine. Different shapes despite the name.
- **Consolidation:** rename EEJ's to disambiguate, OR sunset EEJ's once APATRIS Layer 0 v1 spine is the primary.

---

## 8. Recommended consolidation paths

For each overlap zone (Section 4), my recommendation:

| Zone | EEJ action | Effort | When |
|---|---|---|---|
| 4.1 Legal case management | Deprecate EEJ's legal-case-engine + legal-engine + legal-operations once APATRIS Layer 0 v1 is live and the legal_articles spine is populated. Retain EEJ's pure-function `legal-decision-engine.ts` as a deterministic checker. | Medium (~3-5 days to migrate read paths to APATRIS API; another ~2 days to retire deprecated services) | After APATRIS Layer 0 v1 ships (estimated 6 weeks per master plan, post-counsel-review) |
| 4.2 Immigration intelligence | Deprecate EEJ's immigration AI paths once APATRIS Layer 0 v1 ships. Keep `regulatory_updates` ingest as an EEJ-side feed that Apatris may consume. | Medium (~3 days) | After APATRIS Layer 0 v1 ships |
| 4.3 TRC service | Retain as thin proxy or deprecate; decision waits for APATRIS Layer 1 (case_reference write fixed) | Low if proxy (~1 day), Medium if deprecate (~3 days) | After APATRIS Layer 1 ships |
| 4.4 Work permits | Hybrid retain: EEJ keeps non-TRC permit types (Type A/B/C, Oświadczenie, Seasonal); APATRIS absorbs TRC | None (no migration; just don't grow EEJ's TRC code) | Now |
| 4.5 MOS modules | Retain EEJ's `mos-2026-mandate.ts` (already explicitly EEJ-only); retire `mos-engine.ts` + `mos-package.ts` to APATRIS | Low (~2 days) | After APATRIS Layer 1+ for case-bound MOS ships |
| 4.6 Document handling for legal docs | Hybrid by document type; audit EEJ's `working-documents.ts`, `first-contact-verification.ts`, `smart-ingest.ts` to identify which paths handle legal-evidence vs recruitment docs; route legal-evidence paths to APATRIS API | High (~5-7 days for the audit + route migration) | After APATRIS Layer 1 ships |
| 4.7 Lawyer review surfaces | EEJ has none and shouldn't build one. No EEJ work needed. | None | n/a |
| 4.8 Worker-facing legal status tabs | Hybrid: keep EEJ's mobile UI, switch data source to APATRIS API once canonical there | Medium (~3-5 days for API migration) | After APATRIS Layer 4 ships |
| 4.9 Regulatory updates ingest | Defer — both feeds work; pick one when consolidation cost is justified | n/a | 2026 Q3 review |

**Aggregate consolidation effort estimate:** ~25-35 EEJ-side engineering days, spread across 6-12 months as APATRIS layers ship. None of it is urgent today (APATRIS isn't mature enough to absorb the work yet).

**EEJ posture during the consolidation window:**
- Don't grow the legal-* services in EEJ. Bug-fix only.
- Add disclaimers to mobile tabs that surface AI-generated legal content ("informational, not legal advice").
- Treat the existing legal-case-engine and immigration AI paths as deprecated-on-arrival once APATRIS Layer 0 v1 is committed.

---

## 9. Regulatory exposure (EEJ-side)

### EEJ recruitment scoring is likely high-risk under Annex III §4(a)

EEJ's `routes/jobs.ts` smart matching algorithm (lines 127-165) computes a `matchScore` for worker-job pairs based on: role match (+30), experience (+20), qualification (+15), location (+15), document validity (+20), capped at 100. This score is used to filter and rank candidates for client-facing recruitment workflows.

**EU AI Act Annex III §4(a)** lists "AI systems intended to be used for the recruitment or selection of natural persons, in particular to place targeted job advertisements, to analyse and filter job applications, and to evaluate candidates" as a **high-risk** category.

Unlike APATRIS's Annex III §7 analysis (which depends on the "by or on behalf of competent public authorities" qualifier and concludes likely-not-high-risk), Annex III §4(a) has **no analogous escape qualifier**. Recruitment scoring done by a private staffing agency for its own clients is squarely within the §4(a) target.

**APATRIS's verdict at `bf4d92b` does NOT carry over to EEJ recruitment scoring.** This is a different Annex III category, with different qualifiers, different obligations, different counsel review needs.

### Implications

If the matchScore algorithm is in fact high-risk under §4(a), EEJ inherits Articles 8-15 obligations: risk management, data governance, technical documentation, record-keeping, transparency, human oversight, accuracy/robustness/cybersecurity. Plus Annex IV technical documentation, conformity assessment, EU declaration of conformity, CE marking, post-market monitoring. The scope is similar to what APATRIS would inherit if its Annex III §7 verdict reclassifies.

### What EEJ needs

1. **EEJ-specific EU AI Act research** documenting the §4(a) classification analysis for the matchScore + ATS pipeline. Modeled on APATRIS's `EU_AI_ACT_ARTICLE_6_RESEARCH.md` structure.
2. **EEJ-specific counsel handoff packet** modeled on APATRIS's, scoped to recruitment scoring rather than legal-immigration AI.
3. **Article 6(3) exclusion analysis** — could the matchScore qualify as "narrow procedural task" or "preparatory task" under 6(3)? Likely no because Annex III §4(a) profiling carve-out applies (the algorithm scores natural persons), but the analysis must be documented.
4. **Article 6(4) non-high-risk-assessment record** if §4(a) applies and 6(3) exclusions are asserted as a fallback.

### Effort estimate

- Research document: 2-3 days for EEJ Claude Code to produce a draft modeled on APATRIS's commit `bf4d92b`.
- Counsel handoff packet: 3-4 days to extend the research into a counsel-ready packet.
- Counsel review: 5-15 hours of qualified counsel time (same range as APATRIS).
- Architectural changes: potentially significant if classification confirms; 2-4 weeks of implementation depending on requirements.

---

## 10. EEJ priorities for tomorrow

Ranked by impact and urgency.

### Priority 1 — EEJ EU AI Act §4(a) research

**Scope:** Produce `docs/EU_AI_ACT_ANNEX_III_4A_RECRUITMENT_RESEARCH.md` (or similar path) documenting the Annex III §4(a) classification analysis for `routes/jobs.ts` matchScore + the ATS pipeline. Mirror the structure of APATRIS's `EU_AI_ACT_ARTICLE_6_RESEARCH.md` (commit `bf4d92b`) — 13 sections including framework, Annex III categorical scan, classification verdict, architectural impact, MUST-RESOLVE items, RODO intersection, Polish-specific context, counsel review questions.

**Unblocks:** EEJ can either confirm low-risk posture and document Article 6(4) assessment, or trigger conformity-assessment work. Without this, EEJ has unflagged regulatory exposure on its core recruitment surface.

**Why this is #1:** APATRIS-side regulatory work is ahead. EEJ is sitting on a likely-high-risk surface (matchScore on natural-person candidates) without documented analysis. The audit process matters more than the verdict.

**Estimate:** 2-3 days for the research draft.

### Priority 2 — Persistent Neon test branch for EEJ

**Scope:** Provision a Neon test branch (child of EEJ production), document the connection string pattern in `STEP3-FOLLOWUPS.md` or a new `TEST-DATABASE-SETUP.md`, commit it, run the full vitest suite against it, document the result.

**Unblocks:** Every future EEJ deploy can verify against a real DB without per-deploy ephemeral Docker setup. Eliminates the "Path 2a Docker workaround" recurring overhead. Aligns EEJ verification posture with APATRIS's.

**Why this is #2:** Step 3 closure surfaced this gap explicitly. The Path 2a workaround works but is per-deploy friction. Persistent test infra is a low-cost durable improvement.

**Estimate:** Half day to provision + 1 day to document + verify.

### Priority 3 — Fix `migrate.ts` `legal_evidence` ordering bug

**Scope:** Either move `CREATE TABLE IF NOT EXISTS legal_evidence` from line 634 to before the ALTER block at line 521, OR widen the DO `$$` block at line 520-524 with `EXCEPTION WHEN undefined_table THEN NULL;`. Add a Path 2a verification step that confirms migrations apply on a fresh DB without pre-seed.

**Unblocks:** Path 2a setup becomes a single command, no manual pre-seed. Disaster recovery scenarios (new tenant on new Neon project; clean-room recreation) become viable. Tracked in `STEP3-FOLLOWUPS.md` since Step 3a deploy verification surfaced it.

**Why this is #3:** Latent bug; production isn't affected (table already exists from prior deploys). But it's a real correctness issue and the fix is small.

**Estimate:** Half day for fix + verify.

### Priority 4 — Audit and split EEJ document handling for legal vs recruitment docs

**Scope:** Read `working-documents.ts`, `first-contact-verification.ts` (939 LOC), `smart-ingest.ts` (588 LOC) and identify which code paths handle legal-evidence documents (TRC packets, authority correspondence) vs recruitment documents (CVs, contracts, BHP certs). Document the boundary in `docs/EEJ-APATRIS-CONSOLIDATION-AUDIT.md` Section 7. Tag legal-evidence paths as "deprecate when APATRIS Layer 1 ships."

**Unblocks:** Clears the path for the actual consolidation work later. Without the audit, the consolidation has no roadmap.

**Why this is #4:** Lower urgency than 1-3, but if not done now, the consolidation work becomes a multi-week archeology project later.

**Estimate:** 2 days.

### Priority 5 — Add Stage 4 / Step 1-3 update to `docs/architecture-boundaries.md`

**Scope:** The boundary doc was last updated 2026-04-12, before Stage 4 hardening, Step 1, Step 2, Step 3. Update Section 8 (Feature Ownership Matrix) and Section 9 (Deployment Architecture) to reflect: tenant isolation at FK level, PII encryption (workers PESEL/IBAN), Stripe billing, T1 dashboard, CRM dual-currency, WhatsApp drafter+webhook+approve. Reference this audit doc as the consolidation roadmap.

**Unblocks:** Future audit cycles have a current boundary baseline.

**Estimate:** Half day.

---

## 11. Open questions for APATRIS Claude Code

The APATRIS-side response document should validate or contest:

1. **Layer timing** — when does APATRIS Layer 0 v1 actually ship? Master plan estimates 6 weeks post-counsel-review. Counsel review is 5-15 hours of counsel time, not yet released (`COUNSEL_PACKET_CONTACTS.md` was just populated `edcdc76`). Realistic Layer 0 v1 ship date drives every EEJ consolidation deferral. **EEJ assumes Q3 2026 earliest** for Layer 0 v1; APATRIS Claude Code should confirm or correct.

2. **Layer 1 case_reference resolution** — `CHECK_LAYER1_CASE_REFERENCE.md` has 7 PRODUCT-DECISION questions for Manish that gate Layer 1 sub-phase 1. Without case_reference resolution, the document linker doesn't fire. EEJ's TRC-domain document ingest (`first-contact-verification.ts`, `smart-ingest.ts`) cannot route to APATRIS until this is resolved. **What's the timeline?**

3. **Workforce-app vs EEJ mobile** — APATRIS has its own `workforce-app/` per the LANGUAGE_TOGGLE_VERIFICATION report. Is it intended to **replace** EEJ's mobile tabs for the worker-facing legal status surface, or is it APATRIS's lawyer-facing/site-coordinator surface only? If the former, the consolidation in Section 4.8 is more invasive than I've estimated.

4. **Knowledge graph** — both platforms have a `knowledge-graph` service. Same shape, different purpose, same name? Section 7.4 flags this; needs APATRIS-side disambiguation.

5. **Annex III §4(a) recruitment exposure** — APATRIS's research doc explicitly notes "the CRM and worker-matching modules of the broader Apatris platform may touch this category — but those are separate products from Layer 0 / the legal scope of this assessment." Does APATRIS believe EEJ's `routes/jobs.ts` matchScore is APATRIS's problem or EEJ's? My read: EEJ's. Confirm.

6. **MOS-2026 mandate exclusivity** — EEJ's `services/mos-2026-mandate.ts` declares "NO Apatris data. EEJ only." but APATRIS has `mos-engine.service.ts` and `mos-package.service.ts`. Is the MOS-2026 mandate a separate regulatory regime that EEJ uniquely owns, or is APATRIS's MOS work upstream and EEJ's is downstream operational?

7. **Lawyer-as-gate scope** — does APATRIS's structural lawyer gate apply only to Polish immigration AI outputs, or to ANY AI output that touches a foreign worker (including, e.g., the EEJ RegulatoryTab summary that's currently AI-generated)? If the latter, the consolidation in Section 4.2 is broader than I've estimated.

8. **Counsel review release timing** — `COUNSEL_HANDOFF_PACKET.md` v1.0 is "internally complete, counsel-ready." When is it actually sent to counsel? Layer 0 v1 build is gated. Every downstream timeline depends on this.

---

## 12. Limitations and caveats

### What this audit cannot conclude

- **APATRIS's actual Layer 0+ implementation effort.** Master plan estimates exist; real time-to-ship depends on counsel review depth, AI inference layer build complexity, integration costs not enumerated in the master plan.
- **Whether EEJ's Annex III §4(a) classification verdict is high-risk or excluded under Article 6(3).** The research isn't done yet. Priority 1 produces the research, not the verdict.
- **Whether EEJ's existing `legal-*` services are actually being used in production** vs being shipped-but-dormant. A code-frequency-of-use audit would refine the consolidation cost estimates. Not done in this audit.
- **The actual APATRIS API contract** that EEJ would consume post-consolidation. APATRIS's API exists at `apatris-api.fly.dev` but I did not enumerate its endpoints. The consolidation effort estimates assume a reasonable read-API surface; if APATRIS's API doesn't yet expose the data EEJ would consume, the consolidation timeline extends.

### Boundary ambiguity that this audit cannot resolve unilaterally

- **Document handling boundary** (Section 7.1) — by document type seems right, but the actual file-level audit hasn't happened (Priority 4).
- **Worker-facing surface ownership** (Section 7.2) — depends on whether APATRIS's `workforce-app/` is a candidate for replacing EEJ's mobile tabs. Question 3 in Section 11.
- **Knowledge graph disambiguation** (Section 7.4) — needs APATRIS-side perspective. Question 4 in Section 11.

### What needs cross-platform decision

- All Section 4 consolidation candidates marked "Hybrid" or "Defer."
- Section 9 EU AI Act §4(a) research output — counsel review may produce architectural requirements that change the EEJ recruitment surface materially.
- The actual sequencing: which EEJ deprecation happens first, who commits to which API contract by when.

### Self-affirming-audit risk

This document was written by EEJ Claude Code from EEJ's vantage point. The recommendations favor EEJ's ability to keep working while APATRIS matures. An APATRIS-side audit may reasonably contest:
- "EEJ retains its legal-* services with disclaimers" — APATRIS may argue this perpetuates the false-hope/false-certainty problem the master plan exists to prevent.
- "EEJ keeps the mobile UI surface" — APATRIS may argue this fragments the lawyer-as-gate enforcement; if EEJ's mobile tabs surface AI-generated legal content without lawyer approval, APATRIS's structural gate has a hole.
- "EEJ retains regulatory_updates ingest" — APATRIS may argue Stream C (continuous Polish-law refresh) should be APATRIS-owned to maintain the Layer 0 spine integrity.

These are real critiques. The audit is genuinely partial without the APATRIS-side response.

---

## End of EEJ-side audit

**Next step:** APATRIS Claude Code (next session) reads this document and produces a response document at `Apatris-Compliance-Hub/artifacts/api-server/docs/EEJ-APATRIS-CONSOLIDATION-AUDIT-APATRIS-RESPONSE.md` (or in the EEJ repo as a sibling, depending on where the user prefers to keep the merged record). The response should validate or contest each Section 4 zone, each Section 7 hybrid, each Section 11 question. The merged final consolidation plan emerges from the conversation between the two documents.

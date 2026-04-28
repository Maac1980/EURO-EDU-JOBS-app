# EEJ ↔ APATRIS Consolidation Audit

**Date:** 2026-04-27 (v1) → 2026-04-28 (v2 revision)
**Author:** EEJ Claude Code
**Scope:** Compare current EEJ and APATRIS implementations of overlapping legal-immigration functionality, identify what consolidates to APATRIS, what stays in EEJ, what's hybrid, and produce the priority list for the EEJ side of the build.
**Companion:** `docs/architecture-boundaries.md` (committed 2026-04-12, pre-Step-3) — this audit extends and updates that boundary doc.
**v1 commit:** `2b67a5c` (preserved in git history).
**v2 revision (this commit):** incorporates findings from 2026-04-28 — the matchScore usage audit (chat-only), the EU AI Act §4(a) Phase 1 scope at `docs/EU_AI_ACT_ANNEX_III_4A_RECRUITMENT_RESEARCH_SCOPE.md` (commit `305eb08`), the EEJ agency regulatory framework inventory at `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` (commit `014bea2`), the agency-versus-outsourcing legal-vehicle distinction (new Section 3.5), and the Q1/Q2/Q3 decisions answered as hybrid-architecture / counsel-validated low-risk / single-counsel engagement.
**Authorization:** Cross-repo read of APATRIS at `/Users/manishshetty/Desktop/Apatris-Compliance-Hub` was explicitly authorized for this audit purpose (v1) and re-authorized for the v2 revision; reverts to the EEJ-only / APATRIS-only routine boundary after this v2 commit closes.

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
- **Live version:** **v99** (deployed 2026-04-27)
- **Origin/master HEAD at v1 audit:** `3c0695c` (Step 3 closure documentation commit)
- **Origin/master HEAD at v2 revision:** `014bea2` (regulatory framework inventory, 2026-04-28). Three documentation commits since v1 of this audit: `305eb08` (EU AI Act §4(a) scope), `014bea2` (regulatory framework inventory). No code commits — production is still v99.
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

**v2 update — agency-specific compliance encoding is more substantial than v1 captured.** The regulatory framework inventory at `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` (commit `014bea2`) catalogues **33 encoded compliance constraints** across `agency-protection.ts` (625 LOC), `agency-compliance-engine.ts` (695 LOC), `legal-decision-engine.ts`, `legal-intelligence.ts`, `legal-kb.service.ts`, `first-contact-verification.ts`, and `docs/knowledge-hub/workflows/status-dashboard.ts`. Highlights: 5 placement gates as hard blocks (BHP, medical, work auth, contract-permit type, 18-month assignment limit), 5 voivode-notification deadlines (Art. 88i ust. 1/2/7), KRAZ tracker (Art. 305-329, Ustawa o rynku pracy 2025), 10-rule retention table (incl. Art. 14a 36-month assignment retention), Specustawa/CUKR Ukrainian-worker tracker, BHP/risk-assessment templates including `Ryzyko zawodowe`. The inventory also flags 10 gaps; the top three by §4(a)-Phase-2 impact are Gap 5 (jobRole free-text taxonomy, 12-20 hr), Gap 4 (agency-vs-direct classifier, 4-6 hr), Gap 2 (position-specific permit binding, 8-14 hr). This refines Section 4 (consolidation candidates) and Section 5 (EEJ-only domain) below.

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
- **Live version:** **v295** (deployed 2026-04-24, unchanged since v1 of this audit)
- **APATRIS git HEAD at v1 audit:** `edcdc76` (counsel packet contacts populated 2026-04-28)
- **APATRIS git HEAD at v2 revision:** `27ff161` (front-matter refinement). Four documentation-only commits since `edcdc76`: `27ff161`, `839db22`, `4e76e01`, `57d3b1d` — all counsel-packet refinements (front-matter, version line, Manish's role title, removal of obsolete subsections). No code commits.
- **Production health:** `https://apatris-api.fly.dev/api/healthz` → HTTP 200

Recent commits (`27ff161` and 13 prior) are entirely **documentation work** on the counsel handoff packet — Section 8 verbatim seven questions, Section 11 engagement contacts, version cleanup. The most recent CODE deploy (v295) shipped Apr 24, four days before the v2 revision of this audit.

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

## 3.5. Legal vehicle distinction (added in v2)

The consolidation analysis depends on a structural distinction that v1 of this audit underweighted: **EEJ and APATRIS operate under different legal vehicles for placing foreign workers in Poland**, and that vehicle determines which obligations attach to each platform.

### EEJ — agencja pracy tymczasowej (temporary work agency)

EEJ operates as `agencja pracy tymczasowej` under **Ustawa z dnia 9 lipca 2003 r. o zatrudnianiu pracowników tymczasowych** (Temporary Employment Act). Workers are *leased* by EEJ to a *user-employer* (`pracodawca użytkownik`); the worker is EEJ's employee, the user-employer directs the work. The legal relationship is structurally tripartite (Art. 7).

This vehicle imposes a specific set of obligations EEJ encodes today (Section 2 update; full inventory at `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md`):
- **Work-type prohibitions (Art. 8 ust. 1)** — agency-leased workers cannot perform certain work, notably particularly dangerous work (`prace szczególnie niebezpieczne`) which by implementing regulation includes work at heights (`praca na wysokości`), and cannot replace striking workers or recently-dismissed permanent staff.
- **Equal pay parity (Art. 15 + Art. 18³ᶜ KP)** — agency-leased workers must receive equivalent pay and conditions to user-employer permanent staff in the same role.
- **18/36-month assignment limits (Art. 20)** — cumulative duration cap at any one user-employer.
- **Voivode notification cadence (Art. 88i)** — 7/14/15-day reports of commencement, non-commencement, termination.
- **KRAZ registration** — agency cannot operate without KRAZ entry; annual Marshal report under Art. 323.
- **Tripartite document responsibilities** — BHP induction, risk-assessment information (`Ryzyko zawodowe`), medical referral, `Zakres obowiązków`.

### APATRIS — outsourcing / legal services platform

APATRIS does not place workers as agency-leased. Per the master plan and the EU AI Act §7 research at `bf4d92b`, APATRIS is "private applicant-side legal services" — it represents foreigners in their proceedings before authorities (TRC applications, work-permit submissions, appeals). When APATRIS handles an outsourced workforce engagement, the workers are typically *directly employed* by APATRIS (or an APATRIS-affiliated entity) and the engagement with the end-client is governed by a *services contract* (B2B), not a tripartite agency-leasing structure.

Outsourcing under this structure does **not** trigger the Temporary Employment Act's Art. 8 prohibitions, Art. 15 equal-pay parity to a user-employer's staff, or Art. 20 18/36-month cap. It does still trigger general Kodeks Pracy obligations (Art. 229 medical, Art. 237³ BHP, Art. 22¹ contract requirements), Foreigners Act position-specific permits (Art. 88), and RODO. But the *agency-specific* layer that EEJ encodes is a different obligation set than the *outsourcing-with-legal-services* layer APATRIS encodes.

### Why this distinction shapes consolidation

The Urząd's questioning of APATRIS's legal vehicle (referenced in conversation; not yet documented in the APATRIS counsel packet beyond the §7 "by or on behalf of" qualifier analysis) presses on whether APATRIS can lawfully take on certain workforce engagements that an agencja pracy can. The answer matters here because:

1. **Some EEJ functionality is legally agency-specific and cannot consolidate to APATRIS.** The Section 4 zones marked "agency-specific" in v2 stay in EEJ regardless of how mature APATRIS becomes — they encode obligations that only attach to EEJ's vehicle.
2. **Some EEJ functionality is legal-domain-shared and can consolidate to APATRIS.** Recruitment-side document AI, regulatory-update ingest, immigration AI on TRC applications — these are jurisdictional knowledge work, not vehicle-specific obligations.
3. **Some EEJ functionality is a candidate for shared infrastructure that both vehicles need.** Position-specific permit binding (Gap 2 in the regulatory framework inventory) is needed by both EEJ (to validate worker placement under the agency vehicle) and APATRIS (to assist worker permit-amendment workflow under the legal-services vehicle). Building it once in shared infrastructure serves both.

### Implication for the audit's consolidation classification

v1 of this audit used three labels for each Section 4 zone: "EEJ deprecates," "APATRIS owns," "Hybrid." v2 introduces a four-way classification that surfaces the legal-vehicle distinction explicitly:

- **STAY IN EEJ** — encodes agency-specific (Temporary Employment Act) obligations; cannot consolidate without breaking compliance posture.
- **MOVE TO APATRIS** — immigration legal-domain knowledge work that APATRIS structurally owns under the master plan.
- **SHARED INFRASTRUCTURE** — both platforms benefit; build once and consume from both. Examples: position-permit binding, retention scheduler core (rules differ by vehicle but the scheduler engine is the same), document storage substrate.
- **HYBRID** — parts move, parts stay. Examples: document handling (recruitment docs stay in EEJ; legal-evidence docs move to APATRIS); worker-facing mobile UI (UI surface stays in EEJ; legal-status data moves to APATRIS).

Section 4 zones below are now labelled with this four-way classification.

---

## 4. Conceptual overlap zones

For each zone: what EEJ has, what APATRIS has, consolidation candidate. **v2** annotates each zone with the four-way label introduced in Section 3.5 (STAY IN EEJ / MOVE TO APATRIS / SHARED INFRASTRUCTURE / HYBRID).

### 4.1 Legal case management — **MOVE TO APATRIS**

| | EEJ (`3c0695c`) | APATRIS (`edcdc76`) |
|---|---|---|
| Files | `services/legal-case-engine.ts`, `case-engine.ts`, `legal-engine.ts`, `legal-decision-engine.ts`, `legal-operations.ts`, `legal-tracking-card.ts` | `services/legal-case.service.ts`, `case-intelligence.service.ts`, `case-notebook.service.ts`, `case-sync.service.ts`, `legal-engine.ts`, `legal-queue.service.ts`, `legal-status.service.ts`, `legal-approval.service.ts` |
| Schema | EEJ has `legal_cases` table on prod (Stage 4 tenant-scoped) | APATRIS has `trc_cases`, `case_notebook_entries`, `case_generated_docs`, `case_reference` (NULL on all 5 prod rows per `CHECK_LAYER1_CASE_REFERENCE.md`) — schema-without-data-flow problem |
| State machine | EEJ's legal-decision-engine is documented as "PURE function, NO AI, NO database, NO side effects" — deterministic | APATRIS Layer 0 design names two-sided argument construction, refusal mode, source-linked claims as the structural target |
| Lawyer gate | None structural — EEJ services produce text; mobile tabs show worker status | APATRIS principle 9: "AI completes; lawyer edits and sends. Boundary is structural, not preferential." Layer 0 v1 includes 5-layer structural prevention of AI-side send. |
| **Consolidation candidate** | EEJ deprecates legal-case-engine + legal-engine + legal-operations once APATRIS Layer 0 v1 ships. EEJ's pure-function legal-decision-engine may survive as a checker but the AI-generating-text paths sunset. | APATRIS owns this domain |

### 4.2 Immigration intelligence — **MOVE TO APATRIS**

| | EEJ | APATRIS |
|---|---|---|
| Files | `services/immigration.service.ts`, `legal-intelligence.ts`, `legal-answer-engine.ts`, `legal-completions.ts`, `routes/regulatory.ts`, `routes/permits.ts`, `routes/trc-service.ts` | `services/legal-intelligence.service.ts`, `legal-answer.service.ts`, `legal-research.service.ts`, `legal-copilot.service.ts`, `legal-ai-explanation.service.ts`, `daily-legal-scan.service.ts` |
| Knowledge base | EEJ has `regulatory_updates` table, scraped from praca.gov.pl/ZUS/PIP/Sejm | APATRIS has `legal_knowledge` (12 prod rows), `legal_articles` (designed, not yet built) — Layer 0 spec calls for ~80-150 article corpus |
| AI surface | EEJ uses Claude + Perplexity inline; no source linkage enforcement | APATRIS Layer 0 design enforces source linkage as schema constraint (4-layer: schema + prompt + validator + drift detection) |
| **Consolidation candidate** | EEJ deprecates the immigration AI paths once APATRIS Layer 0 v1 ships. EEJ keeps `regulatory_updates` ingest as a feed for Apatris consumption (not as the AI brain). | APATRIS owns this domain |

### 4.3 TRC service — **HYBRID** (data MOVES TO APATRIS; thin EEJ proxy may persist short-term)

| | EEJ | APATRIS |
|---|---|---|
| Files | `routes/trc-service.ts` (in EEJ routes) | `services/legal-status.service.ts`, `legal-evidence-ocr.service.ts`, `worker-legal-view.service.ts`, plus `trc_cases` table |
| Schema | EEJ has `work_permit_applications` (with `tenant_id`, Stage 4-scoped) | APATRIS has `trc_cases` with `case_reference`, plus document linker logic in `document-intake.service.ts` |
| **Consolidation candidate** | EEJ's TRC service is a thin route layer over `work_permit_applications`; could be retained as a passthrough that proxies to APATRIS, OR deprecated and replaced by APATRIS's case management surface accessible via SSO | Hybrid — EEJ may proxy in the short term |

### 4.4 Work permits (Type A/B/C, Oświadczenie, Seasonal) — **HYBRID** (position-binding is SHARED INFRASTRUCTURE candidate; agency-side enforcement STAYS IN EEJ)

| | EEJ | APATRIS |
|---|---|---|
| Files | `routes/permits.ts` + `work_permit_applications` table | not as direct a match — APATRIS uses `trc_cases` as the unified case container |
| Behavior | EEJ has CRUD + 7-day deadline tracking + document checklists | APATRIS has document-intake linker + case-centered workflow |
| **Consolidation candidate** | Hybrid: EEJ retains for non-TRC permit types not yet covered by APATRIS; APATRIS absorbs TRC-card permits as part of legal case management | Hybrid; redraw boundary when APATRIS Layer 1+ ships |

### 4.5 MOS (Ministerstwo Spraw Zagranicznych) modules — **HYBRID** (mos-2026 mandate STAYS IN EEJ; legacy mos-engine MOVES TO APATRIS)

| | EEJ | APATRIS |
|---|---|---|
| Files | `services/mos-engine.ts`, `mos-package.ts`, `mos-2026-mandate.ts` (with explicit comment "NO Apatris data. EEJ only.") | `services/mos-engine.service.ts`, `mos-package.service.ts` |
| Branding | EEJ's `mos-2026-mandate.ts` declares EEJ-only and explicitly excludes Apatris data | APATRIS has parallel implementation |
| **Consolidation candidate** | EEJ retains its `mos-2026-mandate.ts` (already explicitly EEJ-only); the legacy `mos-engine.ts` + `mos-package.ts` deprecate in favor of APATRIS's Layer 1+ once shipped | Mostly APATRIS, but EEJ keeps the MOS-2026 mandate-specific module |

### 4.6 Document handling for legal documents — **HYBRID** (recruitment docs STAY IN EEJ; legal-evidence docs MOVE TO APATRIS; storage substrate SHARED)

| | EEJ | APATRIS |
|---|---|---|
| Files | `services/document-ocr.ts`, `document-hardening.ts`, `document-logging.ts`, `smart-document.ts`, `smart-ingest.ts`, `working-documents.ts`, `first-contact-verification.ts` (939 LOC monolithic) | `services/document-intake.service.ts`, `document-intake-hardening.service.ts`, `document-intelligence.service.ts`, `legal-document.service.ts`, `legal-evidence-ocr.service.ts`, `case-doc-generator.service.ts`, `smart-document.service.ts` |
| Discipline | EEJ uses Claude Vision OCR + Knowledge Graph sync; no source linkage requirement | APATRIS Layer 1 calls for `linkDocument` to populate `linked_case_id` on every upload (currently 0/20 prod rows linked — broken-on-prod gap that Layer 1 fixes) |
| **Consolidation candidate** | **HYBRID**: EEJ continues to ingest recruitment-domain documents (CVs, contracts, BHP certs); APATRIS owns legal-evidence-domain documents (TRC application packets, authority correspondence, court filings). Boundary at the document type. | Hybrid — see Section 7 |

### 4.7 Lawyer review surfaces — **MOVE TO APATRIS** (EEJ has none; agency-side does not need one)

| | EEJ | APATRIS |
|---|---|---|
| Files | `services/poa-legal-protection.ts` (POA + RODO consent tracker), `legal-tracking-card.ts` | `services/legal-approval.service.ts`, `legal-queue.service.ts`, `legal-copilot.service.ts` (with future Layer 0 v2 in-flight engagement, post-edit verification, probe support) |
| Discipline | EEJ has no structural lawyer gate — drafts produced by AI services can flow to mobile worker tabs without lawyer approval | APATRIS principle 1: "Human review is the structural gate. AI output cannot reach a client or authority without lawyer approval." Layer 0 v1 includes structural send-prevention. |
| **Consolidation candidate** | EEJ has no equivalent surface and shouldn't try to build one. APATRIS owns the lawyer review surface for legal-immigration domain. | APATRIS owns |

### 4.8 Worker-facing legal status (mobile tabs) — **HYBRID** (UI surface STAYS IN EEJ; legal-status data MOVES TO APATRIS)

| | EEJ | APATRIS |
|---|---|---|
| Files | mobile `MyDocsTab.tsx`, `MyStatusTab.tsx`, `MyUPOTab.tsx`, `WorkPermitTab.tsx`, `TRCServiceTab.tsx`, `MySchengenTab.tsx`, `ImmigrationSearchTab.tsx`, `RegulatoryTab.tsx`, `GDPRTab.tsx` | APATRIS has separate `workforce-app/` plus `worker-legal-view.service.ts` for the data layer |
| User flow | EEJ shows worker their own document expiries, work permit status, Schengen day count, upcoming TRC dates | APATRIS shows worker their case status (not yet documented in detail; would need Layer 4 consent loop to be meaningful) |
| **Consolidation candidate** | Hybrid: EEJ retains the worker-facing mobile tabs as the "always-with-you" daily-driver UX (the tabs are wired into the EEJ portal and compliance flows). When APATRIS Layer 4 ships, those tabs may consume APATRIS data via API, but the surface stays EEJ-branded. | Hybrid — EEJ owns the surface; APATRIS owns the data once it's the source of truth |

### 4.9 Regulatory updates as legal-domain content — **HYBRID** (defer; EEJ retains for compliance dashboards; APATRIS feeds legal_articles spine)

| | EEJ | APATRIS |
|---|---|---|
| Files | `routes/regulatory.ts`, `regulatory_updates` table, `enhanced-daily-scan.ts` | `services/daily-legal-scan.service.ts` |
| Source | EEJ scrapes praca.gov.pl, ZUS, PIP, Sejm via Perplexity | APATRIS has its own daily scan service |
| **Consolidation candidate** | EEJ retains the regulatory ingest for compliance dashboard purposes (T1 dashboard "Regulatory Intelligence" widget); APATRIS may consume the same feed or run its own. Defer decision; both sides currently have working code. | Defer — both keep their feeds for now |

### 4.10 Agency-specific compliance gates — **STAY IN EEJ** (added in v2)

| | EEJ (`014bea2`) | APATRIS |
|---|---|---|
| Files | `services/agency-protection.ts` (BHP/medical/permit hard blocks at `:531-549`, contract-permit cross-validation at `:228-280`, Annex 1 signature countdown, Specustawa/CUKR tracker, offline compliance card), `services/agency-compliance-engine.ts` (18/36-month limiter at `:172-181`, KRAZ tracker, Marshal annual report, voivode notifications at `:412-431`, retention scheduler at `:501-554`, PIP inspection pack, contract reclassification scanner) | None equivalent — APATRIS is outsourcing, not agency-leasing |
| Regulatory basis | Ustawa o zatrudnianiu pracowników tymczasowych (Art. 8 prohibitions [not encoded — Gap 1], Art. 14a retention, Art. 15 equal-pay [not encoded — Gap 3], Art. 20 assignment limits), Ustawa o promocji zatrudnienia (Art. 87, 88, 88i, 88z), Ustawa o rynku pracy (Art. 305-329 KRAZ, Art. 323 Marshal report), Kodeks Pracy (Art. 229, 237³, 22¹), Foreigners Act (Art. 88, 108, 114, 118, 139a-f), Specustawa CUKR | Foreigners Act (Art. 88, 108, 114, 118), Kodeks Pracy (Art. 229, 237³); does NOT need Temporary Employment Act enforcement |
| **Consolidation candidate** | **STAY IN EEJ.** This is the legal-vehicle-specific layer — agency obligations imposed by Temporary Employment Act do not apply to APATRIS as outsourcing. The 33-constraint inventory at `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` is structurally EEJ-domain. | n/a |

---

## 5. EEJ-only domain

These remain entirely EEJ — not part of any consolidation. **v2 update:** the agency-compliance-ops row below is the operational surface for the 33 constraints catalogued in `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` (commit `014bea2`); see Section 4.10 for the explicit STAY-IN-EEJ rationale rooted in the legal-vehicle distinction (Section 3.5).

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

### 7.5 Position-specific permit binding (added in v2 — SHARED INFRASTRUCTURE candidate)

- **EEJ need:** Gap 2 in the regulatory framework inventory (`docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` Section 4.1, 4.2, Section 5 Gap 2). Art. 88 Ustawa o promocji zatrudnienia issues work permits for a specific position (`stanowisko`) and a specific user-employer. EEJ stores `workers.permit_type` and `workers.work_permit_expiry` but does NOT store `permit_position` or `permit_user_employer`. The matching logic at `routes/jobs.ts:152-157` checks expiry only — it does not validate that the permit was issued for the same position or user-employer as the job posting. Closing this gap is estimated at 8-14 hours.
- **APATRIS need:** when handling foreigner permit-amendment workflows (the master plan's case-centered architecture), APATRIS needs to know what position the existing permit covers in order to determine whether an amendment or a new permit is required. Same data model (permit → position → user-employer) is needed.
- **Boundary:** the data model and the position-vs-job cross-validation logic are common across both vehicles; the consumer-side decision (block placement at EEJ vs route-to-amendment-workflow at APATRIS) differs.
- **Consolidation:** **build once.** Add `permit_position` and `permit_user_employer_id` columns on a shared schema (likely `work_permit_applications` extended), expose via API to both platforms. EEJ consumes for matching-time validation; APATRIS consumes for amendment-workflow routing. Defer until APATRIS Layer 1+ ships and the API contract is stable.

### 7.6 Document retention scheduler (added in v2 — partial SHARED INFRASTRUCTURE candidate)

- **EEJ has:** retention rules table at `services/agency-compliance-engine.ts:501-512` with 10 entries (Personnel file, Payroll, Foreign-worker docs, CV, Contract, BHP cert, Medical cert, **Assignment record (Art. 14a, 36 months — agency-specific)**, ZUS, Tax). Scheduler engine at `:514-554`.
- **APATRIS need:** legal-evidence retention is its own concern (case files, authority correspondence, court filings have their own retention requirements under Polish administrative procedure rules). APATRIS likely needs an equivalent scheduler.
- **Boundary:** the scheduler **engine** (compute delete-after date, surface due queue, mark-completed) is generic. The **rule set** is vehicle-specific: EEJ's Art. 14a 36-month assignment retention is agency-specific; APATRIS's case-evidence retention is legal-services-specific.
- **Consolidation:** scheduler engine could be extracted to shared infrastructure; rule sets stay separate per vehicle. Lower priority than 7.5 because EEJ's scheduler is small (40 LOC) and the duplication cost is low.

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

### v2 update — refinement based on legal vehicle distinction

The v2 four-way classification (Section 3.5) refines v1's recommendations:

- **STAY IN EEJ (Section 4.10, agency-specific compliance gates):** zero migration effort; this layer cannot consolidate without breaking compliance posture under Ustawa o zatrudnianiu pracowników tymczasowych. Continue to grow this layer per the gap list at `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` Section 5.
- **MOVE TO APATRIS (zones 4.1, 4.2, 4.7):** unchanged from v1. ~6-8 engineering days when APATRIS Layer 0 v1 is live.
- **HYBRID (zones 4.3, 4.4, 4.5, 4.6, 4.8, 4.9):** unchanged from v1.
- **SHARED INFRASTRUCTURE (zones 7.5, 7.6 added in v2):** position-specific permit binding (Section 7.5) and document retention scheduler engine (Section 7.6) become candidates for shared build. Position binding intersects with EEJ's Gap 2 — implementation that serves both vehicles is more efficient than EEJ-alone implementation, IF APATRIS commits to consuming the same model. Decision deferred until APATRIS Layer 1+ API contract is stable.

The aggregate effort estimate (~25-35 EEJ-side engineering days) does not change materially because the SHARED INFRASTRUCTURE work was implicit in v1's "Hybrid" zone treatment. The clarity gain is structural, not numeric.

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

### v2 update — Phase 1 scope, matchScore audit findings, and Q1/Q2/Q3 decisions

Three refinements landed on 2026-04-28:

**1. Phase 1 §4(a) scope committed at `305eb08`.** `docs/EU_AI_ACT_ANNEX_III_4A_RECRUITMENT_RESEARCH_SCOPE.md` is the structural template for the §4(a) research, mirroring APATRIS's `bf4d92b` (14 H2 sections / 416 lines) adapted to recruitment. Phase 1 (this scoping doc) is committed; Phase 2 (research) is the priority for tomorrow's session (Section 10 Rank 2). Phase 2 + 3 refined estimate: ~22-25 hours total (10-12 hours research + 9 hours write); contracts toward 18-20 hours if Q1 hybrid is adopted before Phase 2 starts.

**2. matchScore usage audit (chat-only, not committed) classified the algorithm as PARTIALLY USED.** Findings:
- Defined inline at `routes/jobs.ts:127-159` (apply path) and `:244-280` (admin-pull /matches endpoint). Schema column at `db/schema.ts:351` (numeric(5,2)).
- Surfaced in production: `eej-mobile-HIDDEN/src/pages/tabs/ApplicationsTab.tsx:143-152` and `ATSPipelineTab.tsx:135-144` as color-coded badges to authenticated recruiters.
- Decision impact: **display-only / human-in-the-loop**. No auto-reject, no auto-advance, no candidate-facing exposure, no notifications, no audit trail.
- Half-implemented: the public-application path at `routes/workers.ts:184` writes `matchScore: "0"` and never recomputes — half of EEJ's intake bypasses the scoring.
- **Two strong protected-characteristics proxies identified for Article 10 data governance scrutiny:** `worker.trcExpiry` and `worker.workPermitExpiry` (compliance bonus +20). Both are structurally available only to non-EU candidates (TRC = third-country-national permit; work permit unnecessary for EU candidates). They function as legal-residency-status proxies that map to nationality. The +20 compliance bonus is unavailable to EU candidates by construction. Whether this is legally-required-checking versus discriminatory-ranking is the central §4(a) Phase 2 question.
- One **age-proxy** identified: `worker.experience` parsed-as-int with a >=3-year cliff. Step-function disadvantage for younger candidates. Less central than the TRC/permit proxies but Article 10-relevant.
- **Auth-gating gap surfaced as collateral finding:** `GET /api/jobs/:id` at `routes/jobs.ts:38` is NOT auth-gated and returns all `job_applications` joined with `workers` rows, including `matchScore` and worker PII. This is a separate access-control gap, not §4(a) scope, but flagged for separate fix (Section 10 Rank 3).

**3. Q1/Q2/Q3 decisions answered.**
- **Q1 (matchScore strategic vs vestigial) — answered HYBRID.** Sunset numeric ranking; retain rule evaluation as eligibility checklist; separate eligibility from ranking; present factual information (✅ TRC valid, ✅ Work permit valid, ⚠ Experience <3y) to recruiters without composite scores or color-coded badges. Rationale: the matchScore is decorative in current operations (no business outcome conditioned on it; half of intake bypasses it; not audited; not surfaced to candidates) — but the underlying rule evaluation has operational value as a compliance checklist that a recruiter can scan. Sunsetting only the *ranking* eliminates the §4(a) ranking surface while preserving the compliance utility.
- **Q2 (risk tolerance for §4(a) classification) — answered Option C.** Hybrid validated through counsel as low-risk classification. The architectural intervention from Q1 (sunset ranking, eligibility-only filtering, factual presentation) is the basis for the low-risk argument. If counsel agrees the post-intervention architecture does not fall within Annex III §4(a)'s "analyse and filter job applications, evaluate candidates" scope, Articles 8-15 conformity work is not triggered. If counsel disagrees, the conformity work returns to the table.
- **Q3 (counsel engagement strategy) — answered Option C.** Single counsel engagement with the same Polish counsel APATRIS will engage; escalate to specialist employment-law counsel only if the work demands it. Rationale: cost/time efficiency, single relationship covers both platforms' EU AI Act exposure, specialist escalation is available if §4(a) analysis reveals labor-law-specific complexity beyond the general counsel's depth.

These decisions shape Phase 2's deliverable: rather than Phase 2 producing an open-ended classification analysis, it produces a counsel-ready argument that the post-intervention matchScore architecture is low-risk under §4(a), with the architectural intervention as Phase 2's recommended action and the Article 6(4) non-high-risk-assessment record as a Phase 3 deliverable.

---

## 10. EEJ priorities for tomorrow

**v2 update — re-ranked based on 2026-04-28 work and Q1/Q2/Q3 decisions.**

The v1 ranking placed the §4(a) research at Rank 1 with persistent test branch and migrate.ts fix following at Ranks 2 and 3. The v2 ranking inserts a new Rank 1 (close Gap 4 — agency-vs-direct classifier) and a new Rank 3 (close auth-gating gap at `GET /api/jobs/:id`) reflecting today's findings; the §4(a) research moves to Rank 2 because it requires Gap 4 closed first to scope correctly. The persistent test branch and migrate.ts fix shift to Ranks 4 and 5 — they remain valid follow-ups but are deferred behind §4(a) work because §4(a) is regulatory-deadline-sensitive.

### Priority 1 (v2 — new) — Close Gap 4 (agency-vs-direct classifier)

**Scope:** Add a `placement_type` enum column (`agency_leased` | `direct_hire`) to `workers` (or to `eej_assignments`), default `agency_leased`, surface in onboarding / assignment creation UI, gate Art. 8 / Art. 15 / Art. 20 enforcement on it.

**Unblocks:** §4(a) Phase 2 needs explicit `placement_type` to scope which placements the matchScore actually touches. Without this field, Phase 2 must either assume all placements are agency-leased (overscoping) or declare scope ambiguous. Cheapest of the five gaps in the regulatory framework inventory; closes a classification precondition.

**Why this is #1:** Smallest-effort high-impact item on the list. 4-6 hours of engineering vs Phase 2's 10-12 hours of research. Closing Gap 4 first reduces Phase 2's open variables.

**Estimate:** 4-6 hours (per `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` Section 5 Gap 4).

### Priority 2 (v2 — was Priority 1) — EEJ EU AI Act §4(a) Phase 2 research

**Scope:** Phase 2 of the §4(a) work scoped at `docs/EU_AI_ACT_ANNEX_III_4A_RECRUITMENT_RESEARCH_SCOPE.md` (commit `305eb08`). Produce the research document at the path that scope identifies, mirroring APATRIS's `EU_AI_ACT_ARTICLE_6_RESEARCH.md` (commit `bf4d92b`) structure adapted to recruitment §4(a). Cite the regulatory framework inventory (`014bea2`) and the matchScore audit findings (Section 9 v2 update). Build the counsel-ready argument that the post-Q1-hybrid-intervention architecture is low-risk under §4(a).

**Unblocks:** Counsel engagement can proceed with a defensible low-risk classification argument. Article 6(4) non-high-risk-assessment record can be drafted as a Phase 3 deliverable. Architectural intervention (sunset ranking, eligibility-only filtering, factual presentation) becomes a scoped engineering task with a deadline pegged to counsel sign-off.

**Why this is #2:** §4(a) regulatory exposure remains EEJ's largest unflagged regulatory item. Q1/Q2/Q3 decisions have narrowed the scope from "open classification analysis" to "build the low-risk argument with the hybrid intervention as the architectural anchor." Phase 2 can begin once Gap 4 (Priority 1) is closed.

**Estimate:** Phase 2 research ~10-12 hours; Phase 3 write ~9 hours; total ~22-25 hours, contracting toward 18-20 hours given Q1 hybrid is decided before Phase 2 starts.

### Priority 3 (v2 — new) — Close auth-gating gap at `GET /api/jobs/:id`

**Scope:** The matchScore audit on 2026-04-28 surfaced that `GET /api/jobs/:id` at `routes/jobs.ts:38` is NOT auth-gated and returns all `job_applications` for the job joined with `workers` rows, including `matchScore` and worker PII (name, email, jobRole, nationality at minimum). Add `authenticateToken` middleware; restrict the application list to authenticated callers; consider whether the public-facing job board needs a separate non-applications-leaking view.

**Unblocks:** Closes a privacy/PII exposure that is independent of §4(a) but adjacent. Reduces RODO Article 6 / Article 32 attack surface. Demonstrates compliance posture during counsel review.

**Why this is #3:** Privacy concern surfaced as collateral finding during the matchScore audit. Small fix, high cleanup-value, easy to bundle with §4(a) Phase 2's eventual architectural changes. Could be done in parallel with Priority 1 by the same engineer; ranked #3 to preserve the sequencing intent.

**Estimate:** 2-4 hours.

### Priority 4 (v2 — was Priority 2) — Persistent Neon test branch for EEJ

**Scope:** Provision a Neon test branch (child of EEJ production), document the connection string pattern in `STEP3-FOLLOWUPS.md` or a new `TEST-DATABASE-SETUP.md`, commit it, run the full vitest suite against it, document the result.

**Unblocks:** Every future EEJ deploy can verify against a real DB without per-deploy ephemeral Docker setup. Eliminates the "Path 2a Docker workaround" recurring overhead. Aligns EEJ verification posture with APATRIS's.

**Why this was #2 in v1, now #4 in v2:** Step 3 closure surfaced this gap explicitly. The Path 2a workaround works but is per-deploy friction. Persistent test infra is a low-cost durable improvement. Deferred behind §4(a) work because §4(a) is regulatory-deadline-sensitive.

**Estimate:** Half day to provision + 1 day to document + verify.

### Priority 5 (v2 — was Priority 3) — Fix `migrate.ts` `legal_evidence` ordering bug

**Scope:** Either move `CREATE TABLE IF NOT EXISTS legal_evidence` from line 634 to before the ALTER block at line 521, OR widen the DO `$$` block at line 520-524 with `EXCEPTION WHEN undefined_table THEN NULL;`. Add a Path 2a verification step that confirms migrations apply on a fresh DB without pre-seed.

**Unblocks:** Path 2a setup becomes a single command, no manual pre-seed. Disaster recovery scenarios (new tenant on new Neon project; clean-room recreation) become viable. Tracked in `STEP3-FOLLOWUPS.md` since Step 3a deploy verification surfaced it.

**Why this was #3 in v1, now #5 in v2:** Latent bug; production isn't affected (table already exists from prior deploys). But it's a real correctness issue and the fix is small. Deferred behind §4(a) work because §4(a) is regulatory-deadline-sensitive.

**Estimate:** Half day for fix + verify.

### Priority 6 (v2 — was Priority 4) — Audit and split EEJ document handling for legal vs recruitment docs

**Scope:** Read `working-documents.ts`, `first-contact-verification.ts` (939 LOC), `smart-ingest.ts` (588 LOC) and identify which code paths handle legal-evidence documents (TRC packets, authority correspondence) vs recruitment documents (CVs, contracts, BHP certs). Document the boundary in `docs/EEJ-APATRIS-CONSOLIDATION-AUDIT.md` Section 7. Tag legal-evidence paths as "deprecate when APATRIS Layer 1 ships."

**Unblocks:** Clears the path for the actual consolidation work later. Without the audit, the consolidation has no roadmap.

**Why this is #4:** Lower urgency than 1-3, but if not done now, the consolidation work becomes a multi-week archeology project later.

**Estimate:** 2 days.

### Priority 7 (v2 — was Priority 5) — Add Stage 4 / Step 1-3 update to `docs/architecture-boundaries.md`

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

### Added in v2 — questions surfaced by the regulatory framework inventory and matchScore audit

9. **Does APATRIS have an equivalent compliance-encoding inventory?** The EEJ regulatory framework inventory at `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` (commit `014bea2`) catalogues 33 encoded constraints across the agency-vehicle compliance layer. APATRIS likely has its own outsourcing-vehicle compliance encoding (Foreigners Act submissions, KPA procedural deadlines, RODO retention for case files). An APATRIS-side equivalent inventory would clarify which of the EEJ inventory items are vehicle-specific (and thus not consolidation candidates) versus generally applicable (potential SHARED INFRASTRUCTURE).

10. **Does APATRIS handle position-specific permit binding for outsourced workers?** Section 7.5 (added in v2) flags position-permit binding as a SHARED INFRASTRUCTURE candidate. Does APATRIS already store `permit_position` and `permit_user_employer` in any of its case-management tables? If yes, EEJ should consume that schema rather than build its own. If no, EEJ should propose a shared schema before independently closing Gap 2.

11. **Does APATRIS have a contract reclassification scanner equivalent to EEJ's?** EEJ's `services/agency-compliance-engine.ts:632-695` scans civil-contract workers for PIP-reclassification risk indicators (Zlecenie / Dzieło / B2B with patterns suggesting de facto employment relationship). The 2026 PIP empowerment to reclassify with 7-day appeal applies to outsourced workers as well as agency-leased ones. If APATRIS has built equivalent scanning, the algorithm could be shared; if not, this is an area where EEJ's encoding could be useful upstream.

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

### v2 update — limitations specific to the v2 revision

- The v2 four-way classification (STAY IN EEJ / MOVE TO APATRIS / SHARED INFRASTRUCTURE / HYBRID) is grounded in the legal-vehicle distinction (Section 3.5), but the *legal-vehicle distinction itself* has not yet been validated by counsel. The Urząd's questioning of APATRIS's legal vehicle (referenced in conversation) presses on this. If counsel concludes that APATRIS's legal vehicle is structurally adjacent to agencja pracy rather than distinct from it, the STAY-IN-EEJ classification of Section 4.10 may need revisiting.
- The matchScore audit (Section 9 v2 update) was returned in chat and not committed to a separate document. Findings are summarized in this audit's Section 9 update; full audit transcript is in conversation history. A formal matchScore audit document was not produced because the findings shape Phase 2's research rather than constituting a deliverable in their own right.
- The v2 priorities ranking inserts Gap 4 closure as Rank 1 with a 4-6 hour estimate. The estimate is from the regulatory framework inventory's gap list (`014bea2`); actual implementation may surface dependencies (UI surfaces, audit-log integration, migration ordering) that extend the estimate. The split structure (EEJ-side audit, future APATRIS-side response) still applies for the v2 revision.

### Self-affirming-audit risk

This document was written by EEJ Claude Code from EEJ's vantage point. The recommendations favor EEJ's ability to keep working while APATRIS matures. An APATRIS-side audit may reasonably contest:
- "EEJ retains its legal-* services with disclaimers" — APATRIS may argue this perpetuates the false-hope/false-certainty problem the master plan exists to prevent.
- "EEJ keeps the mobile UI surface" — APATRIS may argue this fragments the lawyer-as-gate enforcement; if EEJ's mobile tabs surface AI-generated legal content without lawyer approval, APATRIS's structural gate has a hole.
- "EEJ retains regulatory_updates ingest" — APATRIS may argue Stream C (continuous Polish-law refresh) should be APATRIS-owned to maintain the Layer 0 spine integrity.

These are real critiques. The audit is genuinely partial without the APATRIS-side response.

---

## End of EEJ-side audit

**Next step:** APATRIS Claude Code (next session) reads this document and produces a response document at `Apatris-Compliance-Hub/artifacts/api-server/docs/EEJ-APATRIS-CONSOLIDATION-AUDIT-APATRIS-RESPONSE.md` (or in the EEJ repo as a sibling, depending on where the user prefers to keep the merged record). The response should validate or contest each Section 4 zone, each Section 7 hybrid, each Section 11 question. The merged final consolidation plan emerges from the conversation between the two documents.

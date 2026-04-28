# EU AI Act Annex III §4(a) Recruitment Research — Scope

**Date:** 2026-04-28
**Author:** EEJ Claude Code
**Phase:** 1 of 3 (Phase 1 = scope, Phase 2 = research, Phase 3 = document write)
**Companion documents:**
- `docs/EEJ-APATRIS-CONSOLIDATION-AUDIT.md` (commit `2b67a5c`) — identified this work as EEJ Rank 1 priority
- APATRIS `EU_AI_ACT_ARTICLE_6_RESEARCH.md` (Apatris repo commit `bf4d92b`) — structural template for the eventual EEJ research document
- APATRIS `MASTER_PLAN.md` (Apatris repo commit `f1c0152`) — provides the discipline pattern (counsel review as pre-build gate)

This is a SCOPING document. It identifies what the eventual research must cover. It does NOT perform the research, does NOT produce the classification verdict, does NOT answer the counsel questions.

---

## 1. Frame

This scope document precedes the EEJ EU AI Act Annex III §4(a) recruitment research that will land at `docs/EU_AI_ACT_ANNEX_III_4A_RECRUITMENT_RESEARCH.md` in Phase 3.

EEJ's `routes/jobs.ts` matchScore — the algorithm computing 0-100 recruitment scores for foreign-worker applicants on Polish job postings — likely falls within EU AI Act Annex III §4(a) high-risk category covering "AI systems intended to be used for the recruitment or selection of natural persons." Unlike APATRIS's Annex III §7 immigration-domain analysis (which produced a likely-not-high-risk verdict via the "by or on behalf of competent public authorities" qualifier in commit `bf4d92b`), §4(a) has **no analogous escape qualifier**. APATRIS's verdict does not carry over.

EEJ requires its own research, its own verdict, its own counsel handoff packet.

This scope document maps the work: what carries over structurally from APATRIS's research, what is recruitment-specific, what evidence Phase 2 must collect, what counsel questions Phase 3 will surface.

---

## 2. Annex III §4(a) verbatim text and EEJ applicability

### Verbatim text (Regulation (EU) 2024/1689 Annex III §4)

> **Employment, workers management and access to self-employment:**
>
> (a) AI systems intended to be used for the recruitment or selection of natural persons, in particular to place targeted job advertisements, to analyse and filter job applications, and to evaluate candidates.

### Critical contrast with §7 (the category APATRIS analyzed)

§7 (migration, asylum, border control) requires the AI system be "intended to be used **by or on behalf of competent public authorities** or by Union institutions, bodies, offices or agencies." That qualifier is the structural reason APATRIS's research at commit `bf4d92b` produced its likely-not-high-risk verdict — APATRIS is private applicant-side legal services, not authority-side decision support.

**§4(a) has no such qualifier.** Recruitment AI is high-risk regardless of whether the operator is a public authority or a private staffing agency. EEJ is a private staffing agency that operates recruitment AI on behalf of itself and its clients. The qualifier path APATRIS used to step out from under high-risk classification is not available to EEJ.

### EEJ applicability — initial pattern match

EEJ's matchScore aligns with §4(a) along all three sub-activities mentioned:

| §4(a) sub-activity | EEJ matchScore alignment |
|---|---|
| "place targeted job advertisements" | Not currently in scope (EEJ does not target advertisements). Phase 2 must verify across the full ATS surface. |
| "analyse and filter job applications" | matchScore at `routes/jobs.ts:125-159` analyzes worker data against job requirements. The current implementation does not auto-filter (no rejection threshold), but the `GET /jobs/:id/matches` endpoint at `routes/jobs.ts:244-280` returns top 20 sorted DESC by score — this is filtering by ranking. |
| "evaluate candidates" | Direct match. matchScore explicitly evaluates candidates and assigns a 0-100 score stored on `job_applications.matchScore`. |

The minimum-viable §4(a) reading is "EEJ's matchScore evaluates candidates." Counsel review will refine whether ranking-without-rejection-threshold qualifies as "filter" and whether the absence of targeted-advertisement features keeps that sub-activity out of scope.

---

## 3. EEJ recruitment scoring evidence

Read first-hand from `routes/jobs.ts` at HEAD `2b67a5c`.

### Scoring algorithm (`routes/jobs.ts:125-159` and `:244-280`)

Two scoring sites:

**Site 1: `POST /jobs/:id/apply` (lines 125-159)** — when a worker applies, the system computes matchScore and stores it on the application:
- **Job role match:** +30 if `worker.jobRole` substring is in `job.requirements`
- **Experience:** +20 if `parseInt(worker.experience) >= 3` years
- **Qualification:** +15 if `worker.qualification` is truthy (any qualification)
- **Location match:** +15 if `worker.assignedSite` contains `job.location`
- **Document compliance:** +20 if `trcExpiry` AND `workPermitExpiry` are future-dated (valid)
- **Cap:** `Math.min(matchScore, 100)`
- **Persistence:** stored as `match_score` (NUMERIC) on `job_applications`, with `match_reasons` (TEXT[]) audit-trail of the +N hits

**Site 2: `GET /jobs/:id/matches` (lines 244-280)** — admin-side query that finds best candidates for a job:
- Same scoring rules as Site 1
- Tenant-scoped via `requireTenant(req)` (Stage 4 enforcement)
- Filters to `score > 0`, sorts DESC, returns top 20
- Returns worker subset (id, name, email, jobRole, nationality, experience, qualification) plus score and reasons

### Decision-making properties

| Property | State | Evidence |
|---|---|---|
| Algorithm type | **Rule-based**, not ML-trained | `routes/jobs.ts:125-159` is hand-coded conditional logic; no model weights |
| Auto-rejection | **No** — no minimum-score threshold filters candidates out | scoring path always inserts the application (line 161) regardless of score |
| Auto-acceptance | **No** — score does not auto-place workers | `stage: "New"` on insert (line 164); placement requires admin Kanban move |
| Ranking influence | **Yes** — `/jobs/:id/matches` returns top 20 by score | Lines 273-274 |
| Candidate-facing transparency | **No** — matchScore is not shown to applicants | No mobile tab or public endpoint surfaces matchScore back to the worker |
| Human review between score and outcome | **Yes, but not structural** — admin recruiters see ranked list, manually move applications through 8-stage Kanban | `routes/jobs.ts:213-240` PATCH /applications/:id/stage requires authenticated admin |
| Use of protected characteristics | **Indirect** — nationality returned in admin response payload (line 273) but not used in scoring; document expiry proxies for legal residency status (TRC = third-country-national permit) | matchScore inputs: jobRole, experience, qualification, assignedSite, trcExpiry, workPermitExpiry. Nationality not in scoring formula. |
| Profile data retention | **Yes — indefinite** as part of worker record | `workers` table has no documented retention bound for the fields scored |
| Reuse | **Yes** — same worker applying to multiple jobs reuses the same profile data | matchScore re-computes per application, drawing from the same worker row |

### Surfaces beyond matchScore that may also fall within §4(a)

Phase 2 must audit:
- **AI smart-matching endpoint** (`/jobs/:id/matches`) — the admin-facing equivalent of matchScore; same algorithm exposed differently
- **AI Smart Upload / CV scanning** (`AddCandidateModal.tsx`, `BulkUpload.tsx`, related document-OCR services) — if these classify candidate suitability, they fall under §4(a)
- **ATS Kanban auto-staging** — if the system auto-advances candidates between stages, that's automated decision-making affecting employment outcomes
- **Worker matching AI** referenced in CLAUDE.md Phase 1 #7 (`Match workers to client requests by skill, location, documents`) — this may be a separate codepath or the same matchScore reused
- **Mobile `JobBoardTab` ranking** — if jobs are sorted/filtered for the worker's view based on AI scoring, that's another §4(a) surface

The scope of §4(a) coverage is the FULL recruitment AI surface, not just one function.

---

## 4. Structural transfers from APATRIS bf4d92b

APATRIS's `EU_AI_ACT_ARTICLE_6_RESEARCH.md` has 14 H2 sections, 416 lines. The following sections transfer **structurally** to EEJ recruitment research, with EEJ-specific content replacing APATRIS-specific content:

| APATRIS section | Transfer mode | EEJ-specific content |
|---|---|---|
| **Frame** | direct transfer | EEJ recruitment + Annex III §4(a) framing instead of APATRIS legal-immigration + §7 |
| **Companion Documents** | direct transfer | EEJ docs (architecture-boundaries, consolidation audit, this scope), not Apatris docs |
| **Status Summary** | direct transfer | EEJ classification verdict (Phase 2 output), Polish AI law status (likely identical), counsel review timing |
| **Executive Summary** | direct transfer | §4(a) classification verdict + reasoning, conformity path obligations under either classification, what counsel must answer |
| **Article 6 Classification** with subsections (framework / Annex III categorical scan / verdict) | direct transfer | Section reframed to walk Annex III §4(a) primarily, with brief notes on why §7 doesn't apply to EEJ |
| **Conformity Assessment Requirements** with subsections (high-risk path / not-high-risk path / timeline) | direct transfer | Articles 8-15 burden if §4(a) confirmed; Article 6(3) exclusion analysis if asserted |
| **Architectural Elements (Articles 9-15)** | direct transfer | EEJ-specific gap analysis: what's already in place (Stage 4 audit log, encryption, role-based access), what would need to be added (risk management documentation, transparency surface, candidate-facing AI disclosure) |
| **Polish-Specific Considerations** | direct transfer | KRiBSI primary supervisor (same as APATRIS), UODO advisory role (same), but with Kodeks Pracy / Labour Code overlay (§4(a)-specific) |
| **Limits of Research** with subsections (scope / depth / counsel questions) | direct transfer | EEJ-specific scope acknowledgments, depth gradations, counsel question list |
| **Sources Consulted** | direct transfer | Same EU AI Act + Polish AI law sources, plus §4(a)-specific case law / guidance |

### Sections that need partial transfer (some content carries, some doesn't)

| APATRIS section | Transfer mode | Notes |
|---|---|---|
| **v1 Surface Gap Analysis** | partial | APATRIS analyzes Layer 0 v1 design surfaces against AI Act Articles 9-15. EEJ would analyze its current production v99 surface (matchScore, ATS pipeline, admin dashboard, candidate intake) against the same Articles. Different inventory; same structural exercise. |
| **Deployment Documentation** | partial | APATRIS is pre-build; documentation required at Layer 0 v1 ship. EEJ is already deployed; documentation required NOW (retroactive Article 6(4) record if asserting non-high-risk under 6(3)). |
| **Ongoing Monitoring** | partial | APATRIS plans monitoring infrastructure. EEJ already has monitoring (Sentry, Fly logs, audit_entries). The gap analysis is whether existing monitoring satisfies §4(a) Article 12 record-keeping and Article 17 post-market monitoring obligations. |
| **Architectural Impacts** | partial | APATRIS's response is Layer 0 v1 architectural design. EEJ's response is different: the system already exists, so impact analysis is "what minimum changes bring v99 into compliance." |

---

## 5. EEJ-specific sections needed (not in APATRIS bf4d92b)

The following sections are **recruitment-specific** and have no APATRIS counterpart:

### 5.1 Protected characteristics analysis under §4(a)

Recruitment AI's special risk under EU AI Act Annex III §4(a) is discrimination on protected characteristics: age, gender, nationality, ethnic origin, religion, disability, sexual orientation. EEJ's matchScore does not directly score on these, but Phase 2 must analyze:
- Whether scoring inputs **proxy** for protected characteristics (e.g., experience requirements may indirect-discriminate on age; document-validity requirements may indirect-discriminate on nationality given third-country-national document regimes)
- Whether nationality appears in scoring decisions even if not in the formula (e.g., admin recruiters see nationality alongside score and may use it in selection)
- Whether the candidate population shows disparate impact across demographic groups (requires data analysis)

This section has no APATRIS counterpart because legal-immigration applicants are by definition foreign — nationality is the user category, not a protected characteristic to mask.

### 5.2 Article 50 candidate-facing transparency

Article 50 of the AI Act mandates AI-disclosure to natural persons interacting with AI systems. For recruitment, this raises the question: must EEJ disclose to candidates that their applications are AI-scored?

Currently EEJ does NOT show matchScore to candidates. Phase 2 must analyze:
- Whether Article 50 applies to AI scoring not directly visible to the candidate (it influences the recruiter's selection but the candidate never sees it)
- Whether Polish UODO RODO Article 13/14 information-obligation overlays AI Act Article 50 with stricter requirements
- What disclosure language is required if disclosure is mandated

This section has no APATRIS counterpart because lawyer-supervised legal services already disclose AI involvement as part of professional practice norms.

### 5.3 Polish Kodeks Pracy (Labour Code) overlay

Polish employment law layered on top of EU AI Act:
- **Article 11¹ Kodeks Pracy** — non-discrimination in employment relations (broader than AI Act Article 10)
- **Article 18³ᵃ Kodeks Pracy** — equal treatment obligations
- **Polish Labour Inspector (PIP)** — has supervisory authority for employment matters that may overlap with KRiBSI on §4(a) recruitment AI

Phase 2 must research whether these layer additional obligations on AI-assisted recruitment beyond AI Act + RODO baseline.

### 5.4 Training-data documentation for rule-based vs learned models

EEJ's matchScore is rule-based (hand-coded conditional logic), not ML-trained. AI Act Annex IV technical documentation typically presumes a learned model:
- Training data provenance
- Validation and testing data
- Bias mitigation measures
- Model card

Rule-based systems may have different documentation obligations. Phase 2 must clarify what Annex IV documentation a rule-based recruitment scoring system must produce.

### 5.5 §4(a) supervisory authority jurisdiction

For APATRIS, KRiBSI is the primary supervisor with UODO advisory + supplementary supervisory in justice/border/police domains. For EEJ recruitment AI:
- KRiBSI is general AI supervisor (presumably also primary)
- PIP (Polish Labour Inspector) has employment-law supervisory authority
- UODO has RODO supervisory authority over candidate personal data

Phase 2 must clarify which authority has primary jurisdiction over AI-driven recruitment decisions and whether multiple authorities have concurrent jurisdiction.

---

## 6. APATRIS sections that do NOT transfer

Sections of APATRIS's research at `bf4d92b` that are immigration-specific and have **no recruitment equivalent**:

### 6.1 Annex III §7 categorical scan

APATRIS's research walks all four §7 sub-items (7a polygraph tools, 7b risk assessment, 7c application examination, 7d biometric identification). None of these apply to EEJ recruitment. The EEJ research walks §4(a) sub-items instead.

### 6.2 The "by or on behalf of competent public authorities" qualifier analysis

APATRIS's central reasoning is that this qualifier in §7 excludes private applicant-side services. §4(a) has no analogous qualifier. The detailed parsing of "intended use" and "on behalf of" that anchors APATRIS's verdict has no role in EEJ's analysis. EEJ's verdict will be reached on different grounds — most likely whether Article 6(3) exclusions apply or whether profiling carve-out closes them.

### 6.3 Foreigners Act / KPA representation regime

APATRIS's Polish-specific section discusses radca prawny representation under Kodeks postępowania administracyjnego (Administrative Procedure Code). Recruitment is not an administrative procedure; KPA representation regime does not apply.

### 6.4 Lawyer-as-structural-gate architectural response

APATRIS's architectural response to high-risk classification (or the discipline regardless) is the lawyer-as-structural-gate principle — AI output cannot reach a client or authority without lawyer approval, encoded in the system. EEJ has no lawyer in the loop. EEJ's architectural response under §4(a) has to be different: human-in-the-loop admin recruiter review, candidate-facing transparency, automated decision documentation. The lawyer-gate concept is APATRIS-specific.

### 6.5 Polish-immigration-specific case law and authority practice

APATRIS's research draws on Polish administrative law, voivodeship office practice, MSWiA guidance. EEJ's research draws on Polish labour law and recruitment practice. Different legal corpus.

---

## 7. Evidence collection plan for Phase 2

Phase 2 (research) needs the following evidence:

### 7.1 EEJ codebase reads

- `routes/jobs.ts` — done in Phase 1
- `routes/eej-mobile.ts` candidate intake flows — does the intake auto-classify or auto-score?
- `services/smart-document.ts` and `smart-ingest.ts` — do they classify candidate suitability from CVs/documents?
- `services/eej-copilot.ts` — does the AI copilot make recruitment recommendations?
- Mobile `ATSPipelineTab`, `ApplicationsTab`, `BulkUploadTab`, `JobBoardTab` — do they expose matchScore to candidates? Do they auto-filter for the worker's view?
- `worker_matching` references in CLAUDE.md Phase 1 #7 — locate and read

### 7.2 Schema reads

- `job_applications` table — what fields are stored from scoring; retention policy?
- `workers` table — what protected-characteristic-adjacent fields are stored (nationality, age inferred from birthdate, gender)?
- `audit_entries` — does the audit log capture matchScore-driven decisions?

### 7.3 Production reads (read-only)

- Sample of `job_applications` rows on production: distribution of matchScore values, distribution of stage transitions per score band — to support the disparate-impact analysis (Section 5.1)
- `workers` table demographic distribution (nationality, age, gender if collected)

### 7.4 Regulatory text reads

- EU AI Act Regulation (EU) 2024/1689 — Articles 6, 9-15, 17, 50, Annex III, Annex IV, Annex VI, Annex VII
- Polish AI implementation law draft (Sejm review status as of research date)
- Polish Kodeks Pracy — Articles 11¹, 18³ᵃ, 22¹ (employment data)
- Polish Ustawa o promocji zatrudnienia i instytucjach rynku pracy (Employment Promotion Act)
- RODO (Polish GDPR implementation) — Article 22 automated individual decisions, Article 9 special categories, Articles 13/14 information obligations

### 7.5 Authority and standards-body publications

- KRiBSI guidance (Polish AI supervisor, designated 2026-03-31)
- UODO guidance on automated decision-making in employment contexts
- PIP guidance on AI in recruitment
- Commission AI Act Article 6(5) implementation guidelines (deadline February 2026 — should be available by Phase 2)
- European Data Protection Board guidance on Article 22 RODO

### 7.6 Comparative materials

- APATRIS `bf4d92b` for structural reference (already read)
- Public examples of recruitment-AI Article 6(4) non-high-risk assessments (if any have been published)
- ETSI / CEN-CENELEC harmonized standards under AI Act (when published)

---

## 8. Counsel question candidates

Initial draft of counsel questions specific to EEJ recruitment. Phase 3 will refine and reorder; final version goes into the EEJ counsel handoff packet equivalent of APATRIS's `COUNSEL_HANDOFF_PACKET.md`.

### Question 1 — Classification of matchScore under §4(a)

Does EEJ's matchScore (algorithm at `routes/jobs.ts:125-159`, computing 0-100 score from job role match, experience, qualification, location, document validity) qualify as an AI system "intended to be used for the recruitment or selection of natural persons" within Annex III §4(a) of the EU AI Act?

If yes, which of the three sub-activities applies — "place targeted job advertisements," "analyse and filter job applications," or "evaluate candidates"? Or all three?

### Question 2 — Ranking-without-rejection-threshold qualification as "filter"

EEJ's matchScore does not auto-reject candidates (no minimum-score threshold). However, the `GET /jobs/:id/matches` endpoint returns top 20 sorted by score — effective filtering by ranking position. Is ranking-without-rejection-threshold "filtering" within §4(a)'s "analyse and filter job applications"?

### Question 3 — Article 6(3) exclusions and the profiling carve-out

Article 6(3) lists four conditions under which Annex III systems are not high-risk: narrow procedural task, improve human-completed result, detect deviations, preparatory task. The last paragraph of 6(3) carves out AI systems that perform profiling of natural persons — these are always high-risk regardless.

Does EEJ's matchScore constitute "profiling" under GDPR Article 4(4) ("any form of automated processing of personal data consisting of the use of personal data to evaluate certain personal aspects relating to a natural person")? If yes, the 6(3) exclusion path is closed.

### Question 4 — RODO Article 22 application with human admin review

RODO Article 22 prohibits decisions based "solely on automated processing" with "legal effects" or "similarly significant" effects. EEJ's matchScore is computed automatically and influences a human admin recruiter's selection. The recruiter sees the ranked list and manually advances applications through the Kanban pipeline.

Does the human recruiter's intervention break Article 22 application, or is the recruiter's selection "rubber-stamping" if they routinely select from the top of the score-ranked list?

### Question 5 — Polish Kodeks Pracy overlay

Does Polish Kodeks Pracy (Labour Code) — particularly Articles 11¹ (non-discrimination), 18³ᵃ (equal treatment), and 22¹ (employment data) — impose obligations on AI-assisted recruitment beyond the EU AI Act + RODO baseline?

If yes, which Polish authorities (KRiBSI, UODO, PIP) have primary supervisory jurisdiction over §4(a) recruitment AI? Are there concurrent jurisdictions, and how do they interact?

### Question 6 — Indirect use of nationality and other protected characteristics

EEJ's matchScore formula does not use nationality or other protected characteristics directly. However, the admin response payload returns nationality alongside score (and admin recruiters may use it in selection). Document-validity scoring (TRC + work permit expiry) is conceptually a proxy for third-country-national legal residency status.

Does indirect use of protected characteristics — via display alongside matchScore, or via document-status proxies — create RODO Article 9 (special categories) or AI Act Article 10 (data governance / bias mitigation) obligations?

### Question 7 — Article 50 candidate-facing transparency

Article 50 of the AI Act mandates AI-disclosure to natural persons interacting with AI systems. EEJ does NOT currently show matchScore to candidates. The score influences the recruiter's selection but is not visible to the applicant.

Does Article 50 apply to AI scoring not directly visible to the candidate? If yes, what disclosure is required and where (job posting? application form? candidate dashboard)?

How does Article 50 interact with RODO Article 13/14 information obligations (which the candidate is already entitled to receive about personal data processing)?

### Question 8 — Article 14 human oversight via admin recruiter review

APATRIS's high-risk-path response to Article 14 (human oversight) is its lawyer-as-structural-gate: AI cannot reach a client or authority without lawyer approval. EEJ has no lawyer in the loop. Admin recruiters (T1/T2/T3 roles) see ranked candidate lists and manually select via the Kanban pipeline.

Does admin recruiter review constitute Article 14-compliant human oversight for §4(a) recruitment, or is something more structural required (e.g., explicit recruiter sign-off on each AI-scored decision; ability to override the score; documentation of the override reason)?

### Question 9 — Rule-based scoring and Annex IV technical documentation

EEJ's matchScore is rule-based (hand-coded conditional logic), not ML-trained. AI Act Annex IV technical documentation includes provisions presuming learned models (training data provenance, validation, bias-mitigation measures, model card).

For a rule-based recruitment scoring system, what Annex IV documentation is required? Is the rule-based nature relevant to §4(a) classification, or does the user-facing function (evaluate candidates) determine classification regardless of implementation technique?

### Question 10 — Population scope and tenant isolation

EEJ is multi-tenant (tenant_id at FK level, Stage 4 enforcement). The matchScore algorithm runs identically across tenants, but the candidate population per tenant differs. RODO Article 22 references "data subject" — singular natural person.

Does multi-tenant operation create per-tenant compliance obligations (e.g., each tenant is a separate "controller" requiring its own Article 6(4) record), or does the EEJ provider hold a consolidated obligation? If per-tenant, the consolidation audit's tenant-isolation work has direct AI Act implications beyond the data-protection framing it was originally scoped against.

---

## 9. Architectural response considerations

Phase 2 will analyze; Phase 3 will recommend. Initial enumeration of options:

### Option A — Document non-high-risk under Article 6(3) exclusion

If counsel review supports Article 6(3) "narrow procedural task" or "preparatory task" exclusion (despite the profiling carve-out concern in Question 3), EEJ produces an Article 6(4) non-high-risk-assessment record and proceeds with lighter obligations: Article 50 transparency, RODO compliance, Polish employment-law compliance.

This is APATRIS's posture for §7 (likely-not-high-risk verdict). EEJ's path to this option is steeper because §4(a) lacks the qualifier APATRIS used.

### Option B — Accept high-risk classification and build Articles 8-15 conformity

Implement: risk management system (Article 9), data governance (Article 10), technical documentation (Article 11 / Annex IV), record-keeping (Article 12), transparency to deployers (Article 13), human oversight (Article 14), accuracy/robustness/cybersecurity (Article 15). Plus Annex VI/VII conformity assessment, EU declaration of conformity, CE marking, post-market monitoring.

This is APATRIS's contingent path if counsel reclassifies. EEJ has Stage 4 + Step 1-3 infrastructure that partially supports several Articles (audit log, encryption, role-based access). Phase 2 must inventory the v99 surface against Articles 9-15.

### Option C — Add structural human-in-the-loop review

Modify the recruitment surface so admin recruiters must explicitly sign off on AI-scored decisions before they affect the candidate (e.g., the recruiter cannot move a candidate to "Placed" without acknowledging the matchScore; the admin response payload requires positive confirmation rather than passive ranking).

This is the EEJ-equivalent of APATRIS's lawyer-as-gate, scoped to recruitment. It reduces RODO Article 22 exposure (Question 4) and supports Article 14 compliance (Question 8). Implementation cost: medium; touches `routes/jobs.ts`, `applications` Kanban flow, audit_entries.

### Option D — Add candidate-facing AI disclosure

Modify EEJ's job posting / application surface to disclose to candidates that their applications are AI-scored (Article 50 + RODO 13/14 compliance).

Implementation cost: low for the disclosure itself (mobile UI text, public job board copy). Higher cost if the disclosure must include candidate access to their own matchScore (transparency-on-request via portal token).

### Option E — Sunset matchScore as a feature

The simplest response: if matchScore is vestigial or low-strategic-value, retire it. Replace ranking with manual recruiter judgment across the unranked candidate list. This eliminates §4(a) exposure for the matchScore surface entirely. Downstream surfaces (CV scanning, document classification, smart-matching endpoints) may still trigger §4(a) and require their own analysis.

Manish's product-strategy decision (Section 11 question 1) determines whether Option E is on the table.

---

## 10. Time estimate refinement

The audit's 2-3 day estimate covered Phase 1 + Phase 2 + Phase 3. Refined:

| Phase | Work | Hours |
|---|---|---|
| Phase 1 (today) | Read APATRIS bf4d92b in full, read routes/jobs.ts, draft this scope document | ~2-3 hours (mostly done) |
| Phase 2 (next session) | Evidence collection per Section 7: codebase reads (~3 hours), regulatory text reads (~4 hours), authority publications survey (~2 hours), production data sample (~1 hour) | ~10-12 hours |
| Phase 3 (next session or day after) | Document write: 14-section EEJ research mirroring APATRIS bf4d92b structure (~6 hours), counsel question refinement and validation against Section 7 evidence (~2 hours), reread + commit (~1 hour) | ~9 hours |
| **Total** | Phase 1 + 2 + 3 | **~22-25 hours of focused work** |

This is at the upper end of the audit's 2-3 day estimate (16-24 hours). The §4(a) recruitment surface is more complex than initially scoped (multiple AI surfaces beyond matchScore, Polish Kodeks Pracy overlay, multi-tenant compliance dimension).

If Manish's product-strategy decision (Section 11 question 1) sunsets matchScore, Phase 2 + Phase 3 scope contracts substantially — possibly to ~6-10 hours total — because the analysis is bounded to remaining surfaces (CV scanning, smart-matching endpoint, ATS automation).

---

## 11. Open questions for Manish before Phase 2

These cannot be answered by Claude Code; they need internal-EEJ decisions.

### Q1 — Is matchScore strategic or vestigial?

What is matchScore actually used for in EEJ's daily operations? Is it:
- A core feature that recruiters rely on for candidate selection (preserve and analyze)
- An advisory aid that recruiters glance at but don't depend on (simpler analysis path; perhaps disclose-only response)
- Vestigial code from an earlier product vision (sunset path; eliminate §4(a) exposure for this surface)

The product-strategy answer determines Phase 2 scope and Section 9 Option E availability.

### Q2 — Risk tolerance for §4(a) classification

If counsel review produces an ambiguous verdict (e.g., "could go either way"), what is EEJ's risk tolerance:
- Document Article 6(3) exclusion record and accept residual risk if interpretation tightens (cheaper, more exposed)
- Build Articles 8-15 conformity proactively under presumption of high-risk (more expensive, more durable)
- Sunset the surface and avoid the question (cheapest, removes feature)

This is a leadership-level call that shapes Phase 3's recommendation set.

### Q3 — Counsel engagement strategy

Will EEJ engage:
- The same counsel as APATRIS (lower coordination cost; counsel already steeped in the platform context; same primary contact Manish Shetty per APATRIS `COUNSEL_PACKET_CONTACTS.md`)
- Different counsel with deeper expertise on §4(a) recruitment / employment law (more focused expertise; higher coordination cost)
- A combined engagement where one counsel handles both APATRIS §7 and EEJ §4(a) (compromise; possible per the same primary-contact arrangement)

Counsel selection affects Phase 3 packet structure and timeline.

### Q4 — Other AI surfaces in EEJ that may also fall under §4(a)

Beyond matchScore, EEJ has several AI-adjacent recruitment surfaces (Section 3.1 list). Should Phase 2 + 3 cover the full surface in one document, or scope to matchScore alone with separate research per surface?

Recommendation: cover the full surface in one document — multiple §4(a) surfaces with one classification verdict would be more efficient than multiple documents. But this is a scope question for Manish.

### Q5 — Timeline urgency

How urgent is the EEJ research relative to other EEJ priorities (persistent test branch, migrate.ts ordering bug, document handling audit)? The consolidation audit ranked it #1, but if APATRIS Layer 0 v1 build is months away, the EEJ research can be sequenced flexibly. Or if Manish wants both APATRIS counsel review and EEJ counsel review to land in parallel (so one counsel engagement covers both platforms), that imposes a different schedule.

---

## End of Phase 1 scope

Phase 2 (research) and Phase 3 (document write) await:
1. Manish's answers to Section 11 questions Q1-Q5
2. Confirmation of cross-repo authorization for Phase 2 (or scope contraction if sunset)
3. Decision on whether to draft the EEJ counsel handoff packet alongside Phase 3 or as a separate Phase 4

Until these answers exist, Phase 2 cannot start cleanly.

# EU AI Act Annex III §4(a) — EEJ Counsel Handoff

## Section 1 — Cover page and document control

**Title:** EU AI Act Annex III §4(a) — EEJ Counsel Handoff

**Date prepared:** 2026-04-29

**Prepared by:** EEJ Sp. z o.o.
- Founder and Partner: Manish Shetty (manish@apatris.pl, +48 576 341 732)
- Backup contact: Akshay Gandhi, Partner and Board Member (akshay@apatris.pl)
- Mailing address: ul. Chłodna 51, Warsaw, Poland

**For:** [Counsel name to be filled at engagement]

**Document version:** v1.0

**Companion documents available on request:**

- Phase 1 scope — `docs/EU_AI_ACT_ANNEX_III_4A_RECRUITMENT_RESEARCH_SCOPE.md` (commit `305eb08`)
- Phase 2 research — `docs/EU_AI_ACT_ANNEX_III_4A_PHASE_2_RESEARCH.md` (commit `ce0364c`)
- EEJ-APATRIS consolidation audit (v2) — `docs/EEJ-APATRIS-CONSOLIDATION-AUDIT.md` (commit `9be0faa`)
- Regulatory framework inventory — `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` (commit `014bea2`)
- Step 3 follow-ups + Gap 4 closure note — `artifacts/api-server/STEP3-FOLLOWUPS.md` (last updated `b5cb28e`)

**Production state at delivery:** `eej-jobs-api` v100 in `ams` region, deployed 2026-04-28. The `placement_type` classifier (described in Section 5) is live in production. All 100 existing workers in the production database default to `placement_type='agency_leased'` per the migration applied at v100.

**Repository:** `Maac1980/EURO-EDU-JOBS-app` at HEAD `ce0364c` as of document preparation.

**Document scope:** EU AI Act Annex III §4(a) recruitment AI classification for EEJ only. Section 9 enumerates what is out of scope.

---

## Section 2 — Executive summary

### The classification question

Is EEJ's recruitment AI a high-risk AI system under EU AI Act (Regulation (EU) 2024/1689) Annex III §4(a)?

EEJ's recruitment AI sits literally within Annex III §4(a) because it analyses and filters job applications and presents information to assist recruitment decisions. The operative question, however, is not whether the system falls within Annex III — it does — but whether Article 6(3) exempts it from high-risk classification. EEJ's position, presented in this document for counsel validation, is that the redesigned system qualifies for the Article 6(3)(a) and (d) exemption based on its architectural design as an eligibility-filtering and factual-presentation tool that does not evaluate, score, or rank candidates.

### EEJ's classification posture

EEJ argues not-high-risk under Article 6(3)(a) (narrow procedural task) and (d) (preparatory task to a human assessment), provided the architectural intervention described in Section 5 is implemented as committed. The classification rests on three structural elements: first, eligibility filtering that consists of binary lawful checks against externally-defined Polish regulatory criteria (work-permit validity, TRC validity, BHP, medical, certifications, placement-type compatibility, assignment-duration eligibility); second, factual presentation of operationally relevant worker data without composite scoring, ranking, or color-coded signals; third, recruiter-led decision-making in which the human selects from eligible candidates based on facts and operational judgment, and the system makes no recommendation.

The profiling caveat in Article 6(3) — which returns an Annex III system to high-risk status if it "performs profiling of natural persons" — is the load-bearing interpretive question. The redesigned system is designed not to evaluate personal aspects within the meaning of GDPR Article 4(4). The argument is defensible but the boundary is interpretive, and EEJ's first counsel question (Q1, Section 8) seeks counsel's authoritative reading.

### The architectural intervention

The redesigned matching system replaces the legacy numeric scoring (matchScore at lines 125-159 and 244-280 of `routes/jobs.ts`, currently partially used in production) with a three-layer architecture: eligibility filtering on lawful criteria, factual presentation without scoring or ranking, and recruiter-led decision-making. The intervention removes the numeric matchScore output, the color-coded ranking signals in mobile UI, and the public-application path that currently writes a default zero score.

The intervention's components are inventoried in Section 5 with effort estimates. The aggregate engineering work is approximately 60 to 95 hours.

### The architectural commitment

EEJ commits, subject to counsel validation, to implementing the architectural intervention on the timeline described in Section 7. The not-high-risk classification depends on this commitment being executed. Counsel should understand the classification posture as a documented architectural commitment, not as a fait accompli. As of document preparation, only Gap 4 (the `placement_type` classifier described in Section 3) is live in production; the matchScore sunset and the other gap closures are pending counsel validation before implementation begins.

### The bundling thesis

Polish-law gap closure and EU AI Act compliance are an integrated architectural commitment, not parallel compliance tracks. Closing Gap 1 (Article 8 ust. 1 prohibition list under the Temporary Employment Act) satisfies Polish staffing-agency law and simultaneously strengthens the §4(a) eligibility-filtering argument. Closing Gap 3 (equal-pay parity under Art. 15 Temp Work Act and Art. 18³ᶜ Kodeks Pracy) satisfies Polish law and improves the AI Act Article 10 (data governance) posture. Closing Gap 5 (jobRole taxonomy) is the precondition for Gap 2 (position-specific permit binding under Foreigners Act Art. 88) and strengthens both frameworks. EEJ requests counsel guidance on whether the integrated commitment is sufficient or whether parallel-track work is required.

### The counsel questions

Section 8 contains thirteen specific questions for counsel input. Question 1 — the Article 6(3) classification of the redesigned system — is the central question on which the entire posture rests; all other questions presuppose its resolution. Question 8 (auth-gating gap at `GET /api/jobs/:id`) and Question 11 (documentation requirements under Article 6(3) audit) are the two highest-priority items beyond Q1. The remaining questions address Polish staffing-agency interactions, gap implementations, RODO interactions, the provider-versus-deployer determination, counsel engagement scoping, and the Polish AI implementation law's expected provisions.

### Production state

The `placement_type` classifier — which scopes Polish Temporary Employment Act enforcement (Articles 8, 14a, 15, 20) to agency-leased workers and exempts direct-outsourcing workers — is live in production at v100 as of 2026-04-28. All 100 existing production workers default to `'agency_leased'`. The other gap closures and the matchScore sunset are pending counsel validation; the legacy matchScore continues to operate in production with display-only effects (no auto-rejection, no candidate-facing exposure, no audit trail of decisions made on its basis) per the audit findings summarised in Section 4.

### Document scope

This document addresses EU AI Act Annex III §4(a) recruitment AI only. Out of scope: Annex III §4(b) post-hire workforce management; other EEJ AI surfaces (the AI copilot, regulatory intelligence, immigration search); the APATRIS-side §7 immigration AI analysis (handled in a separate counsel engagement scoped at the cross-platform level — see Q12). Section 9 enumerates the limitations and out-of-scope items in detail.

---

## Section 3 — Background and context

### EEJ's business model

EEJ Sp. z o.o. ("EEJ") operates as `agencja pracy tymczasowej` — a temporary work agency under Polish staffing-agency law. The governing statute is `Ustawa z dnia 9 lipca 2003 r. o zatrudnianiu pracowników tymczasowych` (the Temporary Employment Act). EEJ employs the worker under Polish labour law (typically `umowa zlecenie` for the welder workforce that constitutes EEJ's primary placement category), and leases the worker to a user-employer (`pracodawca użytkownik`) for placement at the user-employer's site. The relationship is structurally tripartite: EEJ as agency, user-employer as work-direction recipient, worker as `pracownik tymczasowy`.

EEJ currently has approximately seventy active welders placed across user-employers including Tekra, Izotechnik, and Gaztech. The workforce is predominantly third-country nationals (Ukrainian, Belarusian, Vietnamese, Filipino) holding work permits or oświadczenie under the Foreigners Act and the Promocji Zatrudnienia / Ustawa o rynku pracy framework.

### The legal-vehicle distinction

EEJ's `agencja pracy` model is distinct from the outsourcing model operated by APATRIS, an affiliated platform. Under outsourcing, the worker is directly employed by the platform and provided to the end-client through a B2B services contract; the Temporary Employment Act's tripartite framework does not apply. EEJ's recruitment AI matching surface operates exclusively in the agency-leasing context.

To encode this distinction in software, EEJ implemented the `placement_type` classifier — a database column on the `workers` table with an enumerated value of either `'agency_leased'` or `'direct_outsourcing'`. This classifier scopes the application of Polish Temporary Employment Act provisions (specifically the Article 20 18-month assignment cap and the Article 14a 36-month assignment retention rule) to agency-leased workers only. The classifier is described further in Section 5 and is one of the questions submitted to counsel (Q4).

### The regulatory landscape

The EU AI Act (Regulation (EU) 2024/1689) entered into force on 2024-08-01 with phased applicability. The provisions on prohibited AI systems (Article 5) apply from 2025-02-02; the high-risk system obligations (Articles 8-15, 16-29, 43+) apply from 2026-08-02 for most Annex III categories. The Polish AI implementation law was accepted by the Council of Ministers on 2026-03-31 and is in Sejm review as of document preparation; it is not yet enacted. The expected supervisory authorities are KRiBSI (`Krajowa Rada ds. Bezpieczeństwa Sztucznej Inteligencji`) for primary AI Act enforcement and UODO (`Urząd Ochrony Danych Osobowych`) for the RODO-track and certain supplemental supervisory roles. The precise jurisdictional scope is the subject of Q13.

### The recruitment AI in scope

The system at the centre of this analysis is the matchScore implemented in `artifacts/api-server/src/routes/jobs.ts` lines 125-159 (the `POST /jobs/:id/apply` candidate-application path) and lines 244-280 (the `GET /jobs/:id/matches` admin-pull endpoint that returns ranked candidates for a job). The matchScore is rule-based, hand-coded conditional logic — not a machine-learned model. It computes a numeric score from 0 to 100 from worker data (job role, experience, qualification, location, document validity) against job posting requirements.

The matching results surface to recruiters via two mobile UI tabs in the EEJ-internal mobile app: `ApplicationsTab` and `ATSPipelineTab`. Both currently display the matchScore as a colour-coded badge. The badges are not visible to candidates; the candidate-facing surfaces (the public application form, candidate emails, candidate WhatsApp messages) do not show the matchScore.

A usage audit conducted on 2026-04-28 (documented in the EEJ-APATRIS audit v2 at commit `9be0faa`) classified the matchScore as `PARTIALLY USED`: defined and called in production, surfaced to recruiters in two UI tabs, but display-only in operational effect. The matchScore does not auto-reject candidates, does not auto-advance them through the ATS pipeline, is not surfaced to candidates, is not used in notifications, and is not captured in the audit trail of placement decisions. The recruiter's pipeline-stage transitions (`pipeline_stage` field on the `job_applications` table) drive operational outcomes; the matchScore is a secondary visual hint on the card.

### The intent of this document

This document is the counsel handoff for foundational classification of EEJ's recruitment AI under EU AI Act Annex III §4(a) and Article 6(3). It presents EEJ's classification posture (not-high-risk under 6(3)(a)+(d) via the architectural intervention), the architectural commitment (the work EEJ commits to in code, subject to counsel validation), the Polish regulatory overlay (how EU AI Act compliance integrates with Polish staffing-agency, anti-discrimination, immigration, and data-protection law), and thirteen counsel questions on which EEJ requests authoritative input. Section 9 enumerates what the document does not address.

---

## Section 4 — Classification posture

### The Article 6 framework

EU AI Act Article 6 governs which AI systems are classified as high-risk. The framework operates in three structural layers. Article 6(1) addresses AI systems that are products covered by Annex II Union harmonization legislation; this layer does not apply to EEJ's recruitment AI, which is not a product covered by machinery, medical-device, radio-equipment, or other harmonization legislation. Article 6(2) makes systems within Annex III high-risk by default, subject to the Article 6(3) exemption. Article 6(3) provides that an Annex III system is not high-risk if it does not pose a significant risk of harm to health, safety, or fundamental rights and does not materially influence decision-making, provided that one of four exemption conditions is fulfilled. The Article 6(3) test is then qualified by a profiling caveat: notwithstanding the conditions, an Annex III system is always high-risk if it performs profiling of natural persons.

Annex III §4(a) is the relevant Annex III category for EEJ. The category is "AI systems intended to be used for the recruitment or selection of natural persons, in particular to place targeted job advertisements, to analyse and filter job applications, and to evaluate candidates." EEJ's recruitment AI literally falls within this category because it analyses and filters job applications and presents information to assist recruitment decisions. The classification analysis therefore turns entirely on whether Article 6(3) applies.

### The four exemption conditions

Article 6(3) lists four conditions, at least one of which must be fulfilled for the exemption to apply. Condition (a) — narrow procedural task — applies when the AI system performs a specific, well-defined task with limited scope. Condition (b) — improving the result of a previously completed human activity — does not match EEJ's recruitment workflow, in which the AI does not improve a prior human result. Condition (c) — detecting decision-making patterns or deviations from prior decisions — does not match either, since EEJ's system performs no pattern detection on prior decisions. Condition (d) — preparatory task to an assessment — applies when the AI system prepares information for human assessment without itself performing the assessment.

EEJ's argument relies on conditions (a) and (d). The redesigned matching system, described in Section 5, is structured as three layers: an eligibility-filtering layer of binary lawful checks (mapping to condition (a)), a factual-presentation layer that displays operationally relevant worker data without scoring or ranking (mapping to condition (d)), and a recruiter-led decision layer in which the human selects from eligible candidates and the system makes no recommendation (the human assessment that conditions (a) and (d) presuppose).

Each eligibility gate corresponds to a specific Polish legal provision and produces a binary eligible-or-not-eligible outcome. The work-permit validity gate maps to Art. 88 Ustawa o promocji zatrudnienia / Ustawa o rynku pracy 2025; the TRC validity gate maps to Art. 114 Ustawa o cudzoziemcach; the BHP-training gate maps to Art. 237³ Kodeks Pracy; the medical-exam gate maps to Art. 229 Kodeks Pracy; the placement-type compatibility gate (Gap 1, pending) will map to Art. 8 Ustawa o zatrudnianiu pracowników tymczasowych; the assignment-duration eligibility gate (live as part of the Gap 4 closure at v100) maps to Art. 20 of the same statute. The aggregation of multiple narrow procedural tasks does not transform them into an evaluative composite: each gate is independently a binary verification against an external authoritative criterion, and the combined output is binary at the candidate level (eligible or not eligible) rather than graded.

The factual-presentation layer does not synthesize, weight, or rank. It displays years of experience, certifications held, prior placement history, current site, language proficiency, document expiry dates, and worker availability dates — all factual data taken from the worker record without derivative computation. The default ordering can be alphabetical, chronological by application date, or geographic; it is not a system-derived "fit score." The recruiter applies their own filters and selects.

### The profiling caveat — the central interpretive question

The most consequential single sentence in the analysis is the closing clause of Article 6(3): "an AI system referred to in Annex III shall always be considered to be high-risk where the AI system performs profiling of natural persons." The AI Act does not itself define profiling; the operative definition is GDPR Article 4(4): "any form of automated processing of personal data consisting of the use of personal data to evaluate certain personal aspects relating to a natural person, in particular to analyse or predict aspects concerning that natural person's performance at work, economic situation, health, personal preferences, interests, reliability, behaviour, location or movements."

EEJ's position is that the redesigned system processes personal data but does not "evaluate certain personal aspects" within the meaning of Article 4(4). The eligibility filter checks legal facts about the person (does the work permit cover this position?) — a verification of an external legal fact, not an evaluative judgment about a personal aspect. The factual presentation displays objective data points without weighting, ranking, or inference; it does not analyse or predict aspects of the person's performance, suitability, reliability, or other Article 4(4)-enumerated characteristics. The eligibility check involves data that touches a personal aspect (residency status, in the case of a TRC validity check), but the use is verification rather than evaluation.

A defensible counter-reading exists. A determined regulator could argue that any check involving residency, employment history, or qualification data is an evaluation of personal aspects under a wide reading of Article 4(4). Under that reading, the profiling caveat returns the system to high-risk regardless of the architectural intervention. EEJ's argument relies on the narrow reading — that "evaluate certain personal aspects" means producing a synthesized judgment about the person, not verifying an external legal fact about the person — and that reading aligns with the established CJEU jurisprudence on GDPR Article 22, in which simple eligibility verifications have not been treated as profiling for automated-decision-making purposes. The line is interpretive, however, and EEJ's first counsel question (Q1) seeks counsel's authoritative reading.

### The gateway test

Article 6(3) requires, in addition to one of the four conditions being met, that the system "not pose a significant risk of harm" and "not materially influence the outcome of decision-making." EEJ's redesigned matching does not affect health or safety directly. The fundamental-rights surface — the principal locus of risk for recruitment AI — is potential disparate impact on protected characteristics. The architectural design is structured to minimize this risk: eligibility filtering operates on lawful criteria (the worker either has the work permit or does not; the work permit is required by Polish law for non-EU nationals), factual presentation does not weight or rank, and the recruiter performs the operational judgment. The architecture removes the experience-cliff (the legacy matchScore's `+20 if experience >= 3 years` provision, which functioned as an age proxy) and the compliance-bonus signal (the legacy `+20 if both TRC and work-permit valid`, which structurally rewarded non-EU candidates with valid documents — a nationality-correlated signal) by sunsetting the numeric scoring entirely.

On material influence, the eligibility filter removes legally-ineligible candidates from the recruiter's view, which is an outcome-influencing operation in a literal sense. EEJ's position is that removing legally-ineligible candidates is not an evaluative influence within the meaning of Article 6(3) — it implements the law. A worker without a valid work permit cannot lawfully be placed; the eligibility filter implements the legal prohibition on illegal employment, not a system judgment about the worker. The factual presentation, similarly, does not weight or rank; it presents objective data and the recruiter judges. EEJ requests counsel validation of this reading in Q1.

### Summary of the classification argument

EEJ's redesigned recruitment AI is positioned to fall within Article 6(3) as not-high-risk under conditions (a) and (d), provided that the matchScore numeric output is fully sunset, color-coded ranking signals are removed, the eligibility filtering and factual presentation surfaces are documented as the system's role, the recruiter's decision is documented as the human assessment, and the profiling caveat does not apply because the system does not evaluate personal aspects in the GDPR Article 4(4) sense. The argument hinges on counsel validation of the profiling-caveat boundary and on the architectural intervention being completed in implementation. If the argument fails, the system is high-risk and the conformity work under Articles 8-15 (an additional 100 to 180 hours per Phase 2 Section 5.9) is triggered, including a quality management system, Annex IV technical documentation, internal-control conformity assessment under Article 43 plus Annex VI, EU declaration of conformity, CE marking, and EU database registration.

---

## Section 5 — The architectural intervention

### The redesigned system in three layers

The redesigned matching system replaces the legacy numeric matchScore with a three-layer architecture. The first layer is eligibility filtering: for each candidate-job pairing, the system evaluates a series of binary lawful checks. The work-permit validity check verifies that the worker's permit is current and (when Gap 2 closes) covers the specific position required by the job posting. The TRC validity check verifies the residence card under Art. 114 Ustawa o cudzoziemcach, including the Art. 108 filing-continuity protection where applicable. The oświadczenie validity check applies for eligible nationalities under Art. 88z. The BHP-training and medical-exam checks are implemented under Art. 237³ and Art. 229 Kodeks Pracy respectively. The certification-match check verifies that the worker holds the cert required by the job (for example, EN ISO 9606-1 for a welding job). The placement-type compatibility check (Gap 1, pending) will verify that the agency-leased worker is not being placed on a prohibited work type under Art. 8 ust. 1 Temporary Employment Act. The assignment-duration eligibility check (live in production at v100 as part of the Gap 4 closure) gates the 18-month-out-of-36-month rolling cap from Art. 20 to agency-leased workers only. The Schengen-days-remaining check applies for non-permit foreign workers under the Schengen 90/180-day rule and is currently a risk-flag rather than a hard block.

Each gate is an independent verification. There is no weighting, no aggregation into a score, no derivative computation. The output is a binary eligible-or-not-eligible at the candidate level, accompanied by a structured `matchReasons` array that records which gates passed and which did not (the array is retained from the legacy matchScore implementation and serves as the eligibility checklist). When a candidate fails a gate, the recruiter sees the specific reason and can make an informed determination about whether the gate's underlying condition can be remediated (for example, scheduling a BHP-training renewal) before placement.

The second layer is factual presentation. Among eligible candidates, the system displays operationally relevant facts taken from the worker record: years of experience, specific certifications held (with expiry dates), current `assignedSite`, prior placement history at the user-employer, declared language proficiency, document expiry dates, and worker availability dates. The display is structured but unranked. There is no composite score, no percent-match indicator, no color-coded "fit" badge, and no system-assigned priority order. The default ordering is recruiter-configurable — alphabetical by name, chronological by application date, or geographic by current site — but is not a system-derived evaluation.

The third layer is recruiter decision. The recruiter applies their own filters (location, availability date, specific certifications, prior-placement preference) and selects the candidate to place. The system makes no recommendation. The placement decision is recorded in the existing pipeline state (`pipeline_stage` transition from "Screening" to subsequent stages, `eej_assignments` row insert with `start_date` and `client_name`) and is captured in the audit log. The recruiter's selection is the operational decision that the EU AI Act and Polish law-mandated human-in-the-loop framework presuppose.

### What is live in production today

The `placement_type` classifier — which encodes the agency-leasing-versus-outsourcing legal-vehicle distinction described in Section 3 — is live in production at v100 as of 2026-04-28. The schema migration adds a `placement_type` text column on the `workers` table with a `NOT NULL` constraint, a default value of `'agency_leased'`, and a check constraint that restricts values to the enumerated pair. The API surface accepts the new field on worker creation and update with validation, audits all changes via dedicated `field='PLACEMENT_TYPE'` audit entries, and gates the Art. 20 18-month enforcement and Art. 14a 36-month retention to agency-leased workers via a new `art_20_enforced` boolean column on the runtime `eej_assignments` table. The mobile UI surfaces the placement vehicle as a small badge on the contracts tab. All 100 existing production workers default to `'agency_leased'` per the migration default.

The legacy matchScore continues to operate in production with the partially-used profile described in Section 3. The numeric score is computed at application time and on the admin-pull endpoint, stored on `job_applications.matchScore` (numeric column, precision 5 scale 2), and surfaced via the two mobile UI tabs as colour-coded badges. The score is display-only in operational effect: no candidate is auto-rejected, no candidate is auto-advanced, no candidate-facing surface reveals the score, no notification uses it, and no audit row captures it as a decision factor.

### What is pending counsel validation

The architectural intervention's other components are pending counsel validation before implementation begins. The matchScore numeric output is to be fully sunset: the scoring logic at `routes/jobs.ts:127-165` and `:254-274` is to be replaced with eligibility-only evaluation that emits a `matchReasons` checklist but no composite score. The public-application path at `routes/workers.ts:184` is to stop writing the default `matchScore="0"` value. The mobile UI tabs `ApplicationsTab.tsx:143-152` and `ATSPipelineTab.tsx:135-144` are to replace the colour-coded score badges with neutral display. The `job_applications.matchScore` column is to be retained for historical read access but to stop receiving writes; a future migration may drop it after a transition period.

Five gaps from the regulatory framework inventory are pending closure. Gap 1 is the Article 8 ust. 1 prohibition list (work types that agency-leased workers cannot perform): EEJ has no `prohibited_work_types` taxonomy, no flag on job postings, and no filter at matching time. Gap 2 is position-specific permit binding: EEJ stores permit type and permit expiry but not permit position or permit user-employer, and the matching logic does not verify position-match. Gap 3 is equal-pay parity verification under Art. 15 Temp Work Act and Art. 18³ᶜ Kodeks Pracy. Gap 5 is jobRole taxonomy: the `workers.jobRole` field is free-text without a controlled vocabulary or KZiS-code lookup. Each gap is described in detail in the regulatory framework inventory at commit `014bea2`. The auth-gating gap at `GET /api/jobs/:id` (an unauthenticated endpoint that returns worker PII alongside matchScore data) is a separate but related item, identified during the matchScore audit and rated as the audit's Rank 3 priority for closure.

### The aggregate intervention effort

The Phase 2 research (Section 4.5 of `docs/EU_AI_ACT_ANNEX_III_4A_PHASE_2_RESEARCH.md`) inventories the architectural intervention with effort estimates. The hybrid path implementation in code — sunset of the numeric scoring, UI badge replacement, public-application path cleanup, eligibility-checklist refactor — is approximately 15 to 25 hours of engineering work. Closing Gap 1 is approximately 6 to 10 hours. Closing Gap 2 is approximately 8 to 14 hours. Closing Gap 3 is approximately 10 to 18 hours. Closing Gap 5 is approximately 12 to 20 hours. Closing the auth-gating gap is approximately 2 to 4 hours. Drafting the Article 6(4) non-high-risk-assessment record (the documentation that supports the classification under audit) is approximately 4 to 6 hours of writing. The aggregate intervention is approximately 60 to 95 hours of engineering and documentation work, sequenced after counsel validation.

### EEJ's commitment

EEJ commits, subject to counsel validation under Q1, to executing the architectural intervention on the timeline described in Section 7. The not-high-risk classification is a documented architectural commitment, not a fait accompli. Counsel reading this document should understand that the legacy matchScore continues to operate in production today, that the architectural intervention is the path EEJ proposes to take to defend the not-high-risk classification, and that EEJ will not claim the classification is established until the intervention is implemented and the Article 6(4) record is drafted.

---

## Section 6 — Polish regulatory overlay and integration

### Kodeks Pracy anti-discrimination

The Polish Labour Code anti-discrimination framework is the most operationally consequential overlay on EEJ's recruitment AI. Article 11³ Kodeks Pracy ("Jakakolwiek dyskryminacja w zatrudnieniu, bezpośrednia lub pośrednia, w szczególności ze względu na płeć, wiek, niepełnosprawność, rasę, religię, narodowość, przekonania polityczne, przynależność związkową, pochodzenie etniczne, wyznanie, orientację seksualną...") prohibits direct and indirect discrimination on enumerated protected grounds. Article 18³ᵃ establishes the right to equal treatment in matters of establishment and termination of the employment relationship, conditions of employment, promotion, and access to training. Article 18³ᵇ defines direct discrimination (less favourable treatment for a protected reason in a comparable situation) and indirect discrimination (an apparently neutral provision, criterion, or practice that puts a protected group at a particular disadvantage compared with others, unless objectively justified by a legitimate aim and the means are appropriate and necessary). Article 18³ᶜ establishes the right to equal pay for equal work or work of equal value. Article 18³ᵉ shifts the burden of proof: if a worker presents facts from which discrimination may be presumed, the employer must prove that no discrimination occurred.

The redesigned system is designed to avoid direct discrimination by removing all scoring on prohibited grounds. The legacy matchScore did not score on age, sex, ethnicity, religion, or sexual orientation directly; the redesign goes further by removing the experience-cliff (an age proxy) and the document-validity bonus (a nationality proxy) by sunsetting numeric scoring entirely. The eligibility filter remains, but as a series of binary lawful gates rather than as an aggregated score; the gates that involve protected-characteristic-adjacent data (TRC validity, work-permit validity, medical-exam status) are objectively justified under Art. 18³ᵇ because Polish law requires the agency to verify these before placement.

The objective-justification defence under Art. 18³ᵇ is strong for the eligibility gates because each gate implements a legal requirement: an agency cannot lawfully place a worker without verifying work authorization, BHP training, and medical clearance. The argument is that the gates are appropriate and necessary because the legal requirement they implement is mandatory and binding. EEJ requests counsel validation that this objective-justification reasoning is sufficient (Q5).

The burden of proof under Art. 18³ᵉ is supported by EEJ's audit-log infrastructure (the `audit_entries` table records placement decisions, pipeline-stage transitions, and the new `field='PLACEMENT_TYPE'` audit entries) and by the rule-based, transparent, explainable nature of the redesigned eligibility filter. If a worker alleges discrimination in placement, EEJ can demonstrate the eligibility decision and the recruiter selection from the audit log; the rule-based filter is fully traceable.

### RODO (GDPR) overlay

EEJ's processing of recruitment data is grounded primarily in Article 6(1)(b) RODO (performance of contract — the worker's employment with EEJ), Article 6(1)(c) (legal obligation — Polish labour law, Foreigners Act, RODO retention), and Article 6(1)(f) (legitimate interests — the matching activity). For pre-hire candidate data, the lawful bases shift to Article 6(1)(b) (pre-contractual measures at the data subject's request) and Article 6(1)(a) (consent, for retention beyond a single application).

Article 9 RODO (special categories) is relevant in two specific surfaces. The medical-exam-status check (binary eligibility gate based on whether the worker's `badania lekarskie` is current) involves health data, which is special-category under Article 9(1). The exemption EEJ relies on is Article 9(2)(b) — processing necessary for carrying out obligations and exercising specific rights of the controller in the field of employment law, where authorised by Member State law. Polish law (Art. 229 Kodeks Pracy) requires the employer to verify medical clearance before assigning the worker to a particular position; the eligibility check implements this requirement. EEJ requests counsel validation of the Article 9(2)(b) reading (Q5).

Article 22 RODO governs decisions based solely on automated processing, including profiling, that produce legal effects or similarly significant effects on the data subject. The redesigned system is designed to fall outside Article 22 because the placement decision is made by the recruiter, not "solely" by automated processing. The eligibility filter's exclusion of an ineligible candidate is automated, but EEJ's position is that the exclusion is exempt from Article 22 either under Article 22(2)(b) (decisions authorised by Union or Member State law to which the controller is subject — the eligibility check implements Polish work-authorization law) or under Article 22(2)(a) (decisions necessary for entering into or performance of a contract — the agency's pre-contractual matching activity). A counter-reading argues that the eligibility filter's automated exclusion is itself an automated decision that triggers Article 22 directly. EEJ requests counsel validation in Q10.

The data-minimization principle of Art. 5(1)(c) and the purpose-limitation principle of Art. 5(1)(b) are supported by the redesigned factual-presentation layer, which displays only operationally necessary facts rather than the full worker record. The retention obligations under Art. 5(1)(e) and Art. 17 are addressed by EEJ's encoded retention rule set (the regulatory framework inventory enumerates ten retention categories at `services/agency-compliance-engine.ts:501-512`), with candidate-CV retention at zero years (default delete; consent-based extension).

### Foreigners Act (Ustawa o cudzoziemcach) and the work-authorization framework

Foreigners (third-country nationals) require work authorization to work legally in Poland. The framework comprises Art. 87 (general work-permit obligation) and Art. 88 (work permit types A through E, seasonal, plus oświadczenie under Art. 88z for eligible nationalities including Ukrainian, Belarusian, Georgian, Moldovan, and Armenian workers). Art. 88i imposes employer notification obligations: 7-day commencement, 14-day non-commencement, and 15-business-day termination notifications to the voivode. Art. 108 Ustawa o cudzoziemcach provides filing-continuity protection: a foreigner who files a TRC application before the previous title expires retains the right to stay and work during the application's pendency. Art. 114 governs the single permit (combined TRC plus work). Art. 118 addresses change of employer during a TRC.

EEJ's matching surface enforces work-authorization eligibility today through binary checks on the work-permit-expiry, TRC-expiry, and oświadczenie-expiry fields stored on the worker record. The Specustawa / CUKR special framework for Ukrainian workers post-war is encoded as a tracker that flags workers approaching the 2027-03-04 CUKR application deadline. The Art. 108 protection logic is integrated into the eligibility evaluation via a dedicated decision engine.

The Art. 88 position-specific binding is the central pending item. Polish work permits issued under Art. 88 are bound to a specific position (`stanowisko`) at a specific user-employer (`pracodawca użytkownik`); a change of position or user-employer generally requires permit amendment or new permit application. EEJ stores `permit_type` and `permit_expiry` but does not yet store `permit_position` or `permit_user_employer`. Closing this gap (Gap 2) requires schema additions, intake-form updates, document-OCR extension, and matching-time cross-validation. EEJ requests counsel guidance on the implementation design in Q7, including the workflow at mismatch (block placement, route to APATRIS for amendment, or both).

### Temporary Employment Act (Ustawa o zatrudnianiu pracowników tymczasowych)

The Temporary Employment Act is the central staffing-agency statute. Art. 7 establishes the tripartite structure (agency, user-employer, worker). Art. 8 ust. 1 lists the work prohibitions for agency-leased workers: particularly dangerous work (`prace szczególnie niebezpieczne`, including work at heights and certain construction tasks), replacement of striking workers, replacement of permanent staff dismissed in the prior three months for reasons not attributable to the worker, and certain weapons-related work. Art. 14a establishes the 36-month assignment-record retention. Art. 15 mandates equal pay parity: agency-leased workers must receive equivalent pay and conditions to user-employer permanent staff in the same role. Art. 20 establishes the 18-month assignment-duration cap (rolling within a 36-month window) at any one user-employer.

EEJ encodes Art. 14a (retention; gated on `placement_type='agency_leased'` per the Gap 4 closure), Art. 20 (the 18-month cap; the active Gap 4 enforcement at `agency-compliance-engine.ts:172-181`), Art. 88i voivode notifications, and the KRAZ registry obligations under Art. 305-329 of the Ustawa o rynku pracy 2025 (Marshal annual report under Art. 323). The encoded compliance is summarised in the regulatory framework inventory at commit `014bea2`, which catalogues 33 distinct constraints across 10 categories.

Art. 8 ust. 1 (the prohibition list) is not yet encoded. Gap 1 is the closure. The implementation question is the appropriate taxonomy: the prohibitions reference implementing regulations that enumerate `prace szczególnie niebezpieczne` in detail, and the strictness of the prohibition varies (the work-at-heights prohibition is generally strict; the striking-worker-replacement prohibition is contextual on the user-employer's labour situation). EEJ requests counsel guidance in Q3 on the practical scope of Art. 8, the implementation taxonomy, and the documentation sufficient to demonstrate compliance under PIP audit.

Art. 15 (equal pay parity) crosses with Art. 18³ᶜ Kodeks Pracy and is the third pending gap (Gap 3). EEJ does not currently implement an automated equal-pay verification; the comparator-pay information is recorded in individual contracts but not validated at placement. EEJ requests counsel guidance in Q5 on whether the absence of automated verification is a compliance violation in itself and on the appropriate technical design.

### The integration thesis

The Polish regulatory overlay and the EU AI Act are not parallel compliance tracks; they are two lenses on the same architectural commitment. Closing Gap 1 satisfies Polish staffing-agency law (mandatory) and simultaneously strengthens the §4(a) eligibility-filter argument by adding another binary lawful check that maps to Article 6(3)(a). Closing Gap 3 satisfies Polish labour law (Art. 15 plus Art. 18³ᶜ) and improves the AI Act Article 10 (data governance, bias avoidance) posture. Closing Gap 5 satisfies the precondition for Gap 2 and strengthens both frameworks by introducing controlled-vocabulary input data (KZiS codes) that supports both the position-specific permit binding and the AI Act Article 10 input-data-quality requirement.

Compliance with one framework supports compliance with the other. The 33 encoded constraints in the regulatory framework inventory provide the data-governance foundation that Article 10 examination builds on. The audit-log infrastructure supports both the AI Act Article 19 (provider logs) and the Art. 18³ᵉ Kodeks Pracy burden-of-proof requirement. The placement_type classifier supports the AI Act Article 14 (human oversight, recruiter understands when Art. 20 applies) and the Polish Temporary Employment Act enforcement scoping.

EEJ's commitment is to execute the integrated architectural work as a single programme rather than as parallel compliance tracks. Counsel guidance is requested on whether this integrated commitment is sufficient under both frameworks or whether parallel-track work is required (Q4 partially addresses; Q11 addresses the documentation aspect).

---

## Section 7 — The architectural commitment and timeline

EEJ commits, subject to counsel validation of the classification posture in Q1, to the following architectural work.

The hybrid path implementation in code constitutes the first programme of work. The numeric matchScore is to be sunset across both `POST /jobs/:id/apply` (the candidate-application path) and `GET /jobs/:id/matches` (the admin-pull endpoint). The public-application path that currently writes a default zero score is to be cleaned up. The mobile UI badges in `ApplicationsTab` and `ATSPipelineTab` are to be replaced with neutral display. The `matchReasons` checklist is to be retained as an eligibility-checklist artefact but separated from any scoring. The audit-log infrastructure is to be extended to capture eligibility-decision events (which workers were filtered out and why). The aggregate effort is approximately 15 to 25 engineering hours.

The auth-gating gap closure constitutes a separate near-term item. The endpoint `GET /api/jobs/:id` is currently unauthenticated and returns all `job_applications` for a given job joined with `workers` rows, exposing matchScore data and worker PII (name, email, jobRole, nationality). Closing the gap requires adding `authenticateToken` middleware and restricting the application list to authenticated callers. The aggregate effort is approximately 2 to 4 engineering hours. Q8 addresses the regulatory exposure.

Gap 1 closure (Article 8 ust. 1 prohibition list under the Temporary Employment Act) constitutes the third programme of work. The implementation requires defining a `prohibited_work_types` enum or controlled-vocabulary list, adding a flag on `job_postings` (or a more granular hazard-category taxonomy), implementing a filter in the matching logic, and adding intake-form support for marking job postings as prohibited for agency-leased placement. The aggregate effort is approximately 6 to 10 engineering hours.

Gap 2 closure (position-specific permit binding under Foreigners Act Art. 88) constitutes the fourth programme of work. The implementation requires schema additions (`permit_position`, `permit_user_employer_id`, possibly `permit_working_time` on the workers table or the `work_permit_applications` table), document-OCR extension to extract these fields from the permit document, matching-time cross-validation, intake-form updates, and a workflow design for the case of permit-job mismatch. The aggregate effort is approximately 8 to 14 engineering hours. The closure also has a cross-platform consideration: APATRIS as the immigration legal-services platform handles permit-amendment workflows, and a mismatched permit is potentially routable to APATRIS rather than blocked at EEJ. The architectural design depends on counsel guidance on the appropriate workflow (Q7).

Gap 3 closure (equal-pay parity under Art. 15 Temp Work Act and Art. 18³ᶜ Kodeks Pracy) constitutes the fifth programme. The implementation requires a comparator-pay field on the `clients` table (per-position, per-currency), a workflow for the user-employer to declare comparator pay, and a validation gate on contract creation or rate change. A simpler precursor — recruiter-asserted comparator pay without user-employer integration — is approximately 4 to 6 hours; the full design with user-employer integration is approximately 10 to 18 hours.

Gap 5 closure (jobRole taxonomy under KZiS or PKD codes) constitutes the sixth programme and is the precondition for Gap 2. The implementation requires a code lookup table seeded with the 50 to 100 most-common KZiS codes EEJ actually places (welding specializations, construction trades, transport categories), an intake-form dropdown that lets staff pick a code while preserving free-text for legacy data, a backfill script for existing rows, and a controlled-vocabulary integration into the eligibility-filter logic. The aggregate effort is approximately 12 to 20 engineering hours.

The Article 6(4) non-high-risk-assessment record is the documentation artefact that supports the not-high-risk classification under audit. The record explains why the system does not pose a significant risk and which 6(3) conditions apply, with citations to the architectural intervention and the regulatory framework. The aggregate documentation effort is approximately 4 to 6 hours of writing.

The aggregate engineering and documentation work is approximately 60 to 95 hours.

EEJ proposes the following indicative timeline, subject to counsel guidance:

The auth-gating gap closure (Q8 priority) is committed within four to six weeks of counsel engagement. This is the highest-priority near-term item and is independent of the broader classification analysis: the gap is a privacy and cybersecurity exposure regardless of how Q1 is resolved.

The hybrid path implementation in code (matchScore sunset, UI badge replacement, public-application path cleanup, eligibility-checklist refactor) is committed within six to twelve weeks of counsel validation under Q1. The implementation is the architectural foundation for the not-high-risk classification.

Gap 1, Gap 3, and Gap 5 closures are committed within six to twelve weeks of counsel validation under Q3, Q5, and Q6 respectively. These three gaps are the Polish-staffing-agency-law-and-AI-Act-data-governance integrated commitment described in Section 6.

Gap 2 closure (position-specific permit binding) is committed within twelve to sixteen weeks of counsel validation under Q7, contingent on the architectural design that counsel recommends (in particular, on whether the workflow at permit-job mismatch should block placement, route to APATRIS for amendment, or both).

The Article 6(4) non-high-risk-assessment record drafting follows the implementation work: when the architectural intervention is in production and the gap closures are live, EEJ drafts the record within an additional four to six weeks. The record is the artefact that EEJ commits to retaining for the duration of the EU AI Act's documentation-retention period (10 years per Article 18 if the system is reclassified as high-risk, or per Q11 counsel guidance for the not-high-risk case).

The above timeline is indicative. EEJ requests counsel guidance on the appropriate timeline based on the regulatory exposure assessment, the Q1 classification outcome, and the priority that counsel attaches to each pending gap.

---

## Section 8 — The thirteen counsel questions

This section presents the thirteen counsel questions verbatim from the Phase 2 research at commit `ce0364c`, Section 9. Each question is structured as Question text, Why it matters, What EEJ needs, and Priority. The questions are intended to be cited and answered individually; counsel may engage with each as a discrete advice request.

### Question 1 — Article 6(3) classification of the redesigned matching

**Question text:** Does EEJ's redesigned recruitment matching system — comprising binary eligibility filtering on Polish-law-mandated criteria (work-permit validity, TRC validity, BHP, medical, certifications, placement-type-compatibility, assignment-duration eligibility) and factual presentation of operationally relevant worker data without composite scoring, ranking, or color-coded signals — qualify for the Article 6(3)(a) and (d) exemption from high-risk classification under Annex III §4(a) of Regulation (EU) 2024/1689?

**Why it matters:** This is the central classification question. If yes, EEJ avoids Articles 8-15 conformity work (~100-180 hours plus ongoing). If no, EEJ inherits high-risk obligations including QMS, Annex IV documentation, conformity assessment, CE marking, EU database registration.

**What EEJ needs:** A counsel opinion validating or contesting the not-high-risk classification, with reasoning grounded in the AI Act text and any Commission guidance available. If validated, identification of the specific architectural elements (Section 4.5 list) that must be implemented to defend the classification under audit. If contested, identification of the specific elements that fail the test and what alternative architectural designs would meet 6(3).

**Priority:** Highest. All other questions depend on this one's resolution.

### Question 2 — Polish staffing-agency law and §4(a) interaction

**Question text:** Does Polish Temporary Employment Act (`Ustawa z dnia 9 lipca 2003 r. o zatrudnianiu pracowników tymczasowych`) impose any specific recruitment-AI obligations that layer onto EU AI Act Annex III §4(a)? Specifically: (i) does the agencja pracy's matching obligation under Polish staffing law (matching a leased worker to a user-employer) affect the §4(a) classification, given that §4(a) addresses "recruitment or selection" (English text) but Polish staffing-agency activity is structurally placement (`pośrednictwo pracy`)? (ii) Does the tripartite structure under Art. 7 Temp Work Act create deployer-obligation considerations beyond standard recruitment AI?

**Why it matters:** EEJ's matching surface operates both for new candidate intake (clearly §4(a)) and for placing existing EEJ workers at user-employers (potentially §4(b) post-hire workforce management or ambiguous). The classification analysis must address both modes.

**What EEJ needs:** A counsel opinion on whether the Polish staffing-agency context expands or narrows the §4(a) scope, and clarification of where matching-of-existing-workers-to-new-user-employer-engagements falls under Annex III.

**Priority:** High. Affects scope of the §4(a) analysis.

### Question 3 — Art. 8 prohibition list implementation

**Question text:** For agency-leased workers (`placement_type='agency_leased'`), how should the Article 8 ust. 1 prohibition list (Temp Work Act prohibitions on particularly dangerous work, striking-worker replacement, recently-dismissed-staff replacement) be implemented in EEJ's matching system to satisfy both Polish law and EU AI Act eligibility-filter design? Specifically: (i) what taxonomy should `prohibitedForAgency` apply to (job-posting level, position-level, hazard-category level)? (ii) Are the prohibitions strict (any agency-leased worker is forbidden) or contextual (depending on user-employer state, e.g., active strike)? (iii) What documentation is sufficient to demonstrate compliance under PIP audit?

**Why it matters:** Gap 1 closure is on the architectural-intervention list. Implementation must be done correctly to avoid creating new compliance exposures while fixing the existing one.

**What EEJ needs:** A counsel opinion on the practical scope of Art. 8, including which specific work types are within the prohibition (the regulation references implementing acts that enumerate `prace szczególnie niebezpieczne`). Identification of any case law or PIP enforcement guidance.

**Priority:** Medium-high. Required for Gap 1 implementation.

### Question 4 — placement_type compliance implications

**Question text:** Does the `placement_type` classifier shipped to production at v100 (commit `8c4d819`/`b5cb28e`) — which scopes Art. 20 18/36-month limits and Art. 14a retention rules to agency-leased workers only, and exempts direct-outsourcing workers from those gates — create any new compliance obligations under Polish law or EU AI Act that EEJ has not yet addressed? Specifically: (i) does the legal vehicle distinction need to be disclosed to natural persons (workers, candidates) under any provision? (ii) Does the differential gating create any audit or documentation requirements beyond the existing audit-log infrastructure? (iii) Are there cross-platform implications with APATRIS's outsourcing operations?

**Why it matters:** Gap 4 is shipped, but the legal-vehicle distinction itself was identified in audit v2 as load-bearing-but-unvalidated. Counsel validation closes the loop.

**What EEJ needs:** Confirmation that the placement_type architecture is sufficient for the cross-vehicle differentiation, or identification of additional documentation/disclosure required.

**Priority:** Medium. Gap 4 is shipped; counsel review is a closing-the-loop step.

### Question 5 — Equal-pay parity (Art. 15 Temp Work Act + Art. 18³ᶜ KP)

**Question text:** EEJ does not currently implement an equal-pay parity check at placement (Gap 3 in the regulatory framework inventory). Article 15 Temp Work Act and Art. 18³ᶜ Kodeks Pracy require agency-leased workers to receive equivalent pay to user-employer permanent staff in the same role. Three questions: (i) Is the absence of an automated equal-pay verification a compliance violation in itself, or is the requirement satisfied if EEJ documents the comparator pay in the contract regardless of system support? (ii) Does the absence of this check create a §4(a)-relevant indirect-discrimination concern under EU AI Act Article 10? (iii) When implemented, what is the appropriate technical design — comparator pay declared by user-employer, comparator pay derived from market data, or recruiter-asserted comparator?

**Why it matters:** Gap 3 closure is a 10-18 hour engineering task. Implementation design depends on counsel guidance.

**What EEJ needs:** A counsel opinion on the compliance posture pre-implementation and on the appropriate technical design.

**Priority:** Medium. Pre-implementation; affects timing of Gap 3 closure.

### Question 6 — jobRole taxonomy (Article 10 data governance)

**Question text:** EEJ's `workers.jobRole` field is free-text, populated from intake forms, CV OCR, and manual entry; there is no controlled vocabulary or KZiS-code lookup. (i) Does this data-quality posture affect Article 10 (data governance) compliance under the high-risk classification (and therefore the documentation required if Article 6(3) argument fails)? (ii) Under the not-high-risk Article 6(3) classification, does free-text jobRole undermine the eligibility-filter narrow-procedural-task argument by introducing semantic ambiguity? (iii) When implemented (Gap 5 closure), what is the recommended depth — core-50 KZiS codes, full ~2,500 codes, or hybrid?

**Why it matters:** Free-text jobRole is the precondition for Gap 2 (position-permit binding) and affects multiple downstream gaps.

**What EEJ needs:** Counsel opinion on whether free-text undermines the §4(a) classification argument, plus practical guidance on taxonomy depth.

**Priority:** Medium. Multi-gap precondition.

### Question 7 — Position-specific permit binding (Foreigners Act Art. 88)

**Question text:** Polish work permits issued under Art. 88 Ustawa o promocji zatrudnienia / Ustawa o rynku pracy 2025 are bound to a specific position (`stanowisko`) at a specific user-employer. EEJ's matching currently checks permit expiry but does not verify position-binding (Gap 2). (i) Does the absence of this check create §4(a)-relevant exposure (an eligibility filter that fails to verify a legally-required binding)? (ii) Does it create a separate Foreigners Act enforcement risk under PIP / voivode audits? (iii) When closed, what fields should be captured (permit_position, permit_user_employer_id, permit_working_time)? (iv) How should the matching surface handle the case where a worker's permit covers position A but the job posting requires position B — block placement, route to APATRIS for amendment, or both?

**Why it matters:** Gap 2 closure is 8-14 hours; design affects integration with APATRIS (potentially shared-infrastructure SHARED candidate per audit v2 Section 7.5).

**What EEJ needs:** Counsel opinion on the structural design of position-binding and the workflow at mismatch. Cross-reference to APATRIS's case-management surface.

**Priority:** Medium. Affects Gap 2 design and APATRIS integration.

### Question 8 — Auth-gating gap at GET /api/jobs/:id

**Question text:** The endpoint `GET /api/jobs/:id` at `routes/jobs.ts:38` is currently unauthenticated and returns all `job_applications` for a job joined with `workers` rows, including matchScore data and worker PII (name, email, jobRole, nationality). (i) Under EU AI Act Article 15 (cybersecurity), does this exposure constitute a fail of the requirement? (ii) Under RODO Article 32 (security of processing), what is the regulatory exposure? (iii) Is this gap material to the §4(a) classification analysis (i.e., does the not-high-risk classification depend on the gap being closed)? (iv) What is the remediation timeline expected by counsel?

**Why it matters:** This is the audit Rank 3 priority item. It affects multiple compliance frameworks simultaneously and is a near-term remediation.

**What EEJ needs:** Counsel opinion on regulatory exposure and timeline expectation for closure. Confirmation that closure is part of the §4(a) classification posture.

**Priority:** High. Near-term remediation item.

### Question 9 — Provider vs deployer status under EU AI Act

**Question text:** EEJ Sp. z o.o. developed the recruitment AI internally and uses it for its own staffing-agency operations. Under EU AI Act Articles 3(3) and 3(4), is EEJ classified as: (i) provider only, (ii) deployer only, (iii) both provider and deployer? Specifically: (a) Does internal-only deployment by the developing entity constitute "placing on the market or putting into service"? (b) If EEJ later opens the platform to multi-tenant SaaS use by other staffing agencies (Phase 3 SaaS in CLAUDE.md roadmap), how does the classification change? (c) What documentation differentiates provider obligations (Articles 16-19) from deployer obligations (Article 26) when the same entity occupies both roles?

**Why it matters:** Defines which obligations attach to EEJ. Affects scope of all remaining classification work.

**What EEJ needs:** Definitive classification with reasoning, plus guidance on the future-multi-tenant scenario.

**Priority:** Medium-high. Foundational for the obligation inventory.

### Question 10 — RODO Article 22 interaction with eligibility filtering

**Question text:** The redesigned matching is designed to fall outside RODO Article 22 (no automated decision-making producing legal effects on the candidate) because the recruiter makes the placement decision. However, the eligibility filtering itself excludes ineligible candidates from the recruiter's view. (i) Is the eligibility filter's exclusion an automated decision under Article 22(1)? (ii) If yes, does Article 22(2)(b) (decisions authorised by Member State law) exempt EEJ's eligibility checks (since they implement Polish work-authorization law)? (iii) Does Article 22(2)(a) (necessary for entering into a contract) apply to the agency's pre-contractual matching activity? (iv) Does EEJ's existing CV-scan flow at `routes/workers.ts:117-128` (Claude Vision OCR at intake) require Article 50 disclosure under the AI Act, given that candidates upload CVs that the system processes?

**Why it matters:** Affects whether the eligibility filter triggers a separate Article 22 compliance track and whether the candidate-facing CV-scan needs disclosure.

**What EEJ needs:** Counsel opinion on the eligibility filter's Article 22 status and on Article 50 disclosure requirements for the CV-scan path.

**Priority:** Medium. RODO compliance is independent but interacts with §4(a) classification.

### Question 11 — Documentation and transparency obligations under Article 6(3) audit

**Question text:** Assuming the not-high-risk classification under Article 6(3) is validated, what specific documentation must EEJ maintain to defend that classification under audit? Specifically: (i) Is the Article 6(4) non-high-risk-assessment record (a written record explaining why the system does not pose significant risk and which 6(3) conditions apply) sufficient, or is additional documentation required? (ii) Does the Commission delegated act under Article 6(4) (status as of counsel review date) impose specific documentation requirements that are not in the AI Act text directly? (iii) What is the recommended retention period for the Article 6(4) record? (iv) Does the documentation need to be made publicly available, available to candidates on request, available to deployers, or kept internally?

**Why it matters:** Determines the Phase 3 write-up's required components. Affects how much documentation must be drafted before the architectural intervention can be claimed as compliant.

**What EEJ needs:** Concrete checklist of documentation elements with retention/availability guidance.

**Priority:** High. Defines the Phase 3 deliverable's contents.

### Question 12 — Counsel engagement scoping (single vs separate)

**Question text:** Per Q3 decision, EEJ intends to engage the same Polish counsel as APATRIS for both the §7 immigration-AI analysis (APATRIS) and the §4(a) recruitment-AI analysis (EEJ). (i) Are the two analyses sufficiently distinct that a single counsel can address them efficiently, or does §4(a) recruitment-AI require specialist Polish employment-law expertise that the §7 immigration-AI counsel may lack? (ii) Should the two analyses be combined into a single counsel engagement document or kept separate? (iii) Does counsel see any conflicts of interest between APATRIS as outsourcing platform and EEJ as agency-leasing platform under the Q3 same-counsel arrangement? (iv) What is counsel's estimated billing for the combined or separated scope?

**Why it matters:** Affects counsel engagement logistics, cost, and scope.

**What EEJ needs:** Counsel's own assessment of the engagement scope and any escalation to specialist employment-law counsel if needed.

**Priority:** Medium. Logistics, but affects timeline.

### Question 13 — KRiBSI vs UODO jurisdictional scope (added during Phase 2)

**Question text:** The Polish AI implementation law (accepted by Council of Ministers 2026-03-31, in Sejm review as of 2026-04-29) is anticipated to designate KRiBSI (Krajowa Rada ds. Bezpieczeństwa Sztucznej Inteligencji) as the primary AI supervisory authority and UODO (Urząd Ochrony Danych Osobowych) as advisory plus supplemental for justice/border/police domains. (i) Which authority will have jurisdiction over EEJ's recruitment-AI matters? (ii) If the Article 6(3) not-high-risk classification is validated, does the supervisory-authority interaction differ (e.g., reduced reporting requirements)? (iii) For the §4(a) classification specifically, does any Polish-specific exemption or addition exist or is anticipated under the implementation law?

**Why it matters:** Determines which authority EEJ engages with for AI-Act-related matters and whether Polish law adds anything beyond the EU baseline.

**What EEJ needs:** Counsel guidance on the regulatory landscape as it stands and as it is expected to develop.

**Priority:** Low-medium. Regulatory landscape; affects ongoing posture.

---

## Section 9 — Limitations and what is out of scope

The Phase 2 research identified six items that the research could not definitively resolve and that require counsel input. The first is the absence of binding Commission interpretive guidance on §4(a) and Article 6(3): the Commission's Article 6(4) implementing acts and §4(a)-specific guidance documents have draft status or limited binding effect as of document preparation, and authoritative Commission interpretation is incomplete. The second is the profiling-caveat boundary under Article 6(3): the textual analysis identifies the line between verification (favourable to EEJ) and evaluation (unfavourable), but the line is interpretive. The third is the §4(a) "evaluation" criterion scope: the narrow reading supports EEJ's classification posture, but counsel's authoritative reading is needed. The fourth is the Polish enforcement-agencies' interpretation of EEJ's classification: no published Polish-side enforcement guidance exists as of document preparation, and KRiBSI has not yet been established. The fifth is the placement_type='direct_outsourcing' classification's effect on §4(a) analysis: the analysis in Section 5 is framed for agency-leased; whether direct-outsourcing workers' analysis differs is partially addressed by Q4. The sixth is the CV-scan path's Article 50 disclosure status: whether the existing Claude Vision OCR flow at `routes/workers.ts:117-128` requires AI-system disclosure to the candidate uploading the CV is partially addressed by Q10.

The document scope is EU AI Act Annex III §4(a) recruitment AI for EEJ. The following items are explicitly out of scope. Annex III §4(b) post-hire workforce management is a separate Annex III category; EEJ's GPS tracking, performance monitoring, and task-allocation surfaces are not analysed here. Other EEJ AI surfaces — the AI copilot at `services/eej-copilot.ts`, the regulatory intelligence and immigration search surfaces, and the contract reclassification scanner — may have their own AI Act exposure but are not part of this engagement. The APATRIS-side §7 immigration-AI analysis is handled in a separate counsel engagement at the cross-platform level; the Q12 question addresses the engagement-scoping interaction. The actual implementation of the architectural intervention in code is separate engineering work, sequenced after counsel validation under Q1 and the related questions; it is described in Section 7 as a commitment but the implementation prompts are not included here.

The Polish AI implementation law is in Sejm review and not yet enacted as of document preparation. EEJ has analysed the EU baseline (Regulation (EU) 2024/1689 in force) and the expected Polish authority structure (KRiBSI plus UODO), but the specific Polish-law provisions are not yet binding. Counsel guidance on the expected provisions and on EEJ's posture as the law progresses through Sejm is requested in Q13.

---

## Section 10 — Companion documents and appendices

### Appendix A — Regulatory citations

The verbatim text of the load-bearing regulatory provisions is reproduced here for counsel's convenience.

**Annex III §4(a) — EU AI Act (Regulation (EU) 2024/1689):**

> "AI systems intended to be used for the recruitment or selection of natural persons, in particular to place targeted job advertisements, to analyse and filter job applications, and to evaluate candidates."

**Article 6(3) — EU AI Act:**

> "By derogation from paragraph 2, an AI system referred to in Annex III shall not be considered to be high-risk where it does not pose a significant risk of harm to the health, safety or fundamental rights of natural persons, including by not materially influencing the outcome of decision making.
>
> The first subparagraph shall apply where any of the following conditions is fulfilled:
> (a) the AI system is intended to perform a narrow procedural task;
> (b) the AI system is intended to improve the result of a previously completed human activity;
> (c) the AI system is intended to detect decision-making patterns or deviations from prior decision-making patterns and is not meant to replace or influence the previously completed human assessment, without proper human review; or
> (d) the AI system is intended to perform a preparatory task to an assessment relevant for the purposes of the use cases listed in Annex III.
>
> Notwithstanding the first subparagraph, an AI system referred to in Annex III shall always be considered to be high-risk where the AI system performs profiling of natural persons."

**GDPR Article 4(4) — profiling definition:**

> "'profiling' means any form of automated processing of personal data consisting of the use of personal data to evaluate certain personal aspects relating to a natural person, in particular to analyse or predict aspects concerning that natural person's performance at work, economic situation, health, personal preferences, interests, reliability, behaviour, location or movements."

**GDPR Article 22(1) — automated decision-making:**

> "The data subject shall have the right not to be subject to a decision based solely on automated processing, including profiling, which produces legal effects concerning him or her or similarly significantly affects him or her."

**Art. 11³ Kodeks Pracy — anti-discrimination:**

> "Jakakolwiek dyskryminacja w zatrudnieniu, bezpośrednia lub pośrednia, w szczególności ze względu na płeć, wiek, niepełnosprawność, rasę, religię, narodowość, przekonania polityczne, przynależność związkową, pochodzenie etniczne, wyznanie, orientację seksualną, zatrudnienie na czas określony lub nieokreślony, zatrudnienie w pełnym lub w niepełnym wymiarze czasu pracy — jest niedopuszczalna."

**Art. 18³ᶜ Kodeks Pracy — equal pay for equal work:**

> "Pracownicy mają prawo do jednakowego wynagrodzenia za jednakową pracę lub za pracę o jednakowej wartości."

**Art. 8 ust. 1 Ustawa o zatrudnianiu pracowników tymczasowych — work prohibitions for agency-leased workers (paraphrased):**

Agency-leased workers (`pracownicy tymczasowi`) cannot perform: (1) particularly dangerous work (`prace szczególnie niebezpieczne`), including work at heights and certain construction; (2) replacement of striking workers; (3) replacement of permanent staff dismissed in the prior 3 months for reasons not attributable to the worker; (4) certain weapons-related work.

**Art. 15 Ustawa o zatrudnianiu pracowników tymczasowych — equal-pay parity (paraphrased):**

Agency-leased workers must receive equivalent pay and conditions to user-employer permanent staff in the same role.

**Art. 20 Ustawa o zatrudnianiu pracowników tymczasowych — assignment-duration cap (paraphrased):**

The cumulative duration of agency-leased work at any one user-employer is capped at 18 months within a 36-month rolling window.

**Art. 88 Ustawa o promocji zatrudnienia / Ustawa o rynku pracy 2025 — work permit framework (paraphrased):**

Foreigners (third-country nationals) require work authorization for legal employment in Poland. Work permits are issued by type (A through E, seasonal) and bind to a specific position (`stanowisko`) at a specific user-employer.

**Art. 108 Ustawa o cudzoziemcach — filing-continuity protection (paraphrased):**

A foreigner who files a TRC application before the previous title expires retains the right to stay and work in Poland during the application's pendency, subject to specific conditions.

### Appendix B — Encoded compliance constraints

EEJ encodes 33 distinct compliance constraints in production code as of HEAD `b5cb28e`. The constraints are catalogued in detail in `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` (commit `014bea2`). The summary categories are: five placement gates as hard blocks (BHP, medical, work authorization, contract-permit type compatibility, 18-month assignment limit); four Schengen and pre-placement risk gates; five voivode-notification deadlines under Art. 88i; two KRAZ and Marshal-reporting items under Art. 305-329 and Art. 323; ten document-retention rules across Polish Labour Code Art. 94(9a), Ustawa o rachunkowości, Foreigners Act, GDPR Art. 17, Temp Work Act Art. 14a, ZUS, and Ordynacja podatkowa; fourteen Foreigners Act and KPA references in the legal-decision-engine; four Specustawa and CUKR Ukrainian-tracker items; three BHP and risk-assessment templates; and one each of PIP inspection pack and contract-reclassification scanner. The aggregate is approximately 1,700 lines of compliance encoding code.

### Appendix C — Architectural intervention inventory

The architectural intervention required to defend the not-high-risk classification under Article 6(3) is inventoried below with effort estimates. The estimates are in engineering hours.

| Component | Estimated effort | Status |
|---|---|---|
| Sunset numeric matchScore in POST /jobs/:id/apply (`routes/jobs.ts:127-165`) | 3-5 hours | Pending |
| Sunset numeric matchScore in GET /jobs/:id/matches (`routes/jobs.ts:244-280`) | 3-5 hours | Pending |
| Public-application path stops writing matchScore="0" (`routes/workers.ts:184`) | 1-2 hours | Pending |
| Replace ApplicationsTab badge with neutral display (`eej-mobile-HIDDEN/src/pages/tabs/ApplicationsTab.tsx:143-152`) | 2-3 hours | Pending |
| Replace ATSPipelineTab badge with neutral display (`eej-mobile-HIDDEN/src/pages/tabs/ATSPipelineTab.tsx:135-144`) | 2-3 hours | Pending |
| Stop writing `job_applications.matchScore`; retain column for historical read | 2-3 hours | Pending |
| Implement `matchReasons` as eligibility-checklist artefact | 3-5 hours | Pending |
| Close auth-gating gap at `GET /api/jobs/:id` (audit Rank 3) | 2-4 hours | Pending |
| Close Gap 1 — Article 8 ust. 1 prohibition list | 6-10 hours | Pending |
| Close Gap 2 — position-specific permit binding | 8-14 hours | Pending |
| Close Gap 3 — equal-pay parity | 10-18 hours | Pending |
| Close Gap 5 — jobRole taxonomy (KZiS code) | 12-20 hours | Pending |
| Documentation: system role, recruiter role, eligibility-vs-evaluation distinction | 4-6 hours | Pending |
| Audit logging captures eligibility decisions (not "score") | 2-3 hours | Pending |
| Article 6(4) non-high-risk-assessment record | 4-6 hours | Pending |
| **Aggregate** | **~60-95 engineering hours** | |
| Live in production at v100 | | |
| Gap 4 — placement_type classifier (schema, API, behavioural gating, audit, UI badge) | shipped | Live (commit `8c4d819`/`b5cb28e`) |

### Appendix D — Counsel question priority summary

| # | Question | Priority |
|---|---|---|
| Q1 | Article 6(3) classification of the redesigned matching | Highest |
| Q2 | Polish staffing-agency law and §4(a) interaction | High |
| Q3 | Article 8 prohibition list implementation | Medium-high |
| Q4 | placement_type compliance implications | Medium |
| Q5 | Equal-pay parity (Art. 15 Temp Work Act + Art. 18³ᶜ KP) | Medium |
| Q6 | jobRole taxonomy (Article 10 data governance) | Medium |
| Q7 | Position-specific permit binding (Foreigners Act Art. 88) | Medium |
| Q8 | Auth-gating gap at GET /api/jobs/:id | High |
| Q9 | Provider vs deployer status under EU AI Act | Medium-high |
| Q10 | RODO Article 22 interaction with eligibility filtering | Medium |
| Q11 | Documentation under Article 6(3) audit | High |
| Q12 | Counsel engagement scoping | Medium |
| Q13 | KRiBSI vs UODO jurisdictional scope | Low-medium |

### Companion documents

The following companion documents are available to counsel on request and provide the source material from which this counsel handoff was synthesised.

| Document | Path | Commit |
|---|---|---|
| Phase 1 scope | `docs/EU_AI_ACT_ANNEX_III_4A_RECRUITMENT_RESEARCH_SCOPE.md` | `305eb08` |
| Phase 2 research | `docs/EU_AI_ACT_ANNEX_III_4A_PHASE_2_RESEARCH.md` | `ce0364c` |
| EEJ-APATRIS consolidation audit (v2) | `docs/EEJ-APATRIS-CONSOLIDATION-AUDIT.md` | `9be0faa` |
| Regulatory framework inventory | `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` | `014bea2` |
| Step 3 follow-ups + Gap 4 closure note | `artifacts/api-server/STEP3-FOLLOWUPS.md` | last updated `b5cb28e` |

---

*End of EEJ EU AI Act §4(a) Counsel Handoff v1.0.*

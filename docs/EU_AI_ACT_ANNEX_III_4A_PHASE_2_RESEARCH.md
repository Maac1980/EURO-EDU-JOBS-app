# EU AI Act Annex III §4(a) — EEJ Phase 2 Research

## Section 1 — Frame and companion documents

**Date:** 2026-04-29
**Author:** EEJ Claude Code (commissioned by Manish Shetty, Founder/Partner, EEJ Sp. z o.o.)
**Repository:** `Maac1980/EURO-EDU-JOBS-app`
**Repo HEAD at start of work:** `b5cb28e`
**Production state at start of work:** `eej-jobs-api` v100 in `ams` (deployed 2026-04-28), Gap 4 (`workers.placement_type`) live with all 100 existing workers defaulting to `'agency_leased'`.

**Purpose.** Foundational classification analysis under EU AI Act Annex III §4(a) for EEJ's recruitment AI systems, building on Phase 1 scope (commit `305eb08`) and incorporating the Q1/Q2/Q3 decisions reached on 2026-04-28. The document produces structured analysis, regulatory citations, mappings between EEJ's actual implemented architecture and AI Act requirements, and refined counsel-question candidates. This is research-mode work; counsel-ready prose synthesis is Phase 3.

**Companion documents.**

| Document | Path | Commit | Role in Phase 2 |
|---|---|---|---|
| Phase 1 scope | `docs/EU_AI_ACT_ANNEX_III_4A_RECRUITMENT_RESEARCH_SCOPE.md` | `305eb08` | Phase 2 fulfils Phase 1's scoped sections; the 7 + 3 counsel questions are refined and expanded in Section 9 |
| EEJ-APATRIS consolidation audit (v2) | `docs/EEJ-APATRIS-CONSOLIDATION-AUDIT.md` | `9be0faa` | Section 3.5 (legal-vehicle distinction) and Section 9 (matchScore audit findings) are foundational inputs |
| EEJ agency regulatory framework inventory | `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` | `014bea2` | Section 7 (Polish overlay) cites 33 encoded constraints; gap list informs Section 4 architecture-pending and Section 8 interaction analysis |
| Step 3 follow-ups + Gap 4 closure note | `artifacts/api-server/STEP3-FOLLOWUPS.md` | `b5cb28e` | Three Gap 4 deferred items (D2 worker detail, bulk audit, PIP placement_type surfacing) referenced as architecture-pending in Section 4 |

**Q1/Q2/Q3 decisions carried into Phase 2.**

- **Q1 — matchScore strategic vs vestigial:** answered **HYBRID**. Sunset numeric ranking; retain the rule evaluation as an *eligibility checklist*; separate eligibility from ranking; present factual information without composite scores or color-coded ranking signals. The redesigned system filters by lawful eligibility and presents structured facts; the recruiter selects.
- **Q2 — Risk tolerance for §4(a):** answered **counsel-validated low-risk via architectural intervention**. The redesigned matching is the basis for the not-high-risk argument under Article 6(3)(a)+(d). Phase 2 produces that argument; counsel validates.
- **Q3 — Counsel engagement strategy:** answered **single Polish counsel engagement** (the same counsel APATRIS will engage for §7 immigration AI), with escalation to specialist Polish employment-law counsel only if the §4(a) work demands it.

**Methodology.**

- Verbatim citations from the EU AI Act (Regulation (EU) 2024/1689, in force 2024-08-01, applicable in stages through 2027) and from Polish legal text (Kodeks Pracy, Ustawa o cudzoziemcach, Ustawa o zatrudnianiu pracowników tymczasowych, Ustawa o promocji zatrudnienia / Ustawa o rynku pracy 2025, RODO). Citations include Article and paragraph numbers; Recital references where they carry interpretive weight.
- Cross-reference to EEJ's actual implemented architecture: the matchScore is PARTIALLY USED (Audit v2 Section 9), placement_type is live in production at v100 (commit `8c4d819`/`b5cb28e`), 33 constraints already encoded (regulatory framework inventory Section 2), 5 primary + 5 lower-priority gaps remain (regulatory framework inventory Section 5).
- Where the regulatory text is ambiguous or open to interpretation (especially around Article 6(3) condition boundaries and the §4(a) "evaluation" criterion), the ambiguity is flagged as a counsel question rather than resolved by speculation.
- Citations of EU AI Act use the form: "Article X(Y)(Z)" and "Recital N." Polish law citations use the form used by EEJ's existing services and the regulatory framework inventory: "Art. X Ustawa o ..." or "Art. X KP."

**Scope boundary.** Phase 2 produces structured analysis and counsel-question candidates. It does not produce counsel-ready prose conclusions on questions requiring counsel input. It does not produce architectural-design recommendations beyond what the Q1 hybrid path already specifies. It does not produce implementation prompts for closing the gaps.

**Out of scope for Phase 2:** the counsel engagement itself, implementation of the redesigned matching, closure of Gaps 1/2/3/5/auth-gating, the §4(a) Phase 3 counsel-ready write-up.

---

## Section 2 — EU AI Act Article 6 classification analysis

### 2.1 The Article 6 framework

Regulation (EU) 2024/1689 (EU AI Act) Article 6 governs which AI systems are classified as **high-risk**. The framework has three structural layers:

1. **Article 6(1):** AI systems are high-risk when they are products covered by Annex II Union harmonization legislation AND when those products require third-party conformity assessment under that legislation.
2. **Article 6(2):** AI systems referred to in **Annex III** are also high-risk, except where Article 6(3) applies.
3. **Article 6(3):** An Annex III system is **NOT** high-risk if it does not pose a significant risk of harm to health, safety, or fundamental rights, including by not materially influencing the outcome of decision-making, AND if **one or more** of the four exemption conditions (a)-(d) is met. There is a profiling caveat that returns the system to high-risk regardless.

**EEJ's recruitment AI is not within Article 6(1).** The matchScore and ATS pipeline are not products covered by any Annex II Union harmonization legislation (machinery, toys, lifts, RED, MDR, IVDR, etc. — none apply). EEJ's recruitment AI is an internal SaaS recruitment tool; it is not a machinery safety component, not a medical device, not radio equipment.

**EEJ's recruitment AI falls within Annex III.** Annex III §4(a) explicitly names "AI systems intended to be used for the recruitment or selection of natural persons, in particular to place targeted job advertisements, to analyse and filter job applications, and to evaluate candidates." Section 3 below treats §4(a) framing in detail.

**Therefore the central classification question for EEJ is whether Article 6(3) exempts the system.**

### 2.2 Article 6(3) — the four exemption conditions

The Article 6(3) text (EU AI Act):

> "By derogation from paragraph 2, an AI system referred to in Annex III shall not be considered to be high-risk where it does not pose a significant risk of harm to the health, safety or fundamental rights of natural persons, including by not materially influencing the outcome of decision making.
>
> The first subparagraph shall apply where any of the following conditions is fulfilled:
> (a) the AI system is intended to perform a narrow procedural task;
> (b) the AI system is intended to improve the result of a previously completed human activity;
> (c) the AI system is intended to detect decision-making patterns or deviations from prior decision-making patterns and is not meant to replace or influence the previously completed human assessment, without proper human review; or
> (d) the AI system is intended to perform a preparatory task to an assessment relevant for the purposes of the use cases listed in Annex III.
>
> Notwithstanding the first subparagraph, an AI system referred to in Annex III shall always be considered to be high-risk where the AI system performs profiling of natural persons."

Three structural elements:

- A **gateway test**: the system must "not pose a significant risk of harm" and "not materially influence the outcome of decision-making." This must be true *before* any of (a)-(d) apply.
- The **four conditions** (a)-(d): at least one must be fulfilled.
- The **profiling caveat**: the carve-out is unavailable if the system performs profiling. "Profiling" is not defined inside the AI Act itself; the operative definition is GDPR Article 4(4) (see Section 7.2 RODO).

### 2.3 Article 6(4) — Commission implementing acts

Article 6(4) directs the Commission to adopt implementing acts to specify the practical implementation of Article 6(3) and to provide a comprehensive list of practical examples of high-risk and non-high-risk use cases. As of 2026-04-29, the Commission has issued draft guidelines but no binding implementing act has been adopted. **Counsel input needed (see Section 9 Question 11)** on the status and content of any guidelines that have been published since the AI Act's August 2024 entry into force.

### 2.4 Mapping the redesigned matchScore (hybrid path) to Article 6(3)

The redesigned system (per Q1 HYBRID) consists of:

1. **Eligibility filtering** — binary checks: work-permit validity (per Foreigners Act Art. 88), TRC validity (per Ustawa o cudzoziemcach Art. 114), basic role-skill match, certification match (e.g., EN ISO 9606-1 weld procedure), placement-type compatibility (Temp Work Act Art. 8 prohibition list — see Gap 1), assignment-duration eligibility (Temp Work Act Art. 20 — see Gap 4 closure).
2. **Factual presentation** — structured display of operationally relevant facts: years of experience, specific certifications held, prior placement history, current location, language proficiency. **No** composite score, **no** color-coded ranking signal, **no** ordered ranking.
3. **Recruiter decision** — the human recruiter selects which eligible worker to place. The system makes no recommendation.

**Mapping to (a) — narrow procedural task:**

Each eligibility gate is a discrete legal verification (does the permit cover this position? is the TRC currently valid? does the worker hold the cert that the job requires?). These are not evaluative judgments; they are binary conformance checks against externally defined legal criteria. This maps cleanly to "narrow procedural task" within the meaning of Article 6(3)(a).

**Mapping to (d) — preparatory task:**

The factual presentation surface prepares information for a human assessment (the recruiter's decision) but does not itself perform that assessment. The facts displayed (experience, certifications, prior placement) are objective data points; the system does not weight them, score them, or rank them. This maps to "preparatory task to an assessment" within Article 6(3)(d).

**Conditions (b) and (c) are not the basis for EEJ's argument.** (b) presupposes that a human activity has been completed and the AI improves its result; this does not match the recruitment workflow. (c) presupposes pattern detection on prior decisions; the redesigned system does not do this.

### 2.5 The profiling caveat — the central interpretive question

Article 6(3) ends: "an AI system referred to in Annex III shall always be considered to be high-risk where the AI system performs profiling of natural persons." This is the most consequential single sentence in the analysis.

**Profiling** under GDPR Article 4(4): "any form of automated processing of personal data consisting of the use of personal data to evaluate certain personal aspects relating to a natural person, in particular to analyse or predict aspects concerning that natural person's performance at work, economic situation, health, personal preferences, interests, reliability, behaviour, location or movements."

**The key textual element is "evaluate certain personal aspects."** The redesigned matching is designed to *not* evaluate. It filters by externally-defined legal criteria (does the worker have the permit?) and displays facts (the worker has X years of experience). At no point does the system synthesize a personal-aspect evaluation about the worker.

**Counter-argument that the caveat applies anyway.** A counsel-side challenge could argue: (i) eligibility filtering is itself an "evaluation" of the worker's lawful work eligibility, even if binary; (ii) deciding which facts to present is itself an evaluative weighting; (iii) the inputs to eligibility filtering (TRC validity, work-permit position-binding) involve personal-aspect data (residency status is a "personal aspect"). Under the most expansive reading of Article 4(4), the caveat would bring the system back into high-risk.

**Counter-counter-argument.** The text of Article 4(4) reads "to evaluate **certain personal aspects** relating to a natural person." The aspects enumerated — performance at work, economic situation, health, preferences, interests, reliability, behaviour, location, movements — are evaluative judgments about the person, not external legal facts about the person's eligibility. A binary check of "is this work-permit valid for this position" is not an evaluation of a personal aspect; it is a verification of an external legal fact. This reading aligns with how Article 22 GDPR (automated decision-making with legal effects) has been interpreted in CJEU jurisprudence: simple eligibility verifications have not been treated as "profiling" for Article 22 purposes.

**This is the central counsel question.** Section 9 Question 1 frames it precisely. The architectural intervention is designed to land the system on the right side of the line, but the line itself is interpretive.

### 2.6 The gateway test — "significant risk of harm" and "material influence"

Even if (a)-(d) and the profiling caveat are favourably resolved, Article 6(3) requires that the system "not pose a significant risk of harm" and "not materially influence the outcome of decision-making."

**Significant risk of harm.** EEJ's redesigned matching does not affect health or safety directly. The fundamental-rights surface is potentially disparate impact on protected characteristics (Section 7.1 anti-discrimination overlay). The architectural design — eligibility filtering on lawful criteria, factual presentation without ranking, recruiter-led decision — is deliberately structured to minimize this risk. **Counsel input needed (Question 1)** on whether this risk profile is "not significant" within the meaning of Article 6(3).

**Material influence on outcome.** The recruiter sees the eligible-candidate list and the facts; the recruiter selects. The system does not order, recommend, or weight. Counsel may challenge: (i) eligibility filtering itself influences the outcome by removing candidates from consideration; (ii) the choice of which facts to display influences what the recruiter sees first. A defensible response: removing legally-ineligible candidates is not an evaluative influence — it implements the law. Displaying objective facts without weighting is not an outcome-influencing recommendation.

### 2.7 Summary of the Section 2 argument

EEJ's redesigned recruitment AI (Q1 HYBRID) is positioned to fall within Article 6(3) as not-high-risk under conditions (a)+(d), provided that:

- The matchScore numeric output is fully sunset (no composite score in any UI surface, no API response field exposing a score, no audit trail captured as "score").
- Color-coded ranking signals are removed.
- The eligibility filtering and factual presentation surfaces are documented as the system's role; the recruiter's decision is documented as the human assessment.
- The profiling caveat does not apply because the system does not evaluate personal aspects in the GDPR Article 4(4) sense.

The argument hinges on counsel validation of the profiling-caveat boundary (Question 1) and on the architectural intervention being completed in implementation (Section 4 architecture-pending). If the argument fails, the system is high-risk and Articles 8-15 conformity work is triggered (Section 5).

---

## Section 3 — Annex III §4(a) specific framing

### 3.1 Verbatim text of Annex III §4(a)

Annex III §4 is titled "Employment, workers' management and access to self-employment." Sub-paragraph (a) reads:

> "AI systems intended to be used for the recruitment or selection of natural persons, in particular to place targeted job advertisements, to analyse and filter job applications, and to evaluate candidates."

Three explicitly named sub-activities: (i) place targeted job advertisements, (ii) analyse and filter job applications, (iii) evaluate candidates. The umbrella scope is "recruitment or selection of natural persons."

### 3.2 Relationship to §4(b)

Annex III §4(b) covers AI systems "intended to be used to make decisions affecting terms of work-related relationships, the promotion or termination of work-related contractual relationships, to allocate tasks based on individual behaviour or personal traits or characteristics or to monitor and evaluate the performance and behaviour of persons in such relationships." This is the *post-hire* employment-management scope. EEJ's matching surface is *pre-hire*; §4(b) does not apply to the matchScore but may apply to other EEJ surfaces (e.g., GPS tracking, performance evaluation in the Operations module). **Out of scope for Phase 2.**

### 3.3 Examples typically considered within §4(a)

Drawing from the Commission's published guidance on Annex III (where available), ETUC analyses, and employer-association working papers:

- **CV / resume screening AI** that scores or ranks applicants. *Within §4(a), typically high-risk.*
- **Interview scoring AI** (video-interview analysis, sentiment analysis, voice analytics applied to applicants). *Within §4(a), high-risk.*
- **Candidate ranking systems** with composite scores. *Within §4(a), high-risk.*
- **Job-applicant matching systems** with ranking output. *Within §4(a), high-risk.*
- **Targeted job-advertisement systems** that use predicted candidate-fit to direct ads. *Within §4(a) explicitly (sub-activity (i)).*

### 3.4 Examples typically considered outside §4(a)

- **Pure scheduling tools** (calendar coordination for interviews). *Outside — administrative.*
- **Background-check verification** that returns a binary "criminal record / no record" result against an authoritative database. *Likely outside — verification, not evaluation.*
- **Document-management systems** for recruitment files (storage, indexing). *Outside — record-keeping.*
- **Training-material generation** for HR teams. *Outside — not applicant-facing.*
- **Automated job-posting tools** that distribute postings to job boards. *Outside if no targeting; within §4(a) if targeted by predicted candidate fit.*

The line between "within" and "outside" depends primarily on whether the system performs evaluative judgment about the candidate or merely processes information without judgment.

### 3.5 The "evaluation" criterion — where is the line?

§4(a) names "evaluate candidates" as an explicit sub-activity. The critical interpretive question is what constitutes "evaluation."

**Narrow reading (favorable to EEJ's hybrid path):** "evaluate" means produce a synthesized judgment about a candidate's fit, suitability, or quality. A binary lawful-eligibility check (does the permit cover this position?) is verification, not evaluation. Display of objective facts (the worker has 3 years of experience) is presentation, not evaluation.

**Wide reading (unfavorable):** any system that affects which candidates the recruiter sees — by filtering them, ordering them, or selecting which facts to display — is performing evaluation in a functional sense, regardless of whether the output is a numeric score.

**EEJ's position under the redesigned system.** Eligibility filtering is verification on externally-defined legal criteria. Factual presentation has no synthesis, weighting, or ordering. The narrow reading supports not-high-risk. The wide reading does not. **Counsel input needed (Question 1)** on which reading prevails for §4(a).

A precedential anchor: GDPR Article 22 ("solely automated decision-making") has been interpreted by CJEU and DPAs to focus on whether the system produces a *decisive* output that affects the data subject. A purely informative or preparatory system that leaves decision authority with a human has been treated as outside Article 22. The §4(a) "evaluation" boundary may track this same logic, but it is not authoritative.

### 3.6 The "placement of natural persons" phrasing in Polish staffing-agency context

§4(a) uses "recruitment or selection of natural persons" (not "placement"). However, EEJ as agencja pracy literally **places** workers under Polish Temporary Employment Act semantics — the agencja is the legal employer, and the worker is leased to a user-employer for placement. The Polish term *pośrednictwo pracy* (job intermediation) is the activity §4(a) is targeting in part.

**Two possible interpretive frames:**

1. **§4(a) covers both recruitment (selecting from candidates) and placement (matching candidates to user-employers).** Under this reading, EEJ's matching is squarely within §4(a) regardless of which action is being described — selection, recruitment, or placement.
2. **§4(a) covers selection-into-employment (the recruitment funnel), and the act of "placing" a worker who is already an EEJ employee at a specific user-employer is post-hire workforce management under §4(b).** Under this reading, the matchScore applied to existing EEJ workers being placed at user-employers might fall under §4(b) (task-allocation based on personal traits), not §4(a).

The English "placement" in §4(a) ("place targeted job advertisements") refers to ad placement, not worker placement. So the §4(a) text does not directly address worker-placement-at-user-employer. **This is an important Polish-specific interpretive question — Question 2 in Section 9.**

EEJ's pragmatic position: the matching surface operates both for new candidate intake (§4(a) territory) and for placing existing EEJ workers at new client engagements (§4(b) ambiguous). The architectural intervention (Q1 HYBRID) is designed to fall outside both §4(a) high-risk and §4(b) task-allocation high-risk regardless of which framing applies.

### 3.7 Where EEJ's redesigned matching sits relative to §4(a)

**Within §4(a) literally** (because EEJ uses an AI system for recruitment/selection of natural persons), but **arguing for Article 6(3) exemption** (because the redesigned system is narrow procedural + preparatory and does not profile).

This is structurally identical to APATRIS's §7 analysis (commit `bf4d92b`): both platforms argue that they fall within an Annex III category but qualify for an exemption. The exemption mechanisms differ — APATRIS argues the §7 "by or on behalf of competent public authorities" qualifier does not apply; EEJ argues Article 6(3)(a)+(d). But the structural posture is the same: not contesting Annex III applicability, contesting high-risk classification.

---

## Section 4 — Hybrid path mapping under §4(a)

### 4.1 The redesigned system in detail

**Layer 1 — Eligibility filtering (binary lawful checks).** For each candidate-job pairing, the system evaluates:

| Check | Source of authority | Binary outcome |
|---|---|---|
| Work-permit validity for this position (`stanowisko`) | Art. 88 Ustawa o promocji zatrudnienia / Ustawa o rynku pracy 2025 | Eligible / Not-eligible |
| TRC validity (third-country nationals) | Art. 114 Ustawa o cudzoziemcach | Eligible / Not-eligible / Art. 108 protection pending |
| Oświadczenie validity (eligible nationalities) | Art. 88z Ustawa o promocji zatrudnienia | Eligible / Not-eligible |
| BHP training current | Art. 237³ Kodeks Pracy | Eligible / Not-eligible |
| Medical exam current (badania lekarskie) | Art. 229 Kodeks Pracy | Eligible / Not-eligible |
| Required certification held (e.g., EN ISO 9606-1 for welding job) | Job posting requirements | Eligible / Not-eligible |
| Placement-type compatibility (agency-leased vs. job's `prohibitedForAgency` flag — Gap 1) | Art. 8 Ustawa o zatrudnianiu pracowników tymczasowych | Eligible / Not-eligible |
| Assignment-duration eligibility (18/36-month rolling window for agency-leased) | Art. 20 Ustawa o zatrudnianiu pracowników tymczasowych — gated on `placement_type='agency_leased'` per Gap 4 | Eligible / Blocked |
| Schengen days remaining (non-permit foreign workers) | Schengen 90/180-day rule + Art. 108 Ustawa o cudzoziemcach | Eligible / Risk-flagged |
| Position-permit binding (Gap 2 — pending) | Art. 88 Ustawa o promocji zatrudnienia | Future eligibility check |

Each gate is an independent binary verification on externally-defined legal criteria. No weighting, no aggregation into a score.

**Layer 2 — Factual presentation.** Among eligible candidates, the system displays operationally relevant facts:

- Years of experience (factual, from worker record)
- Specific certifications held (factual, from worker record)
- Current `assignedSite` (factual, from worker record)
- Prior placements at the user-employer (factual, from `eej_assignments` history)
- Language proficiency declared (factual, from worker record)
- Document expiry dates (factual, from worker record)
- Worker availability dates (factual, from worker record)

**No** composite score. **No** percent match. **No** color-coded ranking signal. **No** ordered ranking by system-assigned priority. The default order can be alphabetical, chronological by application date, or geographic — but not by any system-derived "fit score."

**Layer 3 — Recruiter decision.** The recruiter selects the candidate to place based on facts and operational judgment. The recruiter can apply their own filters (location, availability date, specific certifications) but the system does not recommend, weight, or rank. The placement decision is recorded in the existing pipeline (`pipeline_stage` transition, `eej_assignments` insert) with audit logging.

### 4.2 Article 6(3)(a) mapping in detail

**Condition (a) — narrow procedural task.** Each eligibility check listed in 4.1 Layer 1 is independently a discrete legal verification. The recital framing of "narrow procedural task" in the AI Act preamble (Recital 53 references) emphasizes that the system performs a specific, well-defined task with limited scope. EEJ's eligibility filtering meets this:

- **Specific:** each gate corresponds to one legal provision.
- **Well-defined:** the check is binary against an external authoritative source.
- **Limited in scope:** the gate does not extend beyond the legal verification it implements.

The aggregation of multiple narrow procedural tasks (multiple binary gates running in sequence) does not transform them into an evaluative judgment. Each is independently narrow and procedural.

**Counterargument and response.** Counsel may argue that the *combination* of gates creates an evaluative composite. Response: the combination produces a binary eligible/not-eligible outcome at the candidate-level, not a graded evaluation. Eligible candidates pass; ineligible candidates do not. There is no "more eligible" or "less eligible." This is consistent with how, for example, voter-eligibility checks (multiple binary gates: age, citizenship, registration) are not treated as an evaluation of the person.

### 4.3 Article 6(3)(d) mapping in detail

**Condition (d) — preparatory task.** Layer 2 (factual presentation) prepares information for human assessment. Article 6(3)(d) is satisfied when the system performs preparatory work and the actual assessment is carried out by a human. EEJ's design:

- The system displays facts; the recruiter assesses.
- The system does not synthesize, summarize evaluatively, or recommend.
- The recruiter's decision is independent and exercises operational judgment.

**Distinction from "decision-influencing task."** A system that ranks or recommends, even if a human formally signs off, is influencing the decision; this would not qualify under (d). The redesigned system explicitly avoids this: there is no system-generated ranking or recommendation. The human is not selecting from a prioritized list; the human is selecting from an unranked list of eligible candidates.

### 4.4 Profiling caveat — does the redesigned system profile?

GDPR Article 4(4) profiling: "automated processing of personal data consisting of the use of personal data to evaluate certain personal aspects relating to a natural person."

**The redesigned system processes personal data** (worker name, nationality, jobRole, document expiries, etc.). This is undisputed.

**The redesigned system does NOT evaluate personal aspects.** The eligibility filter checks legal facts about the person (does the permit cover this position?); it does not produce a judgment about the person's performance, suitability, reliability, or other GDPR Article 4(4)-enumerated aspects. The factual presentation displays objective data; it does not evaluate.

**A careful counter-reading:** a check of "TRC validity" involves a personal aspect (residency status). Therefore the system uses personal-aspect data in the processing. This is true, but the *use* is not *evaluation* in the Article 4(4) sense. The system does not infer something about the person from the residency status; it checks whether the legal authorization to work in this position exists. The legal authorization is an external fact, not a personal-aspect inference.

**This is not airtight.** A determined regulator could argue that any check involving residency, employment history, or qualification data is an evaluation of personal aspects in a wide reading. The architectural intervention is designed to make the narrow reading defensible, but the line is interpretive. **Counsel input needed (Question 1).**

### 4.5 Architecture-pending: what must change in code

The classification argument depends on the architectural intervention being implemented. As of 2026-04-29 (HEAD `b5cb28e`), the production matchScore is PARTIALLY USED with the legacy numeric scoring still in `routes/jobs.ts:125-159` and `:244-280`. The hybrid path requires:

| Change | Location | Estimated effort | Status |
|---|---|---|---|
| Remove numeric scoring in POST /jobs/:id/apply | `routes/jobs.ts:127-165` | 3-5 hours | Pending |
| Remove numeric scoring in GET /jobs/:id/matches | `routes/jobs.ts:244-280` | 3-5 hours | Pending |
| Public-application path stops writing matchScore="0" | `routes/workers.ts:184` | 1-2 hours | Pending |
| Replace ApplicationsTab badge (matchScore color-coded) with neutral display | `eej-mobile-HIDDEN/src/pages/tabs/ApplicationsTab.tsx:143-152` | 2-3 hours | Pending |
| Replace ATSPipelineTab badge with neutral display | `eej-mobile-HIDDEN/src/pages/tabs/ATSPipelineTab.tsx:135-144` | 2-3 hours | Pending |
| Drop or null `job_applications.matchScore` column writes; retain for historical read but stop writing | `db/schema.ts:351`, all insert sites | 2-3 hours (data-migration consideration) | Pending |
| Implement `matchReasons` as eligibility-checklist (kept), separate from any scoring | `routes/jobs.ts` | 3-5 hours | Pending — utility from Q1 hybrid |
| Close auth-gating gap at `GET /api/jobs/:id` (audit Rank 3) | `routes/jobs.ts:38` | 2-4 hours | Pending |
| Close Gap 1 — Art. 8 prohibition list | New schema + matching filter | 6-10 hours | Pending |
| Close Gap 2 — position-specific permit binding | Schema + matching filter + intake form | 8-14 hours | Pending |
| Close Gap 3 — equal-pay parity check | Schema + comparator + validation gate | 10-18 hours | Pending |
| Close Gap 5 — jobRole taxonomy (KZiS code) | Schema + lookup + intake UI | 12-20 hours | Pending |
| Documentation: system role, recruiter role, eligibility-vs-evaluation distinction | New docs | 4-6 hours | Pending |
| Audit logging captures eligibility decisions (not "score") | Existing audit infrastructure | 2-3 hours | Pending |

**Aggregate implementation estimate:** approximately 60-95 engineering hours to fully realize the architectural intervention. This is the work that follows Phase 3 (counsel-ready write-up) and counsel sign-off. Each item above can be its own commit/Task following the Step 3 / Gap 4 atomic-commit pattern.

The classification argument **cannot be defended under audit** until this implementation is complete. Phase 3 should make this dependency explicit: "the not-high-risk classification depends on the architectural intervention being implemented; we are committing to that implementation as part of the classification posture."

### 4.6 Audit trail and documentation requirements

For the not-high-risk classification to be defensible, the following documentation must exist:

- **Article 6(4) non-high-risk-assessment record.** A written record explaining why the system does not pose a significant risk and which 6(3) conditions apply. This is mandated by Article 6(4) for systems claiming the exemption.
- **System role documentation.** The system's role is "eligibility filtering and factual presentation"; it does not evaluate, rank, or recommend.
- **Recruiter role documentation.** The recruiter performs the evaluation and makes the placement decision. Recruiter training materials should reflect this.
- **Eligibility-vs-evaluation distinction documentation.** Internal and external documentation must consistently describe what the system does (binary lawful checks + facts) versus what it does not do (evaluation, ranking, recommendation).
- **Audit logging discipline.** Eligibility decisions are logged; the recruiter's selection is logged; no system-generated "score" is logged (because none exists post-redesign).

This documentation is part of the architecture-pending work (estimated ~4-6 hours for the documentation alone, separate from code changes).

---

## Section 5 — Article 8 and conformity requirements (if high-risk)

This section documents what is required IF the not-high-risk argument fails and EEJ's recruitment AI is classified as high-risk. Even with the Section 4 hybrid argument, this fallback inventory serves two purposes: (i) provides counsel a defensive posture if the not-high-risk argument is challenged; (ii) identifies which conformity requirements EEJ's existing compliance encoding partially meets.

### 5.1 Article 8 — compliance with Title III Chapter 2

> "High-risk AI systems shall comply with the requirements laid down in this Section, taking into account the generally acknowledged state of the art." (Article 8(1))

The "Section" referenced is Articles 9-15. Compliance is mandatory throughout the system's lifecycle (Article 8(2)). The provider is responsible for compliance; the deployer has separate obligations (Section 6).

### 5.2 Article 9 — Risk management system

> "A risk management system shall be established, implemented, documented and maintained in relation to high-risk AI systems." (Article 9(1))

Required elements (Article 9(2)):
- (a) Identification and analysis of known and reasonably foreseeable risks to health, safety, or fundamental rights.
- (b) Estimation and evaluation of risks that may emerge under intended use and reasonably foreseeable misuse.
- (c) Evaluation of other risks possibly arising based on post-market monitoring data.
- (d) Adoption of appropriate and targeted risk-management measures.

**EEJ's existing partial coverage:**

- **Audit logging** (`audit_entries` table): immutable trail of decisions. Partial coverage of post-market monitoring (9(2)(c)).
- **Contract reclassification scanner** (`agency-compliance-engine.ts:632-693`): identifies workers at PIP-reclassification risk. Partial coverage of risk identification (9(2)(a)).
- **placement_type tracking** (Gap 4 closure): scopes Art. 20 enforcement correctly. Partial coverage of risk evaluation (9(2)(b)).
- **First-contact verification** (`first-contact-verification.ts`): flags Schengen-day risks at intake. Partial coverage of risk identification.
- **Compliance status dashboard** (T1 ExecutiveHome): surfaces critical / warning / compliant counts. Partial coverage of post-market monitoring.

**Gaps:**

- No formal risk register specific to the recruitment AI.
- No documented risk-management measures specific to algorithmic decisions.
- No documented testing of failure modes (e.g., what happens if a worker's TRC expires between eligibility check and placement?).

### 5.3 Article 10 — Data and data governance

> "High-risk AI systems which make use of techniques involving the training of AI models with data shall be developed on the basis of training, validation and testing data sets that meet the quality criteria referred to in paragraphs 2 to 5." (Article 10(1))

**EEJ's recruitment AI is rule-based, not learned.** The matchScore computes from hand-coded conditional logic; there is no training data set. Article 10's training-data-quality requirements are largely inapplicable. However, the *general* data-governance requirements (10(2)) still apply:

> "Training, validation and testing data sets shall be subject to data governance and management practices appropriate for the intended purpose of the AI system. Those practices shall concern in particular: (a) relevant design choices; (b) data collection processes and the origin of data...; (c) relevant data preparation processing operations...; (d) the formulation of assumptions, in particular with respect to the information that the data are supposed to measure and represent; (e) an assessment of the availability, quantity and suitability of the data sets that are needed; (f) examination in view of possible biases that are likely to affect the health and safety of natural persons, have a negative impact on fundamental rights or lead to discrimination prohibited under Union law, especially where data outputs influence inputs for future operations; (g) appropriate measures to detect, prevent and mitigate possible biases identified..."

For a rule-based system, the analogous requirements are about the *input data* (worker records, job postings) and the *rule design*:

- **Input data quality:** does the worker record have correct data? (TRC expiry, work-permit position, BHP status). EEJ's 33 encoded constraints (regulatory framework inventory Section 2) provide the data-quality validation layer.
- **Rule design assumptions:** the eligibility rules encode legal requirements; the assumptions are documented in the regulatory citations on each rule (e.g., "Art. 88 work permit position-binding").
- **Bias examination — the central concern.** Two specific input-axes have been flagged in audit v2 Section 9 as protected-characteristics-adjacent:
  - The 3-year experience cliff in legacy matchScore (`+20 if experience >= 3 years`) functions as an age proxy. Removing this in the hybrid path eliminates the cliff.
  - TRC and work-permit validity as eligibility criteria are structurally available only to non-EU candidates (TRC = third-country-national permit). This is *legally required* — Polish law requires the agency to verify work authorization. But the use of these criteria in a "compliance bonus" scoring is what creates the proxy. Removing the bonus in the hybrid path eliminates the proxy effect; using the criteria as a binary lawful gate is verification, not bias.

**Gaps:**

- Gap 1 (Art. 8 prohibition list) — without this taxonomy, the system has no data-governance discipline around prohibited-work-type matching.
- Gap 5 (jobRole free-text) — without taxonomy, the input data has no controlled vocabulary; this is a data-quality gap directly relevant to Article 10.

### 5.4 Article 11 — Technical documentation

> "The technical documentation of a high-risk AI system shall be drawn up before that system is placed on the market or put into service and shall be kept up-to date. The technical documentation shall be drawn up in such a way to demonstrate that the high-risk AI system complies with the requirements set out in this Section." (Article 11(1))

Annex IV specifies the contents. For a rule-based system:

- **General description** (Annex IV §1): system intended purpose, who interacts with it (recruiters), version.
- **Detailed description of elements and process of development** (Annex IV §2): the rule logic, the input fields, the eligibility gates.
- **Information about monitoring, functioning and control** (Annex IV §3): how the system is monitored in production (audit logging, T1 dashboard).
- **Description of the appropriateness of the performance metrics** (Annex IV §4): for rule-based systems, the metrics are pass/fail of eligibility checks, not predictive accuracy.
- **Risk management system as referred to in Article 9** (Annex IV §5): cross-reference to Section 5.2 above.
- **Description of any change made to the system through its lifecycle** (Annex IV §6): git history is the source of truth.
- **List of harmonised standards applied in full or in part** (Annex IV §7): unclear if any AI-specific harmonised standards apply to rule-based systems; counsel input.
- **A copy of the EU declaration of conformity** (Annex IV §8): required if high-risk; not yet drafted.
- **Detailed description of the system in operation enabling the assessment of its compliance** (Annex IV §9): operational documentation.

**Gaps:** EEJ has no Annex IV technical documentation drafted. The git history, the `STEP3_PLAN.md`, and the `architecture-boundaries.md` substitute partially but are not Annex IV-compliant. Drafting Annex IV documentation is approximately 20-40 hours of work.

### 5.5 Article 13 — Transparency and provision of information to deployers

> "High-risk AI systems shall be designed and developed in such a way as to ensure that their operation is sufficiently transparent to enable deployers to interpret a system's output and use it appropriately." (Article 13(1))

For EEJ, the provider and the deployer are likely the same legal entity (EEJ Sp. z o.o.). Article 13 still applies; it just means EEJ provides information to itself. The information must include:

- (Article 13(3)(a)) identity and contact details of the provider
- (Article 13(3)(b)) characteristics, capabilities, and limitations of performance, including:
  - intended purpose
  - level of accuracy, robustness, cybersecurity (Article 15)
  - any known or foreseeable circumstance that may lead to risks
  - performance regarding specific groups (bias notices)
  - input data specifications
  - output and limitations
- (Article 13(3)(c)) changes during lifecycle
- (Article 13(3)(d)) human oversight measures (Article 14)
- (Article 13(3)(e)) computational and hardware resources
- (Article 13(3)(f)) expected lifetime and maintenance

**EEJ's existing partial coverage:**

- The `STEP3_PLAN.md` and `architecture-boundaries.md` describe parts of the system but not in Article 13 form.
- The audit log captures changes (13(3)(c)).
- The compliance dashboard surfaces system state but is not deployer-facing documentation.

**Gaps:** A formal Article 13 deployer-information document does not exist. Drafting estimate: 8-12 hours.

### 5.6 Article 14 — Human oversight

> "High-risk AI systems shall be designed and developed in such a way... that they can be effectively overseen by natural persons during the period in which the AI system is in use." (Article 14(1))

Required oversight measures (Article 14(4)):

- (a) Properly understand the relevant capacities and limitations
- (b) Remain aware of the possible tendency of automatically relying on or over-trusting the output (automation bias)
- (c) Correctly interpret the high-risk AI system's output
- (d) Decide not to use the AI system or otherwise disregard, override or reverse the output
- (e) Intervene on the operation of the high-risk AI system or interrupt the system through a "stop" button or similar procedure

**EEJ under the redesigned system has structural human oversight by design.** The recruiter selects from facts; the system makes no recommendation. This is stronger oversight than typical (where the system recommends and the human can override). However, the documentation of this oversight must exist:

- Recruiter training materials (currently informal)
- Operational guidance (when to question the eligibility filtering — e.g., a worker flagged as ineligible for a TRC reason that may have an Art. 108 protection)
- Stop / override procedures (recruiter can manually add an ineligible worker if they have authoritative information the system lacks; this should be auditable)

**Gaps:** Formal Article 14 documentation does not exist. Estimate: 6-10 hours.

### 5.7 Article 15 — Accuracy, robustness, cybersecurity

> "High-risk AI systems shall be designed and developed in such a way that they achieve an appropriate level of accuracy, robustness, and cybersecurity, and that they perform consistently in those respects throughout their lifecycle." (Article 15(1))

**Accuracy** for a rule-based eligibility filter: the rules must correctly implement the legal requirements they encode. Accuracy is testable: given a worker's data, does the system correctly determine whether the work permit covers the job's position? Test coverage:

- Unit tests on individual rules: partial (existing).
- Integration tests on full eligibility chain: partial (Gap 4 added 8 placement_type tests; total integration tests 176 + 1 todo).
- End-to-end tests against production data: not currently in scope (production data not in test environments).

**Robustness:** can the system handle adversarial inputs (e.g., a worker with deliberately corrupted record fields)? This is partially addressed by Stage 4 PII encryption and Stage 4 input validation but not specifically tested as adversarial robustness.

**Cybersecurity:**

- Auth-gating at the API layer (Stage 4 hardening).
- The known auth-gating gap at `GET /api/jobs/:id` (audit Rank 3) is a relevant exposure; it returns worker PII unauthenticated. **Closing this gap is required for Article 15 defensibility.**
- JWT-based auth, refresh tokens, rate limiting (Stage 1).

**Gaps:**

- The auth-gating gap is the most important cybersecurity item to close before claiming Article 15 compliance.
- Adversarial robustness testing has not been performed.
- Accuracy validation against production data has not been performed (no Path 2a-equivalent for production data review).

### 5.8 Conformity assessment process — Article 43

If high-risk and not exempt under Article 6(3), Article 43 specifies the conformity assessment procedure. For Annex III systems (other than those listed in §1, biometric ID), the procedure is **internal control (Annex VI)** unless harmonised standards exist and are applied (Annex VII third-party). EEJ would conduct the internal control assessment.

**Internal control under Annex VI:**

- Provider verifies that quality management system (Article 17) complies.
- Provider examines technical documentation (Article 11).
- Verifies system has been designed/developed in conformity with Articles 8-15.
- Affixes CE marking (Article 48).
- Draws up EU declaration of conformity (Article 47).
- Registers in EU database (Article 49).

**Time/cost estimate:** 40-80 hours of internal-control assessment work; €0 for the assessment itself (no notified body fee for internal control); CE marking and declaration of conformity are administrative.

### 5.9 Summary of conformity-requirement coverage

| Article | Requirement | EEJ existing coverage | Gap |
|---|---|---|---|
| 9 | Risk management | Audit log, scanner, dashboard (partial) | Formal risk register, documented mitigations |
| 10 | Data governance | 33 encoded constraints (partial) | Bias examination, jobRole taxonomy, formal data documentation |
| 11 | Technical documentation | Git history, plans, boundaries doc (partial) | Annex IV-compliant document |
| 13 | Transparency to deployers | None formal | Article 13 deployer document |
| 14 | Human oversight | Structural via redesigned system (strong) | Recruiter training docs, override procedures, stop button doc |
| 15 | Accuracy / robustness / cybersecurity | Tests, encryption, auth (partial) | Auth-gating gap closure, adversarial robustness, accuracy validation |
| 43+47+48+49 | Conformity assessment | None | Internal control assessment, CE marking, declaration of conformity, EU database registration |

**Aggregate fallback-conformity estimate** (if Article 6(3) argument fails): 100-180 hours of work in addition to the architectural intervention.

---

## Section 6 — Articles 16-29 obligations on providers and deployers

### 6.1 Provider vs deployer determination — Article 25

EU AI Act Article 3 (definitions):

- **Provider** (Article 3(3)): "a natural or legal person, public authority, agency or other body that develops an AI system or a general-purpose AI model or that has an AI system or a general-purpose AI model developed and places it on the market or puts it into service under its own name or trademark, whether for payment or free of charge."
- **Deployer** (Article 3(4)): "a natural or legal person, public authority, agency or other body using an AI system under its authority except where the AI system is used in the course of a personal non-professional activity."

**EEJ's situation:**

- EEJ Sp. z o.o. developed the recruitment AI internally.
- EEJ uses the recruitment AI internally for its own staffing-agency operations.
- EEJ does not currently make the recruitment AI available to other companies as a SaaS product (SaaS multi-tenancy at Stage 4 is for EEJ's own future expansion, not third-party deployment).

Under the strict text of Articles 3(3) and 3(4), EEJ is **both provider and deployer**. As provider: developed and put into service under its own name. As deployer: uses the system for its own activities.

**Article 25 — Responsibilities along the AI value chain.** When the same entity is both provider and deployer, the provider obligations dominate. EEJ as provider must satisfy Articles 16-19; EEJ as deployer must satisfy Article 26.

If EEJ later expands to multi-tenant SaaS where other staffing agencies use EEJ's recruitment AI, those tenants would be the deployers and EEJ would remain the provider. **Out of scope for Phase 2** — current state is single-tenant EEJ-only deployment.

**Counsel question (Question 9 in Section 9):** confirm provider/deployer classification, especially the implications if EEJ later opens the platform to other tenants.

### 6.2 Article 16 — Provider obligations

> "Providers of high-risk AI systems shall: (a) ensure that their high-risk AI systems are compliant with the requirements set out in Section 2 [Articles 9-15]; (b) indicate on the high-risk AI system or, where that is not possible, on its packaging or its accompanying documentation, as applicable, their name, registered trade name or registered trade mark, the address at which they can be contacted; (c) have a quality management system in place that complies with Article 17; (d) keep the documentation referred to in Article 18; (e) keep the logs referred to in Article 19, when these are under their control; (f) ensure that the high-risk AI system undergoes the relevant conformity assessment procedure as referred to in Article 43, prior to its placing on the market or putting into service; (g) draw up an EU declaration of conformity in accordance with Article 47; (h) affix the CE marking to the high-risk AI system or, where that is not possible, on its packaging or its accompanying documentation, to indicate the conformity with this Regulation, in accordance with Article 48; (i) comply with the registration obligations referred to in Article 49(1); (j) take the necessary corrective actions and provide information as required in Article 20; (k) upon a reasoned request of a national competent authority, demonstrate the conformity of the high-risk AI system with the requirements set out in Section 2; (l) ensure that the high-risk AI system complies with accessibility requirements in accordance with Directives (EU) 2016/2102 and (EU) 2019/882."

**This list is conditional on the system being high-risk.** If Article 6(3) exempts EEJ's recruitment AI, none of (a)-(l) attach. If the exemption fails, all of (a)-(l) attach.

### 6.3 Article 17 — Quality management system

Provider must implement a QMS including:

- Strategy for regulatory compliance, including conformity assessment procedures.
- Techniques, procedures, and systematic actions for the design, design control, design verification of the high-risk AI system.
- Examination, test, validation procedures (Article 17(1)(c)).
- Technical specifications and standards.
- Systems and procedures for data management.
- Risk management system.
- Post-market monitoring (Article 72).
- Procedures for serious incident reporting.
- Communication with national authorities and other relevant authorities, including notified bodies and customers.
- Systems and procedures for record-keeping of all relevant documentation and information.
- Resource management, including security supply.
- Accountability framework.

**Estimate to draft a QMS:** 40-60 hours, plus ongoing maintenance.

### 6.4 Article 18 — Documentation kept by providers

Article 18(1): Providers shall keep at the disposal of competent authorities for a period of 10 years after the high-risk AI system has been placed on the market or put into service:

- (a) Technical documentation referred to in Article 11.
- (b) Documentation concerning the quality management system referred to in Article 17.
- (c) Documentation concerning changes approved by notified bodies (if applicable).
- (d) Decisions and documents issued by notified bodies (if applicable).
- (e) EU declaration of conformity referred to in Article 47.

EEJ's existing 10-year retention policy on personnel files (`agency-compliance-engine.ts:502, 506-508`, basis `Kodeks Pracy Art. 94(9a)`) provides the retention infrastructure but is not specifically scoped to AI-system documentation. Extension to cover AI documentation is straightforward.

### 6.5 Article 19 — Logs

> "Providers of high-risk AI systems shall keep the logs, referred to in Article 12(1), automatically generated by their high-risk AI systems, to the extent such logs are under their control."

Article 12 logging requirements (records of events). For EEJ's audit-log infrastructure:

- `audit_entries` table: captures pipeline_stage transitions, JOB_POSTING creates, PLACEMENT_TYPE changes, etc.
- Step 3 added `client_activities` (whatsapp_approval), `notifications` (channel='whatsapp'), `whatsapp_messages.approved_by/at`.
- This logging infrastructure partially satisfies Article 12+19 but does not specifically capture eligibility-filter decisions or the recruiter's selection event from a list.

**Gap:** the eligibility-filter decision events (which workers were filtered out and why) are not currently logged. Adding this logging is approximately 4-8 hours.

### 6.6 Article 26 — Deployer obligations

> "Deployers of high-risk AI systems shall take appropriate technical and organisational measures to ensure they use such systems in accordance with the instructions for use accompanying the systems..."

Specific deployer obligations (Article 26):

- (1) Take measures to use system per provider instructions.
- (2) Assign human oversight to natural persons with necessary competence, training, authority.
- (3) Ensure relevance of input data (where the deployer controls input data).
- (4) Monitor operation of the system based on instructions.
- (5) Inform the provider in case of serious incidents.
- (6) Keep logs automatically generated by the system, to the extent under deployer control.
- (7) Cooperate with national competent authorities.
- (8) Inform natural persons subject to the AI system's decisions if applicable (e.g., candidates).
- (9) Conduct fundamental rights impact assessment if applicable (Article 27).
- (10) For workplace use of high-risk AI: inform workers' representatives and affected workers (Article 26(7)).

**Article 26(7) is highly relevant for EEJ.** Workplace use of high-risk AI (recruitment is workplace-related) requires informing workers' representatives (where present) and the workers themselves before deployment. Polish workforce-relations specifics: works councils (`rady pracownicze`) under the Act on Information and Consultation of Employees of 7 April 2006 may apply if EEJ has 50+ employees. **Counsel input needed** on whether the agency-leased workforce counts toward this threshold.

**Article 27 — Fundamental rights impact assessment.** Required for deployers in certain categories, including (Article 27(1)) deployers that are public authorities or private operators providing public services, and other specific categories. Not directly applicable to EEJ as private staffing agency. **Counsel input needed (Question 4)** on edge cases.

### 6.7 Article 50 — Transparency obligations for certain AI systems

Article 50 covers transparency obligations distinct from Article 13. It applies to:

- (1) AI systems intended to interact directly with natural persons — providers must ensure persons are informed they are interacting with AI.
- (2) Generative-AI / synthetic content — content marked as AI-generated.
- (3) Emotion recognition / biometric categorisation — natural persons informed.
- (4) Deep fakes — disclosure required.

**EEJ's recruitment AI does not interact directly with natural persons in the Article 50(1) sense.** The candidates do not interact with the matching system; the recruiter does. The candidates submit applications via a public form; that is not "interacting with an AI system" under the Article 50(1) framing (it is data submission to a system).

However, if EEJ adds a candidate-facing chatbot (CV scanning at intake currently uses Claude Vision; the candidate uploads, the system extracts), the candidate is *implicitly* interacting with AI. **Counsel input needed (Question 10 in Section 9)** on whether EEJ's existing CV-scan flow at `routes/workers.ts:117-128` requires Article 50 disclosure.

### 6.8 Summary of provider/deployer obligation coverage

| Article | Obligation | EEJ as provider | EEJ as deployer | Status |
|---|---|---|---|---|
| 16 | Provider general obligations | Conditional on high-risk classification | n/a | Triggered if 6(3) argument fails |
| 17 | QMS | Required if high-risk | n/a | Drafting estimate 40-60 hours |
| 18 | Documentation retention | Required if high-risk | n/a | Existing 10-year retention covers structure |
| 19 | Logs | Required if high-risk | Required (Article 26(6)) | Audit-log infrastructure partial; eligibility-decision logging gap |
| 26 | Deployer obligations | n/a | Always (regardless of classification) | Partial coverage; Article 26(7) workforce-info gap |
| 27 | Fundamental rights impact assessment | n/a | Conditional on category | Likely not applicable to EEJ as private agency; counsel input |
| 50 | Transparency to natural persons | Required for direct-interaction AI | Required for direct-interaction AI | CV-scan flow needs counsel review |

---

## Section 7 — Polish regulatory overlay

### 7.1 Kodeks Pracy anti-discrimination

The Polish Labour Code anti-discrimination provisions are the most operationally consequential overlay on EEJ's recruitment AI.

**Art. 11³ KP** (general anti-discrimination):

> "Jakakolwiek dyskryminacja w zatrudnieniu, bezpośrednia lub pośrednia, w szczególności ze względu na płeć, wiek, niepełnosprawność, rasę, religię, narodowość, przekonania polityczne, przynależność związkową, pochodzenie etniczne, wyznanie, orientację seksualną, zatrudnienie na czas określony lub nieokreślony, zatrudnienie w pełnym lub w niepełnym wymiarze czasu pracy — jest niedopuszczalna."

(Any discrimination in employment, direct or indirect, in particular on grounds of sex, age, disability, race, religion, nationality, political opinions, trade-union membership, ethnic origin, religion, sexual orientation, employment on a fixed-term or open-ended basis, full-time or part-time employment, is impermissible.)

**Art. 18³ᵃ KP** (right to equal treatment):

> "Pracownicy powinni być równo traktowani w zakresie nawiązania i rozwiązania stosunku pracy, warunków zatrudnienia, awansowania oraz dostępu do szkolenia w celu podnoszenia kwalifikacji zawodowych..."

(Workers should be treated equally in respect of establishing and terminating the employment relationship, conditions of employment, promotion, and access to training...)

**Art. 18³ᵇ KP** (definition of direct and indirect discrimination):

- Direct discrimination: when a worker is, for one or more of the prohibited reasons, treated less favourably than another worker is, has been, or would be treated in a comparable situation.
- Indirect discrimination: when an apparently neutral provision, criterion, or practice puts persons of a particular protected group at a particular disadvantage compared with others, unless that provision, criterion, or practice is objectively justified by a legitimate aim and the means of achieving that aim are appropriate and necessary.

**Art. 18³ᶜ KP** (equal pay for equal work):

> "Pracownicy mają prawo do jednakowego wynagrodzenia za jednakową pracę lub za pracę o jednakowej wartości."

(Workers have the right to equal pay for equal work or for work of equal value.)

**Art. 18³ᵈ KP** (positive action / objective justification): exception for objectively justifiable measures aimed at promoting equal opportunity.

**Art. 18³ᵉ KP** (burden of proof): if a worker alleges discrimination and presents facts from which discrimination may be presumed, the burden shifts to the employer to prove that no discrimination occurred.

**Application to the redesigned system:**

- **Direct discrimination risk:** the redesigned system does not score on any prohibited ground directly. The eligibility filters (TRC, work permit) check work authorization, not nationality per se — but the structural availability of these filters only to non-EU workers is relevant for indirect-discrimination analysis.
- **Indirect discrimination risk:** the eligibility filters are objectively justified (Polish law requires the agency to verify work authorization). The objective-justification defence under Art. 18³ᵇ is strong. Counsel review needed (Question 5) on whether the practice is "appropriate and necessary."
- **Equal pay parity (Art. 18³ᶜ + Art. 15 Temp Work Act):** Gap 3 in regulatory framework inventory. Not yet encoded. The redesigned matching does not directly score on pay, but the absence of an equal-pay verification at placement creates a structural compliance exposure.
- **Burden of proof (Art. 18³ᵉ):** EEJ must be able to demonstrate no discrimination if challenged. The audit-log infrastructure plus the rule-based (transparent, explainable) eligibility filtering supports this defence. The hybrid path's documented system-role / recruiter-role distinction further supports the defence.

### 7.2 RODO (GDPR) overlay

**Art. 6 RODO — lawful basis for processing recruitment data.** EEJ processes worker personal data on:

- Article 6(1)(b) — performance of contract (the worker's employment contract with EEJ).
- Article 6(1)(c) — legal obligation (Polish labour law, Foreigners Act, RODO retention obligations).
- Article 6(1)(f) — legitimate interests (the agency's matching workers to client placements).

For *candidate* (pre-hire) data, the legal basis is typically:

- Article 6(1)(b) — pre-contractual measures at the data subject's request.
- Article 6(1)(a) — consent (for retention beyond the single application).

**Art. 9 RODO — special categories.** EEJ does not intentionally process special-category data in the matching surface. However:

- Nationality may indicate ethnic origin (Article 9(1)).
- Health data (medical exam status) is special-category under Article 9.
- Religion (oświadczenie religijne) is not collected.
- Sexual orientation is not collected.

The matching system uses nationality (in display, not in scoring per the hybrid path) and uses medical-exam status (binary eligibility gate). **Counsel input needed (Question 5)** on whether the eligibility use of medical-exam status under Art. 229 KP qualifies for the Article 9(2)(b) exception (employment law obligation).

**Art. 22 RODO — automated decision-making.** Article 22(1):

> "The data subject shall have the right not to be subject to a decision based solely on automated processing, including profiling, which produces legal effects concerning him or her or similarly significantly affects him or her."

**The redesigned system is designed to fall outside Art. 22.** The decision to place a worker is made by a human recruiter, not "solely" by automated processing. The eligibility filtering is automated, but it does not produce the placement decision; it produces a list of eligible candidates, from which the recruiter selects.

**Counter-argument:** if the eligibility filter excludes a candidate, that exclusion is an automated decision affecting the candidate. Under a strict reading, the eligibility filter itself triggers Article 22 even if the placement decision does not.

**Counter-counter-argument:** the eligibility filter implements a legal requirement (the worker either has the work permit or does not). Article 22(2)(b) exempts decisions "authorised by Union or Member State law to which the controller is subject" — which arguably covers Polish law-mandated eligibility verification. Article 22(2)(a) exempts decisions "necessary for entering into, or performance of, a contract" — which covers the agency's pre-contractual matching activity.

**Counsel input needed (Question 10).**

**Data minimization (Art. 5(1)(c)) and purpose limitation (Art. 5(1)(b)):** the redesigned system displays only operationally necessary facts, not all worker data. This supports compliance.

**Retention (Art. 5(1)(e), Art. 17):** EEJ's 33 encoded retention rules (regulatory framework inventory Section 2.5) provide the retention infrastructure. Candidate-CV retention is set to 0 years with consent-based extension (Art. 17 right to erasure default).

### 7.3 Foreigners Act (Ustawa o cudzoziemcach)

**Art. 87 Ustawa o promocji zatrudnienia / Ustawa o rynku pracy 2025** (work permit requirement):

> Foreigners (third-country nationals) require work authorization to work legally in Poland.

**Art. 88** (work permit types): Type A (employer-bound), Type B (board members), Type C (intracompany transfer), Type D (project-based), Type E (other), Seasonal, Oświadczenie (24-month declaration for eligible nationalities).

**Art. 88 position-specific binding** (interpretive, codified in implementing regulations): work permits are issued for a specific position (`stanowisko`) at a specific user-employer (`pracodawca użytkownik`). Change of position or user-employer generally requires permit amendment or new permit. **Gap 2 in regulatory framework inventory** — EEJ stores `permit_type` and `permit_expiry` but not `permit_position` or `permit_user_employer`.

**Art. 88z** (oświadczenie for eligible nationalities — Ukrainian, Belarusian, Georgian, Moldovan, Armenian): 24-month employment declaration filed at PUP (Powiatowy Urząd Pracy).

**Art. 88i** (employer notification obligations): 7-day commencement, 14-day non-commencement, 15-business-day termination notifications to voivode.

**Art. 108 Ustawa o cudzoziemcach** (filing-continuity protection): if a foreigner files a TRC application before the previous title expires, the right to stay and work is preserved during decision-pending. Encoded in `legal-decision-engine.ts:122-179`.

**Art. 114** (single permit — TRC + work): combined residency-and-work card.

**Art. 118** (employer change during TRC): change of employer during TRC requires modification or new application.

**Art. 139a-139f** (employer notification obligations under Foreigners Act, distinct from Art. 88i Promocji Zatrudnienia).

**Application to the redesigned system:**

- TRC validity is a binary lawful eligibility gate (per Section 4.1 Layer 1).
- Work-permit validity is similarly a binary gate.
- Position-specific permit binding (Gap 2) is currently unenforced at matching time; closing this gap is part of the architectural intervention's Section 4.5 list.
- Oświadczenie validity is encoded (`oswiadczenie_expiry` field, Specustawa/CUKR tracker for Ukrainian workers).
- Art. 108 protection logic is integrated into eligibility evaluation via `legal-decision-engine.ts`.

### 7.4 Temporary Employment Act (Ustawa o zatrudnianiu pracowników tymczasowych)

This is the central staffing-agency statute for EEJ. Detailed analysis in `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` Section 3. Key provisions for §4(a) intersection:

**Art. 7** — tripartite agency / user-employer / worker structure.

**Art. 8 ust. 1** — work prohibitions for agency-leased workers:

> Agency-leased workers (`pracownicy tymczasowi`) cannot perform: (1) particularly dangerous work (`prace szczególnie niebezpieczne`), including work at heights and certain construction; (2) replacement of striking workers; (3) replacement of permanent staff dismissed in the prior 3 months for reasons not attributable to the worker; (4) certain weapons-related work.

**Gap 1 in regulatory framework inventory** — not yet encoded. Closing it adds eligibility filters (Section 4.1 Layer 1) for prohibited-work detection. The §4(a) classification argument is strengthened by treating these as eligibility (not evaluation) gates.

**Art. 14a** — assignment record retention (3 years / 36 months). Encoded; gates on `placement_type='agency_leased'` per Gap 4 closure.

**Art. 15** — equal pay parity:

> Agency-leased workers must receive equivalent pay and conditions to user-employer permanent staff in the same role.

**Gap 3 in regulatory framework inventory** — not yet encoded. Crosses with Art. 18³ᶜ KP (Section 7.1).

**Art. 20** — 18/36-month assignment duration limits. Encoded; gates on `placement_type='agency_leased'` per Gap 4 closure (`agency-compliance-engine.ts:172-181`).

### 7.5 Promocji Zatrudnienia / Ustawa o rynku pracy 2025

**Art. 88i** (voivode notifications): encoded (`agency-compliance-engine.ts:412-431`).

**Art. 305-329, Art. 323** (KRAZ registry, Marshal annual report): encoded (`agency-compliance-engine.ts:281-397`).

These are entity-level obligations, not per-worker matching obligations; they intersect with the AI Act only insofar as the deployer (EEJ) must remain a registered staffing agency to operate.

### 7.6 Polish AI Act implementation status

As of 2026-04-29, Poland is implementing the EU AI Act through national legislation. The Polish AI implementation law has been:

- Accepted by the Council of Ministers (Rada Ministrów) on 2026-03-31.
- Currently in Sejm review as of 2026-04-29 (per APATRIS research at `bf4d92b`).
- Not yet enacted.

Two supervisory authorities are anticipated:

- **KRiBSI** (Krajowa Rada ds. Bezpieczeństwa Sztucznej Inteligencji) — the proposed primary AI supervisory authority for general AI Act enforcement.
- **UODO** (Urząd Ochrony Danych Osobowych) — Polish DPA, advisory + supplemental supervisory in justice / border / police domains; also primary for RODO-track issues.

**Counsel input needed (Question 12)** on the precise jurisdictional scope of KRiBSI vs UODO for recruitment-AI matters.

The Polish AI implementation law is expected to address:
- National authority structure
- Enforcement procedures
- Penalty levels (within EU AI Act limits)
- National-specific high-risk additions or exemptions (if any)
- Training and certification of AI compliance officers

EEJ's posture: monitor the legislation as it progresses through Sejm; align EEJ documentation with both the EU Act (in force) and the Polish law (forthcoming) once enacted.

---

## Section 8 — Regulatory framework interaction analysis

### 8.1 Where the frameworks reinforce each other

**Polish anti-discrimination ↔ EU AI Act Article 10 (data governance + bias).** Compliance with Art. 11³, 18³ᵃ, 18³ᵇ, 18³ᶜ KP requires bias avoidance in recruitment processes. Article 10 of the EU AI Act requires bias examination in input data and rule design. The redesigned matching's removal of the experience-cliff and TRC/permit-validity-bonus addresses both frameworks simultaneously.

**RODO Article 22 ↔ AI Act Article 14 (human oversight).** Both require meaningful human involvement in decisions affecting natural persons. The hybrid path's recruiter-led decision-making satisfies both. Compliance with one establishes the architectural posture for the other.

**Foreigners Act position-specific permits ↔ AI Act Article 6(3)(a) (narrow procedural task).** The position-permit binding check (when Gap 2 closes) is a discrete legal verification. It implements Polish law and qualifies as a narrow procedural task under EU AI Act, simultaneously.

**Polish staffing-agency Art. 8 prohibitions ↔ AI Act §4(a) eligibility framing.** Closing Gap 1 (prohibition list) adds eligibility filters that are simultaneously Polish-law-compliant and §4(a) preparatory-task-compliant. The two frameworks point to the same architectural change.

**Polish 33 encoded constraints ↔ AI Act Article 10 data governance.** EEJ's existing compliance encoding provides the data-quality and lawful-basis foundation that Article 10 builds on. Compliance with Polish law is a precondition for, not a duplicate of, AI Act compliance.

### 8.2 Where the frameworks diverge

**Polish staffing-agency-specific obligations have no EU AI Act counterpart.** Art. 8 prohibitions, Art. 15 equal-pay, Art. 20 18/36-month limits attach to EEJ as agencja pracy specifically. APATRIS as outsourcing does not bear these obligations. The §4(a) classification analysis is shared between platforms; the agency-vehicle obligations are not.

**EU AI Act Article 6(3) profiling caveat is more restrictive than RODO Article 22's direct-decision framing.** Article 22 focuses on the *decision*'s automation; Article 6(3) profiling caveat focuses on the *processing*'s evaluation of personal aspects. A system can satisfy Article 22 (human decides) but still fail the Article 6(3) profiling caveat (system evaluates). The hybrid path is designed to satisfy both, but the boundaries are distinct.

**Polish Kodeks Pracy burden-of-proof reversal (Art. 18³ᵉ) has no direct EU AI Act counterpart.** EEJ must be able to defend non-discrimination affirmatively if challenged in Polish court. The AI Act does not impose a similar burden-shift, but Article 13 (transparency) and Article 14 (human oversight) documentation supports the Polish-law defence.

**RODO retention and AI Act documentation retention have different anchors.** RODO Article 5(1)(e) requires data not be kept longer than necessary for the purpose. AI Act Article 18 requires provider documentation to be kept for 10 years after the system is placed on the market. The retention periods for *the data* and for *the documentation about the data* differ.

### 8.3 Where compliance with one informs the other

**33 encoded constraints inform Article 10.** The data-governance discipline already in EEJ (BHP gates, medical gates, work-auth gates, retention rules) is the Polish-law foundation that Article 10 examination builds on. Drafting the Article 10 documentation can largely cite the existing encoded discipline.

**placement_type classifier (Gap 4) supports Article 14 + Polish staffing-agency law.** Recruiters can correctly understand when Art. 20 enforcement applies (only for agency-leased) and act appropriately. Article 14 (human oversight competence) is supported by this clarity.

**Audit-log infrastructure supports Article 19 + Art. 18³ᵉ KP burden of proof.** EEJ can demonstrate non-discrimination by referencing the audit log of placement decisions and eligibility-filter outputs.

### 8.4 Where additional architectural work is needed for both frameworks

**Closing Gap 1 (Article 8 prohibition list)** supports Polish staffing-agency law (mandatory) and EU AI Act eligibility-filtering correctness (strengthens 6(3)(a) argument).

**Closing Gap 3 (equal-pay parity)** supports Polish law (Art. 15 + Art. 18³ᶜ) and EU AI Act bias avoidance (Article 10). Without this, EEJ has a structural compliance exposure on equal-pay parity that intersects with both frameworks.

**Closing Gap 5 (jobRole taxonomy)** supports Polish position-specific permits (precondition for Gap 2) and EU AI Act input-data quality (Article 10). Free-text jobRole undermines both.

**Closing the auth-gating gap at GET /api/jobs/:id** supports EU AI Act Article 15 (cybersecurity) and RODO Article 32 (security of processing). Production has worker PII exposed at an unauthenticated endpoint; this fails both frameworks.

### 8.5 Cross-framework summary table

| Architectural item | EU AI Act provision | Polish law provision | Status |
|---|---|---|---|
| placement_type classifier | Article 14 (human oversight) | Art. 20 Temp Work Act enforcement scoping | Live (Gap 4 v100) |
| Eligibility filtering removes ranking | Article 6(3)(a)+(d) | Art. 18³ᵇ indirect discrimination | Pending (architectural intervention) |
| Factual presentation (no scoring) | Article 6(3) profiling caveat avoidance | Art. 22 RODO automated-decision avoidance | Pending |
| Art. 8 prohibition list | §4(a) eligibility framing | Art. 8 ust. 1 Temp Work Act | Pending (Gap 1) |
| Position-permit binding | §4(a) narrow procedural task | Art. 88 Ustawa o promocji zatrudnienia | Pending (Gap 2) |
| Equal-pay parity | Article 10 bias avoidance | Art. 15 Temp Work Act + Art. 18³ᶜ KP | Pending (Gap 3) |
| jobRole taxonomy | Article 10 data governance | Art. 88 position-binding precondition | Pending (Gap 5) |
| Auth-gating at GET /jobs/:id | Article 15 cybersecurity | Art. 32 RODO security | Pending (audit Rank 3) |
| Audit-log eligibility events | Article 19 logs | Art. 18³ᵉ KP burden of proof | Pending (incremental) |
| Article 6(4) non-high-risk-assessment record | Article 6(4) | n/a | Pending (Phase 3 deliverable) |
| Annex IV technical documentation (fallback) | Article 11 | n/a | Pending only if 6(3) fails |
| QMS (fallback) | Article 17 | n/a | Pending only if 6(3) fails |
| EU declaration of conformity (fallback) | Article 47 | n/a | Pending only if 6(3) fails |

---

## Section 9 — Refined counsel question candidates

Each question is structured for counsel-ready posing. The question text is intended to be cited verbatim in Phase 3's counsel handoff packet. "Why it matters" provides the regulatory/operational context. "What EEJ needs" specifies the form of the counsel response sought. "Priority" indicates urgency for Phase 3 finalization.

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

## Section 10 — Open questions and limitations

### 10.1 What the research could not definitively resolve

- **Specific Commission interpretive guidance on §4(a) and Article 6(3).** As of 2026-04-29, the Commission's Article 6(4) implementing acts and the §4(a)-specific guidance documents have draft status or limited binding effect. Authoritative Commission interpretation is incomplete.
- **Profiling-caveat boundary under Article 6(3).** The textual analysis in Section 2.5 identifies the line between verification (favorable) and evaluation (unfavorable), but the line is interpretive. Counsel validation is required (Question 1).
- **§4(a) "evaluation" criterion scope.** Section 3.5 identifies narrow vs wide readings. The narrow reading supports EEJ's classification posture; counsel's authoritative reading is needed.
- **Whether Polish enforcement agencies (PIP, KRAZ Marshal, voivode, KRiBSI when established) would interpret EEJ's classification under §4(a) consistently with the EU-level analysis.** No published Polish-side enforcement guidance exists as of research date.
- **The placement_type='direct_outsourcing' classification's effect on §4(a) analysis.** Section 4 frames this for agency_leased; direct-outsourcing workers are EEJ-employed but not under Temp Work Act framing. Whether their §4(a) analysis differs is an open question (Question 4 partially addresses).
- **The CV-scan path's Article 50 disclosure status.** Section 6.7 flags this; Question 10 asks counsel.

### 10.2 What requires counsel input

- The 13 questions in Section 9 are the explicit counsel-input items.
- Validation of the Article 6(3) classification reasoning is the central counsel item.
- Confirmation that the architectural intervention is sufficient.
- Guidance on Polish-implementation-law-specific provisions once enacted.

### 10.3 What requires further architectural decisions

- Implementation of the hybrid path in code (Section 4.5 list). This is engineering work, separate from Phase 3 counsel-ready write-up, sequenced after counsel validation.
- Closing of Gap 1 (Art. 8 prohibition list), Gap 2 (position-permit binding), Gap 3 (equal-pay parity), Gap 5 (jobRole taxonomy). Each is its own work item.
- Closing of the auth-gating gap at `GET /api/jobs/:id` (audit Rank 3).
- Drafting of the Article 6(4) non-high-risk-assessment record (Phase 3 deliverable).
- Drafting of fallback Articles 8-15 conformity documentation if Article 6(3) argument is not validated (Section 5 inventory; ~100-180 hours).

### 10.4 What is out of scope for Phase 2 and Phase 3

- The actual implementation of the redesigned matching (separate engineering work, sequenced after Phase 3 counsel validation).
- The counsel engagement itself (separate process; Q3 single-counsel-engagement decision logistics).
- The closing of the gaps (each is its own work item with own scope).
- §4(b) post-hire workforce management analysis (separate Annex III category, separate research; out of scope per Phase 1 scope and Phase 2 spec).
- Other EEJ AI surfaces (eej-copilot, regulatory intelligence, immigration search) that may have their own §4(a) or other-Annex-III exposure (out of scope per Phase 1 scope).

### 10.5 Sections deferred to Phase 2.5 or Phase 3

None. All 10 H2 sections are completed within the time-box. Phase 3 (counsel-ready write-up) is the next document, separate from this research-mode work.

### 10.6 Phase 3 direction implications from Phase 2 findings

Three findings materially affect Phase 3's write-up:

1. **The architectural intervention is unfinished.** Section 4.5 inventories ~60-95 hours of implementation work that the not-high-risk classification depends on. Phase 3 must surface this dependency clearly: counsel's validation is conditional on EEJ committing to and timeline-ing the implementation. Phase 3 cannot present the redesigned system as a fait accompli; it must present it as a documented architectural commitment.
2. **The profiling caveat is the load-bearing interpretive question.** Section 2.5 is the most consequential single sub-section. Phase 3 must structure the counsel handoff packet such that this question receives the most-direct counsel attention; ambiguity here collapses the entire not-high-risk argument.
3. **Polish-staffing-agency-specific interactions matter more than Phase 1 anticipated.** Section 7 (Polish overlay) and Section 8 (interaction analysis) reveal that several Gap items (1, 3, 5) are simultaneously Polish-law and EU AI Act items. Phase 3 should bundle the §4(a) classification with the Polish-law gap closure plan as a single architectural commitment, not as parallel tracks.

---

*End of EEJ EU AI Act §4(a) Phase 2 research.*

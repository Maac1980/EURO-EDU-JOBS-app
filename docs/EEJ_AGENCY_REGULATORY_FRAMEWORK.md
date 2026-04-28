# EEJ Agency Regulatory Framework — Encoded Constraints and Gap List

## Section 1 — Frame and companion documents

**Date:** 2026-04-28
**Author:** EEJ Claude Code (commissioned by Manish Shetty, Founder/Partner, EEJ Sp. z o.o.)
**Repository:** `Maac1980/EURO-EDU-JOBS-app`
**Repo HEAD at start of work:** `305eb08`
**Purpose:** Inventory the Polish staffing-agency (agencja pracy) compliance constraints that EEJ already encodes in code, with regulatory citations, and identify gaps where no encoding exists. This document is a foundational reference, not a regulatory analysis.

**Scope:** EEJ as `agencja pracy tymczasowej` placing foreign workers under Polish temporary-employment law. The inventory covers what EEJ enforces *today* in production code; the gap list flags what is *not* enforced. This is a codebase-grounded mapping, not a from-scratch reading of Polish law.

**Out of scope for this document:** EU AI Act §4(a) classification analysis, design recommendations for closing gaps, general Kodeks Pracy overview beyond agency intersection, RODO general analysis, Foreigners Act general overview beyond the position-binding intersection.

**Companion documents:**

| Document | Path | Commit | Role |
|---|---|---|---|
| EU AI Act Annex III §4(a) Recruitment Research Scope (Phase 1) | `docs/EU_AI_ACT_ANNEX_III_4A_RECRUITMENT_RESEARCH_SCOPE.md` | `305eb08` | Phase 1 scope for recruitment-AI research; this framework will be cited from Phase 2 |
| EEJ-APATRIS Consolidation Audit | `docs/EEJ-APATRIS-CONSOLIDATION-AUDIT.md` | `2b67a5c` | Cross-platform audit identifying agency-vs-immigration boundary |

**Convention:** Citations use the form `path:line` for code locations, and Polish article references in the form used by the source files (e.g., `Art. 20 Ustawa o zatrudnianiu pracowników tymczasowych`, `Art. 237³ KP`).

---

## Section 2 — Inventory of encoded constraints

This section enumerates each constraint EEJ currently enforces in code, with regulatory basis, encoding location, and enforcement type. Enforcement types:

- **Hard block:** the system refuses to proceed (HTTP 400 / blocking response, placement refused)
- **Warning:** the system surfaces the issue but does not block
- **Audit-only:** the system records the state for later inspection but does not act on it

### 2.1 Placement gates (hard blocks)

| Constraint | Regulatory basis | Encoded at | Enforcement |
|---|---|---|---|
| BHP training missing or expired blocks placement | Art. 237³ Kodeks Pracy | `services/agency-protection.ts:531-534` | Hard block via `POST /v1/agency/placement-check` (returns 400 + blocker list, fine risk up to 60,000 PLN) |
| Medical exam (badania lekarskie) missing or expired blocks placement | Art. 229 Kodeks Pracy | `services/agency-protection.ts:537-541` | Hard block via same endpoint |
| Work authorization missing or expired blocks placement | (general illegality of unauthorized employment) | `services/agency-protection.ts:543-549` | Hard block; fine risk "Up to 50,000 PLN (illegal employment)" cited in code at `agency-protection.ts:557` |
| Contract type incompatible with permit type blocks placement | "Work permit specifies permitted contract type. Mismatch invalidates the permit" | `services/agency-protection.ts:228-280` (rules table at lines 232-239) | Hard block via `POST /v1/agency/validate-contract` (HTTP 400, fine risk 3,000-50,000 PLN per worker) |
| 18-month assignment cumulative limit reached blocks placement at same user-employer | Art. 20 Ustawa o zatrudnianiu pracowników tymczasowych | `services/agency-compliance-engine.ts:172-181` | Hard block via `POST /v1/agency/assignments` (HTTP 400, fine risk 1,000-30,000 PLN, returns next-eligible date 36 months from start) |

### 2.2 Schengen / pre-placement risk gates

| Constraint | Regulatory basis | Encoded at | Enforcement |
|---|---|---|---|
| Candidate <10 Schengen days remaining cannot be placed without Art. 108 or valid permit | Schengen 90/180-day rule + Art. 108 Ustawa o cudzoziemcach | `services/first-contact-verification.ts:508` | Risk-level guidance returned in candidate intake (CRITICAL on overstay) |
| Schengen 80+ days used flags candidate for expedited MOS filing before placement | Schengen 90/180-day rule | `services/first-contact-verification.ts:506-507` + `docs/knowledge-hub/workflows/status-dashboard.ts:188-194` (rule `schengen_80_day_flag`) | Warning |
| Status `EXPIRED_NOT_PROTECTED` or `NO_PERMIT` flags candidate as not-placeable | Art. 87 Ustawa o promocji zatrudnienia | `docs/knowledge-hub/workflows/status-dashboard.ts:174-186` (rule `expired_no_permit`) | Warning (dashboard-only `show_alert`) |
| Schengen 90+ overstay → "do NOT place, consult lawyer" | Art. 108 Ustawa o cudzoziemcach (lapsed protection) | `services/first-contact-verification.ts:516` | Warning |

### 2.3 Voivode / labour office notification deadlines

| Constraint | Regulatory basis | Encoded at | Enforcement |
|---|---|---|---|
| 7-day commencement report to labour office on `WORK_START` | Art. 88i ust. 1 Ustawa o promocji zatrudnienia | `services/agency-compliance-engine.ts:412-418` | Audit-only (deadline row inserted into `eej_compliance_deadlines`); fine risk 1,000-10,000 PLN |
| 14-day non-commencement report on `NON_COMMENCEMENT` | Art. 88i ust. 2 | `services/agency-compliance-engine.ts:421-425` | Audit-only deadline row |
| 15-business-day voivode termination notification on `WORK_END` | Art. 88i ust. 7 | `services/agency-compliance-engine.ts:427-431` | Audit-only deadline row |
| Annex 1 signature countdown (20/25/28-day reminders, expired = Art. 108 protection lost) | Art. 108 Ustawa o cudzoziemcach | `services/agency-protection.ts:163-220` | Warning + dashboard alerts via `GET /v1/agency/annex1-tracker` |
| Contract submission required before work starts (new Foreigners Act, Aug 2025) | "New foreigners act Aug 2025" | `services/agency-compliance-engine.ts:418` | Audit-only deadline row; fine risk 1,000-3,000 PLN per worker |

### 2.4 KRAZ registry and Marshal reporting

| Constraint | Regulatory basis | Encoded at | Enforcement |
|---|---|---|---|
| KRAZ registration tracker (without KRAZ = operating illegally) | Art. 305-329, Ustawa o rynku pracy i służbach zatrudnienia (20 March 2025) | `services/agency-compliance-engine.ts:281-397` (POST `/v1/agency/kraz`, GET annual report) | Audit-only registration record; fine risk "100,000 PLN for operating without KRAZ" |
| Annual Marshal report generator | Art. 323 Ustawa o rynku pracy i służbach zatrudnienia | `services/agency-compliance-engine.ts:329, 381` | Generator endpoint; penalty "miss 2 years = KRAZ deletion = business closure" |

### 2.5 Document retention rules

The retention table at `services/agency-compliance-engine.ts:501-512` encodes ten retention rules, each with regulatory basis. The agency-relevant entries:

| Document type | Years | Regulatory basis | Source line |
|---|---|---|---|
| Personnel file | 10 | Kodeks Pracy Art. 94(9a) | `:502` |
| Payroll record | 5 | Ustawa o rachunkowości | `:503` |
| Foreign-worker docs (post-employment) | 2 | Ustawa o warunkach dopuszczalności | `:504` |
| Candidate CV (no consent) | 0 | GDPR Art. 17 (delete within 3 months) | `:505` |
| Contract | 10 | Kodeks Pracy Art. 94(9a) | `:506` |
| BHP cert | 10 | Kodeks Pracy Art. 94(9a) | `:507` |
| Medical cert | 10 | Kodeks Pracy Art. 94(9a) | `:508` |
| **Assignment record** | **3 (36 months)** | **Art. 14a Ustawa o pracownikach tymczasowych** | **`:509`** |
| ZUS declaration | 5 | Ustawa o systemie ubezpieczeń społecznych | `:510` |
| Tax record | 5 | Ordynacja podatkowa | `:511` |

Enforcement: **audit-only** (delete-after dates scheduled into `eej_retention_schedule`; the system does not auto-delete on the date — it surfaces the queue at `GET /v1/agency/retention/due` for manual action).

### 2.6 Foreigners Act and KPA references (decision-engine-grade)

The `services/legal-decision-engine.ts` rule engine evaluates worker authorization status against eighteen citations (`legal-intelligence.ts:28-47`). These are not placement-blocking by themselves but inform `legalStatus` (NO_PERMIT, EXPIRED_NOT_PROTECTED, PROTECTED_PENDING, EXPIRING_SOON, VALID), which downstream gates consume. The agency-relevant entries:

- **Art. 87 Ustawa o promocji zatrudnienia** — work permit obligation; cited when no permit / no TRC / no oświadczenie / no pending TRC application (`legal-decision-engine.ts:113`) and on expiry-without-protection (`:210`).
- **Art. 88 Ustawa o promocji zatrudnienia** — work permit types A-E (`legal-intelligence.ts:34`).
- **Art. 88z** — oświadczenie (24-month declaration), used for Ukrainian/Belarusian and other listed nationalities (`legal-intelligence.ts:35`, `legal-decision-engine.ts:267`).
- **Art. 108 ust. 1 pkt 2 Ustawa o cudzoziemcach** — TRC filing-continuity protection (right to stay/work while TRC pending if filed before previous title expired); evaluated at `legal-decision-engine.ts:122-179`. Five conditions evaluated: filed-before-expiry, employer continuity, role continuity, formal defect, evidence (MoS stamp / UPO).
- **Art. 114 Ustawa o cudzoziemcach** — single permit (TRC + work) (`legal-intelligence.ts:31`).
- **Art. 118 Ustawa o cudzoziemcach** — change of employer during TRC (`legal-intelligence.ts:32`).
- **Art. 139a-139f Ustawa o cudzoziemcach** — employer notification obligations (`legal-intelligence.ts:46`).
- **Art. 64 KPA** — formal-defect 7-day correction window (`legal-intelligence.ts:37`).
- **Art. 35-36 KPA** — processing time limits (`legal-intelligence.ts:38`).
- **Art. 127 KPA** — appeal right (14 days) (`legal-intelligence.ts:36`).
- **Art. 73 KPA** — right to inspect files (`legal-intelligence.ts:39`).
- **Art. 10 KPA** — right to be heard before decision (`legal-intelligence.ts:45`).
- **Art. 22¹ Kodeks Pracy** — employment contract requirements (`legal-intelligence.ts:41`).
- **Art. 36 Ustawy o sus** — 7-day ZUS registration deadline (`legal-intelligence.ts:44`).
- **Directive 96/71/EC** — posted workers (`legal-intelligence.ts:42`).

Enforcement: **warning + audit-only** (the engine returns a `riskLevel`, `legalBasis`, `requiredActions` payload that downstream UI surfaces for recruiter action).

### 2.7 Specustawa / CUKR Ukrainian-worker tracker

| Constraint | Regulatory basis | Encoded at | Enforcement |
|---|---|---|---|
| Specustawa end date (2026-03-04) tracking | Specustawa for Ukrainian Citizens (post-war refugee provisions) | `services/agency-protection.ts:297, 359` | Warning |
| CUKR card application deadline (2027-03-04) tracking | CUKR — Special Act for Ukrainian Citizens | `services/agency-protection.ts:298, 339, 346, 360` | Warning |
| PESEL UKR-photo deadline (2026-08-31) tracking | Specustawa (PESEL-related provisions) | `services/agency-protection.ts:299` | Warning |
| Workers needing CUKR transition flagged as `EXPIRED_NEEDS_CUKR` / `NO_PERMIT_CHECK_CUKR` | Same | `services/agency-protection.ts:316-319` | Warning via `GET /v1/agency/ukrainian-tracker` |

### 2.8 BHP and risk-assessment templates

The contract-template seed at `services/legal-kb.service.ts:103-116` includes three BHP / risk-assessment artifacts that are mandatory for agency placements:

- **`Zakres obowiązków`** (job scope) — `services/legal-kb.service.ts:103-104`. Required for new workers; binds duties to `job_role` and `assigned_site`.
- **`Ryzyko zawodowe`** (occupational risk information) — `services/legal-kb.service.ts:105-106`. Required for new workers; explicit "Zidentyfikowane zagrożenia" / "Środki ochrony" sections; worker confirms acknowledgement. This is the document required under BHP regulations for the user-employer to inform the worker of position-specific hazards.
- **`Skierowanie na badania lekarskie`** (medical referral) — `services/legal-kb.service.ts:115-116`. Generated on new-worker / medical-expiring events.

Enforcement: **template-generation only** (the system can produce the document; it does not verify the document was signed or that hazards were identified before placement).

### 2.9 PIP inspection pack

The `GET /v1/agency/pip-pack/:workerId` endpoint at `services/agency-compliance-engine.ts:557-630` aggregates the data PIP would request in an unannounced inspection: contract on file, valid residence document, BHP status, medical status, PESEL, ZUS registration, payroll history (12 months), and a check that assignments are within the 18/36 limit. Returns a readiness score (READY / ALMOST_READY / NOT_READY).

Enforcement: **audit-only / readiness assessment**. The endpoint reports gaps; it does not block.

### 2.10 Contract reclassification scanner

`services/agency-compliance-engine.ts:632-695` (referenced earlier in the file at the P3 header) scans civil-contract workers (Zlecenie, Dzieło, B2B) for indicators that PIP could reclassify the contract to Umowa o Pracę.

Enforcement: **audit-only** (risk score and flags surfaced; no blocking).

---

## Section 3 — Temporary Employment Act gaps

The Ustawa z dnia 9 lipca 2003 r. o zatrudnianiu pracowników tymczasowych is the central statute governing agency-leased workers in Poland. EEJ encodes parts of it (Art. 14a retention, Art. 20 assignment limits) but does not encode others. This section maps the relevant Articles to encoding state.

### 3.1 Article 8 ust. 1 — work prohibitions (NOT ENCODED)

Article 8 ust. 1 lists categories of work that may not be performed by an agency-leased worker (`pracownik tymczasowy`). The four core prohibitions:

1. **Particularly dangerous work** (`prace szczególnie niebezpieczne`) — defined by Rozporządzenie Ministra Pracy in implementing regulations; commonly includes work at heights (`praca na wysokości`), confined-space work, certain construction tasks.
2. **Replacement of striking workers** (`zastępowanie pracowników biorących udział w strajku`) — agency workers cannot be placed at a user-employer to fill in for permanent staff on strike.
3. **Replacement of permanent staff dismissed for reasons not attributable to the worker in the prior 3 months** at the same workstation.
4. **Work requiring weapons / use of force** at the user-employer's premises (specific exclusion under separate provisions).

| Prohibition | Encoded? | Notes |
|---|---|---|
| Particularly dangerous work / height work | **NOT ENCODED** | No `prohibited_work_types` taxonomy on `job_postings`; no filter at matching time in `routes/jobs.ts`; no field on workers identifying that height-work medical clearance was obtained |
| Striking-worker replacement | **NOT ENCODED** | No client-state field tracking whether a user-employer has an active strike; no flag on `clients` or `eej_assignments` |
| Recently-dismissed-staff replacement | **NOT ENCODED** | No field on `clients` or `eej_assignments` tracking the user-employer's recent dismissals at the position |
| Weapons / force-using positions | **NOT ENCODED** | Same — no taxonomy, no filter |

The `Ryzyko zawodowe` template (`services/legal-kb.service.ts:105-106`) acknowledges hazards exist at a position but does not classify the position against Art. 8 prohibitions.

### 3.2 Article 14a — retention of assignment records (ENCODED)

Cited at `services/agency-compliance-engine.ts:509`: `ASSIGNMENT_RECORD: { years: 3, basis: "Art. 14a Ustawa o pracownikach tymczasowych (36 months)" }`. Retention rule applied via the document-retention scheduler.

### 3.3 Article 15 — equal pay parity (NOT ENCODED)

Article 15 of the Temporary Employment Act, reinforced by Art. 18³ᶜ Kodeks Pracy, requires that an agency-leased worker (`pracownik tymczasowy`) receive the same pay (and other working conditions) as a permanent worker of the user-employer doing the same or comparable work.

| Aspect | Encoded? | Notes |
|---|---|---|
| Hourly netto rate stored on workers | Yes (`workers.hourly_netto_rate`) | Field exists |
| User-employer comparator-pay reference | **NOT ENCODED** | No field on `clients` storing what permanent staff in the same role earn |
| Validation that worker rate ≥ comparator | **NOT ENCODED** | No code surface compares them |
| Equal-conditions parity (working hours, leave, training) | **NOT ENCODED** | No code surface |

### 3.4 Article 20 — assignment duration limits (ENCODED)

The 18-out-of-36-months rule is enforced as a hard block at `services/agency-compliance-engine.ts:172-181` and re-cited at `:200`, `:229`, `:273`. The 18-month rolling-window calculation runs at `getAssignmentDays()` (referenced by the same file) over `eej_assignments` rows.

### 3.5 Article 7 — agency-vs-user-employer relationship structure

Article 7 defines the tripartite structure (agency / user-employer / worker). EEJ has:
- `clients` table (user-employers) — yes
- `workers` table — yes
- Linking via `eej_assignments(worker_id, client_name | client_id, start_date, end_date)` — yes

But the *legal* tripartite obligations (which party is responsible for which BHP duty, which party signs which document) are not explicitly modelled. The `Zakres obowiązków` template binds duties to a single `assigned_site`/`job_role` without reference to the tripartite roles.

### 3.6 Other relevant Articles surfaced during inventory

- **Art. 9 (working time)** — agency workers' working-time rules. Not specifically encoded; general timesheet logic exists.
- **Art. 11 (probationary period)** — agency workers cannot be placed on a probationary period at the user-employer. Not encoded.
- **Art. 13 (information obligations to user-employer)** — agency must inform the user-employer of certain worker conditions before placement. Not encoded.
- **Art. 17 (leave entitlements)** — proportional leave for agency workers. Not encoded specifically (general leave logic exists).

These are flagged for completeness but are out of scope for the primary gap list (Section 5 captures the highest-impact gaps).

---

## Section 4 — Foreigners Act intersection

The Ustawa o cudzoziemcach (Foreigners Act) intersects with agency law principally at the position-binding question. This section examines that intersection.

### 4.1 Article 88 — work permit position-binding (PARTIALLY ENCODED)

Article 88 work permits are issued by the voivode (`wojewoda`) for a specific:
1. **Permit type** (Type A, B, C, D, E, or seasonal).
2. **User-employer** (the entity at whose premises the work is performed).
3. **Position / stanowisko** (the job title under which the permit is granted).
4. **Working time** (specific FTE or hours committed in the application).

If the worker changes any of (2), (3), or (4), the permit may need amendment or re-application.

| Field | Stored? | Where |
|---|---|---|
| Permit type | Yes | `workers.permit_type` (referenced via `legal-tracking-card.ts:152, 174`); `work_permit_applications.permit_type` (`schema.ts:401`) |
| Permit number | Yes | `workers.permit_number` (referenced via `legal-tracking-card.ts:152`) |
| Permit expiry | Yes | `workers.work_permit_expiry`, also `oswiadczenie_expiry`, `trc_expiry` |
| **Permit position (`stanowisko`)** | **NOT STORED as a dedicated field** | No `permit_position` column on `workers` or `work_permit_applications`. The `permit_type` enum is type-only (A/B/C/Seasonal/Oświadczenie/TRC), not position-name |
| **Permit user-employer (the specific user-employer the permit was issued for)** | **NOT STORED as a dedicated field** | The `eej_assignments` table records *current* assignments but does not link them to the *permit's* user-employer for cross-validation |
| Permit working-time (FTE / hours) | **NOT STORED** | No FTE field on `workers` or `work_permit_applications` |

### 4.2 Permit-position vs job-position cross-validation at matching (NOT ENCODED)

The matching logic at `routes/jobs.ts:125-159` (`POST /jobs/:id/apply`) and at `routes/jobs.ts:244-280` (`GET /jobs/:id/matches`) checks `worker.work_permit_expiry` and `worker.trc_expiry` for *expiry* only. There is no check that:

- the permit was issued for the *same position* as the job posting (`job.title` or `job.requirements`), or
- the permit was issued for the *same user-employer* as the job's `clientId`.

The closest existing check is the contract-permit cross-validation at `services/agency-protection.ts:241-280`, which validates `contractType` against `permitType` (umowa_o_prace / umowa_zlecenie / etc. against Type A / B / Seasonal / Oświadczenie / TRC). That check is **type-vs-type**, not **position-vs-position** or **employer-vs-employer**.

### 4.3 Position change requires new permit application (NOT FLAGGED IN WORKFLOW)

Under Art. 88 (and the implementing 2018 Rozporządzenie), a change of position generally requires either a permit amendment or a new permit application. This is the connection point to the immigration platform (APATRIS), which handles permit-amendment workflows.

| Requirement | Encoded? | Notes |
|---|---|---|
| When a worker is moved to a different position, flag that a permit amendment may be required | **NOT ENCODED** | No code path triggers a flag on `pipeline_stage` or `assigned_site` change |
| When a worker is moved to a different user-employer, flag that a new permit may be required | **PARTIALLY ENCODED via 18/36 limit** | The 18/36-month limit at `agency-compliance-engine.ts:172-181` blocks based on cumulative days at *one* user-employer, but does not cross-validate against the permit's own user-employer field (which doesn't exist as a stored field) |
| Hand-off to immigration platform (APATRIS) for amendment workflow | **NOT ENCODED** | EEJ has no integration that surfaces "this worker needs a permit amendment in APATRIS" |

### 4.4 Art. 118 Ustawa o cudzoziemcach — TRC employer change

Cited at `legal-intelligence.ts:32` ("Change of employer during TRC"). Used as a reference but no automated workflow currently checks `eej_assignments` against the TRC's recorded employer (no such field).

---

## Section 5 — Gap list

Five gaps prioritized by regulatory exposure and dependency relationships. Effort estimates are rough and exclude design / counsel review.

### Gap 1 — Article 8 ust. 1 prohibition list

- **Description:** EEJ has no `prohibited_work_types` taxonomy and no filter at matching time enforcing the Art. 8 ust. 1 prohibitions (particularly dangerous work, height work, striking-worker replacement, dismissed-staff replacement).
- **Regulatory basis:** Art. 8 ust. 1 Ustawa o zatrudnianiu pracowników tymczasowych.
- **Why it matters:** A placement that violates Art. 8 is illegal at inception. PIP fines and KRAZ-deletion risk attach. The agency may be liable to the worker for damages. The `Ryzyko zawodowe` template acknowledges the existence of hazards but does not classify positions against the prohibition list.
- **Current state:** Not encoded. No taxonomy, no filter, no field.
- **Effort to close (rough):** 6-10 hours. Requires (a) defining a `prohibited_work_types` enum or controlled-vocabulary list, (b) adding a `prohibitedForAgency: boolean` flag (or equivalent) on `job_postings`, (c) adding a filter in `routes/jobs.ts` matching logic, (d) UI to flag prohibited postings on creation. Striking-worker and dismissed-staff prohibitions are operationally harder because they depend on user-employer state EEJ does not currently hold.
- **Dependencies:** Gap 5 (jobRole taxonomy) — without a controlled vocabulary the prohibition matching is unreliable.

### Gap 2 — Position-specific permit binding

- **Description:** EEJ stores `workers.permit_type` (type A / B / Seasonal / etc.) and `workers.work_permit_expiry` but does not store the permit's `position` (stanowisko) or `user_employer`. The matching logic at `routes/jobs.ts` checks expiry only; it does not verify the permit was issued for the same position or the same user-employer as the job posting.
- **Regulatory basis:** Art. 88 Ustawa o promocji zatrudnienia (work permit issued for specific position and user-employer); Art. 118 Ustawa o cudzoziemcach (TRC employer change).
- **Why it matters:** Placing a worker on a job where the permit's recorded position or user-employer does not match invalidates the permit for that placement and constitutes illegal employment (fine risk 3,000-50,000 PLN per worker; existing `agency-protection.ts:270` already cites this fine band for the contract-vs-permit-type variant).
- **Current state:** Not encoded for position; not encoded for user-employer. Permit-type-vs-contract-type cross-validation IS encoded (`agency-protection.ts:228-280`), but this is a different axis.
- **Effort to close (rough):** 8-14 hours. Requires (a) adding `permit_position` and `permit_user_employer_id` columns to `workers` (or to `work_permit_applications` with a denormalization), (b) updating intake / OCR (`document-ocr.ts`) to extract these from the permit document, (c) adding cross-validation at matching time, (d) adding a flag on `assigned_site` / `pipeline_stage` change that the permit may need amendment, (e) UI surfaces.
- **Dependencies:** Gap 5 (jobRole taxonomy) — position-binding is unreliable if positions are free-text.

### Gap 3 — Equal-pay parity check

- **Description:** No code surface validates that an agency-leased worker's pay (and working conditions) match those of the user-employer's permanent staff in the same or comparable role.
- **Regulatory basis:** Art. 15 Ustawa o zatrudnianiu pracowników tymczasowych; Art. 18³ᶜ Kodeks Pracy.
- **Why it matters:** Equal-pay parity is the most-litigated obligation under the Temporary Employment Act. PIP audits routinely test it. Failure exposes the agency (and the user-employer jointly) to back-pay claims, PIP fines, and reputational risk. The user-employer is required to provide the pay-comparator information; the agency is required to act on it.
- **Current state:** Not encoded.
- **Effort to close (rough):** 10-18 hours. Requires (a) a comparator-pay field on `clients` (per-position, per-currency), (b) a workflow for the user-employer to declare comparator pay, (c) a validation gate on contract creation / rate change that flags when worker rate is below comparator, (d) UI for the user-employer to confirm the comparator declaration, (e) audit retention for the comparator declaration. A simpler precursor (without user-employer integration) is a "manual comparator entry by recruiter" gate, ~4-6 hours.
- **Dependencies:** Gap 5 (jobRole taxonomy) — comparator-pay lookup is unreliable if positions are free-text. Possibly Gap 4 (agency-vs-direct classifier) — the comparator check should only fire on agency-leased placements, not direct hires.

### Gap 4 — Agency-vs-direct-employment classifier

- **Description:** The `workers.contract_type` column distinguishes Zlecenie / Pracę / Dzieło / B2B but does not encode whether the worker is "leased through an agencja pracy tymczasowej" or "directly employed by the user-employer." EEJ's product-level assumption is that all workers are agency-leased through EEJ, but no field formalizes this.
- **Regulatory basis:** Definitional. Ustawa o zatrudnianiu pracowników tymczasowych applies only to `pracownicy tymczasowi` placed via an agencja. If a worker is directly employed (not through an agency), most of the Art. 8 / Art. 15 / Art. 20 obligations do not attach in the same form.
- **Why it matters:** Mis-classification could either over-apply agency rules (blocking placements that don't need to be blocked) or under-apply them (failing to enforce equal pay or 18-month limits where they do apply). For the §4(a) classification analysis (Phase 2 of the AI Act work), this distinction is needed to scope which placements the matchScore touches.
- **Current state:** Not encoded as an explicit boolean. Indirectly encoded by the assumption that all rows in `eej_assignments` are agency-leased (the table is named for it).
- **Effort to close (rough):** 4-6 hours. Add `placement_type` enum (`agency_leased` | `direct_hire`) to `workers` (or to `eej_assignments`), default to `agency_leased`, surface in onboarding / assignment creation, gate Art. 15 / Art. 8 / Art. 20 enforcement on it.
- **Dependencies:** None. Independently closable.

### Gap 5 — jobRole free-text without taxonomy

- **Description:** `workers.jobRole` is a free-text string (`text("job_role")`) populated from intake forms (`routes/workers.ts:114, 276`), CV OCR (`smart-ingest.ts:453, 511, 528`), and copilot tools (`eej-copilot.ts:186`). No controlled vocabulary, no PKD-code lookup, no KZiS-code lookup, no normalization. Job postings (`job_postings.title`, `job_postings.requirements`) are similarly free-text.
- **Regulatory basis:** Multiple constraints depend on a stable position vocabulary: Art. 8 prohibition list (Gap 1), Art. 88 position-binding (Gap 2), Art. 15 comparator-pay lookup (Gap 3), and Polish official statistics (Klasyfikacja Zawodów i Specjalności / KZiS) which is the official Polish occupation classification used by ZUS, GUS, PUP, and voivode applications.
- **Why it matters:** Most other gaps depend on this one. Without a controlled vocabulary, position-based filters and validations are unreliable (false positives and false negatives). The matchScore at `routes/jobs.ts:131-134` matches `jobRole` via `String.includes()` on the lowercase representation of `job.requirements` — this is a substring match, not a taxonomy match.
- **Current state:** Not encoded. Free text everywhere.
- **Effort to close (rough):** 12-20 hours. The minimum viable scope is (a) add a KZiS-code field alongside the free-text `job_role`, (b) seed the most-common 50-100 KZiS codes EEJ actually places into a lookup table, (c) UI dropdown on intake that lets staff pick a KZiS code while preserving free-text for legacy data, (d) backfill script for existing rows (best-effort matching). Full coverage of the ~2,500 KZiS codes is much larger.
- **Dependencies:** None as a precondition (it can be implemented standalone), but it unblocks Gaps 1, 2, and 3.

### Additional gaps surfaced during inventory (lower priority)

These are listed for completeness; sizing and prioritization are deferred:

- **Gap 6:** Striking-worker / recently-dismissed-staff state on `clients` table. (Subset of Gap 1.)
- **Gap 7:** No flag on `assigned_site` / `pipeline_stage` change that surfaces "permit amendment may be needed" (mentioned in Section 4.3). Subset of Gap 2.
- **Gap 8:** No FTE / working-time field on workers that can be cross-validated against the permit's working-time grant. Subset of Gap 2.
- **Gap 9:** No automated retention deletion. The retention scheduler at `agency-compliance-engine.ts:514-554` schedules dates and surfaces a "due" queue but does not auto-delete. GDPR Art. 17 right-to-be-forgotten is satisfied via manual action only.
- **Gap 10:** No structural model of the tripartite agency / user-employer / worker obligations. The data model treats clients, workers, and assignments as separate flat tables; the legal allocation of BHP / payroll / notification duties between agency and user-employer is implicit, not explicit.

---

*End of EEJ agency regulatory framework inventory.*

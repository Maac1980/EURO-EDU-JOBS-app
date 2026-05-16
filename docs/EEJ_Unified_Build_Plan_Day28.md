# EEJ Unified Build Plan (Day 28)

**Date:** 2026-05-16 (Day 28)
**Inputs synthesized:**
- **A** — Phase 1 audit findings (`docs/EEJ_vs_APATRIS_Feature_Audit_Day28.md`, commit `26012a6`)
- **B** — Existing Tier 2-5 plan + post-P5 follow-on candidates (CLAUDE.md `## CURRENT PRIORITY LIST`; P0-P6 close-out commits `2014276` through `af76ed3`)
- **C** — Manish's worker-side feature spec (Day 27 prompts, captured at full fidelity below — 9 core areas A-I with per-feature implementation requirements + W1/W2/W3 prioritization tiers + Polish-legal lens)

**Output:** ONE prioritized plan covering hardening + worker-side + scaffold-404 + mocks + schema cleanup.

---

## Section 1 — Executive summary

EEJ is post-P5 + P6-survey closed. The next-block question is where to focus build effort given (a) APATRIS has 14 worker-side primitives EEJ doesn't (mood/wellness AMBER, leave/messages/hours/push/coordinator-home GREEN); (b) Manish's worker-side roadmap defines 9 feature areas A-I with explicit W1/W2/W3 priority tiers; (c) the existing Tier 2-5 hardening backlog still has ~15 items including the upload-robustness pass, scaffold-404 backends, and static-mock tabs. The unified plan sequences **Tier 2 hardening first** (close P5-adjacent gaps, no new surface area), **then Tier W1 worker-essentials** (hours + late/absence one-tap + documents-with-push — three highest-leverage worker surfaces, all GREEN on Polish-legal), **then Tier 3 scaffold-404 backends** in parallel (build, don't hide), **then Tier W2 worker expansion** (no-show engine + leave + complaints + worker-AI), **then Tier 4 mocks** + **Tier 5 schema cleanup**, with **Tier W3 reliability/points + scenario simulator deferred** until KRAZ-defense risk is fully understood. Polish-legal-risk flag on every worker-side item; AMBER items design-checked before scope-locking; RED items deferred outright.

---

## Section 2 — Build phase ordering

Sequence (top = build next):

```
1.  Tier 2 hardening                  (close ~15 items; no new surface)
        ↓
2.  Tier W1 worker essentials         (3 surfaces: Hours, Late/absence, Docs-with-push)
        ↓
3.  Tier 3 scaffold-404 backends      (6 endpoints — Analytics, GPS, ContractHub, Skills, Shifts, Calendar)
        ↓
4.  Tier W2 worker expansion          (No-show engine, Leave, Complaints, Worker-AI)
        ↓
5.  Tier 4 static-mock tabs           (Updates, Salary, PayTransparency, AlertsRecent, OpsPipeline)
        ↓
6.  Tier 5 schema/enum cleanup        (pipeline stages, job roles, voivodeships, etc.)
        ↓
7.  Tier W3 deferred                  (Reliability/points, Scenario simulator)
```

Reasoning for the order:
- **Tier 2 first** because each P0-P6 commit assumed Tier 2 was waiting; hardening cleans up the floor before adding rooms.
- **Tier W1 second** (not Tier 3) because Manish's roadmap explicitly tags Hours / Late-absence / Docs as "highest leverage." Tier 3 scaffold-404 surfaces are lying to users today (they 404), but they're staff-side; Tier W1 is worker-side and Manish ships worker-side first per the post-P3-of-Day-27 prompt.
- **Tier 3 third** because the scaffold-404s are blocking staff workflows the existing user base relies on. Building these out unblocks Karan/Marj/Yana.
- **Tier W2 fourth** — after the W1 core is stable, expand with no-show engine + leave + complaints. No-show engine is the heaviest single item; better land after the W1 hours/GPS primitive is in production for shape data.
- **Tier 4 fifth** — static-mock cleanup is honesty work, but lower urgency than functional gaps.
- **Tier 5 sixth** — schema/enum consolidation is "rates" work; pays dividends across all surfaces but has no user-facing urgency.
- **Tier W3 last** — reliability/points carries Polish-legal HURT risk; scenario simulator is large scope. Both should land after KRAZ defense is established.

---

## Section 3 — Phase-by-phase detail

### Phase 1 — Tier 2 hardening (no new surface area)

From CLAUDE.md `## CURRENT PRIORITY LIST` + post-P5 candidates queued during P0-P6 reviews.

| Item | Scope | Polish-legal | Effort |
|---|---|---|---|
| 2.1 Token-key unification | Pick `eej_token` canonical, shim `eej_jwt` + `apatris_jwt`. ~20 surfaces. | GREEN | M |
| 2.2 Error-mask sweep | Add explicit `error` state to render decision tree. 5 surfaces flagged: lib/complianceAI.ts, lib/ai.ts, routes/regulatory.ts, services/legal-intelligence.ts, services/bilingual.ts | GREEN | M |
| 2.3 Replit-text purge | "Add to your Replit Secrets" → Fly-era guidance | GREEN | S |
| 2.4 Alerter SELECT-all-columns hardening | Tighten queries to explicit column lists | GREEN | S |
| 2.5 SubModuleBackBar dead-code removal | Remove unused back-bar (Pass 3 leftover) | GREEN | S |
| 2.6 Case C disambiguation re-ingest base64 cache | (carry-over from Day 26) | GREEN | M |
| 2.7 AddWorkerModal prefill-from-sessionStorage consumer | (carry-over) | GREEN | S |
| 2.8 CI test environment DATABASE_URL credential | Pipeline reliability | GREEN | S |
| 2.9 Upload-robustness pass | HTTP 413 body limits + multi-page upload + progress UI. **Builds on P5 follow-on backend widen.** | GREEN | L |
| 2.10 Scanned-PDF rendering decision | Decide canvas-based render vs friendly "re-upload as photo" (P5 left as fail-forward) | GREEN | M |
| 2.11 Cross-codebase mirror: dashboard `RecruitmentLinkShare` | Mirror P3b env-config to dashboard sibling | GREEN | S |
| 2.12 Cross-codebase mirror: dashboard P1-P4 patterns | If dashboard has same overlay/badge bugs, mirror fix | GREEN | M |
| 2.13 shadcn modal primitives watch | Track if any future EEJ feature pulls shadcn modal (dialog/sheet/drawer/alert-dialog) — if so, migrate to .shell-overlay | GREEN | watch |
| 2.14 Other analyzeImage call sites widen | CV scan + contract scan still narrow (workers.ts:51, 68, 1529) — route through normalizeForClaudeVision | GREEN | M |
| 2.15 Audit-log enrichment | Note sourceFormat in `[encrypted]` → kind mapping (P5 follow-on cosmetic) | GREEN | S |

**Acceptance for Phase 1 completion:** all 15 items committed, CI green, Layer 2 walkthrough on staging passes for at least the user-facing ones (2.1, 2.2, 2.9, 2.10).

### Phase 2 — Tier W1 worker essentials (highest-leverage 3 surfaces)

From Manish's prompt: "Tier W1 (build first — highest leverage): Hours-logging with photo verification + GPS, Late/absence one-tap notification with coordinator routing, Documents/expiry alerts with push notifications."

#### W1.1 Hours logging with photo + GPS

| Field | Detail |
|---|---|
| **Purpose** | Worker self-reports hours worked per day or per shift; photo + GPS metadata anchors the report to deliverables (HELP defense — hours tied to deliverable, not surveillance) |
| **Minimum implementation** | New mobile tab `HoursLogTab.tsx`; new table `hours_entries` (worker_id, date, hours, photo_url, gps_lat, gps_lng, status, submitted_at); endpoint POST `/api/hours/log`; coordinator review queue endpoint GET `/api/hours/pending` |
| **User roles** | Worker (self-report); operations (review); legal (audit access) |
| **Expected behavior** | Worker opens tab, picks date, enters hours, optional photo (e.g. of work product) + GPS auto-captured, submit. Defaults to `submitted` status; coordinator approves/rejects. Aggregates feed payroll. |
| **Data model** | New table `hours_entries`. Worker FK. R2 (existing storage) for photo. NUMERIC(4,1) hours. GPS NUMERIC(9,6) for lat/lng. Status enum (`submitted`/`approved`/`rejected`/`needs_review`). |
| **API** | POST `/api/hours/log`, GET `/api/hours/worker/:id?from=&to=`, PATCH `/api/hours/:id/approve`, PATCH `/api/hours/:id/reject` (with reason) |
| **UI** | New mobile tab. Day-picker calendar, hours input, photo upload (uses P5 widened DocumentScanFlow OR a smaller image-only uploader), GPS auto-captures on save. Submission history list. |
| **AI** | None (Phase 1 — keep it boring) |
| **Notifications** | On submission → notify coordinator (push); on approval/rejection → notify worker |
| **Polish-legal-risk** | **GREEN** — hours tied to deliverables, photo of work product, worker reports themselves (no surveillance). GPS captured at submit time, not continuously. |
| **Effort** | L |

APATRIS reference: `lib/init-db.ts:2250` (hours_log shape), `TimesheetTab.tsx` (UI pattern). Adapt, don't copy — APATRIS table uses TEXT month + worker_name; EEJ should use Drizzle pgTable + worker_id FK + tenant_id.

#### W1.2 Late/absence one-tap notification

| Field | Detail |
|---|---|
| **Purpose** | Worker taps "I'm late" or "I'm absent" — coordinator gets push, audit logged, no penalty engine yet (Tier W3 — risk-flag deferred) |
| **Minimum implementation** | Two buttons on mobile Home (worker tier); endpoint POST `/api/attendance/notify` with `type: "late"|"absent"`, optional `reason`, optional `eta_minutes`; coordinator push notification fires |
| **User roles** | Worker (one-tap notification); operations (recipient); legal (audit access) |
| **Expected behavior** | Worker on shift day taps "Late" or "Absent" → modal asks for optional reason (free text or selection from preset list: sick, family emergency, transport, other) → submit → toast confirms; coordinator gets push immediately + entry shows on coordinator queue |
| **Data model** | New table `attendance_events` (worker_id, type, reason, eta_minutes, status, created_at, ack_by, ack_at). NO points / penalty fields (Tier W3). |
| **API** | POST `/api/attendance/notify`, GET `/api/attendance/pending` (coordinator), PATCH `/api/attendance/:id/ack` |
| **UI** | Two prominent buttons on CandidateHome (worker tier). Modal with reason picker. Submission confirmation toast. Coordinator side: list of pending events with ack button. |
| **AI** | None (Phase 1) |
| **Notifications** | Push to coordinator on event; push to worker on coordinator ack |
| **Polish-legal-risk** | **GREEN** — worker initiates (no surveillance); audit-only (no penalty); supports HELP defense (workers report to coordinator) |
| **Effort** | M |

APATRIS reference: no direct equivalent (mood/wellness AMBER is different intent). Net-new design.

#### W1.3 Documents/expiry alerts with push

| Field | Detail |
|---|---|
| **Purpose** | Push notifications to workers when their TRC / passport / BHP / work permit / oświadczenie is approaching expiry (60/30/7-day milestones). EEJ has the email/whatsapp cron; add push channel. |
| **Minimum implementation** | New table `push_subscriptions` (mirror APATRIS shape). Service worker registration in mobile app. Add `push` channel to existing `compliance-alerts.ts` cron. |
| **User roles** | Worker (recipient); operations (recipient for sub-tenant workers) |
| **Expected behavior** | On mobile app first-load, prompt for push permission. On grant, subscribe + store in DB. Existing daily alert cron at 0 8 * * * picks up workers with expiring docs (60/30/7d windows), fires push alongside email/whatsapp. |
| **Data model** | New `push_subscriptions` table (worker_id, endpoint, p256dh_key, auth_key, created_at, last_used_at). Existing `notifications` table already has channel tracking. |
| **API** | POST `/api/push/subscribe`, DELETE `/api/push/subscribe/:id`, internal `sendPush(workerId, payload)` helper |
| **UI** | Mobile permission prompt on first load. Settings tab toggle to opt out. |
| **AI** | None |
| **Notifications** | THIS IS the notification primitive |
| **Polish-legal-risk** | **GREEN** — supporting statutory document compliance is HELP-aligned |
| **Effort** | M |

APATRIS reference: `lib/init-db.ts:540` (push_subscriptions shape), `services/push-sender.service.ts` (send pattern with VAPID).

### Phase 3 — Tier 3 scaffold-404 backends

From CLAUDE.md `## CURRENT PRIORITY LIST` Tier 3. Architect decision per CLAUDE.md: **build, don't hide**.

| Endpoint | Surface | Polish-legal | Effort |
|---|---|---|---|
| 3.1 `/api/analytics/heatmap` + `/predictive` + `/report/pdf` | AnalyticsPage | GREEN | L |
| 3.2 `/api/gps/active` + `/api/geofences` + `/api/gps/anomalies` | GpsTracking | **AMBER** — staff-side GPS tracking is heavier than worker self-check-in (W1.1) | M |
| 3.3 `/api/contracts` + `/api/poa` + `/api/contracts/:id/pdf` | ContractHub list | GREEN | M |
| 3.4 `/api/workers/:id/skills` | SkillsAssessmentTab | GREEN | S |
| 3.5 `/api/shifts` | ShiftScheduleTab — **P3d helper already wired to display voivodeship; just needs the backend** | GREEN | M |
| 3.6 `/api/workers/availability` | WorkerCalendarTab | GREEN | M |

### Phase 4 — Tier W2 worker expansion

From Manish: "Tier W2 (build after W1 stable): No-show detection engine, Leave/holiday balance with approval flow, Complaint/issue system, AI assistant in worker app."

#### W2.1 No-show detection engine (Manish Section B)

| Field | Detail |
|---|---|
| **Purpose** | Detect when a scheduled shift starts without worker check-in / late button / absent button → escalate per configured policy |
| **Minimum implementation** | New cron job runs every 5 min, scans `shifts` table for shifts starting in the last N minutes without a `hours_entry` / `attendance_event`. Fires escalation per `escalation_policies` table (configurable grace period). |
| **Data model** | New `no_show_events` table (shift_id, worker_id, detected_at, escalation_stage, resolved_at). Existing `eej_escalation_log` table covers escalation history. |
| **API** | Internal cron `noShowDetectionCron.ts`. GET `/api/no-show/pending` (coordinator queue). |
| **UI** | Coordinator dashboard widget: "Active no-shows" with ack action. |
| **AI** | Optional Phase 2 — AI assists coordinator with replacement-worker suggestion |
| **Notifications** | Stage 1 (grace period elapsed): push to worker reminder. Stage 2 (3× grace): push to coordinator. Stage 3 (full no-show window): push to manager + optional company alert. |
| **Polish-legal-risk** | **AMBER** — detection itself is operational; how the **outcome** lands is the risk. NO penalty/points (those are Tier W3). Pure detection + escalation is HELP-aligned. |
| **Effort** | L (depends on W1.1 hours-entry data + W1.2 attendance-event data) |

APATRIS reference: `services/escalation-engine.service.ts:18-147` (case SLA escalation pattern; reuse the deadline+stage primitive).

#### W2.2 Leave/holiday balance with approval flow (Manish Section C)

| Field | Detail |
|---|---|
| **Purpose** | Polish Labor Code Art. 152 statutory leave management. Worker requests; coordinator approves; balance auto-decremented; bonus logic for low-take. |
| **Minimum implementation** | Direct port from APATRIS `leave_requests` table + `LeaveTab.tsx` + `routes/self-service/leave`. Adapt: Drizzle pgTable + tenant_id FK + worker_id FK. |
| **Data model** | New `leave_requests` table (worker_id, leave_type, start_date, end_date, days, status, reason, notice_timing_days, requested_at, decided_at, decided_by). New `leave_balances` table or per-worker leave_balance JSONB column. |
| **API** | POST `/api/leave/request`, GET `/api/leave/worker/:id`, PATCH `/api/leave/:id/approve|reject`, GET `/api/leave/balance/:workerId` |
| **UI** | Mobile LeaveTab (request form + history). Coordinator queue tab. |
| **AI** | None |
| **Notifications** | Worker → coordinator on request; coordinator → worker on decision |
| **Polish-legal-risk** | **GREEN** — supporting statutory entitlement |
| **Effort** | M |

#### W2.3 Complaint/issue system (Manish Section E)

| Field | Detail |
|---|---|
| **Purpose** | Worker raises a complaint (anonymous-allowed); categorized; routed to designated handler; status tracking; voice notes optional |
| **Minimum implementation** | New `complaint_cases` table; new `ComplaintTab.tsx` for worker; coordinator queue. Voice notes deferred (AMBER on biometric data). |
| **Data model** | `complaint_cases` (id, case_id, worker_id NULL if anonymous, category, description, attachment_url, status, assigned_to, created_at) |
| **API** | POST `/api/complaints`, GET `/api/complaints/me`, GET `/api/complaints/pending` (coordinator) |
| **UI** | Mobile complaint form with category picker; status timeline. Coordinator queue. |
| **AI** | Optional: AI-classifies free-text into category |
| **Notifications** | Acknowledgment to worker; alert to assigned handler |
| **Polish-legal-risk** | **GREEN** — supports worker rights; anonymous-allowed is HELP-aligned |
| **Effort** | M |

#### W2.4 AI assistant in worker app (Manish Section A)

| Field | Detail |
|---|---|
| **Purpose** | Worker asks free-text questions ("when does my permit expire?", "how do I request leave?"); AI answers using their own profile data + EEJ legal KB |
| **Minimum implementation** | New mobile chat UI; backend wires to existing `eej-copilot` route (per CLAUDE.md). Restrict tool surface to self-only worker tools. |
| **Data model** | None new — uses existing eej-copilot |
| **API** | POST `/api/eej-copilot/chat` (existing); add `viewerRole: "worker"` gating |
| **UI** | Mobile chat tab |
| **AI** | Claude via existing eej-copilot |
| **Notifications** | None |
| **Polish-legal-risk** | **GREEN** with guardrails: AI must not give legal advice (only EEJ-internal info); must not access other workers' data; must log every interaction |
| **Effort** | M |

### Phase 5 — Tier 4 static-mock tabs

From CLAUDE.md. Honest empty-state where DB doesn't have data; wire to real data where it does.

- 4.1 UpdatesTab (BuildPro fiction → real updates table or empty)
- 4.2 SalaryBenchmark (synthetic Q1 2026 rates → real or empty)
- 4.3 PayTransparency (synthetic breakdowns → real or empty)
- 4.4 AlertsTab "Recently Resolved" (hardcoded names → real resolved-events query or empty)
- 4.5 OperationsHome OPS_PIPELINE + B2B_CONTRACTS (mock fallback → real or empty)

All GREEN on Polish-legal-risk.

### Phase 6 — Tier 5 schema/enum cleanup

From CLAUDE.md. Single source of truth for:
- 5.1 Pipeline stages
- 5.2 Job roles (currently 13 welding-heavy entries)
- 5.3 Nationalities
- 5.4 Voivodeships (P3d helper exists — bridge to canonical enum)
- 5.5 Status enums (worker, application, payroll, etc.)
- 5.6 Contract types
- 5.7 `pit2` column investigation (carry-over from Tier 2 audit notes)
- 5.8 `workPermitExpiry` vs `work_permit_applications` schema-split (P3c reconciled UI-side; schema-side fix is here)

All GREEN.

### Phase 7 — Tier W3 deferred (KRAZ-defense gates)

From Manish: "Tier W3 (build cautiously or last): Reliability/points summary (Polish labor law penalty risk), Scenario simulator/legal test suite (big scope, real but later)."

#### W3.1 Reliability/points summary (Manish — penalty/reward system)

| Polish-legal-risk | **AMBER → potentially RED** |
| Reasoning | A reliability score that drives penalty (lower pay, fewer shifts, blacklist) reads as employee-monitoring under Polish labor code. Reads as agency-dispatch behavior — HURTS KRAZ defense. |
| Decision | **Defer until KRAZ classification is settled.** Even then, design only as worker-visible self-improvement metric (no manager penalty surface). |

#### W3.2 Scenario simulator / legal test suite (Manish Section I)

| Polish-legal-risk | **GREEN** (internal testing) |
| Reasoning | APATRIS has the `test_scenarios` + `test_scenario_runs` tables ready to port. Big scope but internal — no external surface. |
| Decision | **Defer to Tier W3 last per Manish.** Port APATRIS shape when prioritized. |

---

## Section 4 — APATRIS-borrowed-items × phase cross-reference

| APATRIS item | Phase 1 audit class | Lands in unified plan |
|---|---|---|
| W4/W5 messages + MessagingTab | (b) incorporate | Phase 4 W2.3 complaint system (sibling to messaging) — separate later if needed |
| W6/W7 leave_requests + LeaveTab | (b) incorporate | Phase 4 W2.2 |
| W8/W9 hours_log + TimesheetTab | (b) incorporate | Phase 2 W1.1 |
| W10 GpsCheckinTab worker-side | (b) incorporate | Phase 2 W1.1 (GPS is embedded in hours-log submit) |
| W11 ManagerHome 306-LOC | (b) incorporate | Phase 2-4 coordinator-tier UI grows as W1+W2 land |
| W12 push_subscriptions + push-sender | (b) incorporate | Phase 2 W1.3 |
| W13 notification_log | (b) consider | Phase 1 verify EEJ `eej_notification_log` covers; otherwise port |
| E1 escalation-engine.service | (b) reference | Phase 4 W2.1 no-show engine |
| E2 deadline-engine.service | (b) reference | Phase 1 2.9 + Phase 2 W1.3 |
| E4 test_scenarios + routes | (b) incorporate | Phase 7 W3.2 |
| E5 worker-legal-view.service | (b) reference | Could back EEJ's scaffolded MyUPO/MySchengen — covered by Phase 1 hardening if needed; otherwise Phase 3 |
| E6 notification.service router | (b) incorporate | Phase 2 W1.3 (channel-routing infra) |
| C1 site-coordinators route + coordinator role | (b) incorporate | Phase 2-4 — needs CLAUDE.md RBAC review (coordinator-tier vs operations-tier) |
| W1/W2/W3 mood / wellness / voice | (d) flag | Deferred; design pass needed before scoping |
| W14 voice_checkins | (d) flag → RED if biometric | Deferred |
| C4 face-auth | (d) RED | Deferred outright |
| Audit #3 ai-audit dedicated route | (b) incorporate | Phase 1 2.x (small, fits hardening) |
| Audit #4 per-worker activity-log route | (b) incorporate | Phase 1 2.x |

---

## Section 5 — Explicitly OUT of scope (and why)

- **Merging EEJ with APATRIS codebase.** Architecture A locked. Cross-codebase mirrors are individual surgical ports, not consolidation.
- **APATRIS legal-* surface** (legal-cases, legal-brief, legal-evidence-ocr, legal-copilot, legal-status, legal-research, legal-immigration-command, etc.). EEJ doesn't fight Lubuski UW summons; this is APATRIS's KRAZ defense.
- **APATRIS PIP-inspection-report / authority-response infra.** Specific to APATRIS's run-in with Polish authorities. EEJ has lighter legal posture (recruitment + worker management; not running cross-border outsourcing).
- **APATRIS MOS package / posted-workers / A1 form infra.** EEJ doesn't post workers across borders today.
- **APATRIS multi-tenant SaaS scaffolding** (whitelabel, saas-billing). EEJ is single-tenant per CLAUDE.md tenancy notes.
- **APATRIS fines / fraud / churn / ROI analytics.** APATRIS-specific business surfaces.
- **Biometric anything** (face-auth, voice-checkins). Polish RODO / GDPR maximum risk.
- **Reliability/points penalty engine** unless KRAZ defense is settled (Tier W3 deferred).
- **P6 Tier A token consolidation** unless Manish confirms scope (275 file touches; surveyed in P6 but no edit per "wait for confirmation"). Plan re-surfaces this as a Phase 6 sub-item only if confirmed.

---

## Section 6 — Open questions for Manish (before execution starts)

1. **Phase 1 — Tier 2 scope-fence:** all 15 items, or subset? Some (2.6 Case C, 2.7 AddWorkerModal) are old carry-overs from Day 26; still in scope or drop?
2. **Phase 2 W1.1 photo step:** required or optional? If required, blocks workers without smartphone cameras; if optional, weakens the HELP defense (hours-to-deliverable evidence).
3. **Phase 2 W1.2 attendance-event presets:** which preset reasons? Suggested: `sick`, `family emergency`, `transport`, `weather`, `other`. Yes/refine?
4. **Phase 2 W1.3 push permission UX:** prompt on first load (high refuse rate) or after first push-worthy event (better acceptance, but delays first notification)? Recommend the latter.
5. **Phase 4 W2.1 no-show grace period:** 15 min default? Per-shift configurable? Per-tenant default override?
6. **Phase 4 W2.2 leave types:** Polish standard 5 (annual / sick / maternity / parental / unpaid)? Plus EEJ-specific (e.g. "voivodeship trip for permit renewal")?
7. **Coordinator-tier RBAC:** EEJ currently has 4 viewer roles (executive / legal / operations / candidate). APATRIS has 6 roles (Admin / Executive / LegalHead / TechOps / Coordinator / Professional). Does EEJ add a 5th "coordinator" tier, or treat operations as coordinator?
8. **P6 brand-token consolidation:** approve Tier A (theme.ts approach, 275 file touches over time) — lands in Phase 6 Tier 5? Or hold further?
9. **Cross-codebase mirror priority:** Phase 1 2.11/2.12 mirror dashboard sibling — Manish-priority or "as time permits"?
10. **Layer 2 walkthrough cadence:** between every phase, or end-of-phase only? Existing pattern was per-block (P0-P5); plan currently assumes end-of-phase.

---

## Section 7 — Manish's worker-side spec (captured at full fidelity)

For audit traceability — this is the input C feed-through, not Claude paraphrase. Source: user's Day 27 prompts as quoted in the Day 28 tracker.

### Core feature areas (A-I)

**A. Worker app essentials.** Home, Hours, Leave, Documents, Help/complaints, AI assistant. Urgent absence button, Late button, Reliability/points summary.

**B. No-show and absence engine.** Scheduled shift detection, grace period, late warning, no-show detection. Worker notification, coordinator escalation, manager escalation, optional company notification. Penalty/reward points, repeat-event tracking, manual override.

**C. Leave and holiday logic.** Planned leave, same-day leave, sick absence, late notice. Holiday balance, approval flow, bonus/reliability logic, policy configuration.

**D. Communication system.** Worker messages, coordinator messages, manager alerts, company alerts. Multilingual support, SMS/email/push hooks, template management, message logs.

**E. Issue / complaint system.** Categories, attachments, voice notes, case IDs. Escalation, status tracking, anonymous reporting if allowed.

**F. Documents and compliance.** Passport, TRC/permit/visa, PESEL, certificate uploads. Expiry reminders, compliance blocks, review queue.

**G. Coordinator / manager dashboard.** Live attendance, no-show queue, unresolved absences, replacement suggestions. Site risk, worker reliability, document expiry, open cases.

**H. Project-tracking dashboard.** Internal feature status, build status, AI task status. Compliance testing status, blockers, release readiness.

**I. Scenario simulator / legal test suite.** Generate worker profiles, simulate thousands of no-show and absence events. Test legitimate medical exceptions, test unauthorized absences. Verify alerts and penalties, check edge cases, ensure safe compliance behavior.

### Per-feature implementation requirements

For each missing feature, the plan must specify:
- Purpose
- Minimum implementation
- User role affected
- Expected behavior
- Data model / entity / field changes (extending EEJ's existing schema, not creating parallel structures)
- API / service endpoint behavior
- UI page / screen layout and controls
- AI input/output and guardrails (if AI-driven)
- Notification logic (trigger, channel, recipient, logging)
- Polish labor compliance safety rule + manual review rule

### Prioritization tiers

- **Tier W1 (build first — highest leverage):** Hours-logging with photo verification + GPS, Late/absence one-tap notification with coordinator routing, Documents/expiry alerts with push notifications
- **Tier W2 (build after W1 stable):** No-show detection engine, Leave/holiday balance with approval flow, Complaint/issue system, AI assistant in worker app
- **Tier W3 (build cautiously or last):** Reliability/points summary (Polish labor law penalty risk), Scenario simulator/legal test suite (big scope, real but later)

### Polish legal lens

APATRIS's defense vs Lubuski UW summons + Article 13(1)(7) of 2025 Act on entrusting work to foreign nationals + KRAZ classification battle means every feature must pass: "Does this make us look more like a process-outsourcing contractor or more like an agency?"

- HELP defense: hours tied to deliverables, document tracking, workers reporting to APATRIS/EEJ coordinator
- HURT defense: heavy surveillance, penalty/reward systems, agency-dispatch behaviors, employee monitoring outside contract scope
- Every feature carries a Polish-legal-risk flag: GREEN (helps or neutral), AMBER (needs careful design), RED (creates legal liability — defer or redesign)
- Same lens applies to EEJ's international recruitment workers (TRC-based) — same Polish labor code constraints

---

## Status

- **Plan:** complete (this document).
- **Phase 3 deliverable** (next-step prompt for Phase 1 / Item 2.1) — separate section below (placeholder file; would be quoted in chat-Claude review).
- **Awaiting Manish:** open-questions answers in Section 6 before execution starts.

---

## Section 8 — Phase 3 deliverable: next-step prompt draft (not auto-sent)

**Target:** Phase 1 Item 2.1 — token-key unification (first item in unified build order).

**Why this item first:**
- Smallest blast radius among the Phase 1 hardening items.
- Unblocks every subsequent auth-touching change.
- Already inventoried (counts below).
- Pure refactor: tighten, don't widen.

### Inventory (Phase 3 surfacing)

From grep across `eej-mobile-HIDDEN/src` + `artifacts/apatris-dashboard/src` at HEAD `26012a6`:

| Token key | File count | Notes |
|---|---|---|
| `apatris_jwt` | 31 files | Stalest — leftover from APATRIS-era code |
| `eej_jwt` | 24 files | Intermediate refactor; one of the two EEJ keys |
| `eej_token` / `eej_token_v2` | 54 files | Current canonical per CLAUDE.md |
| **Total occurrences** (across both keys + canonical) | **97 lines, 109 files** | |

Note: the same file can use multiple keys (legacy + new). Canonical key per CLAUDE.md is `eej_token` (dashboard) and `eej_token_v2` (mobile). The mobile/dashboard split is intentional — `_v2` suffix denotes the post-2026-refactor mobile token shape.

### Draft `/goal` prompt

```text
/goal Phase 1 Item 2.1 — token-key unification

Manish + chat-Claude here. Unify auth-token storage keys across EEJ
mobile + dashboard. Canonical keys (per CLAUDE.md):
  - eej_token_v2 — mobile (localStorage)
  - eej_token    — dashboard (sessionStorage)

Migrate ALL consumers of `apatris_jwt` and `eej_jwt` to the
canonical key for their side, with a one-read backward-compat shim
on first load so existing user sessions don't get logged out.

INVENTORY (HEAD 26012a6, audited Day 28):
- 31 files reference apatris_jwt
- 24 files reference eej_jwt
- 54 files reference canonical eej_token / eej_token_v2
- Total: ~97 lines across ~109 files

SCOPE FENCE:
- Touch ONLY auth-token storage reads/writes.
- DO NOT modify other localStorage / sessionStorage keys.
- DO NOT widen scope into other Tier 2 items (those land separately).
- DO NOT touch backend JWT verification (tokens stay the same; only
  the BROWSER STORAGE KEY changes).
- DO NOT deploy.

SHIM REQUIREMENT:
On app first-load, BEFORE auth context initializes:
  - If canonical key is empty AND legacy key (apatris_jwt or eej_jwt)
    has a value → copy to canonical key, delete legacy key.
  - Do this exactly once per session (idempotent on repeat loads).
  - Shim lives in a single helper, imported by both mobile + dashboard
    entry points.

ACCEPTANCE CRITERIA (evaluator-checkable):
1. grep -rl "apatris_jwt\|eej_jwt" eej-mobile-HIDDEN/src
   artifacts/apatris-dashboard/src returns 0 files OUTSIDE the shim
   helper file.
2. The shim helper file exists at a single path (e.g.
   lib/auth-token-migration.ts) and is imported once per app.
3. TypeScript: pnpm typecheck clean on api-server and both
   frontends.
4. pnpm build clean on api-server + mobile + dashboard.
5. git ls-files --deleted empty.
6. Single commit per side (mobile commit + dashboard commit).
7. Layer 2 verification list provided in the report.

ESTIMATED TURN CAP: 30 turns. (Large refactor — pure mechanical
replace + one new helper file + verification.)

LAYER 2 VERIFICATION PREVIEW (for the post-/goal report):
1. Fresh browser, no existing localStorage → log in → token lands in
   canonical key only.
2. Browser with existing apatris_jwt set in localStorage → load app
   → token migrates to canonical, apatris_jwt deleted, user stays
   logged in.
3. Browser with eej_jwt set → same as above for eej_jwt.
4. Logout clears the canonical key (not just one of them).
5. Mobile + dashboard tested independently.

OUT OF SCOPE (per the Day 28 unified plan):
- Tier 2 items 2.2-2.15 (separate /goals later).
- P6 Tier A brand-token consolidation (separate decision).
- Cross-codebase mirror to APATRIS codebase (Architecture A locked;
  EEJ work only).
- Any worker-side feature (Phase 2 onward).
- Deploy.
```

### Why this draft is "send-ready"

- Inventory numbers concrete (grep verified at HEAD `26012a6`)
- Scope fence explicit (read/write of token keys only; NOT backend JWT verify)
- Backward-compat shim spec'd inline (no user logout)
- Acceptance criteria evaluator-checkable
- Layer 2 preview written before /goal fires — same pattern as P0-P5
- Out-of-scope list closes scope-creep doors

### What chat-Claude should check before sending

- Is canonical-key split (`eej_token` dashboard vs `eej_token_v2` mobile) the right end-state, or should they unify further?
- Single shim helper vs two shim helpers (one per side)?
- Turn cap 30 — high or low for this scope?

---

## Status

- **Phase 1 audit:** committed `26012a6`
- **Phase 2 unified plan:** this document, committing next.
- **Phase 3 next-step prompt:** drafted above (Section 8), NOT auto-sent.
- **Awaiting Manish:** open questions in Section 6 + Section 8 chat-Claude-check items before execution starts.

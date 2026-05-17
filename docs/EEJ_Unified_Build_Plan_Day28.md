# EEJ Unified Build Plan (Day 28)

**Date:** 2026-05-16 (Day 28)
**Inputs synthesized:**
- **A** — Phase 1 audit findings (`docs/EEJ_vs_APATRIS_Feature_Audit_Day28.md`, commit `26012a6`)
- **B** — Existing Tier 2-5 plan + post-P5 follow-on candidates (CLAUDE.md `## CURRENT PRIORITY LIST`; P0-P6 close-out commits `2014276` through `af76ed3`)
- **C** — Manish's worker-side feature spec (Day 27 prompts, captured at full fidelity below — 9 core areas A-I with per-feature implementation requirements + W1/W2/W3 prioritization tiers + Polish-legal lens)

**Output:** ONE prioritized plan covering hardening + worker-side + scaffold-404 + mocks + schema cleanup.

---

## Section 1 — Executive summary

EEJ is post-P5 + P6-survey closed. The Day 28 revision (this version) captures **every feature in the plan as part of the future build — nothing parked, nothing deferred-indefinitely.** The plan sequences **Phase 10 Operational Hygiene in parallel with Phase 1 Tier 2 hardening** (Neon rotation, Fly secret rotation, readonly role, CI credential), then **Phase 9 Mobile Install Testing** (validation pass on real iPhone + Android), then **Phase 2 Tier W1 worker essentials** (hours + late/absence + docs-with-push — three highest-leverage worker surfaces, all GREEN on Polish-legal), **Phase 3 Tier 3 scaffold-404 backends** (build, don't hide), **Phase 4 Tier W2 worker expansion** (no-show engine + leave + complaints + worker-AI), **Phase 8 Live Chat (#34)** (in-app real-time chat for worker↔team and applicant↔team — XL premium-tier SaaS surface), **Phase 5 Tier 4 mocks**, **Phase 6 Tier 5 schema cleanup**, **Phase 7 Tier W3 KRAZ-defense gated** (reliability/points with explicit prerequisite "KRAZ classification settled"; scenario simulator with prerequisite "W1+W2 in production"), and **Phase 11 Mood/Wellness** (post-W3, design-pass-required, legal-advisor-reviewed). Polish-legal-risk flag on every worker-side item; AMBER items design-checked before scope-locking; RED items reframed as Phase 11 with explicit gating. Architecture A is locked — every cross-codebase reference is "build in EEJ; APATRIS implements from EEJ as reference later."

---

## Section 2 — Build phase ordering

Sequence (top = build next):

```
[Phase 1 Tier 2 hardening]  ║ in parallel ║  [Phase 10 Operational Hygiene]
   (~15 hardening items)    ║             ║  (Neon rotation, Fly secrets,
                            ║             ║   CI credentials, readonly role)
                                ↓
                  Phase 9 — Mobile Install Testing
                  (iPhone + Android PWA validation — gate to W1)
                                ↓
                  Phase 2 — Tier W1 worker essentials
                  (Hours, Late/absence, Docs-with-push)
                                ↓
                  Phase 3 — Tier 3 scaffold-404 backends
                  (Analytics, GPS, ContractHub, Skills, Shifts, Calendar)
                                ↓
                  Phase 4 — Tier W2 worker expansion
                  (No-show engine, Leave, Complaints, Worker-AI)
                                ↓
                  Phase 8 — Live Chat (#34)
                  (Worker↔team + Applicant↔team in-app chat — XL premium)
                                ↓
                  Phase 5 — Tier 4 static-mock tabs
                  (Updates, Salary, PayTransparency, AlertsRecent, OpsPipeline)
                                ↓
                  Phase 6 — Tier 5 schema/enum cleanup
                                ↓
                  Phase 7 — Tier W3 KRAZ-defense gated
                  (W3.1 Reliability/points — gated on KRAZ classification;
                   W3.2 Scenario simulator — gated on W1+W2 in prod)
                                ↓
                  Phase 11 — Mood/Wellness (post-W3, design-pass-required)
                  (Mood entries, Wellness, Voice — legal-advisor-reviewed
                   opt-in/anonymized/no-manager-visibility design)
```

Reasoning for the order:
- **Phase 1 Tier 2 + Phase 10 parallel** — operational hygiene (Neon password rotation flagged this morning, Fly secrets re-rotation, CI credential, readonly role) cannot wait for feature work. Runs alongside Tier 2 hardening on a separate execution thread.
- **Phase 9 between Phase 1 and Phase 2** — real-device PWA testing validates findings #16/#17/#18 BEFORE adding worker-side surface area on top of them. Catches viewport / X-reachability / recruitment-link surface issues that would otherwise compound through Tier W1.
- **Phase 2 Tier W1 third** (not Tier 3) because Manish's roadmap explicitly tags Hours / Late-absence / Docs as "highest leverage." Tier 3 scaffold-404 surfaces are lying to users today (they 404), but they're staff-side; Tier W1 is worker-side and Manish ships worker-side first per the post-P3-of-Day-27 prompt.
- **Phase 3 Tier 3 fourth** because the scaffold-404s are blocking staff workflows the existing user base relies on. Building these out unblocks Karan/Marj/Yana.
- **Phase 4 Tier W2 fifth** — after the W1 core is stable, expand with no-show engine + leave + complaints. No-show engine is the heaviest single item; better land after the W1 hours/GPS primitive is in production for shape data.
- **Phase 8 Live Chat sixth** — placed after W2 because complaint system (W2.3) shares mechanics (threads, attachments, escalation routing). Live Chat reuses those primitives + adds the real-time transport layer. Placing it before Tier 4/5 honesty work prioritizes the premium-SaaS-tier feature for paying agencies.
- **Phase 5 Tier 4 seventh** — static-mock cleanup is honesty work, but lower urgency than functional gaps and the premium chat feature.
- **Phase 6 Tier 5 eighth** — schema/enum consolidation is "rates" work; pays dividends across all surfaces but has no user-facing urgency.
- **Phase 7 Tier W3 ninth — KRAZ-defense gated, NOT deferred indefinitely.** W3.1 Reliability/points has explicit prerequisite "KRAZ classification settled" — when that prerequisite resolves, W3.1 builds. W3.2 Scenario simulator has prerequisite "W1+W2 in production for shape-data."
- **Phase 11 Mood/Wellness last — post-W3, design-pass-required, NOT deferred indefinitely.** Capture as future build with explicit gate: opt-in + anonymized + no-manager-visibility design pass reviewed by legal advisor BEFORE scoping execution.

---

## Section 3 — Phase-by-phase detail

### Phase 1 — Tier 2 hardening (no new surface area)

From CLAUDE.md `## CURRENT PRIORITY LIST` + post-P5 candidates queued during P0-P6 reviews.

> **Runs in parallel with Phase 10 — Operational Hygiene** (see below). Phase 10 is operator/secrets work on a separate execution thread; Phase 1 is feature-code work. They share no critical path.

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

### Phase 9 — Mobile Install Testing (validation gate between Tier 2 and Tier W1)

NOT a build phase. A structured validation pass on real iPhone + Android PWA installs that gates worker-side work. Surfaces findings that may trigger additional fixes BEFORE Phase 2 adds new worker-side surface area.

| Field | Detail |
|---|---|
| **Purpose** | Validate post-P0-P6 mobile fixes on real devices. Confirm findings #16 (mobile profile viewport fit), #17 (mobile X reachability — close-button tap zone), #18 (mobile recruitment link surface) actually work on physical phones, not just desktop devtools. |
| **Scope** | iPhone (Safari PWA install — current-gen + older notched device if available) + Android (Chrome PWA install — current-gen + budget device). Test the post-P0-P6 commit (HEAD `af76ed3` at Day 28). |
| **What gets tested** | All P0-P6 fixes — P0 horizontal-overflow guard, P1 viewport-fit=cover + safe-area-insets, P2 Share Link footer text clipping, P3a bell badge unification, P3b VITE_SHARE_BASE_URL fallback, P3c work-permit reconciliation panel, P3d voivodeship derivation, P4 bottom-nav icon-label collision, P5 scan-document widened formats. Plus rotation, status-bar overlay, home-screen icon, push permission prompt behavior. |
| **Outputs** | Findings list per-device (works / partially works / regression / new bug). Triage into "blocks Phase 2 W1" vs "log as Tier-2-followup" vs "design note." |
| **Who** | Manish-led (open question: solo or with team — Liza/Karan/Marj/Yana). Real workers' devices are out of scope unless explicitly invited. |
| **Polish-legal-risk** | N/A (testing) |
| **Effort** | S — 1-2 structured testing sessions. |
| **Architecture A note** | EEJ-only. APATRIS does its own mobile install testing on its own surfaces. |

**Acceptance for Phase 9 completion:** findings document committed (`docs/Mobile_Install_Testing_Day_X.md`); any "blocks Phase 2 W1" findings have follow-up commits queued; Manish signs off proceed-to-Phase-2 OR proceed-to-Tier-2-followup.

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
**Architecture A:** build in EEJ; APATRIS implements from EEJ as reference later.

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
**Architecture A:** build in EEJ; APATRIS implements from EEJ as reference later.

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
**Architecture A:** build in EEJ; APATRIS implements from EEJ as reference later.

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
**Architecture A:** build in EEJ; APATRIS implements from EEJ as reference later.

#### W2.2 Leave/holiday balance with approval flow (Manish Section C)

| Field | Detail |
|---|---|
| **Purpose** | Polish Labor Code Art. 152 statutory leave management. Worker requests; coordinator approves; balance auto-decremented; bonus logic for low-take. |
| **Minimum implementation** | Direct port from APATRIS `leave_requests` table + `LeaveTab.tsx` + `routes/self-service/leave`. Adapt: Drizzle pgTable + tenant_id FK + worker_id FK. **Architecture A:** build in EEJ; APATRIS implements from EEJ as reference later (even though EEJ ports the shape from APATRIS first, the EEJ-adapted version becomes the canonical reference going forward). |
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

### Phase 8 — Live Chat (#34)

In-app real-time chat. Two surfaces: **worker↔team** (existing workers asking coordinators questions) and **applicant↔team** (cold applicants asking pre-recruitment questions, especially international workers considering visa moves). For future SaaS, this is a premium-tier feature for paying agencies. Position: after Tier W2 (complaint system shares mechanics — threads, attachments, escalation routing); before Tier W3 KRAZ-defense gates.

| Field | Detail |
|---|---|
| **Purpose** | Real-time text chat between (a) authenticated workers and their coordinator/manager, and (b) anonymous/email-only applicants and the recruitment team. Reduces email/whatsapp friction for both internal coordination and cold-recruitment funnel. |
| **Minimum implementation** | Three table set: `chat_threads` (id, type ENUM `worker_team|applicant_team`, subject, status, created_at, last_message_at, assigned_to NULL); `chat_messages` (id, thread_id FK, sender_type ENUM `worker|applicant|staff|system`, sender_id NULL for anonymous applicants, content, attachments JSONB, created_at, read_at); `chat_participants` (thread_id FK, participant_type ENUM `worker|applicant|staff`, participant_id NULL for anonymous, added_at, last_seen_at). Real-time transport via WebSocket or polling (see ARCHITECTURE DECISION below). |
| **User roles** | Worker (mobile chat tab — own threads only); Applicant (public `/apply` chat widget — own thread only, identified by email + magic-link token); Staff inbox (operations/legal/executive — sees all threads filtered by role + assignment); Admin (configure routing rules, premium tier toggle). |
| **Expected behavior** | Worker opens chat tab → sees their threads with coordinator → tap thread → type/send → coordinator gets push + sees in dashboard inbox. Applicant on `/apply` page sees "Have a question? Chat with our team" button → opens chat widget → email-identified thread created → staff inbox routes by language/topic. |
| **Data model** | New: `chat_threads`, `chat_messages`, `chat_participants` tables. Drizzle pgTable + tenant_id FK on all three. Attachments stored in R2 (existing). Message content encrypted at rest (mirror `whatsapp_messages` encryption pattern from `schema.ts:241`). |
| **API** | REST surface: POST `/api/chat/threads` (create, worker or applicant), POST `/api/chat/threads/:id/messages` (send), GET `/api/chat/threads/me` (worker's own threads), GET `/api/chat/threads/staff?role=&status=&assigned=` (staff inbox), PATCH `/api/chat/threads/:id/assign`, PATCH `/api/chat/threads/:id/status`. Real-time: see ARCHITECTURE DECISION. |
| **UI** | Three surfaces: (1) Mobile `LiveChatTab.tsx` for workers (thread list + per-thread message view); (2) Public widget on `/apply` page (collapsible chat bubble, email-gated entry, magic-link continuity); (3) Dashboard `ChatInbox.tsx` for staff (Slack/Intercom-style — threads list left, conversation pane right, assignment + status controls, internal-note sidebar). |
| **AI** | Optional / Phase 2: Claude auto-categorizes incoming messages by topic + language; suggests reply templates to staff; escalates flagged messages (urgent: "I'm injured," "I have no documents", legal-trigger words) to manager. AI surface guardrails: never auto-reply to worker/applicant without staff approval; never expose other workers' data; log every AI suggestion + whether staff accepted. |
| **Notifications** | Push on new message (worker side); email-fallback push if worker push not subscribed; staff push for assigned threads; urgent-escalation alerts (AI-flagged) push to managers. All channels logged via the Phase 2 notification.service router (W1.3). |
| **Polish-legal-risk** | **GREEN** — in-app communication channel; HELP defense (workers reporting to coordinator). Caveats: applicant-side anonymous-to-named conversion must respect GDPR consent (clear data-use disclosure at entry); chat content retention policy needs definition (suggested: 2-year retention then anonymized; aligns with Polish employment record retention norms). |
| **Effort** | **XL** — multi-surface (worker mobile + applicant public + staff dashboard), real-time transport infrastructure decision, three tables, ~12 endpoints, AI categorization layer. |
| **Architecture A** | build in EEJ; APATRIS implements from EEJ as reference later. EEJ leads this primitive — APATRIS has no equivalent (per Phase 1 audit `(d)` flags on messages/voice). |

#### ARCHITECTURE DECISION REQUIRED (Phase 8 entry gate)

Real-time transport choice. Four candidates, must pick ONE before scoping execution:

| Option | Pros | Cons | Effort impact |
|---|---|---|---|
| **(A) Pusher** | Managed service; SDK mature; free tier ample for early premium-tier users | Adds vendor dependency; monthly cost at scale | Fastest to MVP |
| **(B) Ably** | Similar to Pusher; better Polish data residency options | Same vendor-dependency concern | Similar to A |
| **(C) Self-hosted Socket.IO** | No vendor cost; full control; fits Fly.io deployment model | Operational overhead (sticky sessions, scaling, presence tracking); team must manage | Larger initial; lower long-term |
| **(D) Anthropic MCP transport** | Aligns with existing Claude infrastructure; novel | Unproven for this use case; MCP is server-tool transport, may not fit chat patterns | Research-heavy; high risk |

**Recommendation pending Manish + chat-Claude:** (A) Pusher for premium-tier MVP, migrate to (C) Self-hosted if vendor cost becomes blocker at scale. Tracked as open question Q11.

#### Phase 8 prerequisites
- Phase 1 W1.3 push infrastructure (Phase 2) — chat uses it for new-message alerts
- Phase 4 W2.3 complaint system (Phase 4) — shares thread/attachment/assignment mechanics (chat reuses the same patterns at table-design level)
- Architecture decision above resolved

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

### Phase 7 — Tier W3 KRAZ-defense gated

From Manish: "Tier W3 (build cautiously or last): Reliability/points summary (Polish labor law penalty risk), Scenario simulator/legal test suite (big scope, real but later)." Reframed in this revision: **both items are part of the future build, NOT deferred indefinitely** — each has an explicit prerequisite that, when resolved, unblocks execution.

#### W3.1 Reliability/points summary (Manish — penalty/reward system)

| Field | Detail |
|---|---|
| **Purpose** | Worker-visible reliability metric that drives improvement loops (and at some scale, drives manager-side workforce decisions if KRAZ classification permits). |
| **Polish-legal-risk** | **AMBER → potentially RED** depending on design — surfacing to manager + driving penalties HURTS KRAZ defense; worker-self-visible improvement metric is HELP. |
| **Prerequisite (explicit gate)** | **KRAZ classification settled.** Until APATRIS's Lubuski UW response resolves the KRAZ classification question (or Polish authorities issue clarifying guidance on Article 13(1)(7) of the 2025 Act), don't ship a reliability surface that can be read as agency-dispatch behavior. |
| **When prerequisite resolves** | Design pass: worker-visible only (no manager penalty surface, no shift-distribution input), opt-in display, anonymized when surfaced in aggregate. Then build: `worker_reliability_events` table (event_type, timestamp, weight), `worker_reliability_score` view (rolling 90-day weighted sum), mobile tab `MyReliabilityTab.tsx`. |
| **Architecture A** | build in EEJ; APATRIS implements from EEJ as reference later. |
| **Effort** | M (when unblocked) |

#### W3.2 Scenario simulator / legal test suite (Manish Section I)

| Field | Detail |
|---|---|
| **Purpose** | Generate synthetic worker profiles, simulate thousands of no-show + absence events, verify alerts/penalties/escalation engines behave per Polish labor compliance, test edge cases (legitimate medical exceptions vs unauthorized absences). |
| **Polish-legal-risk** | **GREEN** — internal testing infrastructure, no external surface. |
| **Prerequisite (explicit gate)** | **Tier W1 + W2 in production for shape-data.** The simulator validates the engines built in W2.1 (no-show detection), W2.2 (leave), W1.1 (hours), W1.2 (attendance events). Building it before those engines are stable means simulating against shifting targets. |
| **When prerequisite resolves** | Port APATRIS `test_scenarios` + `test_scenario_runs` table shape (`lib/init-db.ts:3456-3471`), adapt to Drizzle pgTable, build scenario-generator service that creates synthetic workers + events + runs them through the live engines, compare output vs expected (matches `routes/test-scenarios.ts` pattern). |
| **Architecture A** | build in EEJ; APATRIS implements from EEJ as reference later (even though EEJ ports APATRIS's table shape first, the EEJ-adapted version becomes canonical). |
| **Effort** | L (when unblocked) |

### Phase 10 — Operational Hygiene (runs in parallel with Phase 1 Tier 2)

Production-prep operational work. NOT feature work — operator/secrets/infrastructure. Runs on a separate execution thread from Phase 1 so feature work doesn't block on credential rotation and vice versa. **All items GREEN on Polish-legal-risk.** See Section 9 for the consolidated runbook.

| Item | Scope | Polish-legal | Effort |
|---|---|---|---|
| 10.1 Rotate Neon `neondb_owner` password | Literal credential leaked in chat history this morning (Day 28); rotate via Neon console, update all consumers, verify | GREEN | S — but HIGH priority |
| 10.2 Re-rotate Fly secrets on BOTH apps | After 10.1 lands, rotate `eej-api` (staging) and `eej-jobs-api` (production) — DATABASE_URL + JWT_SECRET + EEJ_ENCRYPTION_KEY at minimum | GREEN | S |
| 10.3 Provision readonly Neon role + `DATABASE_URL_READONLY` on staging | New Neon role with `SELECT`-only grants on `public` schema; add `DATABASE_URL_READONLY` as a Fly secret on `eej-api`; readonly consumers (reports, analytics, Sentry pull) switch to it | GREEN | M |
| 10.4 Staging Neon branch renewal before May 23 | Neon free-tier branches auto-delete after 14 days; staging branch expires 2026-05-23. Either: (a) renew + reconfirm, (b) upgrade Neon plan to make staging branch permanent, (c) script auto-renewal | GREEN | S — but TIME-BOXED |
| 10.5 CI test environment DATABASE_URL credential | Today's CI failures are this — same Neon root cause as 10.1. Rotate CI's `DATABASE_URL` in GitHub Actions secrets after 10.1 lands | GREEN | S |
| 10.6 Sentry NODE-EXPRESS-8 alerter SELECT-all-columns hardening | Currently in Tier 2 (Item 2.4). **Decision: keep in Tier 2** — the alerter query hardening is feature-code work that's better grouped with the other Tier 2 SQL hygiene items. Phase 10 leaves a pointer so it's not forgotten. | GREEN | S (counted in Tier 2) |
| 10.7 Production audit-tier work | `eej-jobs-api` may also need the staging-style architectural fences and protections (e.g. same RBAC enforcement, same encryption posture, same audit-log invariants). Survey first; implement what gaps surface. | GREEN | M (after survey) |

**Acceptance for Phase 10 completion:** 10.1-10.5 + 10.7 done; CI green; `flyctl secrets list -a eej-api` shows rotated values; readonly role queryable from `eej-api` machine SSH session; staging Neon branch persists past 2026-05-23.

**Why parallel to Phase 1:** operational hygiene must not be blocked by feature backlog; same goes the other way. Different execution threads, different evaluators, no shared critical path.

### Phase 11 — Mood/Wellness (post-W3, design-pass-required)

Captured as future build — **not deferred indefinitely.** APATRIS has the primitives (`mood_entries` table, `MoodTab.tsx`, `WellnessTab.tsx`, `voice_checkins` table per Phase 1 audit findings W1/W2/W3/W14). EEJ can incorporate them ONLY after KRAZ defense is settled AND an opt-in/anonymized/no-manager-visibility design pass is reviewed by a legal advisor.

| Field | Detail |
|---|---|
| **Purpose** | Worker wellbeing self-reporting (mood scores, wellness check-ins, optional voice notes) — a HELP-aligned surface IF designed correctly (worker self-care, not management surveillance). |
| **Polish-legal-risk (default)** | **AMBER** for mood/wellness; **AMBER→RED** for voice biometrics. Reframed as "design-pass-required" — meaning the AMBER flag is dropped to GREEN only after the design-pass criteria below are met. |
| **Prerequisite (explicit gate, both required)** | (a) KRAZ classification settled (same as W3.1); (b) design pass reviewed by legal advisor against the three design-pass criteria below |
| **Design-pass criteria** | (1) **Opt-in:** worker explicitly enables the feature; default OFF; (2) **Anonymized aggregation:** if surfaced to manager, only as anonymized rollup (site-level / team-level averages, never per-worker); (3) **No manager visibility on raw entries:** raw mood entries / voice transcripts are worker-only or accessible only to a designated wellness lead role (not the worker's coordinator); (4) **Retention policy:** explicit retention window (suggested: 90 days for raw entries, indefinite for opt-in anonymized aggregates); (5) **Voice biometric handling:** if voice_checkins ship, full Polish RODO consent flow + transcript-only retention (drop raw audio after transcription). |
| **Items in scope** | 11.1 `mood_entries` (weekly self-report); 11.2 `MoodTab.tsx` (worker UI); 11.3 `WellnessTab.tsx` (worker UI); 11.4 `voice_checkins` (only if criterion 5 satisfied; otherwise defer further). |
| **Architecture A** | build in EEJ; APATRIS implements from EEJ as reference later. (EEJ ports APATRIS's schema shape first.) |
| **Effort** | M for 11.1-11.3 combined when unblocked; +M for 11.4 if shipped. |

---

## Section 4 — APATRIS-borrowed-items × phase cross-reference

| APATRIS item | Phase 1 audit class | Lands in unified plan |
|---|---|---|
| W4/W5 messages + MessagingTab | (b) incorporate | Phase 4 W2.3 complaint system (shared thread mechanics) + Phase 8 Live Chat (real-time transport on top) |
| W6/W7 leave_requests + LeaveTab | (b) incorporate | Phase 4 W2.2 |
| W8/W9 hours_log + TimesheetTab | (b) incorporate | Phase 2 W1.1 |
| W10 GpsCheckinTab worker-side | (b) incorporate | Phase 2 W1.1 (GPS embedded in hours-log submit) |
| W11 ManagerHome 306-LOC | (b) incorporate | Phase 2-4 coordinator-tier UI grows as W1+W2 land; full inbox in Phase 8 |
| W12 push_subscriptions + push-sender | (b) incorporate | Phase 2 W1.3 |
| W13 notification_log | (b) consider | Phase 1 verify EEJ `eej_notification_log` covers; otherwise port via Phase 2 W1.3 |
| E1 escalation-engine.service | (b) reference | Phase 4 W2.1 no-show engine; reused in Phase 8 chat urgent-escalation routing |
| E2 deadline-engine.service | (b) reference | Phase 1 2.9 + Phase 2 W1.3 |
| E4 test_scenarios + routes | (b) incorporate | **Phase 7 W3.2 — KRAZ-defense gated** (prerequisite: W1+W2 in production) |
| E5 worker-legal-view.service | (b) reference | Phase 3 scaffold-404 backends — back EEJ's MyUPO/MySchengen (Tier 1 fix from CLAUDE.md priority list) |
| E6 notification.service router | (b) incorporate | Phase 2 W1.3 (channel-routing infra) |
| C1 site-coordinators route + coordinator role | (b) incorporate | Phase 2-4 — needs CLAUDE.md RBAC review (coordinator-tier vs operations-tier; see Q7) |
| W1/W2/W3 mood / wellness | (d) flag | **Phase 11 — post-W3 design-pass-required** (NOT deferred indefinitely; gate = KRAZ settled + 3 design-pass criteria) |
| W14 voice_checkins | (d) flag → biometric | **Phase 11 sub-item 11.4** — ships only if design-pass criterion 5 (voice biometric handling: full Polish RODO consent + transcript-only retention) is satisfied; otherwise defer further |
| C4 face-auth | (d) RED | Out of scope (Section 5) |
| Audit #3 ai-audit dedicated route | (b) incorporate | Phase 1 2.x (small, fits hardening) |
| Audit #4 per-worker activity-log route | (b) incorporate | Phase 1 2.x |
| **Net-new (no APATRIS source)** — Live Chat (#34) | N/A (EEJ-leads) | **Phase 8** — EEJ builds the primitive; APATRIS implements from EEJ as reference later |
| **Net-new** — Mobile install testing | N/A (validation, not feature) | **Phase 9** — gates Phase 2 W1 |
| **Net-new** — Operational hygiene runbook | N/A (operator work) | **Phase 10** — parallel with Phase 1 |

---

## Section 5 — Explicitly OUT of scope (and why)

This list is intentionally **shorter** than the Day 28 v1 — items previously here as "deferred" are now captured in Phases 7/11 with explicit prerequisites. Items below are truly out-of-scope (APATRIS-specific surfaces that don't apply to EEJ's business shape, or maximum-risk items).

- **Merging EEJ with APATRIS codebase.** Architecture A locked. Cross-codebase ports are surgical; nothing flows back from EEJ to APATRIS automatically (APATRIS implements from EEJ as reference on their own schedule).
- **APATRIS legal-* surface** (legal-cases, legal-brief, legal-evidence-ocr, legal-copilot, legal-status, legal-research, legal-immigration-command). EEJ doesn't fight Lubuski UW summons; this is APATRIS's KRAZ defense.
- **APATRIS PIP-inspection-report / authority-response infra.** Specific to APATRIS's run-in with Polish authorities. EEJ has lighter legal posture (recruitment + worker management; not running cross-border outsourcing).
- **APATRIS MOS package / posted-workers / A1 form infra.** EEJ doesn't post workers across borders today.
- **APATRIS multi-tenant SaaS scaffolding** (whitelabel, saas-billing). EEJ is single-tenant per CLAUDE.md tenancy notes. (Premium-tier SaaS positioning of Phase 8 Live Chat is a separate forward decision — out-of-scope HERE refers to the multi-tenant tenant-isolation infrastructure.)
- **APATRIS fines / fraud / churn / ROI analytics.** APATRIS-specific business surfaces driven by their portfolio shape, not EEJ's.
- **Face-auth biometric login (APATRIS C4).** Polish RODO / GDPR maximum risk; no acceptable EEJ use case.
- **Reliability/points implemented WITHOUT KRAZ-classification gate.** Captured in Phase 7 W3.1 with explicit prerequisite — never built before that prerequisite resolves.
- **Mood/wellness/voice implemented WITHOUT design-pass review.** Captured in Phase 11 with explicit 5-criteria design-pass gate — never built before legal advisor signs off.

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
11. **Phase 8 Live Chat WebSocket infrastructure choice:** Pusher / Ably / self-hosted Socket.IO / Anthropic MCP transport (per Phase 8 ARCHITECTURE DECISION block)? Recommendation pending: Pusher for premium-tier MVP, migrate to self-hosted Socket.IO if vendor cost becomes blocker at scale.
12. **Phase 9 Mobile install testing — Manish solo or with team (Liza/Karan/Marj/Yana)?** Solo = faster, less coordination; team = better device coverage + role-specific findings (e.g. Yana on Ukrainian-language flows, Karan on operations-tier surfaces).
13. **Phase 10 Neon password rotation timing:** rotate NOW (before further work to limit blast radius of the leaked credential) or end-of-Tier-2 (after hardening lands so rotation only fires once)? Recommendation: rotate NOW (10.1 + 10.2 + 10.5) — the credential leak is a today-class risk and Tier 2 hardening doesn't touch DB credentials.

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

## Section 9 — Operational Hygiene runbook (Phase 10 consolidated)

Step-by-step for the parallel operational-hygiene thread. Designed to be runnable by Manish without further prompting; checkpoints flagged for chat-Claude review.

### Pre-run state (today)
- Neon `neondb_owner` password leaked in chat history (Day 28 morning) — must rotate
- Fly secrets on `eej-api` (staging) + `eej-jobs-api` (production) reference the leaked credential via `DATABASE_URL`
- CI `DATABASE_URL` in GitHub Actions secrets — same credential, currently causing test failures
- Staging Neon branch auto-deletes 2026-05-23 (6 days from today's revision date 2026-05-17)
- No readonly Neon role exists; all consumers use the same `neondb_owner` super-grant credential
- `eej-jobs-api` production audit-tier work uncertain — needs survey

### Step 1 — Rotate Neon `neondb_owner` password (10.1, HIGH priority)
1. Log into Neon console (manish@edu-jobs.eu account)
2. Project → Roles → `neondb_owner` → Reset password
3. Copy new password to clipboard (do NOT paste into chat / docs / commit)
4. Build new `DATABASE_URL` string locally; verify it connects via `psql` from your laptop
5. **Checkpoint:** report new connection works; chat-Claude confirms before proceeding to Step 2

### Step 2 — Rotate Fly secrets (10.2)
1. `flyctl secrets set -a eej-api DATABASE_URL=postgresql://...` (new credential from Step 1)
2. Wait for `eej-api` rolling restart, verify `https://eej-api.fly.dev/api/healthz` → 200
3. `flyctl secrets set -a eej-jobs-api DATABASE_URL=postgresql://...` (same new credential)
4. Wait for `eej-jobs-api` rolling restart, verify `https://eej-jobs-api.fly.dev/api/healthz` → 200
5. While rotating, also rotate JWT_SECRET + EEJ_ENCRYPTION_KEY on both apps **only if** Manish accepts the trade-off (rotating JWT_SECRET logs everyone out; rotating EEJ_ENCRYPTION_KEY breaks decryption of existing PESEL/IBAN records — DO NOT rotate EEJ_ENCRYPTION_KEY without a re-encryption migration plan)
6. **Checkpoint:** both apps healthy; staging + prod login still works; chat-Claude confirms before Step 3

### Step 3 — Rotate CI credential (10.5)
1. GitHub repo → Settings → Secrets and variables → Actions → `DATABASE_URL` → Update with new credential
2. Re-run last failing CI job; verify green
3. **Checkpoint:** CI green; chat-Claude confirms

### Step 4 — Provision readonly Neon role (10.3)
1. Neon console → Roles → Create role `eej_readonly` with password
2. SQL on the staging branch: `GRANT USAGE ON SCHEMA public TO eej_readonly; GRANT SELECT ON ALL TABLES IN SCHEMA public TO eej_readonly; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO eej_readonly;`
3. Verify: `psql` as `eej_readonly`, run `SELECT 1; UPDATE workers SET name='x' WHERE 1=0;` → second should error with permission denied
4. `flyctl secrets set -a eej-api DATABASE_URL_READONLY=postgresql://eej_readonly:...`
5. Code change tracked separately — readonly consumers (reports, analytics, Sentry pull jobs) switched to `DATABASE_URL_READONLY` env var (incremental migration, not part of this Step 4)
6. **Checkpoint:** readonly role exists + queryable + correctly denied writes

### Step 5 — Staging Neon branch renewal (10.4) — TIME-BOXED to 2026-05-23
1. Neon console → Branches → `staging` → Check expiry date
2. Pick one: (a) Refresh the branch (resets the 14-day timer), (b) Upgrade Neon plan to Pro for permanent branches (paid), (c) Add a script that auto-refreshes via Neon API on day 12 of the cycle
3. Recommendation: (b) Pro plan — eliminates the recurring chore and 6-day cliff
4. **Checkpoint:** staging branch persists past 2026-05-23

### Step 6 — Production audit-tier survey (10.7)
1. Compare `eej-jobs-api` against the same fences/protections Manish applied to `eej-api`:
   - Encryption posture (`EEJ_ENCRYPTION_KEY` set; `lib/encryption.ts` paths covered)
   - RBAC enforcement (every protected route has `authenticateToken` + role check)
   - Audit-log invariants (INSERT-only on `audit_entries`)
   - Tenant isolation (every tenanted query uses `requireTenant` + `scopedWhere`)
   - CORS allowlist (no wildcards)
   - Stripe webhook signature verification
2. Report gaps; implement fixes; commit per gap
3. **Checkpoint:** survey doc committed; gaps closed or queued

### Phase 10 completion
- 10.1 / 10.2 / 10.3 / 10.4 / 10.5 done; 10.7 surveyed and triaged; 10.6 left in Tier 2 with a Phase 10 pointer
- `flyctl secrets list -a eej-api` shows rotated values (timestamps post Step 2)
- CI green over at least 3 consecutive runs
- Readonly role queryable from `eej-api` machine SSH session (`flyctl ssh console -a eej-api` → `psql $DATABASE_URL_READONLY -c "SELECT 1"`)
- Staging Neon branch persists past 2026-05-23

---

## Status

- **Phase 1 audit:** committed `26012a6`
- **Phase 2 unified plan v1:** committed `c0e68f9`
- **Phase 2 unified plan v2 (this revision — adds Phases 8-11 + Section 9):** this document, committing next.
- **Phase 3 next-step prompt:** drafted in Section 8, NOT auto-sent.
- **Awaiting Manish:** open questions Q1-Q13 in Section 6 + Section 8 chat-Claude-check items before execution starts.

---

## 5-element self-review (per methodology template)

1. **What changed.** Day 28 plan revised to capture every feature as part of the future build — nothing parked, nothing deferred-indefinitely. Added Phase 8 (Live Chat #34), Phase 9 (Mobile Install Testing), Phase 10 (Operational Hygiene parallel with Tier 2), Phase 11 (Mood/Wellness post-W3). Reframed Phase 7 W3 from "deferred" to "KRAZ-defense gated" with explicit prerequisites. Added APATRIS-porting note ("build in EEJ; APATRIS implements from EEJ as reference later") to W1.1, W1.2, W1.3, W2.1, W2.2, W3.1, W3.2, Phase 8, Phase 11. Updated Section 4 cross-reference with new rows. Shrunk Section 5 OUT-of-scope to truly-out items (face-auth biometric, APATRIS-specific business surfaces). Added Q11/Q12/Q13 to Section 6. Added Section 9 — six-step Operational Hygiene runbook.
2. **Why this scope.** Manish + chat-Claude explicitly required nothing be parked. Previous draft had W3 framed as "deferred" and mood/wellness as "out of scope" — both are now part of the plan with explicit gating prerequisites, so the operator can see exactly what unblocks each. Live Chat (#34) added as a premium-tier feature for paying agencies. Operational hygiene split into its own parallel phase because the Neon credential leak today is a today-class risk that cannot wait for feature work.
3. **Verification mechanism.** Every new phase has acceptance criteria + Polish-legal-risk flag + Architecture A note + APATRIS-source-reference where applicable. Section 9 runbook is step-by-step with explicit checkpoints. Section 6 open questions cover the architecture decisions that must resolve before Phase 8 execution + the Phase 9 testing-team scope + the Phase 10 timing decision.
4. **What was NOT verified.** Phase 8 effort estimate (XL) is a rough order-of-magnitude — could be larger depending on Phase 8 ARCHITECTURE DECISION outcome (self-hosted Socket.IO is significantly bigger than Pusher integration). Phase 10.7 production audit-tier survey scope is unknown until the survey runs. Phase 11 design-pass criteria (5 items listed) are draft — legal advisor may add or modify them. Phase 9 testing matrix doesn't enumerate every P0-P6 sub-fix because the post-P0-P6 commit hash is the source of truth; testing reads from that.
5. **Risks.** (i) Phase 8 Live Chat scope creep — XL is honest but bigger if AI auto-categorization Phase 2 absorbs scope from MVP. Mitigation: ARCHITECTURE DECISION gate before scoping execution. (ii) Phase 10.1 + 10.2 + 10.5 rotation order matters — rotating Fly secrets before Neon password is rotated leaks the new secret to whoever still has the old password. Section 9 enforces order Step 1 → Step 2 → Step 3 explicitly. (iii) Phase 11 design-pass criteria may shift after legal review; the gate is the legal review itself, not the current criteria draft. (iv) Phase 7 W3.1 prerequisite "KRAZ classification settled" depends on APATRIS's legal posture resolving — EEJ doesn't control that timeline; W3.1 could remain gated indefinitely if APATRIS's KRAZ resolution drifts.

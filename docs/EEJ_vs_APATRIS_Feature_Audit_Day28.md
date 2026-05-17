# EEJ ← APATRIS Feature Audit (Day 28)

**Date:** 2026-05-16 (Day 28)
**Scope:** Read-only cross-codebase audit. Mirror of APATRIS Claude's Day-30 doc (`/Users/manishshetty/Desktop/Apatris-Compliance-Hub/artifacts/api-server/docs/APATRIS_vs_EEJ_Feature_Audit_Day30.md`) — opposite direction: EEJ looks at APATRIS, identifies what APATRIS has that EEJ doesn't, classifies cross-port viability.
**EEJ HEAD at audit:** `af76ed3` (after P5 follow-on)
**APATRIS HEAD at audit:** `e0e0990` (Day 30 commit 21 — "Worker App Vision Master Prompt")
**APATRIS path:** `/Users/manishshetty/Desktop/Apatris-Compliance-Hub/`

---

## Filesystem note

APATRIS reachable. Single canonical copy under `/Users/manishshetty/Desktop/Apatris-Compliance-Hub/`. No stale duplicates seen.

Key APATRIS directories audited:
- `artifacts/api-server/src/` — routes (130 files), services (~70), lib/init-db.ts (3733 LOC, 150 `CREATE TABLE` statements)
- `artifacts/workforce-app/src/components/tabs/` — 64 worker-app tabs
- `artifacts/apatris-dashboard/src/` — 202 TSX files

Key EEJ directories already known from prior session work:
- `artifacts/api-server/src/routes/` — 33 route files
- `artifacts/api-server/src/db/schema.ts` — 66 `pgTable` exports
- `eej-mobile-HIDDEN/src/pages/tabs/` — ~33 modules per `MoreTab.tsx`
- `artifacts/apatris-dashboard/src/` — EEJ-modified dashboard (historical path name)

---

## Scale comparison

| Surface | APATRIS | EEJ | Delta |
|---|---|---|---|
| API route files | 130 | 33 | APATRIS 4× |
| Service files | ~70 | ~15 | APATRIS 4.5× |
| DB tables | ~150 (raw SQL) | 66 (Drizzle) | APATRIS 2.3× |
| Worker-app tabs | 64 | ~33 | APATRIS 2× |
| Dashboard TSX | 202 | (mixed; not directly counted) | comparable |

APATRIS surface is meaningfully larger but heavily weighted toward legal/regulatory primitives (~20 `legal-*` routes, ~15 `legal-*` services, regulatory-intel pipeline, KRAZ defense engine, MOS package tracking, authority-response correspondence). EEJ surface is recruitment/operations weighted. **Most APATRIS routes are not transferable**; the audit below filters to genuinely cross-port-relevant surfaces.

---

## Per-surface comparison table (10 surfaces — mirror of APATRIS Day-30 + open-ended #10)

| # | Surface | APATRIS state | EEJ state | Gap | Classification |
|---|---|---|---|---|---|
| 1 | **Worker profile structure** | 2 tabs (`profile` + `payroll-history`), `artifacts/apatris-dashboard/src/components/WorkerProfilePanel.tsx:499` per APATRIS Day-30 audit | **11 panels role-adaptive**, `eej-mobile-HIDDEN/src/components/WorkerCockpit.tsx:44-72` | EEJ ahead | **(a) already** — no port from APATRIS to EEJ |
| 2 | **AI summary / AI action recs** | Single PIP-readiness call site per APATRIS audit | 6 files: schema + 2 routes + UI integration + tests, per APATRIS audit | EEJ ahead | **(a) already** |
| 3 | **AI decisions audit log** | Dedicated `routes/ai-audit.ts` (APATRIS) | UI panel `aiHistory` in `WorkerCockpit.tsx:53` but **no dedicated route file** (`find … -iname "ai-audit*"` on EEJ returns zero) | EEJ has UI, missing dedicated route shape; APATRIS has route, missing UI inline | **(b) incorporate** — port the route shape; EEJ UI consumes it |
| 4 | **Activity log per worker** | `audit_logs` table at `artifacts/api-server/src/lib/init-db.ts:843` with `worker_id TEXT`; no per-worker route per APATRIS audit | EEJ has 66 Drizzle tables; `audit_entries`-style table exists per CLAUDE.md; **no per-worker activity-log route verified** | Both missing per-worker route | **(b) incorporate** — net-new on both, build the route on EEJ first |
| 5 | **Deep-link "Open X →" pattern** | NONE per APATRIS Day-30 | Fully built: `setDeepLinkWorker + onOpenModule` in `eej-mobile-HIDDEN/src/components/WorkerCockpit.tsx` at lines 35, 502, 503 + module routing | EEJ ahead | **(a) already** |
| 6 | **Alerts inline on profile** | NONE per APATRIS Day-30 | Panel key #1 in role-adaptive ordering (`WorkerCockpit.tsx:61-72`), `data.alerts` from `/workers/:id/cockpit` response (`lib/api.ts:202`) | EEJ ahead | **(a) already** |
| 7 | **Payroll per worker** | Inline `payroll-history` tab + `routes/payroll/workers/:id` route per APATRIS Day-30 | `payroll` panel in WorkerCockpit + `onOpenModule("payroll", workerId)` deep-link | Different UX (APATRIS inline / EEJ panel + deep-link); both functional | **(a) already** — patterns coexist |
| 8 | **WorkerLink invariant** (every-page-clickable) | NONE per APATRIS Day-30 | NONE — `grep WorkerLink\|WorkerChip\|WorkerBadge` returns zero on EEJ | Both missing | **net-new on both** — keep on roadmap |
| 9 | **Time/site intelligence** | NONE per APATRIS Day-30 | NONE | Both missing | **net-new on both** — keep on roadmap |
| 10 | **Open-ended cross-port find** | See "APATRIS-has-EEJ-doesn't" inventory below | — | See below | mixed classifications |

---

## APATRIS-has-EEJ-doesn't inventory (the actual Phase 1 deliverable)

Filtered to surfaces that **could** add value to EEJ. APATRIS-specific legal/KRAZ infra (`authority-response`, `legal-brief`, `legal-evidence-ocr`, `pip-inspection-report`, MOS engine, regulatory-extraction, etc.) excluded as APATRIS-specific or relevant only if EEJ also gets PIP inspection drama — flagged separately.

### Worker-side primitives APATRIS has

| # | APATRIS asset | File:line | EEJ equivalent? | Polish-legal-risk | Classification |
|---|---|---|---|---|---|
| W1 | `mood_entries` table (weekly 1-5 score + comment + site) | `lib/init-db.ts:1099-1110` | None in `db/schema.ts` (grep `pgTable.*mood` → 0 hits) | **AMBER** — employee mood monitoring could read as surveillance under Polish RODO + labor code | **(d) flag** — useful for wellness but design carefully (opt-in, anonymized, no manager visibility) |
| W2 | `MoodTab.tsx` (137 LOC) | `workforce-app/src/components/tabs/MoodTab.tsx` | None in `eej-mobile-HIDDEN` | AMBER — see W1 | **(d) flag** |
| W3 | `WellnessTab.tsx` (60 LOC) | `workforce-app/src/components/tabs/WellnessTab.tsx` | None | AMBER — same reasoning | **(d) flag** |
| W4 | `messages` + `message_threads` tables (encrypted P2P messaging primitive) | `lib/init-db.ts:1632-1665` | EEJ has `whatsapp_messages` table (`schema.ts:241`) but no in-app generic messaging table | **GREEN** — direct worker↔coordinator communication, statutory neutral | **(b) incorporate** — Manish Section D (Communication system) |
| W5 | `MessagingTab.tsx` (111 LOC) | `workforce-app/src/components/tabs/MessagingTab.tsx` | None | GREEN | **(b) incorporate** — Manish Section D |
| W6 | `leave_requests` table + `routes/self-service/leave` GET/POST | `lib/init-db.ts:1244-1266`, `LeaveTab.tsx:27,35` | None on EEJ (grep `leave_request` → 0 hits in EEJ schema) | **GREEN** — Polish Labor Code Art. 152 statutory leave entitlement; supporting it is helpful, not surveillance | **(b) incorporate** — Manish Section C |
| W7 | `LeaveTab.tsx` (111 LOC) | `workforce-app/src/components/tabs/LeaveTab.tsx` | None | GREEN | **(b) incorporate** — Manish Section C |
| W8 | `hours_log` table | `lib/init-db.ts:2250-2255` | EEJ uses different table; `pgTable("payroll_records")` (`schema.ts`) — different shape, hours embedded in payroll | partial overlap | **(b) consider** — Manish Section A "Hours" needs its own worker-side primitive distinct from payroll-final |
| W9 | `TimesheetTab.tsx` (243 LOC) | `workforce-app/src/components/tabs/TimesheetTab.tsx` | EEJ `NetPerHourTab.tsx` exists but is calculator-only, not submission history | partial | **(b) incorporate** — Manish Section A |
| W10 | `GpsCheckinTab.tsx` (worker-side check-in) | `workforce-app/src/components/tabs/GpsCheckinTab.tsx` | EEJ has `GPSTrackingTab.tsx` (staff-side) but no worker-side check-in tab; backend `gps_checkins` table exists per CLAUDE.md | partial | **(b) incorporate** — Manish Section A |
| W11 | `ManagerHome.tsx` (306 LOC — coordinator/manager dashboard) | `workforce-app/src/components/tabs/ManagerHome.tsx` | None on EEJ (executive/legal/operations homes exist but no coordinator-tier home) | GREEN | **(b) incorporate** — Manish Section G |
| W12 | `push_subscriptions` table + `push-sender.service.ts` (web push infra) | `lib/init-db.ts:540`, `services/push-sender.service.ts:34` | None on EEJ; EEJ has `whatsapp_messages` + email channels only | GREEN | **(b) incorporate** — Manish Sections A/B/D need push |
| W13 | `notification_log` table (channel tracking: push/sms/email status + preview) | `lib/init-db.ts:867`, `push-sender.service.ts:25` | EEJ has `eej_notification_log` (`schema.ts:704`) — partial equivalent, semantics may differ | partial | **(b) consider** — verify EEJ table covers same fields |
| W14 | `voice_checkins` table | `lib/init-db.ts:1118-` | None on EEJ | **AMBER** — voice recording → consent + GDPR + Polish RODO heavy | **(d) flag** — could enable Manish Section E voice complaints, but high consent overhead |

### Engine / service primitives APATRIS has

| # | APATRIS asset | File:line | EEJ equivalent? | Polish-legal-risk | Classification |
|---|---|---|---|---|---|
| E1 | `escalation-engine.service.ts` (case SLA + deadline escalation) | `services/escalation-engine.service.ts:18-147` | EEJ has `eej_escalation_log` table (`schema.ts:740`) but no engine service file | partial — table without engine | **(b) incorporate** — pattern reference for Manish Section B no-show escalation |
| E2 | `deadline-engine.service.ts` | `services/deadline-engine.service.ts` | EEJ has compliance alert cron but no deadline-engine service | partial | **(b) reference** — Manish Section F document-expiry escalation |
| E3 | `action-engine.service.ts` | `services/action-engine.service.ts` | EEJ services pattern (agency-compliance-engine etc.) — different shape | comparable | **(c) APATRIS-specific** — EEJ's per-domain service is the equivalent pattern |
| E4 | `test_scenarios` + `test_scenario_runs` tables + `routes/test-scenarios.ts` | `lib/init-db.ts:3456-3471`, `routes/test-scenarios.ts` | None on EEJ | GREEN — testing infra | **(b) incorporate** — Manish Section I scenario simulator (Tier W3) |
| E5 | `worker-legal-view.service.ts` (worker's-eye-view of legal status) | `services/worker-legal-view.service.ts` | EEJ has `MyStatusTab.tsx` + `MyUPOTab.tsx` + `MySchengenTab.tsx` (worker-side views) | partial — EEJ has tab UIs but maybe no aggregator service | partial overlap | **(b) reference** — EEJ may want an aggregator service to back its multiple worker-side status tabs |
| E6 | `notification.service.ts` (channel router with template management) | `services/notification.service.ts` | EEJ has channel-specific sends (whatsapp, email) but no unified router | gap | **(b) incorporate** — Manish Section D template management |
| E7 | `worker-validation.service.ts` + `routes/worker-validation.ts` | dedicated worker-validation endpoint | EEJ has compliance computation via `lib/compliance.ts` (toWorker, filterWorkers) | comparable approaches | **(a) already** |

### Communication / coordinator surfaces APATRIS has

| # | APATRIS asset | EEJ equivalent? | Classification |
|---|---|---|---|
| C1 | `site-coordinators.ts` route + `routes/coordinator/*` admin endpoints | EEJ uses role=operations (Yana, Karan, Marj) but no dedicated coordinator role per CLAUDE.md 4-tier RBAC | **(b) incorporate** — Manish Section G coordinator dashboard implies a coordinator-tier role distinct from operations |
| C2 | `worker-files.ts` route (worker-specific file uploads) | EEJ has worker scanning via cockpit but no per-worker file-folder endpoint | **(b) consider** — minor; could be useful for Section F documents |
| C3 | `worker-email.ts` route | EEJ uses BREVO SMTP via notification cron; no per-worker email route | partial | **(b) reference** |
| C4 | `face-auth.ts` route (biometric login) | None | **RED** — heavy biometric data → Polish GDPR + RODO maximum-risk territory; defer |
| C5 | `signatures.ts` + `certified-signatures.ts` | EEJ has POA legal protection (`poa-legal-protection.ts`) — different angle | **(c) APATRIS-specific** |

### Schema-level inventory (APATRIS has, EEJ doesn't)

From `lib/init-db.ts` CREATE TABLE statements grep'd against EEJ schema:

| APATRIS table | Purpose | EEJ equivalent? | Polish-legal-risk |
|---|---|---|---|
| `mood_entries` | Weekly mood self-report | none | AMBER |
| `voice_checkins` | Voice-recorded check-in | none | AMBER |
| `messages` + `message_threads` | In-app messaging | partial (whatsapp_messages) | GREEN |
| `leave_requests` | Statutory leave workflow | none | GREEN |
| `test_scenarios` + `test_scenario_runs` | Test scenario engine | none | GREEN |
| `fine_predictions` | Fine prediction | none (legal-specific) | N/A |
| `push_subscriptions` | Web push infra | none | GREEN |
| `notification_log` | Channel send log | partial (`eej_notification_log`) | GREEN |
| `mos_packages` / `posted_workers` / `posted_notifications` | A1 posted-workers compliance | none (EEJ doesn't post workers cross-border yet) | depends on EEJ scope expansion |
| `regulatory_snapshots` | Periodic regulatory tallies | EEJ has regulatory updates but no snapshot rollups | low priority |

### Not-cross-port-relevant (APATRIS-specific)

- All `legal-*` routes/services (legal-cases, legal-brief, legal-evidence-ocr, legal-copilot, legal-status, etc.) — APATRIS's KRAZ-defense / Lubuski UW response infra; **EEJ doesn't fight authority correspondence**, so most of this is not applicable
- `pip-inspection-report.ts` / `authority-response.ts` — same reasoning
- `mos-engine.service.ts` / `mos-package.service.ts` — Multi-Origin Service tracking specific to APATRIS's outsourcing structure
- `fines.ts` / `fraud.ts` / `churn.ts` — APATRIS-specific business analytics
- `whitelabel.ts` / `saas-billing.ts` — APATRIS SaaS scaffolding (EEJ is single-tenant per CLAUDE.md tenancy notes)
- `face-auth.ts` — see RED flag above
- `mood_entries` / `voice_checkins` if they go beyond consent → see AMBER flags above

---

## Polish-legal-risk lens (applied to incorporate-candidates)

Per the user's HELP-vs-HURT classification (does this make EEJ look more like a process-outsourcing contractor or more like an agency?):

| Item | Flag | Reasoning |
|---|---|---|
| Leave self-service (W6/W7) | **GREEN** | Polish Labor Code Art. 152 — supporting statutory leave is contractor-neutral; helps regardless of KRAZ posture |
| Messages / messaging (W4/W5) | **GREEN** | Worker↔coordinator communication channel is statutory-neutral |
| Hours logging (W8/W9) | **GREEN** | Tying hours to deliverables (not surveillance) HELPS the defense |
| GPS check-in (W10) | **AMBER** | Tied to deliverables (clock-in for shift) → HELP; tied to continuous monitoring → HURT. Design carefully — only fire on shift-start/end |
| Push notifications (W12) | **GREEN** | Notification channel itself is neutral; what gets sent matters |
| Manager/coordinator home (W11) | **GREEN** | Internal coordinator UI is invisible to authority test |
| Mood/wellness (W1/W2/W3) | **AMBER** | Could read as employee monitoring; mitigation = opt-in, anonymized, no manager visibility |
| Voice check-ins (W14) | **AMBER→RED** | Voice = biometric under GDPR; consent + retention rules apply; HURT defense unless very limited use case |
| Face-auth (C4) | **RED** | Biometric login — Polish GDPR + RODO maximum risk; defer |
| Test scenario engine (E4) | **GREEN** | Internal testing infra — invisible to authority |
| Escalation engine (E1) | **GREEN if** scoped to compliance escalation (doc expiry, late TRC) | **AMBER if** scoped to attendance escalation (no-show points). Same primitive, two different uses |
| AI audit log route (#3) | **GREEN** | Transparency layer; HELP-aligned (showing what AI decided) |

---

## Anti-hallucination caveats

- **EEJ schema count = 66** is from CLAUDE.md and verified by `grep -c "= pgTable("` in `artifacts/api-server/src/db/schema.ts` returning 66. `lib/db/src/schema/index.ts` is a stub (no `pgTable` exports there).
- **APATRIS 150 tables** is from `grep -c "CREATE TABLE IF NOT EXISTS" lib/init-db.ts`. Some may be defined via `ALTER TABLE` separately and not all CREATEs reflect cleanly distinct tables.
- **APATRIS service file count ~70** is from `ls services/` line count; some are `.test.ts` files (not production code).
- **64 APATRIS workforce-app tabs** is from `find … -name "*.tsx" -type f | wc -l` — includes Home tabs (Tier3Home / Tier4Home / Tier5Home / ManagerHome / OwnerHome) which aren't strictly Tab-component-pattern. Effective consumer-facing tab count is ~58.
- **Per-feature classifications (a)/(b)/(c)/(d) are surface-presence judgments**, not implementation-quality judgments. APATRIS may have a route file that's stub-only; APATRIS Day-30 audit warned of the same on EEJ side. Phase B port should re-read each source.
- **APATRIS HEAD `e0e0990`** — only the most recent commit. APATRIS code may have churned since the Day-30 audit; cross-references to that audit are accurate to its own HEAD `9ddd689`, not necessarily this audit's HEAD.
- **`messages` + `voice_checkins` + `mood_entries` table existence ≠ active flows.** APATRIS Day-30 didn't deep-audit these; PWA tab existence (`MessagingTab.tsx` etc.) is suggestive but not proof of end-to-end wiring.
- **EEJ `MyStatusTab` / `MyUPOTab` / `MySchengenTab` Tier 1 status**: per CLAUDE.md, MyUPOTab + MySchengenTab fetch routes that don't exist server-side. So EEJ's worker-side legal-status surfaces are partially scaffolded — APATRIS's `worker-legal-view.service.ts` is therefore a higher-value reference than the table suggests.
- **"Tabs in workforce-app" ≠ tabs in production deploy.** APATRIS may render only a subset based on tier role.
- **No claim made about which side has higher code quality** — this audit is feature inventory, not architecture review.

---

## 5-element self-review (per methodology template)

1. **What changed:** Created `docs/EEJ_vs_APATRIS_Feature_Audit_Day28.md` — read-only, no code touched.
2. **Why this scope:** Mirror of APATRIS's Day-30 EEJ audit, opposite direction. Manish wants symmetric inventory before unifying the build plan.
3. **Verification mechanism:** Every claim cites file path + line number (or `grep`-output evidence) on both sides. APATRIS HEAD pinned at `e0e0990`. EEJ HEAD pinned at `af76ed3`.
4. **What was NOT verified:** APATRIS source-presence does NOT prove APATRIS feature works in production. Each `(b) incorporate` candidate needs a Phase B verify-then-port pass. EEJ worker-side tabs `MyUPOTab` / `MySchengenTab` are scaffolded-but-broken per CLAUDE.md — port from APATRIS's working equivalents (`worker-legal-view.service.ts`) is candidate, but APATRIS may have stub problems of its own.
5. **Risks:** Mood/wellness/voice surfaces flagged AMBER-RED on Polish-legal-risk. Incorporating without redesign = HURT for KRAZ defense. Face-auth (C4) flagged RED outright. Polish-legal-risk lens applied per item; cross-check before Phase B.

---

## Status

- **Audit:** complete (this document).
- **Phase 2 input ready:** the `(b) incorporate` and `(d) flag` rows above feed directly into Phase 2's unified plan.
- **Phase 3 stub:** the first item Manish would build is in Phase 2's build-order, not chosen here.

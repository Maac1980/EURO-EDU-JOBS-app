# EOD — 2026-05-13 (Build Day)

**Branch:** `tuesday-cockpit-build` at `51a0714`
**Working agreement:** peer-mode-with-codified-roles (Manish operator / chat-Claude systemic / Claude Code safety)

This doc exists so May 14 morning can start dashboard cockpit work in 5 minutes
flat without re-reading the full day's conversation. Audit doc, case law,
FUTURE.md all already exist; this is the bridge between them and tomorrow.

---

## 1. What landed tonight

10 commits on `tuesday-cockpit-build`, dashboard auth unification + 2FA complete
end-to-end:

| # | SHA | Commit |
|---|---|---|
| 0a | `9ed9c47` | docs(future) — FUTURE.md with 4 deferred-work triggers |
| 0b | `3661f3d` | docs(audit) — Phase A audit doc approved |
| 1 | `c757b25` | fix(payroll) — capital-A typo, pre-existing |
| 2 | `0e37613` | feat(systemusers) — canEditWorkers column + T3 backfill |
| 3 | `11169be` | feat(auth) — unify dashboard on system_users + role-translation + JWT extension |
| 3.5 | `6226130` | docs(audit) — commit-5 coupling capture (auth.ts ↔ twofa.ts TODOs) |
| 4 | `2c937ec` | feat(2fa) — TOTP columns on system_users + requires_2fa backfill |
| 5a | `1f7e501` | feat(2fa) — sourceTable dispatch + system_users login 2FA check |
| 5b | `4ca636d` | feat(2fa) — recovery codes + admin reset + mandatory-for-admin |
| 6 | `51a0714` | feat(ui) — Profile 2FA section + AdminSettings security tab |

Plus three-thread audit completed (in chat, not committed as separate doc;
findings summarized in section 3 below). Dashboard cockpit gap surfaced as
larger than thread 3 — primary work for May 14.

Codification expanded across the day (terms 2 + 4 sharpened, term 8 added)
in chat conversation; case law for CORS-500 misrepresentation in
`docs/CASE_LAW_001_PEER_MODE_FIRST_TEST.md`. Worker-upload-link feature
researched (PARTIAL: backend + landing page LIVE from April 14 commit
`039adb5`; team-side "Copy Link" button missing).

---

## 2. What's live on branch `51a0714`

**State:**
- Typecheck clean on api-server.
- Typecheck has 6 pre-existing errors on dashboard in unrelated files
  (CrmPipeline, Dashboard, DocumentTemplates, GeofenceMap, LegalQueue,
  SystemTest). My files clean. Vite build succeeds.
- Vitest parses cleanly: 355 tests total, 144 pass locally, 210 skipped
  (DB-gated), 1 todo.
- Dashboard build clean (2.4MB api dist, 1.95MB dashboard bundle).

**Deployable to staging:** Yes, all 10 commits ready. **NOT YET DEPLOYED.**
Staging deploy is May 16 morning per re-anchored timeline (after dashboard
cockpit lands).

**Tested:** auth unification path (DASH.1-DASH.10, TFA.1-TFA.8b
integration tests written, all DB-gated, will run in CI). Manual UI
verification deferred to May 16 walkthrough.

**Not blocked by anything.** Continue is on green.

---

## 3. What May 14 starts with

**Primary work: dashboard cockpit Approach A.**

Port mobile `WorkerCockpit.tsx` pattern to dashboard so Liza/Anna/Manish
get the unified 11-panel worker view when they click a worker on the
dashboard. **Backend reuse:** the `/workers/:id/cockpit` aggregator
endpoint already exists and is used by mobile — dashboard fetches the
same payload and renders in dashboard density.

**File to create:** `artifacts/apatris-dashboard/src/pages/WorkerCockpitDashboard.tsx`
(or similar; convention-pick at start of work).

**Budget: 10 focused hours.** Brake checkpoint at hour 6 — if scope feels
bigger than the cuts below, stop and re-scope; don't push through.

### IN scope (must-have for May 18)

- 11 panels rendering from `/workers/:id/cockpit` aggregator
- Role-adaptive ordering — needs translation from mobile role names
  (`legal`/`executive`/`operations`) to dashboard role names
  (`admin`/`coordinator`/`manager`)
- AI summary panel with structured action buttons (`scan_document`,
  `send_whatsapp`, `open_trc`, `open_permit`, `open_payroll`, `add_note`)
  — action handlers wire to dashboard routes via wouter, not mobile
  tab-switching
- Deep-link nav: "Open TRC →" / "Open permit →" / "Open payroll →"
  navigate to dashboard pages pre-filtered to the worker
- Inline edit for contact (phone/email) — same as mobile pattern
- **Thread 3 baked in:** "Ask AI about appeal" button on TRC panel
  (when `status === "REJECTED"`) calling `POST /api/legal/answer` with
  `{workerId, question}` — preselects worker so Liza doesn't re-select
  on `LegalAnswerPage`
- Wire `WorkerProfilePanel` callsites to open the new cockpit alongside
  or instead of the slide-over

### DEFERRED if tight (acceptable fallbacks exist)

- `DocumentScanFlow` port — fallback: existing `WorkerProfilePanel`
  upload remains as Liza's document path; cockpit's "Scan & file →"
  button stubs to that
- WhatsApp send picker modal — fallback: link to Messaging page with
  worker pre-filtered (existing pattern)
- Notes inline quick-add — fallback: read-only notes panel for May 18;
  inline edit lands later
- AI reasoning log panel — fallback: keep read-only; the data IS in the
  aggregator response, just render simple list

---

## 4. Key decisions locked

- **Auth unification path X (fallback retained).** systemUsers first,
  users-table fallback for backward-compat per Phase A audit doc §1, §8.
  Anna's continuity preserved.
- **Path Z for admin reset placement.** Admin reset 2FA UI lives in
  `AdminSettings.tsx` Security tab, NOT in `WorkerProfilePanel` or
  TeamManagementCard (which is broken per PENDING-5 anyway).
- **Approach A for dashboard cockpit.** Port mobile pattern, reuse
  backend. Not Approach B (fat slide-over).
- **Thread 3 surfacing baked into May 14 cockpit work.** "Ask AI about
  appeal" lives in the cockpit's TRC panel, not in a separate commit.
- **Mandatory-for-admin / opt-in-for-others 2FA scope.** Manish + Anna
  required day-one. Liza + T3 optional.
- **Yana mobile-only May 18.** nationalityScope dashboard enforcement is
  24-site fix tracked in FUTURE.md §3; Yana stays on mobile until then.
- **PENDING-2 NOT absorbed into cockpit.** It's a separate Stats 403
  bug on Executive Home — May 15 morning ~30 min.
- **PENDING-3 NOT superseded by cockpit.** Cockpit = per-worker view;
  Liza Home = work queue. May 15 afternoon for polish or de-scope.

---

## 5. Key risks if tomorrow drifts

1. **Scope creep on cockpit.** The deferred items (scan flow,
   WhatsApp picker, notes quick-add) have natural pull. Hold the cuts
   unless you find one is cheaper-to-port-than-fallback. Brake at hour 6.

2. **Dashboard density vs mobile narrow column.** Mobile cockpit assumed
   430px column. Dashboard is wider; panel layout (single-col vs 2-col
   grid) is a design decision. If it triggers redesign-by-committee
   mid-implementation, hold for a quick decision instead of expanding
   scope. Default: single-column matching mobile, wider with more
   whitespace. Two-column is iteration N+1.

3. **Role translation edge case for managers without canEditWorkers.**
   The cockpit shouldn't show edit affordances to managers when their
   JWT carries `canEditWorkers === false`. Today this is theoretical
   (all seeded T3 = true), but the gate matters when T4 candidate-tier
   users eventually get dashboard access (rejected today, but pattern
   should hold).

4. **AI summary structured-action routing.** Mobile uses navContext
   singleton + tab switching. Dashboard uses wouter routes (`/workers/:id`,
   `/permits?workerId=X`, etc.). Need a small action→route dispatcher;
   not all action types map cleanly. Defer `add_note` → cockpit-internal
   scroll if dashboard doesn't have a notes route.

5. **6 pre-existing dashboard tsc errors** (PENDING-6). New cockpit file
   shouldn't import from the broken files (CrmPipeline, Dashboard,
   DocumentTemplates, GeofenceMap, LegalQueue, SystemTest). If it does,
   I'll inherit their type problems. Stay away from those imports.

---

## 6. Key artifacts to reference

- **`docs/PHASE_A_AUDIT_DASHBOARD_AUTH_UNIFICATION.md`** — the auth/2FA
  decision shape. §11.5 has commit sequence; §13 has known issues; §11
  has timeline.
- **`FUTURE.md`** — four deferred-work triggers with concrete revisit
  conditions (data-model unification, permissions table, nationalityScope
  enforcement, 2FA mandate review).
- **`docs/CASE_LAW_001_PEER_MODE_FIRST_TEST.md`** — first peer-mode
  case law (CORS-500 misrepresentation). Lessons: curl-vs-browser
  asymmetry, CORS rejection presents as 500, headers-first when
  symptoms diverge.
- **`docs/EOD_WEEK_MAY_12.md`** — Tuesday's ~9,000-line build log. Has
  full mobile cockpit panel inventory + AI summary structured-action
  shape + role-adaptive ordering rules. Reference for the port.
- **`docs/EEJ_CORE_PLAN.md`** — 1994-line Day-17 strategic plan. The
  three-thread framing originated here. Worker count statement (70
  active welders at Tekra/Izotechnik/Gaztech) conflicts with CLAUDE.md
  "200+ workers." Worth confirming with Manish.
- **Tonight's tracker** in chat history — PENDING items reorganized
  post-audit. Not committed; if context resets in the morning, the
  authoritative version is whatever is in section 3 of this doc.

---

## 7. North star reminder

**May 18 demo lands as "platform delivers AI legal-case value" not "we
can log in." Dashboard cockpit + thread 3 surfacing are what deliver
that.**

Auth + 2FA + role routing is necessary plumbing. Without dashboard
cockpit, Liza opens Andriy's TRC denial on her desk on May 18 morning
and gets a fragmented experience (slide-over → separate page → separate
page). With dashboard cockpit + "Ask AI about appeal" baked in, she
opens Andriy → sees everything → taps the alert → asks the AI → gets
a structured answer with Polish KPA Art. 127 references. That's the
plan's promise.

---

## 8. Open items surfaced tonight that aren't yet captured elsewhere

Per term 6 brake check — three things I'm noting here so they don't get
lost on the next compaction:

1. **Worker count discrepancy.** CLAUDE.md says 200+ workers;
   STRATEGIC_RECOMMENDATIONS.md (Day 17) says ~70 active welders at
   Tekra/Izotechnik/Gaztech. May 18 ops scope (WhatsApp templates,
   alert frequency, Liza workload) varies non-trivially between these
   numbers. **Confirm with Manish before May 18 walkthrough framing.**

2. **WhatsApp templates pending Twilio approval.** Per the EOD doc for
   Tuesday: 4 new templates (`trc_expiry_reminder_pl/en`,
   `documents_missing_pl/en`) seeded as `active=FALSE`. Manish flips
   them via SQL once Twilio Business Sender approves. **If templates
   aren't active by May 18, the cockpit's "Send TRC reminder" suggested
   action shows no matching template in the picker.** Add to May 17
   pre-deploy checklist.

3. **Anna's password heads-up.** Anna's portal login post-unification
   resolves through system_users path with her `EEJ_SEED_PASSWORD`
   bootstrap, not the legacy `EEJ_ADMIN_PASSWORD` she's been using.
   She needs to know before her first May 18 login attempt.
   **Add to May 17 pre-deploy checklist.**

These three items belong in a May 17 pre-deploy checklist that doesn't
yet exist. Tomorrow morning or during May 15 work is the right time to
create it.

---

End of day. Next session opens to dashboard cockpit Approach A on
branch `tuesday-cockpit-build` at `51a0714`. Read this doc first,
then `EOD_WEEK_MAY_12.md` section "Tuesday-end inventory of cockpit
features" for the panel-by-panel mobile reference. Start coding.

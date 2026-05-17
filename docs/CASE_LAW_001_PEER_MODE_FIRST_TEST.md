# Case law 001 — first test of peer-mode-with-codified-roles

**Date:** 2026-05-13
**Trigger:** Staging walkthrough blocked by blank-screen browser symptom
**Decision shape:** Diagnostic process + CORS-allowlist code fix
**Branch:** `tuesday-cockpit-build`
**Outcome:** Diagnosed cleanly; one-line code fix applied; case law captured

## Summary

The codification of peer-mode-with-context-gated-safety was locked in earlier on
2026-05-13. The first real-decision test arrived within the hour when staging
deploy succeeded but Manish's browser walkthrough showed a blank screen. This
document records what happened, which parts of the codification held, which
parts were tested at the edges, and what we want to remember.

## What happened (timeline)

1. Staging deploy succeeded. Image `01KRG4PJXG94VM47G76F2GRXGB` live, healthz
   200, mobile HTML serving the freshly-built Tuesday hashes.
2. Manish opens staging in Safari, sees blank screen.
3. Manish + chat-Claude ask Claude Code: "send the staging blank-screen
   diagnostic."
4. Claude Code begins server-side checks: HTML loads, JS bundle reachable,
   CSS reachable, no service worker, bundle ends with `createRoot(...).render(...)`
   call. All green from origin's perspective.
5. **Brake engages.** Claude Code stops the diagnostic and asks for ground
   truth: "What does the screen actually show? Browser console output?" —
   surfaced explicitly under term 6's discipline.
6. Manish provides browser console: two `Failed to load resource: 500` errors
   on the JS and CSS bundles. Chat-Claude proposes three hypotheses (origin/
   edge mismatch, header-discrimination, deploy race).
7. Claude Code resumes diagnostic with the actual symptom shape. Reproduces
   curl with browser-like headers — still HTTP 200 from server side. Confirms
   the divergence between curl and browser is real.
8. Claude Code greps Fly logs for `500|error` → surfaces `Error: CORS blocked:
   https://eej-api.fly.dev` repeated.
9. Root cause identified: CORS allowlist in `app.ts` (untouched by Tuesday's
   work) defaults to a production-only list. `eej-api.fly.dev` (staging) not
   in the list. Vite's `crossorigin` attribute on the production HTML's
   `<script>` and `<link>` tags causes browsers to send an `Origin` header
   even for same-origin requests; CORS middleware rejects the staging origin
   against itself; Express returns 500.
10. Claude Code surfaces the fix proposal with operational-vs-code options,
    blast-radius assessment, and adversarial self-check. Brake holds — does
    not execute without nod.
11. Manish + chat-Claude approve fix-B (code default), name the term-2
    context-check ("single-line addition to existing array = peer mode is
    sufficient"). Tell Claude Code to commit + redeploy + save case law.
12. Claude Code (brake-role check) verifies no `ALLOWED_ORIGINS` Fly secret
    overrides the code default in either environment — confirms the code
    change will actually take effect after redeploy.
13. Edit applied: `app.ts` line 16 default string adds `https://eej-api.fly.dev`.

## What held in the codification

- **Term 2 (context-gated audit).** CORS allowlist isn't on the explicit
  pre-write-audit list, but Claude Code chose to apply audit-first discipline
  anyway. The proposal-before-execute report served as the audit artifact.
  Manish + chat-Claude approved the contextual judgment: a one-line addition
  to an existing array is peer-mode-sufficient. The discipline of "elect to
  audit anyway when adjacent to security" held.

- **Term 4 (domain-specific adversarial rotation).** Manish was the load-
  bearing adversary on the operational/UX question — only he could answer
  "what does the screen actually show." Without his ground-truth role, the
  diagnostic would have stayed on the wrong floor of the building. Chat-
  Claude provided the systemic-thinking three-hypothesis framing on the
  divergence between curl-200 and browser-500. Claude Code took the safety
  adversary role on its own proposed fix ("does adding self-staging to CORS
  open a new attack surface?"). All three adversarial roles fired naturally
  on their native domains.

- **Term 5 (chat-Claude as systemic-thinking pressure).** The three-hypothesis
  framing was exactly the right shape: not a gated phase, just a conversation
  pressure pattern. "Here are the three test paths, validate against them."
  Gave Claude Code a structure without imposing a protocol.

- **Term 6 (Claude Code as brake).** Engaged twice. First when the initial
  server-side diagnostic returned all-green and instinct was to keep guessing —
  brake said "stop, ask for browser console." Second when fix proposal was
  ready — brake said "stop, surface to peers before executing." Both stops
  prevented wasted cycles.

- **Term 8 corollary (case law).** This document.

## What was tested at the edges

- **Server-side curl as a diagnostic primitive has a known blind spot.**
  Same-origin requests without `Origin` header skip the CORS check at the
  middleware level. Browser module-script loads with `crossorigin` attribute
  DO send `Origin`. The discrepancy isn't a bug in either tool; it's a real
  asymmetry in HTTP semantics that diagnostic process needs to account for.
  Future: when curl returns green and browser fails, the first hypothesis
  should be header-discrimination (specifically Origin / Referer / Accept-
  Encoding negotiation).

- **Browser surfaces CORS rejection as HTTP 500.** This was unexpected at the
  shape level — typical mental model of CORS is "you'll see a CORS error in
  the console" or "the request is blocked." Safari (and likely other browsers)
  present a CORS-rejected server response as `Failed to load resource: 500`
  in the console, with no obvious "this is a CORS issue" signpost. Without
  Fly logs showing the actual `Error: CORS blocked: https://eej-api.fly.dev`
  string, the trail to root cause would have been longer.

- **Adversarial check on own fix.** Per term 4, Claude Code took the safety-
  adversary role on its own proposal. Adversarial question to self: "Are you
  certain adding the staging domain to the CORS default doesn't widen the
  surface inappropriately?" Answer (after thinking): adding a domain we own
  to our own allow-list isn't a widening — it's correcting a misconfiguration
  where security was applied to the wrong thing. The middleware should never
  have rejected same-origin module-script loads against a known-self domain.
  This self-adversarial check confirmed the fix bounded.

## What we want to remember

1. **When curl-200 vs browser-500 diverge, check headers first.** Origin /
   Referer / Accept-Encoding are the usual suspects. CORS, content
   negotiation, and PWA caching all fall in this asymmetry zone.

2. **Browser CORS rejection presents as 500, not 4xx.** Don't read "500" and
   immediately assume server-internal error. Cross-reference with server logs
   for `cors|origin|blocked` strings before chasing application code.

3. **First-time deploy to a new domain is a CORS-allowlist trap.** Any new
   public-facing domain (staging, preview, branch deploys, custom subdomain
   for a client portal, etc.) must be in the CORS allowlist BEFORE first
   browser load. Adding to the default in code is preferable to operational
   env-var-only fixes because the default is the carry-forward state for
   any future deploy from any branch.

4. **Vite production builds add `crossorigin` to module scripts and
   stylesheets.** This means the browser sends `Origin` headers on same-
   origin loads of those resources, which means CORS middleware sees them
   and can reject them. Don't assume "same origin = no CORS" for Vite-built
   production HTML.

5. **The brake role works.** Both engagements (stop for ground truth, stop
   before fix execution) prevented diagnostic cycles or unsanctioned changes.
   Codify the pattern: when in doubt, surface and wait rather than guess and
   proceed.

## Branch end-state status (per term 8)

This finding was a configuration bug, not an architectural one. End-state for
`tuesday-cockpit-build` remains tentative pending staging walkthrough. After
this CORS fix lands and walkthrough proceeds:

- If walkthrough surfaces no more issues: end-state = merge to master with
  named production-deploy date.
- If walkthrough surfaces UX iteration (panel ordering, allowOverwrite default,
  etc.): end-state = iterate-then-merge with named iteration scope.
- If walkthrough reveals architectural problems: end-state = abandon, redo
  on master with what we learned.

## Hard boundaries respected

No DROP TABLE, DELETE on audit_entries, force push, or destructive operation
performed. CORS-allowlist change is one-line array addition in `app.ts` —
inside peer-mode scope per term 2's contextual rule. Audit artifact (the
fix proposal report from earlier in this session and this document)
preserves the decision shape for future inspection.

# Case law 002 — fallback data paths must fail loud, not silent

**Date:** 2026-05-14
**Trigger:** Manish surfaced that tapping Ivan Melnyk in Liza's Alerts tab on staging did not open the cockpit; clicks were inert.
**Decision shape:** UX principle codification + mobile AlertsTab.tsx mock-fallback removal
**Branch:** `tuesday-cockpit-build`
**Outcome:** Mock fallback replaced with empty state; principle named for future application

## Summary

Tuesday's AlertsTab work (May 12, commit `72197db`) wired every alert card
on the mobile app to open the worker cockpit. When real candidate data was
available, every card carried the candidate id and a click handler that
fired `setOpenWorkerId(a.id)` — perfect.

But the code had a fallback: when `candidates.length === 0` (data not yet
loaded, or no candidates in tenant), the mobile rendered cards sourced from
`COMPLIANCE_ALERTS` mock data instead. Those mock rows had no id field,
and the click handler was guarded by `onClick={() => a.id && setOpenWorkerId(a.id)}`.
Result: mock cards were intentionally inert. Cursor stayed default, click
was a no-op.

On staging, Liza opened the Alerts tab. Real candidates hadn't loaded (or
weren't visible to her under nationality scope, or the tenant happened to
be empty). She saw cards. She tapped Ivan Melnyk. Nothing happened. From
Liza's perspective the platform was broken — the click was clearly there,
the card looked clickable, but nothing opened.

The bug was not in the click handler. The bug was that the cards existed
at all. Mock-data fallback created the illusion of working state when the
state was actually empty.

## What we want to remember

**Fallback data paths should fail loud, not silent.**

When the real data path returns nothing — empty array, no candidates,
no rows, network failure with empty cache — the UX should communicate
"nothing here" explicitly. Not "here's some placeholder content that
looks real but doesn't behave."

The user's mental model when something doesn't work:
- Empty state ("No alerts to display"): the user understands there's
  no data, looks elsewhere, doesn't blame the app.
- Inert clickable card: the user thinks the app is broken, files a bug,
  loses trust.

The cost of an empty state is one moment of "oh, no data." The cost of
inert mock cards is "the platform doesn't work."

## Principle, generalized

This applies anywhere a fallback exists:
- API request fails or returns empty → don't render placeholder cards
  from mock data; render an empty state with the real shape (loading
  spinner during fetch, "no items" after fetch resolves empty).
- Local mock data used for development → strip before production OR
  gate behind a dev-only flag with a visible banner.
- Optional fields with defaults → make the default behaviorally
  equivalent to "unset" (no click handler if no id), but ALSO don't
  render the row at all if its primary identity field is missing.

## Direct consequences in this codebase (May 14 commit)

`eej-mobile-HIDDEN/src/pages/tabs/AlertsTab.tsx`:
- Removed `import { COMPLIANCE_ALERTS } from "@/data/mockData"`.
- `ExecutiveAlerts.visaExpiring` and `.missingPassports`: removed the
  `: COMPLIANCE_ALERTS.foo` fallback; now resolve to empty arrays when
  `candidates.length === 0`. The existing
  `length === 0 ? "No matches." : map(...)` rendering handles the empty
  state correctly.
- `LegalAlerts.allIssues`: removed the `else` block that pushed
  `COMPLIANCE_ALERTS.visaExpiring`, `.missingPassports`, `.workPermits`
  into the allIssues array. The candidates.forEach loop alone produces
  the right array (empty when no candidates).

No regression: when real candidate data IS available, behavior is
unchanged (rows render and click → cockpit). The change is strictly
the empty-state UX when data is absent.

## Hard boundaries respected

No DROP TABLE, DELETE on audit_entries, force push, or destructive
operation performed. AlertsTab.tsx change is presentational — replaces
fallback array source with empty array, removes one import. Audit
artifact (this document) preserves the principle for future application.

## Related

- CASE_LAW_001 — first peer-mode test (CORS-500 misrepresentation)
- FUTURE.md — no entry needed; this principle is fully resolved in code,
  not deferred. Future application of the principle (other surfaces with
  mock fallbacks) is iteration-by-iteration, not trigger-gated.

# UX Foundation + Architecture Audit — 2026-05-16

Audit performed BEFORE any code changes, per the /goal's explicit Step 1
constraint. The previous foundation pass (commit `cc9d227`) treated each
layout finding as an independent CSS tweak — Layer 2 verification showed
several fixes didn't hold. This audit names the actual root causes by
file:line so the subsequent commits target architecture, not symptoms.

## Finding A — Modal overlays: commit 25's fix was incomplete (3 siblings, 1 fixed)

Three mobile-app overlay classes in `eej-mobile-HIDDEN/src/index.css`:

| Class | Line | Position | Status |
|---|---|---|---|
| `.detail-overlay` | 1147 | `position: fixed; inset: 0; z-index: 200` | ✅ Fixed in commit 25 |
| `.wc-overlay` (WorkerCockpit modal) | 4085 | **`position: absolute; inset: 0`** | ❌ MISSED |
| `.ds-overlay` (DocumentScanFlow modal) | 4881 | **`position: absolute; inset: 0`** | ❌ MISSED |

**Why Manish's "Scan a document tile opens below the bottom bar"
report is real:** `setShowScanFlow(true)` mounts DocumentScanFlow inside
ExecutiveHome's tab-page DOM. `.ds-overlay` uses `position: absolute`, so
it positions to the nearest positioned ancestor — the tab-page (which is
the scroll container with `overflow-y: auto`). When the user has scrolled
in the tab-page, the overlay anchors to the scrolled position, not the
viewport. The sheet's `align-items: flex-end` then stacks the modal at
the scrolled-bottom — visually "below the bottom bar" because the user
sees the viewport, not the tab-page's bottom.

Same root cause for `.wc-overlay` (WorkerCockpit) — triggered from the
worker profile "View Full Profile" button.

**Fix scope:** change two CSS rules from `absolute` → `fixed`. Same
pattern commit 25 used. One commit, surgical.

## Finding B — Mobile scroll-reset targets the wrong DOM node

`eej-mobile-HIDDEN/src/pages/Dashboard.tsx:162, 195-199`:

```ts
const contentScrollRef = useRef<HTMLDivElement>(null);
// ...
useEffect(() => {
  if (contentScrollRef.current) contentScrollRef.current.scrollTop = 0;
}, [activeTab]);
```

The ref attaches to the wrapper `<div style={{ flex:1, overflow:"hidden" }}>`
(Dashboard.tsx:294). But this wrapper has `overflow: hidden`, not `auto` —
it does not scroll. The actual scroll container is `.tab-page` INSIDE the
wrapper, with `overflow-y: auto` (index.css:466).

**Setting `scrollTop = 0` on a non-scrolling wrapper is a no-op.** This
is why pages still open mid-scroll on mobile tab switches despite
commit cc9d227's "fix."

**Fix scope:** add `key={activeTab}` to `<TabContent>` so React remounts
the tab on every change. The new `.tab-page` mounts fresh at scrollTop=0
by definition. One-line frontend change. Removes the scroll-reset effect
entirely — replaced by React's natural unmount/remount.

## Finding C — Dashboard scroll-reset CAN be defeated by per-page scroll containers

`artifacts/apatris-dashboard/src/App.tsx:126-140` queries
`.app-content-wrapper`'s first element child, which is `GlobalDropZone`'s
div (the CSS rule `.app-content-wrapper > * { overflow-y: auto }` makes
it the scroll container). Setting scrollTop on it works at the outer
scroll level.

**However**, individual pages can nest their own `overflow-auto` divs
inside (e.g., a table wrapper with internal scroll). When that happens
the outer reset works but the inner scroll persists. This is uncommon in
the current codebase (most pages use the default page flow) but warrants
a defensive sweep:

```ts
const wrapper = document.querySelector(".app-content-wrapper");
wrapper?.querySelectorAll<HTMLElement>("[data-scroll-container], .overflow-y-auto, .overflow-auto")
  .forEach((el) => { el.scrollTop = 0; });
```

**Fix scope:** widen the selector. Defensive — likely covers any future
nested scroll page without code change.

## Finding D — Mobile-on-desktop "stretches badly" (#41) — foundation EXISTS, lacks visual cue

`eej-mobile-HIDDEN/src/index.css`:

```css
.eej-screen { height: 100dvh; display: flex; align-items: flex-start; justify-content: center; }
@media (min-width: 520px) {
  .eej-screen { padding: 24px 0; align-items: center; }
}
.eej-container { width: 100%; max-width: 430px; height: 100dvh; ... }
@media (min-width: 520px) {
  .eej-container { height: 90vh; max-height: 900px; min-height: 760px; border-radius: 32px; ... }
}
```

**The phone-frame architecturally exists.** On desktop (≥520px) the
container is 430px wide × 90vh tall, centered with `justify-content:
center` + `align-items: center`, with rounded corners and shadow. The
`.g3-root` (mobile Login shell) also enforces 430px max-width.

What's missing is a STRONGER visual cue that the user is in a phone
simulator on desktop:
- The background `#F0F2F5` is very pale — looks like a slightly different
  page color, not a "phone preview surrounded by desktop chrome."
- No thin border/label saying "Mobile preview" or similar dev-affordance.
- The container has a subtle box-shadow but no clear "device frame" feel.

**Manish's "stretches badly" report** most likely refers to either:
(a) cached pre-cc9d227 browser state showing the older full-width layout,
(b) misperception of "stretches" — the contents DO fill 430px width on
desktop, which is intentional phone-width, OR
(c) one specific page rolling its own container that escapes the
.eej-screen wrapping (need a specific URL to diagnose).

**Fix scope:** strengthen the visual cue — darker desktop background
(`#1a1a1a` matching app brand), explicit device-frame styling on the
container (border, taller shadow), optional subtle "Mobile Preview" label
at desktop widths only. Architecture stays; visuals get sharper.

## Finding E — `.ds-overlay` audit revealed `.detail-handle` interaction with `.detail-header` already-sticky

Commit cc9d227 added `position: sticky; top: 0; z-index: 6` to
`.detail-handle` and `position: sticky; top: 16px; z-index: 7` to
`.detail-header`. These are the CandidateDetail close-button stickiness
fix from earlier. They're correct. No issue here, just confirming the
prior fix held.

## Finding F — Document Workflow upload (#42) — needs live diagnosis

The 89c9e4a commit:
- Added universal format normalization (PDF/HEIC/DOCX/JPG/PNG/WebP/GIF)
- Wrapped Claude API errors with `mapErrorToFriendlyResponse`
- Frontend reads `body.userMessage` on error

**Manish reports upload still fails in real use.** Possible causes:
1. Staging dist is older than 89c9e4a (deployment didn't include the build)
2. Specific format Manish tested isn't covered (e.g., HEIC with non-standard
   variant, password-protected PDF, file >25MB)
3. Frontend handler in DocumentWorkflow.tsx has a bug introduced by the
   rewrite (e.g., wrong fetch URL, wrong body shape)
4. Auth header missing on /smart-doc/process call

**Action:** test `/api/documents/smart-ingest` live via curl with a small
JPG to confirm the backend works end-to-end. If 200 with the friendly
response shape, the bug is frontend. If 500 with raw error, the bug is
backend or deployment-state.

## Finding G — Bleed-through (#33) — NO evidence in the shell CSS

Audited:
- Dashboard `.app-shell-root: height: 100vh; height: 100dvh; overflow: hidden` — correctly bounds viewport
- Mobile `.eej-container: height: 100dvh; overflow: hidden` — same
- Page containers render inside scroll-bounded parents

There is NO CSS reason for "bleed-through" between routes. If Manish is
seeing actual bleed-through (previous page visible at edges during
navigation), it's a specific surface issue — need the URL/screenshot to
diagnose. Otherwise the report may be conflating bleed-through with one
of the other layout issues (overlay-below-bottom-bar, scroll-inheritance,
or modal-positioning).

**Action:** report-only. Do not refactor the shell without evidence of an
actual escape — that would be the scope-creep mistake the /goal warns
against.

## Finding H — Consistent page-shell (#38)

All dashboard routes pass through `<AppShell>` → `<GlobalDropZone>` →
`<Switch>`. AppShell renders `.app-top-bar` (header) + `.app-content-wrapper`
(content) + `.app-bottom-bar` (hidden on desktop; mobile-only nav).

All mobile pages render inside Dashboard.tsx (state-based tab switching).
Login.tsx bypasses Dashboard but uses its own `.g3-root` 430px-max shell —
visually consistent on desktop.

**Conclusion:** the page-shell is consistent. No refactor needed.

## Audit summary — what's actually fixable

| Finding | Type | Action |
|---|---|---|
| A — modal overlays absolute → fixed | CSS, 2 rules | Fix |
| B — mobile scroll-reset wrong ref | JS, 1-line `key` add | Fix |
| C — dashboard scroll-reset selector widening | JS, defensive | Fix |
| D — mobile-on-desktop visual cue | CSS, visual polish | Fix |
| E — sticky header (already fixed in cc9d227) | — | No-op |
| F — Document Workflow upload | Diagnose-then-fix | Live test + fix |
| G — bleed-through (#33) | No evidence | Report only |
| H — consistent shell (#38) | Already consistent | Report only |

**Architecture is sound. The previous /goal's "didn't hold" is from
TWO specific bugs — the absolute-positioned overlays (Finding A) and the
wrong scroll-reset target (Finding B). Plus visual polish (D) and a live
upload diagnosis (F).**

No major refactor needed. Five targeted commits will close it.

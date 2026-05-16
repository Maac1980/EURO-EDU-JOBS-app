# UX Foundation Pass 3 — Audit (2026-05-16)

Audit performed BEFORE any code change, per the prompt's explicit Step 1
constraint. Passes 1 (cc9d227) and 2 (67a84d9) each fixed one overlay
selector and missed siblings. This audit lists EVERY overlay/sheet/modal
in the mobile app and the architectural rule that should apply uniformly.

## Inventory — every overlay/sheet/modal/drawer in the mobile app

### CSS-class overlays (3, all in `eej-mobile-HIDDEN/src/index.css`)

| Class | Line | Current positioning | z-index | Used by |
|---|---|---|---|---|
| `.detail-overlay` | 1165 | `position: fixed; inset: 0` | 200 | `ModuleSheet`, `WorkerProfileSheet`, `AddCandidateModal`, `AddUserModal`, `CandidateDetail` |
| `.ds-overlay` | 4881 | `position: fixed; inset: 0` | 9000 | `DocumentScanFlow` |
| `.wc-overlay` | 4107 | `position: fixed; inset: 0` | 9000 | `WorkerCockpit` (4 mount points) |

### Inline-style overlays (3, in tsx files)

| Component | Line | Current positioning | z-index |
|---|---|---|---|
| `components/RecruitmentLinkShare.tsx` | 102 | `position: fixed; inset: 0` | 9999 |
| `pages/tabs/TRCServiceTab.tsx` | 472 | `position: fixed; inset: 0` | 1000 |
| `pages/tabs/ShiftScheduleTab.tsx` | 169 | `position: fixed; inset: 0` | 100 |

### Persistent shell surfaces

| Class | z-index |
|---|---|
| `.dash-header` | 100 |
| `.bottom-nav` | 100 |

## Classification — does each respect the persistent shell?

| Surface | Top edge | Bottom edge | Width on desktop | Respects shell? |
|---|---|---|---|---|
| `.detail-overlay` | viewport top (0) | viewport bottom | full viewport width (covers dark navy surround AND 430px frame) | ❌ NO |
| `.ds-overlay` | viewport top | viewport bottom | full viewport | ❌ NO |
| `.wc-overlay` | viewport top | viewport bottom | full viewport | ❌ NO |
| `RecruitmentLinkShare` (mobile) | viewport top | viewport bottom | full viewport | ❌ NO |
| `TRCServiceTab` modal | viewport top | viewport bottom | full viewport | ❌ NO |
| `ShiftScheduleTab` modal | viewport top | viewport bottom | full viewport | ❌ NO |

**Pattern: every overlay uses `position: fixed; inset: 0` (full viewport
coverage) with z-index higher than the shell (100). That's exactly the
opposite of what Manish reports wanting.** The previous passes fixed
ONE selector at a time, but every overlay was implemented from the same
template — `position: fixed; inset: 0; z-index: above-shell`. Pass 1
fixed `.detail-overlay`'s scroll-anchoring bug. Pass 2 fixed `.ds-overlay`
and `.wc-overlay`'s. None of the three passes addressed the shared
underlying architectural choice that the overlay covers the persistent
header + bottom-nav.

## The architectural rule

> Every modal/sheet/overlay MUST sit BETWEEN the persistent header (top)
> and the bottom-nav (bottom), centered within the 430px phone-frame on
> desktop. Header and bottom-nav z-indices are ABOVE the overlay z-index.
> The user always sees the persistent shell.

## Finding #43 — ModuleSheet route-container diagnosis

The 5 Platform Modules tabs that "break out of the 430px frame on desktop"
are **all rendered by `ModuleSheet.tsx`** (sub-components `ZUSLedger`,
`Timesheets`, `PIPCompliance`, `B2BContracts`, `BHPMedical`). ModuleSheet
mounts via `<ModuleSheet moduleId={...}/>` in ExecutiveHome.tsx:608. It
uses `.detail-overlay` + `.detail-sheet` (ModuleSheet.tsx:24-25).

**Root cause:** `.detail-overlay` is `position: fixed; inset: 0` (full
viewport). On desktop, the overlay spans the entire laptop width —
covering the dark-navy surround AND the 430px phone frame. The
`.detail-sheet` inside is `width: 100%; max-height: 92%` with
`align-items: flex-end` on the parent overlay — so the sheet is
full-viewport-width.

The "other module tabs render correctly within the frame" because they
DON'T use ModuleSheet — they route via `setActiveTab(moduleId)` and
render the matching `<JobBoardTab/>` / `<ATSPipelineTab/>` / etc. INSIDE
the `.eej-container` flex column. Only the 5 Platform Modules are
ModuleSheet-overlaid.

**Fix:** apply the new canonical overlay class to `.detail-overlay`
(which constrains it to `max-width: 430px` centered). #43 resolves
as a side effect of the universal rule.

## The canonical class — `.shell-overlay`

CSS custom properties (set on `.eej-container`):
```css
--shell-header-height: calc(76px + env(safe-area-inset-top, 0px));
--shell-bottom-nav-height: calc(60px + env(safe-area-inset-bottom, 0px));
```

Canonical class:
```css
.shell-overlay {
  position: fixed;
  top: var(--shell-header-height);
  bottom: var(--shell-bottom-nav-height);
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 430px;
  z-index: 50;                /* below shell z:200 */
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  -webkit-overflow-scrolling: touch;
  backdrop-filter: blur(2px);
}
```

Shell z-index raised from 100 → 200 (above overlay z:50).

## Migration plan

1. **Define CSS variables** on `.eej-container`.
2. **Apply canonical positioning** to the 3 CSS overlay classes
   (`.detail-overlay`, `.ds-overlay`, `.wc-overlay`) — same `top`,
   `bottom`, `left`, `transform`, `max-width`, `z-index` per the rule.
3. **Raise shell z-index** on `.dash-header` and `.bottom-nav` to 200.
4. **Refactor 3 inline-style overlays** (RecruitmentLinkShare, TRCServiceTab,
   ShiftScheduleTab) to use the canonical class.
5. **Verify sheets** (`.detail-sheet`, `.ds-sheet`, `.wc-sheet`) have
   `max-width: 430px` — already added to ds/wc in commit 67a84d9; add to
   .detail-sheet now.
6. **ModuleSheet #43 fix** comes for free from step 2.

## What this doesn't refactor

- React component structure stays the same. The overlays are still mounted
  inside their parent components — only their positioning/sizing rules
  change.
- The 4 WorkerCockpit overlay mount points (lines 391, 401, 820, 921) all
  use `.wc-overlay`/`.wc-sheet` — one CSS change covers all four.
- The 5 places using `.detail-overlay` (ModuleSheet, WorkerProfileSheet,
  AddCandidateModal, AddUserModal, CandidateDetail) inherit the fix.

## Estimated impact

Total touched CSS rules: 3 (overlay classes) + 2 (shell z-index)
+ 1 (new `.shell-overlay` class definition — though we could just edit the
existing classes since they're 1:1 with the canonical pattern)
= effectively rewriting 6 CSS blocks.

Total touched tsx files: 3 (RecruitmentLinkShare, TRCServiceTab,
ShiftScheduleTab) to migrate inline → class.

This is small. Pass 3 isn't a refactor — it's defining the rule and
applying it everywhere, all at once, so pass 4 isn't needed.

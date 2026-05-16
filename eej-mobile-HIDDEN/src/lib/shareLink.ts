/**
 * P3b — single source for the public recruitment-apply URL.
 *
 * Why an env override exists: when the app is loaded from a staging host
 * (e.g. staging.eej-jobs-api.fly.dev), `window.location.origin` resolves to
 * the staging origin, and any link copied/sent from the Share dialog goes
 * to staging. Recruiters using the app on staging would then post staging
 * links into WhatsApp/email — workers land on a sandbox by accident.
 *
 * With VITE_SHARE_BASE_URL set at build time (Fly secret on the prod
 * deploy), staging builds opt-out and emit the real public host instead.
 * Unset → falls back to `window.location.origin` (current behavior, safe
 * default for local dev where there's no canonical public host).
 *
 * Used by:
 *  - components/RecruitmentLinkShare.tsx — the share dialog
 *  - pages/tabs/MoreTab.tsx — the "Copy Recruitment Link" tile
 */
export function recruitmentApplyUrl(): string {
  const base = (import.meta.env.VITE_SHARE_BASE_URL as string | undefined)?.trim();
  if (base) return base.replace(/\/+$/, "") + "/apply";
  return `${window.location.origin}/apply`;
}

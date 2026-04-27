/**
 * Feature-flag mechanism. Single source of truth for env-driven feature
 * toggles. Today only WHATSAPP_AUTOMATION_ENABLED. Designed so additional
 * flags slot in alongside without becoming a god-module.
 *
 * Contract:
 *   - isFeatureEnabled(name) returns true only when process.env[name] is
 *     the literal string "true". Any other value (unset, "false", "yes",
 *     "1", "True", "TRUE") returns false.
 *   - Unknown flag names return false (never throw).
 *
 * Per STEP3_PLAN.md: this flag gates auto-trigger hooks in
 * services/whatsapp-drafter.ts. Manual draft creation via the API is NOT
 * gated; admins can always test the flow.
 */

export const FLAG_NAMES = {
  WHATSAPP_AUTOMATION_ENABLED: "WHATSAPP_AUTOMATION_ENABLED",
} as const;

export type FlagName = typeof FLAG_NAMES[keyof typeof FLAG_NAMES];

const KNOWN_FLAGS = new Set<string>(Object.values(FLAG_NAMES));

export function isFeatureEnabled(flagName: string): boolean {
  if (!KNOWN_FLAGS.has(flagName)) return false;
  return process.env[flagName] === "true";
}

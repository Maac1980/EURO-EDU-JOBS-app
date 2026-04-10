/**
 * Bilingual Output — generates PL + EN versions of any text.
 * Polish = legal version. English = internal/operational.
 * Used by: communication, legal briefs, authority packs, worker portal.
 */

export interface BilingualText {
  pl: string;
  en: string;
  originalLanguage: "pl" | "en";
}

/**
 * Takes AI output and ensures both PL and EN versions exist.
 * If output contains === POLISH === and === ENGLISH === markers, splits them.
 * If single language, generates the other via Claude.
 * If Claude unavailable, returns original with "[translation pending]" note.
 */
export async function completeBilingual(text: string, preferredOriginal: "pl" | "en" = "pl"): Promise<BilingualText> {
  // Check for markers
  const plMatch = text.match(/=== POLISH ===\s*([\s\S]*?)(?:=== ENGLISH ===|$)/i);
  const enMatch = text.match(/=== ENGLISH ===\s*([\s\S]*?)(?:=== POLISH ===|$)/i);

  if (plMatch && enMatch) {
    return { pl: plMatch[1].trim(), en: enMatch[1].trim(), originalLanguage: "pl" };
  }

  // Single language — generate other
  const original = text.trim();
  const targetLang = preferredOriginal === "pl" ? "en" : "pl";

  try {
    const mod = await import("@anthropic-ai/sdk");
    const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-sonnet-4-20250514", max_tokens: 800,
      messages: [{ role: "user", content:
        `Translate the following ${preferredOriginal === "pl" ? "Polish" : "English"} text to ${targetLang === "pl" ? "Polish" : "English"}. Keep the same tone, formality, and structure. Do not add or remove content. Return ONLY the translation, no explanations.\n\n${original}` }],
    });
    const translation = resp.content[0].type === "text" ? resp.content[0].text.trim() : "";

    return preferredOriginal === "pl"
      ? { pl: original, en: translation || `[Translation pending]\n${original}`, originalLanguage: "pl" }
      : { pl: translation || `[Tłumaczenie oczekuje]\n${original}`, en: original, originalLanguage: "en" };
  } catch {
    return preferredOriginal === "pl"
      ? { pl: original, en: `[Translation pending]\n${original}`, originalLanguage: "pl" }
      : { pl: `[Tłumaczenie oczekuje]\n${original}`, en: original, originalLanguage: "en" };
  }
}

/**
 * Generates bilingual prompt for AI — asks for both versions in one call.
 * More efficient than generating + translating separately.
 */
export function bilingualPromptSuffix(): string {
  return `\n\nGenerate TWO versions:\n\n=== POLISH ===\n[Full text in formal Polish]\n\n=== ENGLISH ===\n[Full text in English]\n\nBoth versions must contain the same information.`;
}

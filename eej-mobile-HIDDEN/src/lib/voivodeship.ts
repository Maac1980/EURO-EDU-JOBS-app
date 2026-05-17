/**
 * P3d — UI-only derivation: map a site name (or any free-text location
 * string containing a Polish city token) to its voivodeship.
 *
 * Why: Sites in the app (e.g. "Warsaw Factory A", "Krakow Warehouse")
 * carry city info that the voivodeship column on a worker / shift may
 * not — and when both fields exist independently they can contradict
 * (worker.assignedSite = "Warsaw Factory A" with worker.voivodeship =
 * "Pomorskie"). This helper gives the UI a single, consistent way to
 * (a) display a voivodeship next to a site even when no DB column
 * carries it, and (b) fall back to a derived value when the explicit
 * column is null.
 *
 * Spellings match the canonical list in TRCServiceTab.tsx VOIVODESHIPS
 * (no Polish diacritics — same form the rest of the app uses).
 *
 * Coverage: the four cities currently referenced in ShiftScheduleTab
 * SITES plus the next-most-common Polish industrial centers. Returns
 * null when no city token matches — callers should show the explicit
 * value (or "—") in that case, not a guess.
 */

const SITE_CITY_PATTERNS: Array<{ tokens: string[]; voivodeship: string }> = [
  { tokens: ["warsaw", "warszawa"],                    voivodeship: "Mazowieckie" },
  { tokens: ["krakow", "kraków", "cracow"],            voivodeship: "Malopolskie" },
  { tokens: ["gdansk", "gdańsk", "gdynia", "sopot"],   voivodeship: "Pomorskie" },
  { tokens: ["wroclaw", "wrocław", "breslau"],         voivodeship: "Dolnoslaskie" },
  { tokens: ["poznan", "poznań"],                      voivodeship: "Wielkopolskie" },
  { tokens: ["lodz", "łódź"],                          voivodeship: "Lodzkie" },
  { tokens: ["katowice", "gliwice", "bytom", "sosnowiec"], voivodeship: "Slaskie" },
  { tokens: ["lublin"],                                voivodeship: "Lubelskie" },
  { tokens: ["rzeszow", "rzeszów"],                    voivodeship: "Podkarpackie" },
  { tokens: ["szczecin"],                              voivodeship: "Zachodniopomorskie" },
  { tokens: ["bialystok", "białystok"],                voivodeship: "Podlaskie" },
  { tokens: ["bydgoszcz", "torun", "toruń"],           voivodeship: "Kujawsko-Pomorskie" },
  { tokens: ["olsztyn"],                               voivodeship: "Warminsko-Mazurskie" },
  { tokens: ["opole"],                                 voivodeship: "Opolskie" },
  { tokens: ["zielona gora", "gorzow"],                voivodeship: "Lubuskie" },
  { tokens: ["kielce"],                                voivodeship: "Swietokrzyskie" },
];

/**
 * Returns the voivodeship for a site/location string, or null if no
 * known city token matches. Case-insensitive substring match.
 */
export function siteToVoivodeship(site: string | null | undefined): string | null {
  if (!site) return null;
  const haystack = site.toLowerCase();
  for (const { tokens, voivodeship } of SITE_CITY_PATTERNS) {
    if (tokens.some((t) => haystack.includes(t))) return voivodeship;
  }
  return null;
}

/**
 * Returns `{ value, source }` for display. Prefers an explicit
 * voivodeship value; falls back to derivation from the site. `source`
 * lets the UI mark derived values (e.g. "(from site)") so the user
 * knows it isn't authoritative — useful in WorkerCockpit where the
 * explicit column may be missing.
 */
export function resolveVoivodeship(
  explicit: string | null | undefined,
  site: string | null | undefined,
): { value: string | null; source: "explicit" | "derived" | "none" } {
  if (explicit && explicit.trim()) return { value: explicit.trim(), source: "explicit" };
  const derived = siteToVoivodeship(site);
  if (derived) return { value: derived, source: "derived" };
  return { value: null, source: "none" };
}

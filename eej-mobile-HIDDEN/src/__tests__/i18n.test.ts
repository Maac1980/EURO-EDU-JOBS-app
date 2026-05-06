import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const i18nPath = path.resolve(__dirname, "../lib/i18n.tsx");

function readSource(): string {
  return fs.readFileSync(i18nPath, "utf8");
}

describe("i18n — DICT-1 diacritic invariants", () => {
  it("source contains all 16 diacritic-corrected Polish strings", () => {
    const src = readSource();
    const mustContain = [
      'pl: "Więcej"',
      'pl: "Ładowanie..."',
      'pl: "Wystąpił błąd"',
      'pl: "Usuń"',
      'pl: "Potwierdź"',
      'pl: "Wyślij"',
      'pl: "Prześlij"',
      'pl: "Śledzenie GPS"',
      'pl: "Imię i nazwisko"',
      'pl: "Narodowość"',
      'pl: "Ostrzeżenie"',
      'pl: "Oczekujący"',
      'pl: "Zaloguj się"',
      'pl: "Hasło"',
      'pl: "Mój profil"',
      'pl: "Prześlij dokumenty"',
    ];
    for (const s of mustContain) {
      expect(src).toContain(s);
    }
  });

  it("source does NOT contain de-diacritized predecessors", () => {
    const src = readSource();
    const mustNotContain = [
      'pl: "Wiecej"',
      'pl: "Ladowanie..."',
      'pl: "Wystapil blad"',
      'pl: "Usun"',
      'pl: "Potwierdz"',
      'pl: "Wyslij"',
      'pl: "Sledzenie GPS"',
      'pl: "Imie"',
      'pl: "Narodowosc"',
      'pl: "Ostrzezenie"',
      'pl: "Oczekujacy"',
      'pl: "Zaloguj sie"',
      'pl: "Haslo"',
      'pl: "Moj profil"',
      'pl: "Przeslij dokumenty"',
    ];
    for (const s of mustNotContain) {
      expect(src).not.toContain(s);
    }
  });
});

describe("i18n — DICT-2 cold-boot locale detection", () => {
  it("source references navigator.language for cold-boot detection", () => {
    const src = readSource();
    expect(src).toContain("navigator.language");
    expect(src).toMatch(/startsWith\(["']pl["']\)/);
  });

  it("source persists language preference under eej_lang localStorage key", () => {
    const src = readSource();
    expect(src).toContain('"eej_lang"');
  });
});

describe("i18n — COV-2 new auth keys present", () => {
  it("source contains all 9 new Login keys", () => {
    const src = readSource();
    const newKeys = [
      "auth.emailPasswordRequired",
      "auth.portalLabel",
      "auth.brandSubtitle",
      "auth.signInHeading",
      "auth.workEmailLabel",
      "auth.passwordPlaceholder",
      "auth.signInButton",
      "auth.forgotPassword",
      "auth.useBiometrics",
    ];
    for (const k of newKeys) {
      expect(src).toContain(`"${k}"`);
    }
  });

  it("new auth keys have non-empty Polish values", () => {
    const src = readSource();
    const polishExpectations: Record<string, string> = {
      "auth.emailPasswordRequired": "Wprowadź adres e-mail i hasło.",
      "auth.portalLabel": "BEZPIECZNY PORTAL PRACOWNICZY",
      "auth.brandSubtitle": "Platforma zarządzania kadrami",
      "auth.signInHeading": "ZALOGUJ SIĘ DO KONTA",
      "auth.workEmailLabel": "Służbowy e-mail",
      "auth.passwordPlaceholder": "Wprowadź hasło",
      "auth.signInButton": "ZALOGUJ SIĘ",
      "auth.forgotPassword": "Zapomniałeś hasła? Skontaktuj się z administratorem.",
      "auth.useBiometrics": "Użyj biometrii",
    };
    for (const [key, pl] of Object.entries(polishExpectations)) {
      expect(src).toContain(pl);
    }
  });
});

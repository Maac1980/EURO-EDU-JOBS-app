import React, { createContext, useContext, useState, useCallback } from "react";

type Language = "en" | "pl";

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<string, Record<Language, string>> = {
  // Nav labels
  "nav.home": { en: "Home", pl: "Start" },
  "nav.candidates": { en: "Candidates", pl: "Kandydaci" },
  "nav.pipeline": { en: "Pipeline", pl: "Pipeline" },
  "nav.jobs": { en: "Jobs", pl: "Oferty" },
  "nav.alerts": { en: "Alerts", pl: "Alerty" },
  "nav.updates": { en: "Updates", pl: "Aktualizacje" },
  "nav.more": { en: "More", pl: "Wiecej" },
  "nav.mydocs": { en: "My Docs", pl: "Dokumenty" },

  // Common UI
  "common.loading": { en: "Loading...", pl: "Ladowanie..." },
  "common.search": { en: "Search", pl: "Szukaj" },
  "common.noData": { en: "No data found", pl: "Brak danych" },
  "common.error": { en: "An error occurred", pl: "Wystapil blad" },
  "common.save": { en: "Save", pl: "Zapisz" },
  "common.cancel": { en: "Cancel", pl: "Anuluj" },
  "common.delete": { en: "Delete", pl: "Usun" },
  "common.edit": { en: "Edit", pl: "Edytuj" },
  "common.close": { en: "Close", pl: "Zamknij" },
  "common.confirm": { en: "Confirm", pl: "Potwierdz" },
  "common.back": { en: "Back", pl: "Wstecz" },
  "common.next": { en: "Next", pl: "Dalej" },
  "common.submit": { en: "Submit", pl: "Wyslij" },
  "common.upload": { en: "Upload", pl: "Przeslij" },
  "common.download": { en: "Download", pl: "Pobierz" },
  "common.filter": { en: "Filter", pl: "Filtruj" },
  "common.all": { en: "All", pl: "Wszystkie" },
  "common.status": { en: "Status", pl: "Status" },
  "common.actions": { en: "Actions", pl: "Akcje" },
  "common.yes": { en: "Yes", pl: "Tak" },
  "common.no": { en: "No", pl: "Nie" },

  // Page titles
  "page.dashboard": { en: "Dashboard", pl: "Panel" },
  "page.candidates": { en: "Candidates", pl: "Kandydaci" },
  "page.jobs": { en: "Job Board", pl: "Tablica ofert" },
  "page.alerts": { en: "Alerts", pl: "Alerty" },
  "page.profile": { en: "Profile", pl: "Profil" },
  "page.mydocs": { en: "My Documents", pl: "Moje dokumenty" },
  "page.calculator": { en: "ZUS Calculator", pl: "Kalkulator ZUS" },
  "page.invoices": { en: "Invoices", pl: "Faktury" },
  "page.regulatory": { en: "Regulatory Updates", pl: "Zmiany prawne" },
  "page.permits": { en: "Work Permits", pl: "Zezwolenia" },
  "page.interviews": { en: "Interviews", pl: "Rozmowy" },
  "page.contracts": { en: "Contracts", pl: "Umowy" },
  "page.immigration": { en: "Immigration Search", pl: "Wyszukiwarka imigracyjna" },
  "page.gps": { en: "GPS Tracking", pl: "Sledzenie GPS" },

  // Key labels
  "label.name": { en: "Name", pl: "Imie" },
  "label.email": { en: "Email", pl: "Email" },
  "label.phone": { en: "Phone", pl: "Telefon" },
  "label.role": { en: "Role", pl: "Rola" },
  "label.site": { en: "Site", pl: "Lokalizacja" },
  "label.nationality": { en: "Nationality", pl: "Narodowosc" },
  "label.contract": { en: "Contract", pl: "Umowa" },
  "label.expiry": { en: "Expiry", pl: "Wygasa" },
  "label.compliant": { en: "Compliant", pl: "Zgodny" },
  "label.warning": { en: "Warning", pl: "Ostrzezenie" },
  "label.critical": { en: "Critical", pl: "Krytyczny" },
  "label.approved": { en: "Approved", pl: "Zatwierdzony" },
  "label.pending": { en: "Pending", pl: "Oczekujacy" },
  "label.rejected": { en: "Rejected", pl: "Odrzucony" },
  "label.logout": { en: "Logout", pl: "Wyloguj" },

  // Auth
  "auth.login": { en: "Login", pl: "Zaloguj sie" },
  "auth.password": { en: "Password", pl: "Haslo" },
  "auth.loginFailed": { en: "Login failed", pl: "Logowanie nieudane" },

  // Candidate
  "candidate.portal": { en: "Candidate Portal", pl: "Portal kandydata" },
  "candidate.myProfile": { en: "My Profile", pl: "Moj profil" },
  "candidate.contactDetails": { en: "Contact Details", pl: "Dane kontaktowe" },
  "candidate.myDocuments": { en: "My Documents", pl: "Moje dokumenty" },
  "candidate.uploadDocuments": { en: "Upload Documents", pl: "Przeslij dokumenty" },
  "candidate.profileNotFound": { en: "Profile not found", pl: "Profil nie znaleziony" },
};

const I18nContext = createContext<I18nContextValue>({
  language: "en",
  setLanguage: () => {},
  t: (key: string) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const stored = localStorage.getItem("eej_lang");
      if (stored === "en" || stored === "pl") return stored;
    } catch {}
    return "en";
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("eej_lang", lang);
    } catch {}
  }, []);

  const t = useCallback((key: string): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[language] ?? entry.en ?? key;
  }, [language]);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

import React from "react";
import { useI18n } from "@/lib/i18n";

export function LangToggle() {
  const { language, setLanguage } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLanguage(language === "en" ? "pl" : "en")}
      title={language === "en" ? "Przełącz na polski" : "Switch to English"}
      style={{
        background: "rgba(255,255,255,0.15)",
        border: "1px solid rgba(255,255,255,0.3)",
        borderRadius: 6,
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        padding: "4px 8px",
        cursor: "pointer",
        letterSpacing: 0.5,
      }}
    >
      {language === "en" ? "PL" : "EN"}
    </button>
  );
}

/**
 * EEJ Public Language Toggle — PL / EN switcher for public-facing pages.
 * Defaults to PL (Polish). Compact, touch-friendly.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

export function PublicLangToggle() {
  const { i18n } = useTranslation();
  const isPl = i18n.language?.startsWith("pl");

  const toggle = () => i18n.changeLanguage(isPl ? "en" : "pl");

  return (
    <button onClick={toggle}
      className="fixed top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors"
      style={{
        background: "rgba(15,23,42,0.8)",
        borderColor: "rgba(59,130,246,0.3)",
        color: "#60A5FA",
        backdropFilter: "blur(8px)",
      }}
      title={isPl ? "Switch to English" : "Przełącz na Polski"}
    >
      <Globe className="w-3.5 h-3.5" />
      <span className={isPl ? "text-blue-400" : "text-slate-500"}>PL</span>
      <span className="text-slate-600">/</span>
      <span className={!isPl ? "text-blue-400" : "text-slate-500"}>EN</span>
    </button>
  );
}

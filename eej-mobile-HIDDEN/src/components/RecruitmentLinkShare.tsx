import { useState } from "react";
import { Link2, Check, MessageCircle, MessageSquare, Mail, Copy, Share2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Mobile sibling of the dashboard RecruitmentLinkShare. Same behavior — opens
 * a Share dialog (Copy / WhatsApp / SMS / Email) pre-filled with bilingual
 * recruitment copy + the public /apply URL. Mounted on each role-Home tab
 * (ExecutiveHome / OperationsHome / LegalHome) as a visible card and also
 * surfaces in MoreTab via the existing "Copy Recruitment Link" affordance.
 *
 * Tier 1 closeout #18 (mobile-visible) + #21 (shared rename + send actions).
 *
 * Security: URL is `${window.location.origin}/apply` — no hardcoded hosts,
 * no token. The /apply page is intentionally public.
 */

type Variant = "tile" | "card";

interface Props {
  variant?: Variant;
}

function messages(lang: "pl" | "en", url: string) {
  if (lang === "pl") {
    return {
      whatsapp: `Witam! Szukamy pracowników do pracy w Polsce — spawacze, budowlańcy, magazynierzy. Aplikuj online: ${url}`,
      sms: `Praca w Polsce z Euro Edu Jobs. Aplikuj: ${url}`,
      emailSubject: `Praca w Polsce z Euro Edu Jobs`,
      emailBody: `Dzień dobry,\n\nSzukamy pracowników do pracy w Polsce. Aplikacja online: ${url}\n\nZ poważaniem,\nZespół Euro Edu Jobs`,
    };
  }
  return {
    whatsapp: `Hi! We're hiring workers for Poland — welders, construction, warehouse. Apply online: ${url}`,
    sms: `Work in Poland with Euro Edu Jobs. Apply: ${url}`,
    emailSubject: `Work in Poland with Euro Edu Jobs`,
    emailBody: `Hello,\n\nWe're hiring workers for jobs in Poland. Apply online: ${url}\n\nBest regards,\nEuro Edu Jobs Team`,
  };
}

export default function RecruitmentLinkShare({ variant = "card" }: Props) {
  const { language } = useI18n();
  const activeLang: "pl" | "en" = language === "pl" ? "pl" : "en";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = `${window.location.origin}/apply`;
  const msg = messages(activeLang, url);

  const copyUrl = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  };

  const openWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(msg.whatsapp)}`, "_blank");
  const openSms = () => { window.location.href = `sms:?&body=${encodeURIComponent(msg.sms)}`; };
  const openEmail = () => { window.location.href = `mailto:?subject=${encodeURIComponent(msg.emailSubject)}&body=${encodeURIComponent(msg.emailBody)}`; };

  const triggerLabel = activeLang === "pl" ? "Link rekrutacyjny" : "Recruitment Link";
  const triggerSubtitle = activeLang === "pl" ? "Udostępnij publiczny formularz aplikacyjny" : "Share the public application form";
  const dialogTitle = activeLang === "pl" ? "Udostępnij link" : "Share Link";

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: variant === "tile" ? "16px 18px" : "14px 16px",
          marginBottom: 12,
          borderRadius: 14,
          background: "#EFF6FF",
          border: "1.5px solid #BFDBFE",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div
          style={{
            width: 40, height: 40, borderRadius: 12, background: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <Share2 size={20} color="#2563EB" strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1E3A8A" }}>{triggerLabel}</div>
          <div style={{ fontSize: 11, color: "#3B82F6", marginTop: 2 }}>{triggerSubtitle}</div>
        </div>
      </button>

      {dialogOpen && (
        <div
          /* Pass 3 architectural rule — uses the canonical .shell-overlay
             class so the dialog sits between header + bottom-nav, centered
             in the 430px phone-frame. Previously inline position:fixed
             inset:0 z:9999 covered the persistent shell (Manish's
             "opens at bottom + slightly wider than frame" report). */
          className="shell-overlay"
          onClick={() => setDialogOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: "20px 20px 0 0",
              maxWidth: 430, width: "100%",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.2)",
              padding: "20px 20px 32px",
              /* P2 — mirrors .detail-sheet (index.css:1271). Pass 3 bounds
                 the OVERLAY between header + nav; without these two rules
                 the sheet can exceed that bound, and because the overlay's
                 own overflow-y:auto + align-items:flex-end default the
                 scroll to top, the footer "You can edit the message before
                 sending." sits below the visible overlay area on small
                 viewports. Sheet now scrolls internally — overlay stays
                 the bounded surface, sheet stays the scrollable surface. */
              maxHeight: "100%",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>{dialogTitle}</h3>
              <button onClick={() => setDialogOpen(false)} style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: "#6B7280" }}>
                <X size={20} />
              </button>
            </div>

            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 12px", marginBottom: 16,
              background: "#F0F9FF", borderRadius: 10, border: "1px solid #BAE6FD",
            }}>
              <Link2 size={14} color="#0EA5E9" />
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#0C4A6E", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {url}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Row label={copied ? (activeLang === "pl" ? "Skopiowano!" : "Copied!") : (activeLang === "pl" ? "Kopiuj link" : "Copy link")} Icon={copied ? Check : Copy} onClick={copyUrl} color={copied ? "#059669" : "#6B7280"} />
              <Row label={activeLang === "pl" ? "WhatsApp" : "WhatsApp"} Icon={MessageCircle} onClick={openWhatsApp} color="#25D366" />
              <Row label={activeLang === "pl" ? "SMS" : "SMS"} Icon={MessageSquare} onClick={openSms} color="#3B82F6" />
              <Row label={activeLang === "pl" ? "E-mail" : "Email"} Icon={Mail} onClick={openEmail} color="#7C3AED" />
            </div>

            <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 14, lineHeight: 1.5 }}>
              {activeLang === "pl"
                ? "Treść wiadomości można edytować przed wysłaniem."
                : "You can edit the message before sending."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, Icon, onClick, color }: { label: string; Icon: React.ComponentType<{ size?: number; color?: string }>; onClick: () => void; color: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 16px", borderRadius: 12,
        background: "#F9FAFB", border: "1px solid #E5E7EB",
        cursor: "pointer", textAlign: "left",
      }}
    >
      <Icon size={20} color={color} />
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{label}</span>
    </button>
  );
}

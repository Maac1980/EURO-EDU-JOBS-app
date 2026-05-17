import { useState } from "react";
import { Link2, Check, MessageCircle, MessageSquare, Mail, Copy, Share2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Tier 1 closeout #21 (rebuilds the prior "Ad Link" affordance).
 *
 * A single shared component for sharing the public recruitment URL
 * (`${window.location.origin}/apply`). Offers Copy, WhatsApp, SMS, and Email
 * — each opens the recipient app pre-filled with a bilingual message + the
 * link. Designed so both the dashboard home tile and the AppShell toolbar
 * mount the same component (no parallel implementations).
 *
 * Variants:
 *   variant="tile"    — large prominent card, used on dashboard home
 *   variant="compact" — toolbar pill, used in AppShell top-right
 *
 * Both variants open the same Share dialog when clicked.
 *
 * Security:
 *   - URL is computed at render time from window.location.origin — no
 *     hardcoded hosts, no token, no leak surface
 *   - The recruitment page (/apply) is intentionally public — no auth
 *     required to view, but submissions land in the workers table
 *     with pipelineStage="New" for staff review (see workers.ts:83)
 */

type Variant = "tile" | "compact";

interface Props {
  variant?: Variant;
}

/** Bilingual pre-fill text — switches on i18n.language. Editable by the
 * sender in their messaging app before send. */
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

export function RecruitmentLinkShare({ variant = "compact" }: Props) {
  const { i18n } = useTranslation();
  const lang: "pl" | "en" = i18n.language?.startsWith("pl") ? "pl" : "en";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = `${window.location.origin}/apply`;
  const msg = messages(lang, url);

  const copyUrl = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  };

  const openWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(msg.whatsapp)}`, "_blank", "noopener");
  };

  const openSms = () => {
    // `sms:?body=` works on iOS and modern Android; some Android still
    // requires `sms:?&body=` — try the most compatible form.
    window.location.href = `sms:?&body=${encodeURIComponent(msg.sms)}`;
  };

  const openEmail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(msg.emailSubject)}&body=${encodeURIComponent(msg.emailBody)}`;
  };

  const triggerLabel = lang === "pl" ? "Link rekrutacyjny" : "Recruitment Link";
  const triggerLabelShort = lang === "pl" ? "Rekrutacja" : "Recruit";
  const dialogTitle = lang === "pl" ? "Udostępnij link rekrutacyjny" : "Share Recruitment Link";

  return (
    <>
      {variant === "tile" ? (
        <button
          onClick={() => setDialogOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 18px", borderRadius: 10,
            background: "#3B82F6", color: "#ffffff", border: "none",
            fontWeight: 800, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em",
            cursor: "pointer", boxShadow: "0 2px 12px rgba(59,130,246,0.35)",
          }}
          title={dialogTitle}
        >
          <Share2 size={14} /> {triggerLabel}
        </button>
      ) : (
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors"
          style={{
            background: "rgba(59,130,246,0.1)",
            borderColor: "rgba(59,130,246,0.25)",
            color: "#60A5FA",
          }}
          title={dialogTitle}
        >
          <Link2 className="w-3 h-3" /> {triggerLabelShort}
        </button>
      )}

      {dialogOpen && (
        <div
          onClick={() => setDialogOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(11, 16, 30, 0.7)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0f172a", borderRadius: 16, maxWidth: 420, width: "100%",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Share2 size={18} color="#60A5FA" />
                <h3 style={{ fontWeight: 800, fontSize: 14, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{dialogTitle}</h3>
              </div>
              <button onClick={() => setDialogOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>
                {lang === "pl"
                  ? "Udostępnij ten link prospekcyjnym pracownikom. Otwiera publiczny formularz aplikacyjny — bez logowania."
                  : "Share this link with prospective workers. Opens the public application form — no login required."}
              </p>

              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                background: "rgba(59,130,246,0.06)", borderRadius: 8,
                border: "1px solid rgba(59,130,246,0.15)",
              }}>
                <Link2 size={12} color="#60A5FA" />
                <span style={{ fontFamily: "monospace", fontSize: 11, color: "#cbd5e1", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {url}
                </span>
              </div>

              <ShareButton
                label={copied ? (lang === "pl" ? "Skopiowano!" : "Copied!") : (lang === "pl" ? "Kopiuj link" : "Copy link")}
                Icon={copied ? Check : Copy}
                onClick={copyUrl}
                color={copied ? "#22c55e" : "#94a3b8"}
              />
              <ShareButton
                label={lang === "pl" ? "Wyślij przez WhatsApp" : "Send via WhatsApp"}
                Icon={MessageCircle}
                onClick={openWhatsApp}
                color="#22c55e"
              />
              <ShareButton
                label={lang === "pl" ? "Wyślij przez SMS" : "Send via SMS"}
                Icon={MessageSquare}
                onClick={openSms}
                color="#60a5fa"
              />
              <ShareButton
                label={lang === "pl" ? "Wyślij e-mailem" : "Send via Email"}
                Icon={Mail}
                onClick={openEmail}
                color="#a78bfa"
              />

              <p style={{ fontSize: 10, color: "#64748b", margin: "8px 0 0", lineHeight: 1.5 }}>
                {lang === "pl"
                  ? "Treść wiadomości można edytować przed wysłaniem w aplikacji docelowej."
                  : "You can edit the message in the target app before sending."}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ShareButton({ label, Icon, onClick, color }: { label: string; Icon: React.ComponentType<{ size?: number; color?: string }>; onClick: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px", borderRadius: 10,
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        color: "#e2e8f0", fontSize: 13, fontWeight: 600,
        cursor: "pointer", transition: "background 0.15s",
        textAlign: "left",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
    >
      <Icon size={16} color={color} />
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

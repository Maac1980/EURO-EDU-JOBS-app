import { useState } from "react";
import {
  X,
  User,
  Briefcase,
  FileText,
  DollarSign,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Calendar,
  Shield,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Building2,
  Hash,
} from "lucide-react";
import type { Candidate } from "@/data/mockData";

interface Props {
  candidate: Candidate;
  seeFinancials: boolean;
  onClose: () => void;
}

type Tab = "identity" | "employment" | "documents" | "financials";

function fmt(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function expiryStatus(dateStr?: string): "ok" | "warn" | "expired" | "missing" {
  if (!dateStr) return "missing";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "missing";
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 60) return "warn";
  return "ok";
}

function ExpiryBadge({ dateStr }: { dateStr?: string }) {
  const s = expiryStatus(dateStr);
  const cfg = {
    ok:      { bg: "#ECFDF5", color: "#059669", border: "#6EE7B7", label: fmt(dateStr) },
    warn:    { bg: "#FFFBEB", color: "#D97706", border: "#FCD34D", label: fmt(dateStr) + " ⚠" },
    expired: { bg: "#FEF2F2", color: "#DC2626", border: "#FCA5A5", label: fmt(dateStr) + " EXPIRED" },
    missing: { bg: "#F9FAFB", color: "#9CA3AF", border: "#E5E7EB", label: "Not on file" },
  }[s];
  return (
    <span className="wp-expiry-badge" style={{ background: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  );
}

function InfoRow({ icon: Icon, label, value, mono }: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  label: string;
  value?: string | number;
  mono?: boolean;
}) {
  const display = value !== undefined && value !== null && value !== "" ? String(value) : "—";
  return (
    <div className="wp-info-row">
      <div className="wp-info-icon">
        <Icon size={14} color="#6B7280" strokeWidth={1.8} />
      </div>
      <div className="wp-info-content">
        <div className="wp-info-label">{label}</div>
        <div className={"wp-info-value" + (mono ? " wp-mono" : "")}>{display}</div>
      </div>
    </div>
  );
}

function DocExpiryRow({ label, dateStr }: { label: string; dateStr?: string }) {
  return (
    <div className="wp-doc-row">
      <span className="wp-doc-label">{label}</span>
      <ExpiryBadge dateStr={dateStr} />
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return <div className="wp-section-header">{label}</div>;
}

export default function WorkerProfileSheet({ candidate, seeFinancials, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("identity");

  const grossPay = (candidate.hourlyNettoRate ?? 0) * (candidate.totalHours ?? 0);
  const finalPayout = grossPay - (candidate.advancePayment ?? 0);
  const totalZUS = grossPay * 0.1126;

  const tabs: { key: Tab; label: string; Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }> }[] = [
    { key: "identity",   label: "Identity",   Icon: User       },
    { key: "employment", label: "Employment", Icon: Briefcase  },
    { key: "documents",  label: "Documents",  Icon: FileText   },
    ...(seeFinancials ? [{ key: "financials" as Tab, label: "Financials", Icon: DollarSign }] : []),
  ];

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-sheet wp-sheet" onClick={(e) => e.stopPropagation()}>

        <div className="detail-handle" />

        {/* Header */}
        <div className="wp-header">
          <div className="wp-header-left">
            <div className="wp-avatar">
              {candidate.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <div className="wp-header-name">{candidate.name}</div>
              <div className="wp-header-role">{candidate.role}</div>
              <div className="wp-header-loc">
                <MapPin size={10} color="#9CA3AF" strokeWidth={2} style={{ flexShrink: 0 }} />
                {candidate.location}
                {candidate.siteLocation && ` · ${candidate.siteLocation}`}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span className="wp-flag">{candidate.flag}</span>
            <button className="detail-close" onClick={onClose}>
              <X size={14} color="#6B7280" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="wp-tab-bar">
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={"wp-tab" + (tab === key ? " wp-tab--active" : "")}
              onClick={() => setTab(key)}
            >
              <Icon size={12} color={tab === key ? "#1B2A4A" : "#9CA3AF"} strokeWidth={2} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="wp-body">

          {/* ── IDENTITY ── */}
          {tab === "identity" && (
            <div className="wp-section-group">
              <SectionHeader label="Contact" />
              <InfoRow icon={Mail}  label="Email"       value={candidate.email}       />
              <InfoRow icon={Phone} label="Phone"       value={candidate.phone}       />
              <InfoRow icon={MapPin} label="Location"   value={candidate.location}    />
              <InfoRow icon={User}  label="Nationality" value={candidate.nationality} />

              <SectionHeader label="Legal Identity" />
              <InfoRow icon={Hash}       label="PESEL"             value={candidate.pesel}           mono />
              <InfoRow icon={Hash}       label="NIP"               value={candidate.nip}             mono />
              <InfoRow icon={CreditCard} label="IBAN"              value={candidate.iban}            mono />
              <InfoRow icon={Shield}     label="RODO Consent Date" value={fmt(candidate.rodoConsentDate)} />
            </div>
          )}

          {/* ── EMPLOYMENT ── */}
          {tab === "employment" && (
            <div className="wp-section-group">
              <SectionHeader label="Assignment" />
              <InfoRow icon={Building2} label="Assigned Client / Site" value={candidate.siteLocation}       />
              <InfoRow icon={Briefcase} label="Job Role"               value={candidate.role}               />
              <InfoRow icon={TrendingUp} label="Experience"            value={candidate.yearsOfExperience ? candidate.yearsOfExperience + " years" : undefined} />
              <InfoRow icon={Shield}    label="Visa / Permit Type"     value={candidate.visaType}           />

              <SectionHeader label="Contract" />
              <InfoRow icon={FileText}  label="Contract Type"     value={candidate.contractType}                    />
              <InfoRow icon={Calendar}  label="Contract End Date" value={fmt(candidate.contractEndDate)}            />
              <InfoRow icon={CheckCircle} label="Pipeline Stage"  value={candidate.pipelineStage}                  />
            </div>
          )}

          {/* ── DOCUMENTS ── */}
          {tab === "documents" && (
            <div className="wp-section-group">
              <SectionHeader label="Residence & Work Rights" />
              <DocExpiryRow label="TRC Residence Card"  dateStr={candidate.trcExpiry}        />
              <DocExpiryRow label="Work Permit"         dateStr={candidate.workPermitExpiry} />

              <SectionHeader label="Health & Safety" />
              <DocExpiryRow label="BHP Certificate"          dateStr={candidate.bhpExpiry}           />
              <DocExpiryRow label="Badania Lekarskie"        dateStr={candidate.badaniaLekExpiry}    />

              <SectionHeader label="Legal Declarations" />
              <DocExpiryRow label="Oświadczenie"             dateStr={candidate.oswiadczenieExpiry}  />
              <DocExpiryRow label="UDT Certificate"          dateStr={candidate.udtCertExpiry}       />

              <SectionHeader label="Submitted Files" />
              {candidate.documents.map((doc) => (
                <div key={doc.id} className="wp-submitted-doc">
                  <span className="wp-submitted-name">{doc.name}</span>
                  <span
                    className="candidate-badge"
                    style={{
                      fontSize: 10,
                      background: doc.status === "approved" ? "#ECFDF5" : doc.status === "under-review" ? "#EFF6FF" : doc.status === "rejected" ? "#FEF2F2" : "#FFF7ED",
                      color: doc.status === "approved" ? "#059669" : doc.status === "under-review" ? "#2563EB" : doc.status === "rejected" ? "#DC2626" : "#C2410C",
                      border: `1.5px solid ${doc.status === "approved" ? "#6EE7B7" : doc.status === "under-review" ? "#93C5FD" : doc.status === "rejected" ? "#FCA5A5" : "#FDBA74"}`,
                    }}
                  >
                    {doc.status === "approved" ? "Approved" : doc.status === "under-review" ? "Under Review" : doc.status === "rejected" ? "Rejected" : "Missing"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── FINANCIALS (T1 only) ── */}
          {tab === "financials" && seeFinancials && (
            <div className="wp-section-group">
              <SectionHeader label="Pay Rate & Hours" />
              <InfoRow icon={Clock}       label="Hourly Netto Rate"  value={candidate.hourlyNettoRate != null ? `zł ${candidate.hourlyNettoRate.toFixed(2)} / hr` : undefined} />
              <InfoRow icon={Clock}       label="Total Hours Worked" value={candidate.totalHours != null ? `${candidate.totalHours} hrs` : undefined}                          />
              <InfoRow icon={DollarSign}  label="Advance Payment"    value={candidate.advancePayment != null ? `zł ${candidate.advancePayment.toFixed(2)}` : undefined}        />

              <SectionHeader label="Calculated Payout" />
              <div className="wp-calc-card">
                <div className="wp-calc-row">
                  <span className="wp-calc-label">Gross Pay (hrs × rate)</span>
                  <span className="wp-calc-value">zł {grossPay.toFixed(2)}</span>
                </div>
                <div className="wp-calc-row">
                  <span className="wp-calc-label">Less: Advance</span>
                  <span className="wp-calc-value wp-calc-neg">− zł {(candidate.advancePayment ?? 0).toFixed(2)}</span>
                </div>
                <div className="wp-calc-divider" />
                <div className="wp-calc-row wp-calc-total">
                  <span className="wp-calc-label">Final Payout</span>
                  <span className="wp-calc-value wp-calc-highlight">zł {finalPayout.toFixed(2)}</span>
                </div>
              </div>

              <SectionHeader label="ZUS Contributions" />
              <div className="wp-calc-card wp-zus-card">
                <div className="wp-calc-row">
                  <span className="wp-calc-label">ZUS Liability (11.26% of gross)</span>
                  <span className="wp-calc-value">zł {totalZUS.toFixed(2)}</span>
                </div>
                <div className="wp-calc-row" style={{ marginTop: 6 }}>
                  <span className="wp-calc-label">ZUS Status</span>
                  <span className="wp-zus-status">
                    {candidate.zusStatus || "—"}
                  </span>
                </div>
              </div>

              {(candidate.zusStatus?.toLowerCase().includes("pending") || !candidate.zusStatus) && (
                <div className="wp-warning-banner">
                  <AlertTriangle size={14} color="#D97706" strokeWidth={2} style={{ flexShrink: 0 }} />
                  <span>ZUS registration incomplete — contact the finance team before deployment.</span>
                </div>
              )}
            </div>
          )}

        </div>

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}

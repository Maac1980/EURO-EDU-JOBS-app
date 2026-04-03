import { useState, useRef } from "react";
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
  Building2,
  Hash,
  Pencil,
  Save,
  XCircle,
  CheckCircle2,
  FileCheck,
  FileClock,
  FileX,
  FileQuestion,
  Upload,
  Paperclip,
} from "lucide-react";
import type { Candidate } from "@/data/mockData";
import { useToast } from "@/lib/toast";

interface Props {
  candidate: Candidate;
  seeFinancials: boolean;
  canEdit: boolean;
  onClose: () => void;
  onSave?: (updated: Partial<Candidate>) => void;
}

type Tab = "identity" | "employment" | "documents" | "financials";

const JOB_ROLES = [
  "TIG", "MIG", "MAG", "MMA", "ARC / Electrode", "FCAW", "FABRICATOR",
  "Teacher", "Nurse", "Engineer", "IT Specialist", "Logistics", "Other",
];
const CONTRACT_TYPES = ["Umowa o pracę", "Umowa zlecenie", "B2B", "Umowa o dzieło"];
const VISA_TYPES = ["EU Citizen", "Temporary Residence", "Schengen Visa", "Refugee Status", "Work Visa", "Other"];
const ZUS_STATUSES = ["Active — ZUS opłacony", "Pending registration", "Pending — docs incomplete", "Exempt", "Not applicable"];
const PIPELINE_STAGES = ["New Applications", "Docs Submitted", "Under Review", "Cleared to Deploy", "On Assignment"];

function fmt(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return dateStr; }
}

function expiryStatus(dateStr?: string): "ok" | "warn" | "expired" | "missing" {
  if (!dateStr) return "missing";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "missing";
  const diffDays = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
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

function SectionHeader({ label }: { label: string }) {
  return <div className="wp-section-header">{label}</div>;
}

function ReadRow({ label, value, mono }: { label: string; value?: string | number; mono?: boolean }) {
  return (
    <div className="wp-info-row">
      <div className="wp-info-content">
        <div className="wp-info-label">{label}</div>
        <div className={"wp-info-value" + (mono ? " wp-mono" : "")}>{value !== undefined && value !== null && String(value) !== "" ? String(value) : "—"}</div>
      </div>
    </div>
  );
}

function EditInput({ label, value, onChange, mono, type }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; type?: string }) {
  return (
    <div className="wp-edit-row">
      <label className="wp-edit-label">{label}</label>
      <input
        type={type || "text"}
        className={"wp-edit-input" + (mono ? " wp-mono" : "")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function EditSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="wp-edit-row">
      <label className="wp-edit-label">{label}</label>
      <select className="wp-edit-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— select —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function EditDate({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="wp-edit-row">
      <label className="wp-edit-label">{label}</label>
      <input type="date" className="wp-edit-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const UPLOAD_SLOTS = [
  { id: "passport",    label: "Passport / ID Card" },
  { id: "trc",         label: "TRC Residence Card" },
  { id: "work-permit", label: "Work Permit" },
  { id: "bhp",         label: "BHP Certificate" },
  { id: "badania",     label: "Badania Lekarskie" },
  { id: "oswiad",      label: "Oświadczenie" },
  { id: "udt",         label: "UDT Certificate" },
  { id: "other",       label: "Other Document" },
];

export default function WorkerProfileSheet({ candidate, seeFinancials, canEdit, onClose, onSave }: Props) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("identity");
  const [editing, setEditing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [email, setEmail] = useState(candidate.email || "");
  const [phone, setPhone] = useState(candidate.phone || "");
  const [nationality, setNationality] = useState(candidate.nationality || "");
  const [pesel, setPesel] = useState(candidate.pesel || "");
  const [nip, setNip] = useState(candidate.nip || "");
  const [iban, setIban] = useState(candidate.iban || "");
  const [rodoDate, setRodoDate] = useState(candidate.rodoConsentDate || "");

  const [role, setRole] = useState(candidate.role || "");
  const [siteLocation, setSiteLocation] = useState(candidate.siteLocation || "");
  const [experience, setExperience] = useState(candidate.yearsOfExperience || "");
  const [visaType, setVisaType] = useState(candidate.visaType || "");
  const [contractType, setContractType] = useState(candidate.contractType || "");
  const [contractEndDate, setContractEndDate] = useState(candidate.contractEndDate || "");
  const [pipelineStage, setPipelineStage] = useState(candidate.pipelineStage || "");

  const [trcExpiry, setTrcExpiry] = useState(candidate.trcExpiry || "");
  const [workPermitExpiry, setWorkPermitExpiry] = useState(candidate.workPermitExpiry || "");
  const [bhpExpiry, setBhpExpiry] = useState(candidate.bhpExpiry || "");
  const [badaniaLekExpiry, setBadaniaLekExpiry] = useState(candidate.badaniaLekExpiry || "");
  const [oswiadczenieExpiry, setOswiadczenieExpiry] = useState(candidate.oswiadczenieExpiry || "");
  const [udtCertExpiry, setUdtCertExpiry] = useState(candidate.udtCertExpiry || "");

  const [hourlyRate, setHourlyRate] = useState(candidate.hourlyNettoRate != null ? String(candidate.hourlyNettoRate) : "");
  const [totalHours, setTotalHours] = useState(candidate.totalHours != null ? String(candidate.totalHours) : "");
  const [advance, setAdvance] = useState(candidate.advancePayment != null ? String(candidate.advancePayment) : "");
  const [zusStatus, setZusStatus] = useState(candidate.zusStatus || "");

  const rateNum  = parseFloat(hourlyRate)  || 0;
  const hoursNum = parseFloat(totalHours) || 0;
  const advNum   = parseFloat(advance)    || 0;
  const grossPay   = rateNum * hoursNum;
  const finalPayout = grossPay - advNum;
  const totalZUS    = grossPay * 0.1126;

  function handleSave() {
    const updated: Partial<Candidate> = {
      email, phone, nationality, pesel, nip, iban, rodoConsentDate: rodoDate,
      role, siteLocation, yearsOfExperience: experience, visaType,
      contractType, contractEndDate, pipelineStage,
      trcExpiry, workPermitExpiry, bhpExpiry, badaniaLekExpiry, oswiadczenieExpiry, udtCertExpiry,
      hourlyNettoRate: rateNum || undefined,
      totalHours: hoursNum || undefined,
      advancePayment: advNum || undefined,
      zusStatus,
    };
    onSave?.(updated);
    setEditing(false);
    showToast("Profile saved successfully", "success");
  }

  function handleFileUpload(slotId: string, label: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFiles((prev) => ({ ...prev, [slotId]: file.name }));
    showToast(`Uploaded: ${file.name}`, "success");
    e.target.value = "";
  }

  function cancelEdit() {
    setEmail(candidate.email || "");
    setPhone(candidate.phone || "");
    setNationality(candidate.nationality || "");
    setPesel(candidate.pesel || "");
    setNip(candidate.nip || "");
    setIban(candidate.iban || "");
    setRodoDate(candidate.rodoConsentDate || "");
    setRole(candidate.role || "");
    setSiteLocation(candidate.siteLocation || "");
    setExperience(candidate.yearsOfExperience || "");
    setVisaType(candidate.visaType || "");
    setContractType(candidate.contractType || "");
    setContractEndDate(candidate.contractEndDate || "");
    setPipelineStage(candidate.pipelineStage || "");
    setTrcExpiry(candidate.trcExpiry || "");
    setWorkPermitExpiry(candidate.workPermitExpiry || "");
    setBhpExpiry(candidate.bhpExpiry || "");
    setBadaniaLekExpiry(candidate.badaniaLekExpiry || "");
    setOswiadczenieExpiry(candidate.oswiadczenieExpiry || "");
    setUdtCertExpiry(candidate.udtCertExpiry || "");
    setHourlyRate(candidate.hourlyNettoRate != null ? String(candidate.hourlyNettoRate) : "");
    setTotalHours(candidate.totalHours != null ? String(candidate.totalHours) : "");
    setAdvance(candidate.advancePayment != null ? String(candidate.advancePayment) : "");
    setZusStatus(candidate.zusStatus || "");
    setEditing(false);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "identity",   label: "Identity"   },
    { key: "employment", label: "Employment" },
    { key: "documents",  label: "Documents"  },
    ...(seeFinancials ? [{ key: "financials" as Tab, label: "Financials" }] : []),
  ];

  const docStatusCfg: Record<string, { bg: string; color: string; border: string; label: string }> = {
    "approved":     { bg: "#ECFDF5", color: "#059669", border: "#6EE7B7", label: "Approved"     },
    "under-review": { bg: "#EFF6FF", color: "#2563EB", border: "#93C5FD", label: "Under Review" },
    "rejected":     { bg: "#FEF2F2", color: "#DC2626", border: "#FCA5A5", label: "Rejected"     },
    "missing":      { bg: "#FFF7ED", color: "#C2410C", border: "#FDBA74", label: "Missing"      },
  };

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-sheet wp-sheet" onClick={(e) => e.stopPropagation()}>

        <div className="detail-handle" />

        {/* ── Header ── */}
        <div className="wp-header">
          <div className="wp-header-left">
            <div className="wp-avatar">
              {candidate.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="wp-header-name">{candidate.name}</div>
              <div className="wp-header-role">{role || candidate.role}</div>
              {/* Site / workplace tag */}
              {(siteLocation || candidate.siteLocation) && (
                <div className="wp-site-tag">
                  <Building2 size={10} strokeWidth={2} style={{ flexShrink: 0 }} />
                  {siteLocation || candidate.siteLocation}
                </div>
              )}
              <div className="wp-header-loc">
                <MapPin size={10} color="#9CA3AF" strokeWidth={2} style={{ flexShrink: 0 }} />
                {candidate.location}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <span className="wp-flag">{candidate.flag}</span>
            {canEdit && !editing && (
              <button className="wp-edit-btn" onClick={() => setEditing(true)} title="Edit profile">
                <Pencil size={13} color="#1B2A4A" strokeWidth={2.5} />
              </button>
            )}
            <button className="detail-close" onClick={onClose}>
              <X size={14} color="#6B7280" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Edit mode banner */}
        {editing && (
          <div className="wp-edit-banner">
            <Pencil size={13} color="#D97706" strokeWidth={2} style={{ flexShrink: 0 }} />
            <span>Editing profile — changes are saved locally</span>
            <button className="wp-save-btn" onClick={handleSave}>
              <Save size={13} strokeWidth={2.5} />
              Save
            </button>
            <button className="wp-cancel-btn" onClick={cancelEdit}>
              <XCircle size={13} strokeWidth={2.5} />
            </button>
          </div>
        )}

        {/* ── Tab Bar ── */}
        <div className="wp-tab-bar">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              className={"wp-tab" + (tab === key ? " wp-tab--active" : "")}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="wp-body">

          {/* IDENTITY */}
          {tab === "identity" && (
            <div className="wp-section-group">
              <SectionHeader label="Contact" />
              {editing ? <>
                <EditInput label="Email"       value={email}       onChange={setEmail}       type="email" />
                <EditInput label="Phone"       value={phone}       onChange={setPhone}       type="tel"   />
                <EditInput label="Nationality" value={nationality} onChange={setNationality}              />
              </> : <>
                <ReadRow label="Email"       value={email}       />
                <ReadRow label="Phone"       value={phone}       />
                <ReadRow label="Nationality" value={nationality} />
              </>}

              <SectionHeader label="Legal Identity" />
              {editing ? <>
                <EditInput label="PESEL"             value={pesel}    onChange={setPesel}    mono />
                <EditInput label="NIP"               value={nip}      onChange={setNip}      mono />
                <EditInput label="IBAN"              value={iban}     onChange={setIban}     mono />
                <EditDate  label="RODO Consent Date" value={rodoDate} onChange={setRodoDate}      />
              </> : <>
                <ReadRow label="PESEL"             value={pesel}                mono />
                <ReadRow label="NIP"               value={nip}                  mono />
                <ReadRow label="IBAN"              value={iban}                 mono />
                <ReadRow label="RODO Consent Date" value={fmt(rodoDate)}             />
              </>}
            </div>
          )}

          {/* EMPLOYMENT */}
          {tab === "employment" && (
            <div className="wp-section-group">
              <SectionHeader label="Assignment" />
              {editing ? <>
                <EditSelect label="Job Role"               value={role}         onChange={setRole}         options={JOB_ROLES}      />
                <EditInput  label="Assigned Client / Site" value={siteLocation} onChange={setSiteLocation}                          />
                <EditInput  label="Years of Experience"    value={experience}   onChange={setExperience}   type="number"            />
                <EditSelect label="Visa / Permit Type"     value={visaType}     onChange={setVisaType}     options={VISA_TYPES}     />
              </> : <>
                <ReadRow label="Job Role"               value={role}         />
                <ReadRow label="Assigned Client / Site" value={siteLocation} />
                <ReadRow label="Years of Experience"    value={experience ? experience + " years" : undefined} />
                <ReadRow label="Visa / Permit Type"     value={visaType}     />
              </>}

              <SectionHeader label="Contract" />
              {editing ? <>
                <EditSelect label="Contract Type"     value={contractType}    onChange={setContractType}    options={CONTRACT_TYPES}   />
                <EditDate   label="Contract End Date" value={contractEndDate} onChange={setContractEndDate}                            />
                <EditSelect label="Pipeline Stage"    value={pipelineStage}  onChange={setPipelineStage}   options={PIPELINE_STAGES}  />
              </> : <>
                <ReadRow label="Contract Type"     value={contractType}          />
                <ReadRow label="Contract End Date" value={fmt(contractEndDate)}  />
                <ReadRow label="Pipeline Stage"    value={pipelineStage}         />
              </>}
            </div>
          )}

          {/* DOCUMENTS */}
          {tab === "documents" && (
            <div className="wp-section-group">
              <SectionHeader label="Residence & Work Rights" />
              {editing ? <>
                <EditDate label="TRC Residence Card Expiry"  value={trcExpiry}        onChange={setTrcExpiry}        />
                <EditDate label="Work Permit Expiry"         value={workPermitExpiry} onChange={setWorkPermitExpiry} />
              </> : <>
                <div className="wp-doc-row"><span className="wp-doc-label">TRC Residence Card</span><ExpiryBadge dateStr={trcExpiry} /></div>
                <div className="wp-doc-row"><span className="wp-doc-label">Work Permit</span><ExpiryBadge dateStr={workPermitExpiry} /></div>
              </>}

              <SectionHeader label="Health & Safety" />
              {editing ? <>
                <EditDate label="BHP Certificate Expiry"   value={bhpExpiry}        onChange={setBhpExpiry}        />
                <EditDate label="Badania Lekarskie Expiry" value={badaniaLekExpiry} onChange={setBadaniaLekExpiry} />
              </> : <>
                <div className="wp-doc-row"><span className="wp-doc-label">BHP Certificate</span><ExpiryBadge dateStr={bhpExpiry} /></div>
                <div className="wp-doc-row"><span className="wp-doc-label">Badania Lekarskie</span><ExpiryBadge dateStr={badaniaLekExpiry} /></div>
              </>}

              <SectionHeader label="Legal Declarations" />
              {editing ? <>
                <EditDate label="Oświadczenie Expiry"  value={oswiadczenieExpiry} onChange={setOswiadczenieExpiry} />
                <EditDate label="UDT Certificate Expiry" value={udtCertExpiry}   onChange={setUdtCertExpiry}      />
              </> : <>
                <div className="wp-doc-row"><span className="wp-doc-label">Oświadczenie</span><ExpiryBadge dateStr={oswiadczenieExpiry} /></div>
                <div className="wp-doc-row"><span className="wp-doc-label">UDT Certificate</span><ExpiryBadge dateStr={udtCertExpiry} /></div>
              </>}

              <SectionHeader label="Submitted Files" />
              {candidate.documents.map((doc) => {
                const cfg = docStatusCfg[doc.status] ?? docStatusCfg["missing"];
                return (
                  <div key={doc.id} className="wp-submitted-doc">
                    <span className="wp-submitted-name">{doc.name}</span>
                    <span className="candidate-badge" style={{ fontSize: 10, background: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.border}` }}>
                      {cfg.label}
                    </span>
                  </div>
                );
              })}

              <SectionHeader label="Upload Documents" />
              <div className="wp-upload-note">
                <Upload size={13} color="#6B7280" strokeWidth={2} />
                <span>Tap any slot to upload or replace a file — supports PDF, JPG, PNG</span>
              </div>
              {UPLOAD_SLOTS.map(({ id, label }) => {
                const uploaded = uploadedFiles[id];
                return (
                  <div key={id} className="wp-upload-slot">
                    <div className="wp-upload-slot-info">
                      <Paperclip size={14} color={uploaded ? "#059669" : "#9CA3AF"} strokeWidth={2} style={{ flexShrink: 0 }} />
                      <div>
                        <div className="wp-upload-slot-label">{label}</div>
                        {uploaded && <div className="wp-upload-slot-file">{uploaded}</div>}
                      </div>
                    </div>
                    <button
                      className={"wp-upload-btn" + (uploaded ? " wp-upload-btn--done" : "")}
                      onClick={() => fileRefs.current[id]?.click()}
                    >
                      {uploaded ? <><CheckCircle2 size={12} strokeWidth={2.5} /> Replace</> : <><Upload size={12} strokeWidth={2.5} /> Upload</>}
                    </button>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      style={{ display: "none" }}
                      ref={(el) => { fileRefs.current[id] = el; }}
                      onChange={(e) => handleFileUpload(id, label, e)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* FINANCIALS — T1 only */}
          {tab === "financials" && seeFinancials && (
            <div className="wp-section-group">
              <SectionHeader label="Pay Rate & Hours" />
              {editing ? <>
                <EditInput label="Hourly Netto Rate (zł/hr)" value={hourlyRate}  onChange={setHourlyRate}  type="number" />
                <EditInput label="Total Hours Worked"         value={totalHours} onChange={setTotalHours} type="number" />
                <EditInput label="Advance Payment (zł)"       value={advance}    onChange={setAdvance}    type="number" />
              </> : <>
                <ReadRow label="Hourly Netto Rate"  value={rateNum  ? `zł ${rateNum.toFixed(2)} / hr`  : undefined} />
                <ReadRow label="Total Hours Worked" value={hoursNum ? `${hoursNum} hrs`                 : undefined} />
                <ReadRow label="Advance Payment"    value={advNum   ? `zł ${advNum.toFixed(2)}`         : undefined} />
              </>}

              <SectionHeader label="Calculated Payout" />
              <div className="wp-calc-card">
                <div className="wp-calc-row">
                  <span className="wp-calc-label">Gross Pay (hrs × rate)</span>
                  <span className="wp-calc-value">zł {grossPay.toFixed(2)}</span>
                </div>
                <div className="wp-calc-row">
                  <span className="wp-calc-label">Less: Advance</span>
                  <span className="wp-calc-value wp-calc-neg">− zł {advNum.toFixed(2)}</span>
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
                {editing ? (
                  <div style={{ marginTop: 8 }}>
                    <EditSelect label="ZUS Status" value={zusStatus} onChange={setZusStatus} options={ZUS_STATUSES} />
                  </div>
                ) : (
                  <div className="wp-calc-row" style={{ marginTop: 6 }}>
                    <span className="wp-calc-label">ZUS Status</span>
                    <span className="wp-zus-status">{zusStatus || "—"}</span>
                  </div>
                )}
              </div>

              {(zusStatus?.toLowerCase().includes("pending") || !zusStatus) && (
                <div className="wp-warning-banner">
                  <AlertTriangle size={14} color="#D97706" strokeWidth={2} style={{ flexShrink: 0 }} />
                  <span>ZUS registration incomplete — contact the finance team before deployment.</span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Bottom save bar when editing */}
        {editing && (
          <div className="wp-bottom-bar">
            <button className="wp-bottom-cancel" onClick={cancelEdit}>
              <XCircle size={15} strokeWidth={2.5} />
              Cancel
            </button>
            <button className="wp-bottom-save" onClick={handleSave}>
              <CheckCircle2 size={15} strokeWidth={2.5} />
              Save Profile
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

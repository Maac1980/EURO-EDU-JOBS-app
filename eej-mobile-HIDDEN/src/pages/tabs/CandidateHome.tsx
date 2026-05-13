import { useState, useRef, useEffect, useMemo } from "react";
import { Mail, Phone, Globe2, FileCheck, FileClock, FileX, FileQuestion, Upload, Paperclip, CheckCircle2, AlertTriangle, CalendarClock } from "lucide-react";
import { useCandidates } from "@/lib/candidateContext";
import type { DocReviewStatus, Candidate } from "@/data/mockData";
import { useToast } from "@/lib/toast";
import { uploadWorkerDocument } from "@/lib/api";

interface Props {
  candidateId?: string;
}

const DOC_CFG: Record<string, {
  bg: string; text: string; border: string; label: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}> = {
  "approved":     { bg: "#ECFDF5", text: "#059669", border: "#6EE7B7", label: "Approved",      Icon: FileCheck    },
  "cleared":      { bg: "#ECFDF5", text: "#059669", border: "#6EE7B7", label: "Cleared",       Icon: FileCheck    },
  "under-review": { bg: "#EFF6FF", text: "#2563EB", border: "#93C5FD", label: "Under Review",  Icon: FileClock    },
  "pending":      { bg: "#EFF6FF", text: "#2563EB", border: "#93C5FD", label: "Pending",       Icon: FileClock    },
  "expiring":     { bg: "#FFFBEB", text: "#D97706", border: "#FCD34D", label: "Expiring Soon", Icon: FileClock    },
  "rejected":     { bg: "#FEF2F2", text: "#DC2626", border: "#FCA5A5", label: "Rejected",      Icon: FileX        },
  "missing":      { bg: "#FFF7ED", text: "#C2410C", border: "#FDBA74", label: "Missing",       Icon: FileQuestion },
};
const FALLBACK_CFG = DOC_CFG["missing"];

const MY_UPLOAD_SLOTS = [
  { id: "passport",    label: "Passport / ID Card",  hint: "Main identity document" },
  { id: "trc",         label: "TRC Residence Card",  hint: "Temporary Residence Card" },
  { id: "work-permit", label: "Work Permit",          hint: "Zezwolenie na pracę" },
  { id: "bhp",         label: "BHP Certificate",      hint: "Health & safety training" },
  { id: "badania",     label: "Badania Lekarskie",    hint: "Medical fitness certificate" },
  { id: "oswiad",      label: "Oświadczenie",         hint: "Declaration / statement" },
  { id: "photo",       label: "Personal Photo",       hint: "Passport-style photo (JPG)" },
  { id: "other",       label: "Other Document",       hint: "Any additional supporting file" },
];

export default function CandidateHome({ candidateId }: Props) {
  const { showToast } = useToast();
  const { candidates, loading } = useCandidates();
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // If candidateId is provided, look up that specific candidate.
  // If candidateId is provided but not found, show error (don't fall back to wrong profile).
  // Only fall back to candidates[0] if no candidateId was provided (demo mode).
  const MY: Candidate | undefined = candidateId
    ? candidates.find((c) => c.id === candidateId)
    : candidates[0];

  // Worker-side status — declared BEFORE the early returns so it follows
  // the rules of hooks. Returns [] when MY is undefined.
  const myExpiryStatus = useMemo(() => {
    if (!MY) return [] as Array<{ label: string; date: string; days: number; level: "red" | "amber" | "green" }>;
    const today = Date.now();
    const items: Array<{ label: string; date: string; days: number; level: "red" | "amber" | "green" }> = [];
    const check = (label: string, dateStr?: string) => {
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;
      const days = Math.ceil((d.getTime() - today) / 86_400_000);
      const level: "red" | "amber" | "green" = days < 0 || days <= 30 ? "red" : days <= 60 ? "amber" : "green";
      items.push({ label, date: dateStr, days, level });
    };
    check("TRC", MY.trcExpiry);
    check("Work permit", MY.workPermitExpiry);
    check("Medical exam", MY.badaniaLekExpiry);
    check("Oświadczenie", MY.oswiadczenieExpiry);
    check("UDT cert", MY.udtCertExpiry);
    check("Contract", MY.contractEndDate);
    return items.sort((a, b) => a.days - b.days);
  }, [MY]);

  if (loading) {
    return (
      <div className="tab-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <div style={{ color: "#9CA3AF", fontSize: 14 }}>Loading profile...</div>
      </div>
    );
  }

  if (candidateId && !MY) {
    return (
      <div className="tab-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <div style={{ color: "#9CA3AF", fontSize: 14 }}>Profile not found. Your candidate ID does not match any record.</div>
      </div>
    );
  }

  if (!MY) {
    return (
      <div className="tab-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <div style={{ color: "#9CA3AF", fontSize: 14 }}>No candidate profile found.</div>
      </div>
    );
  }

  async function handleUpload(slotId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !MY) return;
    setUploading((p) => ({ ...p, [slotId]: true }));
    try {
      // Real POST — stores file metadata server-side and triggers Claude OCR
      // for passport/contract types. Auto-updates worker fields if AI extracts
      // an expiry / nationality.
      await uploadWorkerDocument(MY.id, slotId, file);
      setUploadedFiles((prev) => ({ ...prev, [slotId]: file.name }));
      showToast(`${file.name} uploaded — your coordinator will review`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading((p) => ({ ...p, [slotId]: false }));
      e.target.value = "";
    }
  }

  const uploadedCount = Object.keys(uploadedFiles).length;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 4 · Candidate Portal</div>
          <div className="tab-greeting-name">My Profile</div>
        </div>
      </div>

      <div className="my-profile-card">
        <div className="my-profile-avatar">{MY.flag}</div>
        <div className="my-profile-info">
          <div className="my-profile-name">{MY.name}</div>
          <div className="my-profile-role">{MY.role}</div>
          <div className="my-profile-location">📍 {MY.location}</div>
        </div>
        <div className={"my-profile-status " + (MY.status === "cleared" ? "green-badge" : MY.status === "expiring" ? "amber-badge" : "red-badge")}>
          {MY.status === "cleared" ? "✓ Cleared" : MY.statusLabel}
        </div>
      </div>

      {/* What's pressing on my case — worker-side at-a-glance status. */}
      {myExpiryStatus.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 16 }}>
            <CalendarClock size={13} color="#9CA3AF" strokeWidth={2} />
            What needs my attention
          </div>
          <div className="my-status-grid">
            {myExpiryStatus.slice(0, 6).map((s) => (
              <div
                key={s.label}
                className={`my-status-card my-status-${s.level}`}
              >
                <div className="my-status-label">{s.label}</div>
                <div className="my-status-days">
                  {s.days < 0 ? `Expired ${Math.abs(s.days)}d ago` : `${s.days}d left`}
                </div>
                <div className="my-status-date">
                  {new Date(s.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-label">Contact Details</div>
      <div className="profile-detail-card">
        <div className="profile-detail-row">
          <Mail size={15} color="#6B7280" strokeWidth={2} style={{ flexShrink: 0 }} />
          <span className="profile-detail-val">{MY.email}</span>
        </div>
        <div className="profile-detail-row">
          <Phone size={15} color="#6B7280" strokeWidth={2} style={{ flexShrink: 0 }} />
          <span className="profile-detail-val">{MY.phone}</span>
        </div>
        <div className="profile-detail-row">
          <Globe2 size={15} color="#6B7280" strokeWidth={2} style={{ flexShrink: 0 }} />
          <span className="profile-detail-val">{MY.nationality}</span>
        </div>
      </div>

      <div className="section-label" style={{ marginTop: 20 }}>My Documents</div>
      <div className="my-docs-list">
        {MY.documents.map((doc) => {
          const cfg = DOC_CFG[doc.status] ?? FALLBACK_CFG;
          return (
            <div key={doc.id} className="my-doc-row">
              <div className="my-doc-icon" style={{ background: cfg.bg }}>
                <cfg.Icon size={17} color={cfg.text} strokeWidth={1.8} />
              </div>
              <div className="my-doc-info">
                <div className="my-doc-name">{doc.name}</div>
                {doc.expiresAt && <div className="my-doc-expires">Expires: {doc.expiresAt}</div>}
              </div>
              <span className="candidate-badge" style={{ background: cfg.bg, color: cfg.text, border: `1.5px solid ${cfg.border}`, fontSize: 11, whiteSpace: "nowrap" }}>
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="section-label" style={{ marginTop: 24 }}>
        Upload My Documents
        {uploadedCount > 0 && (
          <span className="my-upload-count">{uploadedCount} uploaded</span>
        )}
      </div>
      <div className="my-upload-note">
        <Upload size={13} color="#6B7280" strokeWidth={2} style={{ flexShrink: 0 }} />
        <span>Tap any slot to upload — PDF, JPG, or PNG accepted. Files go directly to your EEJ case file.</span>
      </div>
      <div className="my-upload-list">
        {MY_UPLOAD_SLOTS.map(({ id, label, hint }) => {
          const uploaded = uploadedFiles[id];
          return (
            <div key={id} className="my-upload-slot">
              <div className="my-upload-slot-left">
                <div className="my-upload-slot-icon" style={{ background: uploaded ? "#ECFDF5" : "#F9FAFB", border: `1.5px solid ${uploaded ? "#6EE7B7" : "#E5E7EB"}` }}>
                  <Paperclip size={15} color={uploaded ? "#059669" : "#9CA3AF"} strokeWidth={2} />
                </div>
                <div>
                  <div className="my-upload-slot-label">{label}</div>
                  {uploaded
                    ? <div className="my-upload-slot-file">{uploaded}</div>
                    : <div className="my-upload-slot-hint">{hint}</div>}
                </div>
              </div>
              <button
                className={"my-upload-btn" + (uploaded ? " my-upload-btn--done" : "")}
                onClick={() => fileRefs.current[id]?.click()}
                disabled={uploading[id]}
              >
                {uploading[id]
                  ? <>Uploading…</>
                  : uploaded
                    ? <><CheckCircle2 size={13} strokeWidth={2.5} /> Replace</>
                    : <><Upload size={13} strokeWidth={2.5} /> Upload</>}
              </button>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                style={{ display: "none" }}
                ref={(el) => { fileRefs.current[id] = el; }}
                onChange={(e) => handleUpload(id, e)}
              />
            </div>
          );
        })}
      </div>

      {uploadedCount > 0 && (
        <div className="my-upload-submitted-banner">
          <CheckCircle2 size={15} color="#059669" strokeWidth={2.5} />
          <span>{uploadedCount} file{uploadedCount > 1 ? "s" : ""} uploaded — your EEJ coordinator will be notified for review.</span>
        </div>
      )}

      <div style={{ height: 100 }} />
    </div>
  );
}

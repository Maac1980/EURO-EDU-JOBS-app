import { useState, useRef } from "react";
import {
  FileCheck, FileClock, FileX, FileQuestion,
  Upload, Paperclip, CheckCircle2, ShieldCheck,
} from "lucide-react";
import { useCandidates } from "@/lib/candidateContext";
import { useAuth } from "@/lib/auth";
import type { DocReviewStatus } from "@/data/mockData";
import { useToast } from "@/lib/toast";

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

const UPLOAD_SLOTS = [
  { id: "passport",    label: "Passport / ID Card",  hint: "Main identity document" },
  { id: "trc",         label: "TRC Residence Card",  hint: "Temporary Residence Card" },
  { id: "work-permit", label: "Work Permit",          hint: "Zezwolenie na pracę" },
  { id: "bhp",         label: "BHP Certificate",      hint: "Health & safety training" },
  { id: "badania",     label: "Badania Lekarskie",    hint: "Medical fitness certificate" },
  { id: "oswiad",      label: "Oświadczenie",         hint: "Declaration / statement" },
  { id: "photo",       label: "Personal Photo",       hint: "Passport-style JPG photo" },
  { id: "other",       label: "Other Document",       hint: "Any additional supporting file" },
];

export default function MyDocsTab() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const { candidates, loading } = useCandidates();
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const MY = candidates.find(c => c.id === user?.candidateId) ?? candidates[0];

  function handleUpload(slotId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFiles(prev => ({ ...prev, [slotId]: file.name }));
    showToast(`Uploaded: ${file.name}`, "success");
    e.target.value = "";
  }

  if (loading) {
    return (
      <div className="tab-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <div style={{ color: "#9CA3AF", fontSize: 14 }}>Loading documents...</div>
      </div>
    );
  }

  if (!MY) {
    return (
      <div className="tab-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <div style={{ color: "#9CA3AF", fontSize: 14 }}>No candidate data found.</div>
      </div>
    );
  }

  const counts = MY.documents.reduce(
    (acc, d) => { acc[d.status] = (acc[d.status] || 0) + 1; return acc; },
    {} as Record<DocReviewStatus, number>
  );
  const uploadedCount = Object.keys(uploadedFiles).length;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 4 · Candidate</div>
          <div className="tab-greeting-name">My Documents</div>
        </div>
      </div>

      {/* Status Summary */}
      <div className="mydocs-summary-row">
        <div className="mydocs-summary-chip" style={{ background: "#ECFDF5", border: "1.5px solid #6EE7B7", color: "#059669" }}>
          <FileCheck size={13} strokeWidth={2.5} />
          <span>{counts.approved || 0} Approved</span>
        </div>
        <div className="mydocs-summary-chip" style={{ background: "#EFF6FF", border: "1.5px solid #93C5FD", color: "#2563EB" }}>
          <FileClock size={13} strokeWidth={2.5} />
          <span>{counts["under-review"] || 0} In Review</span>
        </div>
        {(counts.rejected || counts.missing) ? (
          <div className="mydocs-summary-chip" style={{ background: "#FFF7ED", border: "1.5px solid #FDBA74", color: "#C2410C" }}>
            <FileQuestion size={13} strokeWidth={2.5} />
            <span>{(counts.rejected || 0) + (counts.missing || 0)} Action Needed</span>
          </div>
        ) : null}
      </div>

      {/* Document List */}
      <div className="section-label" style={{ marginTop: 16 }}>Document Status</div>
      <div className="my-docs-list">
        {MY.documents.map((doc) => {
          const cfg = DOC_CFG[doc.status] ?? FALLBACK_CFG;
          return (
            <div key={doc.id} className="my-doc-row" style={{ background: cfg.bg + "55", border: `1.5px solid ${cfg.border}` }}>
              <div className="my-doc-icon" style={{ background: cfg.bg }}>
                <cfg.Icon size={17} color={cfg.text} strokeWidth={1.8} />
              </div>
              <div className="my-doc-info">
                <div className="my-doc-name">{doc.name}</div>
                {doc.uploadedAt && <div className="my-doc-expires">Uploaded: {doc.uploadedAt}</div>}
                {doc.expiresAt && <div className="my-doc-expires">Expires: {doc.expiresAt}</div>}
              </div>
              <span className="candidate-badge" style={{ background: cfg.bg, color: cfg.text, border: `1.5px solid ${cfg.border}`, fontSize: 11, whiteSpace: "nowrap" }}>
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Upload Section */}
      <div className="section-label" style={{ marginTop: 24 }}>
        Upload Documents
        {uploadedCount > 0 && <span className="my-upload-count">{uploadedCount} uploaded</span>}
      </div>
      <div className="my-upload-note">
        <Upload size={13} color="#6B7280" strokeWidth={2} style={{ flexShrink: 0 }} />
        <span>Tap any slot to upload — PDF, JPG or PNG. Files go directly to your EEJ case file for review.</span>
      </div>
      <div className="my-upload-list">
        {UPLOAD_SLOTS.map(({ id, label, hint }) => {
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
              >
                {uploaded
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
          <ShieldCheck size={15} color="#059669" strokeWidth={2.5} />
          <span>{uploadedCount} file{uploadedCount > 1 ? "s" : ""} sent to your EEJ coordinator for review.</span>
        </div>
      )}

      <div style={{ height: 100 }} />
    </div>
  );
}

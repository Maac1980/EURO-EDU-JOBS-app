import { useState, useRef } from "react";
import {
  X,
  Mail,
  Phone,
  MapPin,
  FileCheck,
  FileClock,
  FileX,
  FileQuestion,
  UserCheck,
  CheckCircle,
  XCircle,
  ClipboardList,
  Upload,
  Paperclip,
  CheckCircle2,
} from "lucide-react";
import type { Candidate, CandidateDocument, DocReviewStatus } from "@/data/mockData";
import { useToast } from "@/lib/toast";
import WorkerProfileSheet from "@/components/WorkerProfileSheet";

const DETAIL_UPLOAD_SLOTS = [
  { id: "passport",    label: "Passport / ID Card" },
  { id: "trc",         label: "TRC Residence Card" },
  { id: "work-permit", label: "Work Permit" },
  { id: "bhp",         label: "BHP Certificate" },
  { id: "badania",     label: "Badania Lekarskie" },
  { id: "oswiad",      label: "Oświadczenie" },
  { id: "other",       label: "Other Document" },
];

interface Props {
  candidate: Candidate;
  onClose: () => void;
  seeFinancials?: boolean;
  canViewFullProfile?: boolean;
  canEdit?: boolean;
}

type DocCfgKey = DocReviewStatus | "cleared" | "expiring" | "pending";
const DOC_CFG: Record<DocCfgKey, {
  bg: string; text: string; border: string; label: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}> = {
  "approved":     { bg: "#ECFDF5", text: "#059669", border: "#6EE7B7", label: "Approved",     Icon: FileCheck    },
  "cleared":      { bg: "#ECFDF5", text: "#059669", border: "#6EE7B7", label: "Cleared",      Icon: FileCheck    },
  "under-review": { bg: "#EFF6FF", text: "#2563EB", border: "#93C5FD", label: "Under Review", Icon: FileClock    },
  "pending":      { bg: "#EFF6FF", text: "#2563EB", border: "#93C5FD", label: "Pending",      Icon: FileClock    },
  "expiring":     { bg: "#FFFBEB", text: "#D97706", border: "#FCD34D", label: "Expiring Soon", Icon: FileClock   },
  "rejected":     { bg: "#FEF2F2", text: "#DC2626", border: "#FCA5A5", label: "Rejected",      Icon: FileX       },
  "missing":      { bg: "#FFF7ED", text: "#C2410C", border: "#FDBA74", label: "Missing",       Icon: FileQuestion },
};
const FALLBACK_CFG = DOC_CFG["missing"];

export default function CandidateDetail({ candidate, onClose, seeFinancials = false, canViewFullProfile = false, canEdit = false }: Props) {
  const { showToast } = useToast();
  const [docStatuses, setDocStatuses] = useState<Record<string, DocReviewStatus>>(() =>
    Object.fromEntries(candidate.documents.map((d) => [d.id, d.status]))
  );
  const [showFullProfile, setShowFullProfile] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function handleFileUpload(slotId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFiles((prev) => ({ ...prev, [slotId]: file.name }));
    showToast(`Uploaded: ${file.name}`, "success");
    e.target.value = "";
  }

  function approve(doc: CandidateDocument) {
    setDocStatuses((prev) => ({ ...prev, [doc.id]: "approved" }));
    showToast(`Document Approved — ${doc.name}`, "success");
  }

  function reject(doc: CandidateDocument) {
    setDocStatuses((prev) => ({ ...prev, [doc.id]: "rejected" }));
    showToast(`Re-upload Requested — ${doc.name}`, "error");
  }

  return (
    <>
      <div className="detail-overlay" onClick={onClose}>
        <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>

          <div className="detail-handle" />

          {/* Header */}
          <div className="detail-header">
            <div className="detail-avatar">
              <UserCheck size={24} color="#1B2A4A" strokeWidth={1.8} />
            </div>
            <div className="detail-header-info">
              <div className="detail-name">{candidate.name}</div>
              <div className="detail-role">{candidate.role}</div>
              <div className="detail-location">
                <MapPin size={11} color="#9CA3AF" strokeWidth={2} style={{ flexShrink: 0 }} />
                {candidate.location} · {candidate.nationality}
              </div>
            </div>
            <div className="detail-flag-badge">{candidate.flag}</div>
            <button className="detail-close" onClick={onClose}>
              <X size={14} color="#6B7280" strokeWidth={2.5} />
            </button>
          </div>

          {/* Contact Strip */}
          <div className="detail-contact-strip">
            <a href={`mailto:${candidate.email}`} className="detail-contact-pill">
              <Mail size={13} color="#6B7280" strokeWidth={2} />
              <span className="detail-contact-text">{candidate.email}</span>
            </a>
            <a href={`tel:${candidate.phone}`} className="detail-contact-pill">
              <Phone size={13} color="#6B7280" strokeWidth={2} />
              <span>{candidate.phone}</span>
            </a>
          </div>

          {/* View Full Profile Button — T1 & T2 only */}
          {canViewFullProfile && (
            <div style={{ padding: "0 16px 12px" }}>
              <button className="wp-open-btn" onClick={() => setShowFullProfile(true)}>
                <ClipboardList size={16} color="#ffffff" strokeWidth={2} />
                <span>View Full Worker Profile</span>
                {seeFinancials && (
                  <span className="wp-open-badge">Financials Included</span>
                )}
              </button>
            </div>
          )}

          {/* Documents */}
          <div className="detail-section-label">Submitted Documents</div>
          <div className="detail-docs-list">
            {candidate.documents.map((doc) => {
              const currentStatus = docStatuses[doc.id];
              const cfg = DOC_CFG[currentStatus as DocCfgKey] ?? FALLBACK_CFG;
              const canAct = currentStatus === "under-review";

              return (
                <div key={doc.id} className="detail-doc-row">
                  <div className="detail-doc-main">
                    <div className="detail-doc-icon" style={{ background: cfg.bg }}>
                      <cfg.Icon size={17} color={cfg.text} strokeWidth={1.8} />
                    </div>
                    <div className="detail-doc-info">
                      <div className="detail-doc-name">{doc.name}</div>
                      <div className="detail-doc-meta">
                        {doc.uploadedAt && <span>↑ {doc.uploadedAt}</span>}
                        {doc.expiresAt  && <span> · exp {doc.expiresAt}</span>}
                      </div>
                    </div>
                    <span
                      className="candidate-badge"
                      style={{
                        background: cfg.bg,
                        color: cfg.text,
                        border: `1.5px solid ${cfg.border}`,
                        fontSize: 10,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {cfg.label}
                    </span>
                  </div>

                  {canAct && (
                    <div className="detail-doc-actions">
                      <button className="doc-approve-btn" onClick={() => approve(doc)}>
                        <CheckCircle size={13} strokeWidth={2.5} />
                        Approve
                      </button>
                      <button className="doc-reject-btn" onClick={() => reject(doc)}>
                        <XCircle size={13} strokeWidth={2.5} />
                        Request Re-upload
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Upload Documents Section */}
          <div className="detail-section-label" style={{ marginTop: 4 }}>Upload Documents</div>
          <div className="detail-upload-note">
            <Upload size={13} color="#6B7280" strokeWidth={2} />
            <span>Upload or replace candidate documents — PDF, JPG, PNG supported</span>
          </div>
          <div className="detail-upload-list">
            {DETAIL_UPLOAD_SLOTS.map(({ id, label }) => {
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
                    {uploaded
                      ? <><CheckCircle2 size={12} strokeWidth={2.5} /> Replace</>
                      : <><Upload size={12} strokeWidth={2.5} /> Upload</>}
                  </button>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    style={{ display: "none" }}
                    ref={(el) => { fileRefs.current[id] = el; }}
                    onChange={(e) => handleFileUpload(id, e)}
                  />
                </div>
              );
            })}
          </div>

          <div style={{ height: 32 }} />
        </div>
      </div>

      {/* Full Worker Profile Sheet */}
      {showFullProfile && (
        <WorkerProfileSheet
          candidate={candidate}
          seeFinancials={seeFinancials}
          canEdit={canEdit}
          onClose={() => setShowFullProfile(false)}
        />
      )}
    </>
  );
}

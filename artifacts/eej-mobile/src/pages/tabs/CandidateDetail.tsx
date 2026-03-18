import { useState } from "react";
import type { Candidate, CandidateDocument, DocReviewStatus } from "@/data/mockData";
import { useToast } from "@/lib/toast";

interface Props {
  candidate: Candidate;
  onClose: () => void;
}

const DOC_CFG: Record<DocReviewStatus, { bg: string; text: string; border: string; label: string }> = {
  "approved":     { bg: "#ECFDF5", text: "#059669", border: "#6EE7B7", label: "✓ Approved"     },
  "under-review": { bg: "#EFF6FF", text: "#2563EB", border: "#93C5FD", label: "⏳ Under Review"  },
  "rejected":     { bg: "#FEF2F2", text: "#DC2626", border: "#FCA5A5", label: "✕ Rejected"     },
  "missing":      { bg: "#FFF7ED", text: "#C2410C", border: "#FDBA74", label: "! Missing"       },
};

export default function CandidateDetail({ candidate, onClose }: Props) {
  const { showToast } = useToast();
  const [docStatuses, setDocStatuses] = useState<Record<string, DocReviewStatus>>(() =>
    Object.fromEntries(candidate.documents.map((d) => [d.id, d.status]))
  );

  function approve(doc: CandidateDocument) {
    setDocStatuses((prev) => ({ ...prev, [doc.id]: "approved" }));
    showToast(`Document Approved: ${doc.name}`, "success");
  }

  function reject(doc: CandidateDocument) {
    setDocStatuses((prev) => ({ ...prev, [doc.id]: "rejected" }));
    showToast(`Re-upload Requested: ${doc.name}`, "error");
  }

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>

        {/* Drag Handle */}
        <div className="detail-handle" />

        {/* Header */}
        <div className="detail-header">
          <div className="detail-avatar">
            <span>{candidate.flag}</span>
          </div>
          <div className="detail-header-info">
            <div className="detail-name">{candidate.name}</div>
            <div className="detail-role">{candidate.role}</div>
            <div className="detail-location">📍 {candidate.location}</div>
          </div>
          <button className="detail-close" onClick={onClose}>✕</button>
        </div>

        {/* Contact Strip */}
        <div className="detail-contact-strip">
          <a href={`mailto:${candidate.email}`} className="detail-contact-pill">
            📧 {candidate.email}
          </a>
          <a href={`tel:${candidate.phone}`} className="detail-contact-pill">
            📞 {candidate.phone}
          </a>
        </div>

        {/* Documents Section */}
        <div className="detail-section-label">Submitted Documents</div>
        <div className="detail-docs-list">
          {candidate.documents.map((doc) => {
            const currentStatus = docStatuses[doc.id];
            const cfg = DOC_CFG[currentStatus];
            const canAct = currentStatus === "under-review";

            return (
              <div key={doc.id} className="detail-doc-row">
                <div className="detail-doc-main">
                  <div className="detail-doc-icon" style={{ background: cfg.bg }}>📄</div>
                  <div className="detail-doc-info">
                    <div className="detail-doc-name">{doc.name}</div>
                    <div className="detail-doc-meta">
                      {doc.uploadedAt && <span>Uploaded: {doc.uploadedAt}</span>}
                      {doc.expiresAt  && <span> · Expires: {doc.expiresAt}</span>}
                    </div>
                  </div>
                  <span
                    className="candidate-badge"
                    style={{
                      background: cfg.bg,
                      color: cfg.text,
                      border: `1.5px solid ${cfg.border}`,
                      fontSize: 11,
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
                      ✓ Approve
                    </button>
                    <button className="doc-reject-btn" onClick={() => reject(doc)}>
                      ✕ Request Re-upload
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}

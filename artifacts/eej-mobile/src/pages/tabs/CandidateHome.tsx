import { Mail, Phone, Globe2, FileCheck, FileClock, FileX, FileQuestion } from "lucide-react";
import { MOCK_CANDIDATES } from "@/data/mockData";
import type { DocReviewStatus } from "@/data/mockData";

const MY = MOCK_CANDIDATES[3];

const DOC_CFG: Record<DocReviewStatus, {
  bg: string; text: string; border: string; label: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}> = {
  "approved":     { bg: "#ECFDF5", text: "#059669", border: "#6EE7B7", label: "Approved",     Icon: FileCheck   },
  "under-review": { bg: "#EFF6FF", text: "#2563EB", border: "#93C5FD", label: "Under Review",  Icon: FileClock   },
  "rejected":     { bg: "#FEF2F2", text: "#DC2626", border: "#FCA5A5", label: "Rejected",      Icon: FileX       },
  "missing":      { bg: "#FFF7ED", text: "#C2410C", border: "#FDBA74", label: "Missing",       Icon: FileQuestion },
};

export default function CandidateHome() {
  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 4 · Candidate Portal</div>
          <div className="tab-greeting-name">My Profile</div>
        </div>
      </div>

      {/* Profile Card */}
      <div className="my-profile-card">
        <div className="my-profile-avatar">{MY.flag}</div>
        <div className="my-profile-info">
          <div className="my-profile-name">{MY.name}</div>
          <div className="my-profile-role">{MY.role}</div>
          <div className="my-profile-location">📍 {MY.location}</div>
        </div>
        <div className="my-profile-status green-badge">✓ Cleared</div>
      </div>

      {/* Contact */}
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

      {/* My Documents */}
      <div className="section-label" style={{ marginTop: 20 }}>My Documents</div>
      <div className="my-docs-list">
        {MY.documents.map((doc) => {
          const cfg = DOC_CFG[doc.status];
          return (
            <div key={doc.id} className="my-doc-row">
              <div className="my-doc-icon" style={{ background: cfg.bg }}>
                <cfg.Icon size={17} color={cfg.text} strokeWidth={1.8} />
              </div>
              <div className="my-doc-info">
                <div className="my-doc-name">{doc.name}</div>
                {doc.expiresAt && <div className="my-doc-expires">Expires: {doc.expiresAt}</div>}
              </div>
              <span
                className="candidate-badge"
                style={{
                  background: cfg.bg,
                  color: cfg.text,
                  border: `1.5px solid ${cfg.border}`,
                  fontSize: 11,
                  whiteSpace: "nowrap",
                }}
              >
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="firewall-notice" style={{ marginTop: 20 }}>
        <span className="firewall-icon">🔒</span>
        <span>Global candidate directory is restricted. You can only view your own profile.</span>
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}

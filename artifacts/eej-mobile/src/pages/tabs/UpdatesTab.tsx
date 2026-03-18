import { FileCheck2, FileX, Bell, Plane, AlertTriangle, Clock } from "lucide-react";

const UPDATES = [
  {
    id: 1,
    icon: FileCheck2,
    iconBg: "#ECFDF5",
    iconColor: "#059669",
    title: "Passport Approved",
    body: "Your passport scan has been reviewed and approved by the EEJ compliance team.",
    time: "2 hours ago",
    tag: "Document",
    tagColor: "#059669",
    tagBg: "#ECFDF5",
  },
  {
    id: 2,
    icon: FileCheck2,
    iconBg: "#ECFDF5",
    iconColor: "#059669",
    title: "TRC Residence Card Approved",
    body: "Your Temporary Residence Card has been verified. You are cleared to deploy.",
    time: "1 day ago",
    tag: "Document",
    tagColor: "#059669",
    tagBg: "#ECFDF5",
  },
  {
    id: 3,
    icon: Plane,
    iconBg: "#EFF6FF",
    iconColor: "#2563EB",
    title: "Deployment Notice",
    body: "You have been assigned to BuildPro Sp. z o.o. — Warsaw site starting 25 Mar 2026. Please confirm your availability.",
    time: "2 days ago",
    tag: "Deployment",
    tagColor: "#2563EB",
    tagBg: "#EFF6FF",
  },
  {
    id: 4,
    icon: FileX,
    iconBg: "#FEF2F2",
    iconColor: "#DC2626",
    title: "BHP Certificate Needs Re-upload",
    body: "Your BHP certificate scan was unclear. Please upload a new high-quality PDF or JPG copy.",
    time: "3 days ago",
    tag: "Action Required",
    tagColor: "#DC2626",
    tagBg: "#FEF2F2",
  },
  {
    id: 5,
    icon: AlertTriangle,
    iconBg: "#FFFBEB",
    iconColor: "#D97706",
    title: "Work Permit Expiring",
    body: "Your Work Permit (A1) expires in 47 days. Contact your EEJ coordinator to begin the renewal process now.",
    time: "5 days ago",
    tag: "Expiry Warning",
    tagColor: "#D97706",
    tagBg: "#FFFBEB",
  },
  {
    id: 6,
    icon: Clock,
    iconBg: "#F5F3FF",
    iconColor: "#7C3AED",
    title: "Oświadczenie Under Review",
    body: "Your declaration document has been received and is currently under review by the legal team.",
    time: "1 week ago",
    tag: "In Review",
    tagColor: "#7C3AED",
    tagBg: "#F5F3FF",
  },
  {
    id: 7,
    icon: Bell,
    iconBg: "#F0F4FF",
    iconColor: "#1B2A4A",
    title: "Welcome to Euro Edu Jobs",
    body: "Your candidate profile has been successfully created. Upload your documents to complete onboarding.",
    time: "2 weeks ago",
    tag: "System",
    tagColor: "#1B2A4A",
    tagBg: "#F0F4FF",
  },
];

export default function UpdatesTab() {
  const unreadCount = 3;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 4 · Candidate</div>
          <div className="tab-greeting-name">My Updates</div>
        </div>
        {unreadCount > 0 && (
          <div className="alert-total-badge">{unreadCount} New</div>
        )}
      </div>

      <div className="updates-list">
        {UPDATES.map((u, idx) => {
          const Icon = u.icon;
          const isNew = idx < unreadCount;
          return (
            <div key={u.id} className={"update-card" + (isNew ? " update-card--new" : "")}>
              {isNew && <div className="update-new-dot" />}
              <div className="update-icon-wrap" style={{ background: u.iconBg }}>
                <Icon size={18} color={u.iconColor} strokeWidth={2} />
              </div>
              <div className="update-body">
                <div className="update-header-row">
                  <div className="update-title">{u.title}</div>
                  <div className="update-time">{u.time}</div>
                </div>
                <div className="update-text">{u.body}</div>
                <div className="update-tag" style={{ background: u.tagBg, color: u.tagColor, border: `1.5px solid ${u.tagColor}30` }}>
                  {u.tag}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}

import { OPS_PIPELINE, B2B_CONTRACTS } from "@/data/mockData";

export default function OperationsHome() {
  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 3 · Operations</div>
          <div className="tab-greeting-name">Commercial Dashboard</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="section-label">Quick Actions</div>
      <div className="ops-actions-row">
        <button className="ops-action-btn ops-primary">
          <span>+</span> Add Candidate
        </button>
        <button className="ops-action-btn ops-secondary">
          <span>↑</span> Upload Docs
        </button>
      </div>

      {/* Candidate Pipeline */}
      <div className="section-label" style={{ marginTop: 20 }}>Candidate Pipeline</div>
      <div className="pipeline-list">
        {OPS_PIPELINE.map((stage) => (
          <div key={stage.stage} className="pipeline-row">
            <div className="pipeline-dot" style={{ background: stage.color }} />
            <div className="pipeline-label">{stage.stage}</div>
            <div className="pipeline-bar-track">
              <div
                className="pipeline-bar-fill"
                style={{
                  width: `${Math.round((stage.count / 50) * 100)}%`,
                  background: stage.color,
                }}
              />
            </div>
            <div className="pipeline-count" style={{ color: stage.color }}>{stage.count}</div>
          </div>
        ))}
      </div>

      {/* B2B Client Contracts */}
      <div className="section-label" style={{ marginTop: 20 }}>B2B Client Contracts</div>
      <div className="contract-list">
        {B2B_CONTRACTS.map((c, i) => (
          <div key={i} className="contract-card">
            <div className="contract-left">
              <div className="contract-client">{c.client}</div>
              <div className="contract-role">{c.role}</div>
            </div>
            <div className="contract-right">
              <div className="contract-headcount">{c.headcount} workers</div>
              <div className={`contract-status ${c.status === "active" ? "green-badge" : "amber-badge"}`}>
                {c.status === "active" ? "✓ Active" : "⏳ Pending"}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}

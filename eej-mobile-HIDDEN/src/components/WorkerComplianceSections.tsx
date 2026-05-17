import { useEffect, useState } from "react";
import { Shield, Globe, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Mobile sibling of dashboard WorkerComplianceSections (Tier 1 closeout #20).
 * Renders UPO + Schengen sections inside the worker profile sheet
 * (CandidateDetail.tsx). Calls the same auth-scoped backend routes;
 * staff users see any worker's records.
 */

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("eej_token_v2");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface UPORecord {
  id: string;
  submission_number: string;
  submission_date: string;
  case_type: string | null;
  authority: string | null;
  art108_locked: boolean | null;
}

interface SchengenData {
  art108Active?: boolean;
  calculation?: {
    daysUsed: number;
    daysRemaining: number;
    latestLegalExitDate: string;
    isOverstay?: boolean;
    isWarning?: boolean;
  } | null;
}

export default function WorkerComplianceSections({ workerId }: { workerId: string }) {
  return (
    <>
      <UPOSection workerId={workerId} />
      <SchengenSection workerId={workerId} />
    </>
  );
}

function UPOSection({ workerId }: { workerId: string }) {
  const [records, setRecords] = useState<UPORecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`/api/mos2026/upo/${encodeURIComponent(workerId)}`, { headers: authHeaders() })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { if (!cancelled) setRecords((d?.records ?? []) as UPORecord[]); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workerId]);

  return (
    <div style={{ marginTop: 12 }}>
      <div className="detail-section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Shield size={11} color="#9CA3AF" />
        UPO Vault (Art. 108)
      </div>
      {loading ? (
        <div style={{ padding: 12, fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>Loading…</div>
      ) : error ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#FEF2F2", border: "1px solid #FCA5A5", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} color="#DC2626" />
          <span style={{ fontSize: 12, color: "#991B1B" }}>Could not load UPO: {error}</span>
        </div>
      ) : !records || records.length === 0 ? (
        <div style={{ padding: 16, borderRadius: 10, background: "#FAFAFA", border: "1px dashed #E5E7EB", textAlign: "center" }}>
          <FileText size={20} color="#D1D5DB" style={{ margin: "0 auto 6px", display: "block" }} />
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>No UPO records on file</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {records.map(r => (
            <div
              key={r.id}
              style={{
                padding: 12,
                borderRadius: 10,
                background: r.art108_locked ? "#ECFDF5" : "#FFFFFF",
                border: `1px solid ${r.art108_locked ? "#6EE7B7" : "#E5E7EB"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                {r.art108_locked ? <CheckCircle2 size={13} color="#059669" /> : <FileText size={13} color="#6B7280" />}
                <span style={{ fontSize: 12, fontWeight: 700, color: r.art108_locked ? "#059669" : "#111827" }}>
                  {r.art108_locked ? "Art. 108 Confirmed" : "UPO Receipt"}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#9CA3AF", fontFamily: "monospace" }}>{r.submission_date?.slice(0, 10)}</span>
              </div>
              <div style={{ fontSize: 11, color: "#6B7280" }}>
                <div>Submission # <span style={{ fontFamily: "monospace", color: "#374151" }}>{r.submission_number}</span></div>
                {r.case_type && <div>Case: {r.case_type}</div>}
                {r.authority && <div>Authority: {r.authority}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SchengenSection({ workerId }: { workerId: string }) {
  const [data, setData] = useState<SchengenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`/api/schengen/worker/${encodeURIComponent(workerId)}`, { headers: authHeaders() })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { if (!cancelled) setData(d as SchengenData); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workerId]);

  const calc = data?.calculation;

  return (
    <div style={{ marginTop: 12 }}>
      <div className="detail-section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Globe size={11} color="#9CA3AF" />
        Schengen 90/180
      </div>
      {loading ? (
        <div style={{ padding: 12, fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>Calculating…</div>
      ) : error ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#FEF2F2", border: "1px solid #FCA5A5", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} color="#DC2626" />
          <span style={{ fontSize: 12, color: "#991B1B" }}>Could not compute: {error}</span>
        </div>
      ) : data?.art108Active ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#ECFDF5", border: "1px solid #6EE7B7" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle2 size={14} color="#059669" />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>Art. 108 protection active</span>
          </div>
          <p style={{ fontSize: 11, color: "#047857", marginTop: 4, lineHeight: 1.4 }}>
            TRC application pending — 90/180 rule does not apply.
          </p>
        </div>
      ) : !calc ? (
        <div style={{ padding: 16, borderRadius: 10, background: "#FAFAFA", border: "1px dashed #E5E7EB", textAlign: "center" }}>
          <Globe size={20} color="#D1D5DB" style={{ margin: "0 auto 6px", display: "block" }} />
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>No border crossings recorded</div>
        </div>
      ) : (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: calc.isOverstay ? "#FEF2F2" : calc.isWarning ? "#FFFBEB" : "#FFFFFF",
            border: `1px solid ${calc.isOverstay ? "#FCA5A5" : calc.isWarning ? "#FCD34D" : "#E5E7EB"}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Days remaining</span>
            <span style={{
              fontSize: 24, fontWeight: 800, fontFamily: "monospace",
              color: calc.isOverstay ? "#DC2626" : calc.isWarning ? "#D97706" : "#3B82F6",
            }}>
              {calc.daysRemaining}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#6B7280" }}>
            <div>Used {calc.daysUsed} / 90 days in 180-day window</div>
            <div>Latest legal exit: <span style={{ fontFamily: "monospace", color: "#374151" }}>{calc.latestLegalExitDate}</span></div>
          </div>
          {calc.isOverstay && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(220,38,38,0.2)" }}>
              <AlertTriangle size={11} color="#DC2626" />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#991B1B" }}>Overstay — file residence application immediately</span>
            </div>
          )}
          {calc.isWarning && !calc.isOverstay && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(217,119,6,0.2)" }}>
              <AlertTriangle size={11} color="#D97706" />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#92400E" }}>Less than 15 days remaining</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

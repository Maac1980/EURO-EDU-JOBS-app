import { TrendingUp, Download } from "lucide-react";
import { useToast } from "@/lib/toast";

const NAVY = "#1B2A4A";

interface BenchmarkRow {
  role: string;
  eejRate: number;
  marketRate: number;
}

const DATA: BenchmarkRow[] = [
  { role: "Welder", eejRate: 35, marketRate: 38 },
  { role: "Construction", eejRate: 28, marketRate: 30 },
  { role: "Warehouse", eejRate: 25, marketRate: 26 },
  { role: "Healthcare", eejRate: 32, marketRate: 35 },
  { role: "Driver", eejRate: 30, marketRate: 32 },
];

function badge(eej: number, market: number) {
  const diff = ((eej - market) / market) * 100;
  if (diff >= 0) return { label: "Above Market", color: "#10B981", bg: "#D1FAE5" };
  if (diff > -5) return { label: "Competitive", color: "#F59E0B", bg: "#FEF3C7" };
  return { label: "Below Market", color: "#EF4444", bg: "#FEE2E2" };
}

export default function SalaryBenchmarkTab() {
  const { toast } = useToast();
  const competitive = DATA.filter(d => {
    const diff = ((d.eejRate - d.marketRate) / d.marketRate) * 100;
    return diff > -5;
  }).length;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Market Intelligence</div>
          <div className="tab-greeting-name">Salary Benchmark</div>
        </div>
        <TrendingUp size={28} color={NAVY} />
      </div>

      {/* Summary */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: competitive >= DATA.length ? "#D1FAE5" : "#FEF3C7",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 18,
            color: competitive >= DATA.length ? "#065F46" : "#92400E",
          }}>
            {competitive}/{DATA.length}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
              {competitive} of {DATA.length} roles are market competitive
            </div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>Based on Polish market Q1 2026 data</div>
          </div>
        </div>
      </div>

      {/* Table header */}
      <div style={{ ...row, background: NAVY, borderRadius: "10px 10px 0 0", marginTop: 14, border: "none" }}>
        <div style={thCell}>Job Role</div>
        <div style={{ ...thCell, textAlign: "right" }}>EEJ (PLN)</div>
        <div style={{ ...thCell, textAlign: "right" }}>Market (PLN)</div>
        <div style={{ ...thCell, textAlign: "right" }}>Diff %</div>
      </div>

      {/* Table rows */}
      {DATA.map((d, i) => {
        const diff = (((d.eejRate - d.marketRate) / d.marketRate) * 100).toFixed(1);
        const b = badge(d.eejRate, d.marketRate);
        const isLast = i === DATA.length - 1;
        return (
          <div key={d.role} style={{
            ...row,
            borderRadius: isLast ? "0 0 10px 10px" : 0,
            borderTop: "none",
          }}>
            <div style={{ flex: 1, fontWeight: 600, fontSize: 13, color: "#111827" }}>{d.role}</div>
            <div style={{ ...tdCell }}>{d.eejRate}</div>
            <div style={{ ...tdCell }}>{d.marketRate}</div>
            <div style={{ ...tdCell, color: b.color, fontWeight: 700 }}>{diff}%</div>
          </div>
        );
      })}

      {/* Badge breakdown */}
      <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginTop: 18, marginBottom: 8 }}>Role Analysis</div>
      {DATA.map(d => {
        const diff = (((d.eejRate - d.marketRate) / d.marketRate) * 100).toFixed(1);
        const b = badge(d.eejRate, d.marketRate);
        const maxRate = 40;
        return (
          <div key={d.role} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{d.role}</div>
              <span style={{
                padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: b.bg, color: b.color,
              }}>{b.label}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 2 }}>EEJ Rate</div>
                <div style={{ background: "#F3F4F6", borderRadius: 6, height: 16, overflow: "hidden" }}>
                  <div style={{ width: `${(d.eejRate / maxRate) * 100}%`, background: NAVY, height: "100%", borderRadius: 6 }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginTop: 2 }}>{d.eejRate} PLN/hr</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 2 }}>Market Rate</div>
                <div style={{ background: "#F3F4F6", borderRadius: 6, height: 16, overflow: "hidden" }}>
                  <div style={{ width: `${(d.marketRate / maxRate) * 100}%`, background: "#9CA3AF", height: "100%", borderRadius: 6 }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginTop: 2 }}>{d.marketRate} PLN/hr</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#6B7280", textAlign: "right" }}>Difference: {diff}%</div>
          </div>
        );
      })}

      {/* Export */}
      <button onClick={() => toast("Report exported to PDF")} style={primaryBtn}>
        <Download size={16} /> Export Report
      </button>

      <div style={{ height: 100 }} />
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", padding: "14px 16px", marginBottom: 6 };
const row: React.CSSProperties = { display: "flex", alignItems: "center", padding: "10px 14px", background: "#fff", border: "1.5px solid #E5E7EB" };
const thCell: React.CSSProperties = { flex: 1, fontSize: 11, fontWeight: 700, color: "#fff" };
const tdCell: React.CSSProperties = { flex: 1, fontSize: 13, color: "#374151", textAlign: "right" };
const primaryBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  background: NAVY, color: "#fff", border: "none", borderRadius: 10,
  padding: "12px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer",
  marginTop: 16, width: "100%",
};

import { useState } from "react";
import { BarChart3, ShieldCheck, Loader2 } from "lucide-react";
import { useToast } from "@/lib/toast";

const NAVY = "#1B2A4A";

interface GenderData { gender: string; avgRate: number; medianRate: number; }
interface ContractData { type: string; avgRate: number; count: number; }
interface NatData { nationality: string; avgRate: number; count: number; }

const MOCK_GENDER: GenderData[] = [
  { gender: "Male", avgRate: 31.2, medianRate: 30.0 },
  { gender: "Female", avgRate: 29.8, medianRate: 29.0 },
];
const MOCK_CONTRACT: ContractData[] = [
  { type: "Umowa Zlecenie", avgRate: 28.5, count: 124 },
  { type: "Umowa o Prace", avgRate: 33.0, count: 89 },
];
const MOCK_NAT: NatData[] = [
  { nationality: "Ukrainian", avgRate: 29.5, count: 95 },
  { nationality: "Belarusian", avgRate: 30.2, count: 42 },
  { nationality: "Georgian", avgRate: 28.8, count: 31 },
  { nationality: "Indian", avgRate: 31.0, count: 28 },
  { nationality: "Filipino", avgRate: 30.5, count: 17 },
];

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div style={{ background: "#F3F4F6", borderRadius: 6, height: 20, width: "100%", overflow: "hidden" }}>
      <div style={{ width: `${(value / max) * 100}%`, background: color, height: "100%", borderRadius: 6, transition: "width 0.5s" }} />
    </div>
  );
}

export default function PayTransparencyTab() {
  const { toast } = useToast();
  const [data, setData] = useState<{ gender: GenderData[]; contract: ContractData[]; nat: NatData[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = () => {
    setLoading(true);
    setTimeout(() => {
      setData({ gender: MOCK_GENDER, contract: MOCK_CONTRACT, nat: MOCK_NAT });
      setLoading(false);
      toast("Report generated");
    }, 800);
  };

  const gap = data ? (((data.gender[0].avgRate - data.gender[1].avgRate) / data.gender[0].avgRate) * 100).toFixed(1) : "0";
  const maxRate = 40;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Compliance</div>
          <div className="tab-greeting-name">Pay Transparency Report</div>
        </div>
        <BarChart3 size={28} color={NAVY} />
      </div>

      {/* Compliance badge */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 10, background: "#ECFDF5", borderColor: "#10B981" }}>
        <ShieldCheck size={22} color="#10B981" />
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#065F46" }}>EU Pay Transparency Directive Ready</div>
          <div style={{ fontSize: 11, color: "#6B7280" }}>Compliant with 2023/970 reporting requirements</div>
        </div>
      </div>

      {!data ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <BarChart3 size={40} color="#D1D5DB" />
          <div style={{ fontSize: 14, color: "#6B7280", marginTop: 12 }}>Generate a pay transparency report</div>
          <button onClick={generate} disabled={loading} style={primaryBtn}>
            {loading ? <Loader2 size={16} className="spin" /> : "Generate Report"}
          </button>
        </div>
      ) : (
        <>
          {/* Gender pay gap */}
          <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginTop: 16, marginBottom: 8 }}>Gender Pay Gap Analysis</div>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Pay Gap</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: parseFloat(gap) > 5 ? "#EF4444" : "#10B981" }}>{gap}%</span>
            </div>
            {data.gender.map(g => (
              <div key={g.gender} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: "#374151", fontWeight: 600 }}>{g.gender}</span>
                  <span style={{ color: "#6B7280" }}>Avg: {g.avgRate} PLN | Med: {g.medianRate} PLN</span>
                </div>
                <Bar value={g.avgRate} max={maxRate} color={g.gender === "Male" ? "#3B82F6" : "#EC4899"} />
              </div>
            ))}
          </div>

          {/* Contract breakdown */}
          <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginTop: 14, marginBottom: 8 }}>Contract Type Breakdown</div>
          <div style={card}>
            {data.contract.map(c => (
              <div key={c.type} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: "#374151" }}>{c.type}</span>
                  <span style={{ color: "#6B7280" }}>{c.avgRate} PLN/hr ({c.count} workers)</span>
                </div>
                <Bar value={c.avgRate} max={maxRate} color={c.type.includes("Prace") ? "#10B981" : "#F59E0B"} />
              </div>
            ))}
          </div>

          {/* Nationality breakdown */}
          <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginTop: 14, marginBottom: 8 }}>Nationality Breakdown</div>
          <div style={card}>
            {data.nat.map(n => (
              <div key={n.nationality} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: "#374151" }}>{n.nationality}</span>
                  <span style={{ color: "#6B7280" }}>{n.avgRate} PLN/hr ({n.count})</span>
                </div>
                <Bar value={n.avgRate} max={maxRate} color="#6366F1" />
              </div>
            ))}
          </div>

          <button onClick={generate} style={{ ...primaryBtn, marginTop: 14 }}>Regenerate Report</button>
        </>
      )}
      <div style={{ height: 100 }} />
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", padding: "14px 16px", marginBottom: 6 };
const primaryBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  background: NAVY, color: "#fff", border: "none", borderRadius: 10,
  padding: "12px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer",
  marginTop: 16, width: "100%",
};

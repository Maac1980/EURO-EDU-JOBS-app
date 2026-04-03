import { useState, useEffect, useMemo } from "react";
import { Calculator, Download, Lock } from "lucide-react";
import { calculate, reverseCalculate } from "@/components/KnowledgeCenter";
import { useToast } from "@/lib/toast";

function authHeaders(): Record<string, string> {
  const token = sessionStorage.getItem("eej_token");
  return token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" };
}

interface Worker { id: string; name: string; hourlyNettoRate?: number; totalHours?: number; advancePayment?: number; }

export default function PayrollTab() {
  const { showToast } = useToast();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState("2026-03");
  const [edits, setEdits] = useState<Record<string, { hours?: number; advance?: number }>>({});

  useEffect(() => {
    fetch("/api/payroll/workers", { headers: authHeaders() })
      .then((r) => r.json()).then((d) => setWorkers(d.workers ?? []))
      .catch(() => setWorkers([])).finally(() => setLoading(false));
  }, []);

  function calc(w: Worker) {
    const hours = edits[w.id]?.hours ?? w.totalHours ?? 160;
    const rate = w.hourlyNettoRate ?? 31.40;
    const advance = edits[w.id]?.advance ?? w.advancePayment ?? 0;
    const r = calculate(hours, rate, "zlecenie", true, false);
    return { ...r, hours, rate, advance, final: Math.max(0, r.net - advance) };
  }

  const totals = useMemo(() => {
    let gross = 0, net = 0, cost = 0;
    workers.forEach((w) => { const c = calc(w); gross += c.gross; net += c.net; cost += c.totalCost; });
    return { gross, net, cost };
  }, [workers, edits]);

  return (
    <div className="tab-page">
      <div className="tab-greeting"><div><div className="tab-greeting-label">Finance</div><div className="tab-greeting-name">Payroll Ledger</div></div>
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: "4px 8px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12 }}>
          {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m) => (<option key={m} value={`2026-${m}`}>2026-{m}</option>))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, background: "#EFF6FF", borderRadius: 12, padding: "10px", textAlign: "center" }}><div style={{ fontSize: 16, fontWeight: 800, color: "#3B82F6" }}>{totals.gross.toFixed(0)} PLN</div><div style={{ fontSize: 10, color: "#3B82F6" }}>Total Gross</div></div>
        <div style={{ flex: 1, background: "#ECFDF5", borderRadius: 12, padding: "10px", textAlign: "center" }}><div style={{ fontSize: 16, fontWeight: 800, color: "#059669" }}>{totals.net.toFixed(0)} PLN</div><div style={{ fontSize: 10, color: "#059669" }}>Total Net</div></div>
        <div style={{ flex: 1, background: "#FEF2F2", borderRadius: 12, padding: "10px", textAlign: "center" }}><div style={{ fontSize: 16, fontWeight: 800, color: "#DC2626" }}>{totals.cost.toFixed(0)} PLN</div><div style={{ fontSize: 10, color: "#DC2626" }}>Employer Cost</div></div>
      </div>
      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading payroll...</div>}
      {!loading && workers.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}><Calculator size={28} /><div style={{ marginTop: 8 }}>No workers in payroll</div></div>}
      {workers.map((w) => { const c = calc(w); return (
        <div key={w.id} style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 12, marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 6 }}>{w.name}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 11 }}>
            <div><span style={{ color: "#9CA3AF" }}>Hours: </span><input type="number" value={c.hours} onChange={(e) => setEdits({...edits, [w.id]: {...edits[w.id], hours: Number(e.target.value)}})} style={{ width: 50, padding: "2px 4px", border: "1px solid #E5E7EB", borderRadius: 4, fontSize: 11 }} /></div>
            <div><span style={{ color: "#9CA3AF" }}>Rate: </span><span style={{ fontWeight: 600 }}>{c.rate}/h</span></div>
            <div><span style={{ color: "#9CA3AF" }}>Gross: </span><span style={{ fontWeight: 600, color: "#3B82F6" }}>{c.gross.toFixed(2)}</span></div>
            <div><span style={{ color: "#9CA3AF" }}>ZUS: </span><span style={{ color: "#DC2626" }}>-{c.employeeZus.toFixed(2)}</span></div>
            <div><span style={{ color: "#9CA3AF" }}>PIT: </span><span style={{ color: "#D97706" }}>-{c.pit.toFixed(2)}</span></div>
            <div><span style={{ color: "#9CA3AF" }}>Net: </span><span style={{ fontWeight: 700, color: "#059669" }}>{c.net.toFixed(2)}</span></div>
            <div><span style={{ color: "#9CA3AF" }}>Net/h: </span><span style={{ fontWeight: 700, color: "#10B981" }}>{c.netPerHour.toFixed(2)} PLN</span></div>
            <div><span style={{ color: "#9CA3AF" }}>Health: </span><span style={{ color: "#DC2626" }}>-{c.health.toFixed(2)}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <span style={{ color: "#9CA3AF" }}>Want net/h: </span>
              <input type="number" step="0.5" placeholder="—" style={{ width: 48, padding: "2px 3px", border: "1px solid #10B981", borderRadius: 4, fontSize: 10, color: "#10B981", background: "#F0FDF4" }}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const el = e.target.nextElementSibling as HTMLElement | null;
                  if (val > 0 && c.hours > 0 && el) {
                    const rv = reverseCalculate(c.hours, val, "zlecenie", true, false);
                    el.textContent = `→ ${(rv.gross / c.hours).toFixed(2)}/h`;
                  } else if (el) { el.textContent = ""; }
                }} />
              <span style={{ fontSize: 10, color: "#3B82F6", fontWeight: 600 }}></span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11 }}>
            <div><span style={{ color: "#9CA3AF" }}>Advance: </span><input type="number" value={c.advance} onChange={(e) => setEdits({...edits, [w.id]: {...edits[w.id], advance: Number(e.target.value)}})} style={{ width: 60, padding: "2px 4px", border: "1px solid #E5E7EB", borderRadius: 4, fontSize: 11 }} /></div>
            <div><span style={{ color: "#9CA3AF" }}>Take-Home: </span><span style={{ fontWeight: 800, color: "#059669" }}>{c.final.toFixed(2)} PLN</span></div>
          </div>
        </div>
      ); })}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => { fetch("/api/payroll/close-month", { method: "POST", headers: authHeaders(), body: JSON.stringify({ month }) }).then(() => showToast("Month closed", "success")).catch(() => showToast("Failed", "error")); }} style={{ flex: 1, padding: 12, borderRadius: 10, border: "none", background: "#1B2A4A", color: "#FFD600", fontSize: 14, fontWeight: 700, cursor: "pointer" }}><Lock size={14} style={{ display: "inline", marginRight: 4 }} /> Close Month</button>
        <button onClick={() => showToast("CSV export coming soon", "info")} style={{ padding: "12px 16px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}><Download size={14} /></button>
      </div>
      <div style={{ height: 100 }} />
    </div>
  );
}

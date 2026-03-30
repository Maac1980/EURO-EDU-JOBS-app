import { useEffect, useState, useCallback } from "react";
import { Calculator, Download, Lock } from "lucide-react";
import { useToast } from "@/lib/toast";
import { calculate } from "@/components/KnowledgeCenter";
import type { ContractType } from "@/components/KnowledgeCenter";

const API_BASE = "/api";
const ZUS_RATE = 0.1126;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("eej_token_v2");
  return token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" };
}

interface PayrollWorker {
  id: string;
  name: string;
  hours: number;
  rate: number;
  gross: number;
  zus: number;
  health: number;
  pit: number;
  net: number;
  advances: number;
  final: number;
  contractType?: ContractType;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PayrollTab() {
  const { showToast } = useToast();
  const [workers, setWorkers] = useState<PayrollWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear] = useState(2026);
  const [closing, setClosing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState("");
  const [editAdvances, setEditAdvances] = useState("");

  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/payroll/workers?month=${selectedMonth + 1}&year=${selectedYear}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const mapped = (data.workers || data || []).map((w: any) => {
        const hours = w.hours ?? 0;
        const rate = w.rate ?? 0;
        const contractType: ContractType = w.contractType || "zlecenie";
        const calc = calculate(hours, rate, contractType, true, contractType === "praca");
        const advances = w.advances ?? 0;
        return {
          id: w.id || w._id || String(Math.random()),
          name: w.name || w.fullName || "Unknown",
          hours,
          rate,
          gross: calc.gross,
          zus: calc.employeeZus,
          health: calc.health,
          pit: calc.pit,
          net: calc.net,
          advances,
          final: Math.round((calc.net - advances) * 100) / 100,
          contractType,
        };
      });
      setWorkers(mapped);
    } catch {
      setWorkers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  function recalcWorker(w: PayrollWorker, hours: number, advances: number): PayrollWorker {
    const contractType: ContractType = w.contractType || "zlecenie";
    const calc = calculate(hours, w.rate, contractType, true, contractType === "praca");
    return {
      ...w,
      hours,
      gross: calc.gross,
      zus: calc.employeeZus,
      health: calc.health,
      pit: calc.pit,
      net: calc.net,
      advances,
      final: Math.round((calc.net - advances) * 100) / 100,
    };
  }

  function startEdit(w: PayrollWorker) {
    setEditingId(w.id);
    setEditHours(String(w.hours));
    setEditAdvances(String(w.advances));
  }

  async function saveEdit(w: PayrollWorker) {
    const hours = parseFloat(editHours) || 0;
    const advances = parseFloat(editAdvances) || 0;
    try {
      await fetch(`${API_BASE}/payroll/workers/${w.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ hours, advances, month: selectedMonth + 1, year: selectedYear }),
      });
      const updated = recalcWorker(w, hours, advances);
      setWorkers((prev) => prev.map((p) => (p.id === w.id ? updated : p)));
      showToast("Payroll updated", "success");
    } catch {
      showToast("Failed to update payroll", "error");
    }
    setEditingId(null);
  }

  async function closeMonth() {
    setClosing(true);
    try {
      const res = await fetch(`${API_BASE}/payroll/close-month`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ month: selectedMonth + 1, year: selectedYear }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast(`${MONTHS[selectedMonth]} ${selectedYear} closed`, "success");
    } catch {
      showToast("Failed to close month", "error");
    } finally {
      setClosing(false);
    }
  }

  function exportCSV() {
    const header = "Name,Hours,Rate,Gross,ZUS,Health,PIT,Net,Advances,Final";
    const rows = workers.map((w) =>
      `"${w.name}",${w.hours},${w.rate},${w.gross},${w.zus},${w.health},${w.pit},${w.net},${w.advances},${w.final}`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${MONTHS[selectedMonth].toLowerCase()}-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported", "success");
  }

  const totals = workers.reduce(
    (acc, w) => ({
      hours: acc.hours + w.hours,
      gross: acc.gross + w.gross,
      zus: acc.zus + w.zus,
      health: acc.health + w.health,
      pit: acc.pit + w.pit,
      net: acc.net + w.net,
      advances: acc.advances + w.advances,
      final: acc.final + w.final,
    }),
    { hours: 0, gross: 0, zus: 0, health: 0, pit: 0, net: 0, advances: 0, final: 0 }
  );

  const fmt = (n: number) => n.toFixed(2);

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Finance</div>
          <div className="tab-greeting-name">Payroll Ledger</div>
        </div>
      </div>

      {/* ZUS Rate Notice */}
      <div style={{ background: "#EEF2FF", borderRadius: 10, padding: "8px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Calculator size={16} color="#6366F1" />
        <span style={{ fontSize: 12, color: "#4338CA", fontWeight: 600 }}>ZUS Employee Rate: {(ZUS_RATE * 100).toFixed(2)}%</span>
      </div>

      {/* Month Selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
            fontSize: 14, fontWeight: 600, background: "#fff", color: "#111827",
          }}
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i}>{m} {selectedYear}</option>
          ))}
        </select>
        <button
          onClick={exportCSV}
          style={{
            display: "flex", alignItems: "center", gap: 4, padding: "8px 14px",
            borderRadius: 10, border: "none", background: "#059669", color: "#fff",
            fontWeight: 700, fontSize: 12, cursor: "pointer",
          }}
        >
          <Download size={14} /> CSV
        </button>
      </div>

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          onClick={closeMonth}
          disabled={closing}
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 10, border: "none",
            background: closing ? "#D1D5DB" : "#DC2626", color: "#fff",
            fontWeight: 700, fontSize: 13, cursor: closing ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          <Lock size={14} /> {closing ? "Closing..." : "Close Month"}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading payroll...</div>
      ) : workers.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>No payroll data for {MONTHS[selectedMonth]} {selectedYear}</div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 12, border: "1.5px solid #E5E7EB" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 800 }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                {["Name", "Hours", "Rate", "Gross", "ZUS", "Health", "PIT", "Net", "Advances", "Final", ""].map((h) => (
                  <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontWeight: 700, color: "#6B7280", borderBottom: "1.5px solid #E5E7EB", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "8px 6px", fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>{w.name}</td>
                  <td style={{ padding: "8px 6px" }}>
                    {editingId === w.id ? (
                      <input
                        type="number"
                        value={editHours}
                        onChange={(e) => setEditHours(e.target.value)}
                        style={{ width: 50, padding: "2px 4px", borderRadius: 6, border: "1.5px solid #6366F1", fontSize: 11 }}
                      />
                    ) : (
                      <span style={{ color: "#374151" }}>{w.hours}</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 6px", color: "#374151" }}>{fmt(w.rate)}</td>
                  <td style={{ padding: "8px 6px", color: "#374151", fontWeight: 600 }}>{fmt(w.gross)}</td>
                  <td style={{ padding: "8px 6px", color: "#DC2626" }}>{fmt(w.zus)}</td>
                  <td style={{ padding: "8px 6px", color: "#D97706" }}>{fmt(w.health)}</td>
                  <td style={{ padding: "8px 6px", color: "#7C3AED" }}>{fmt(w.pit)}</td>
                  <td style={{ padding: "8px 6px", color: "#059669", fontWeight: 700 }}>{fmt(w.net)}</td>
                  <td style={{ padding: "8px 6px" }}>
                    {editingId === w.id ? (
                      <input
                        type="number"
                        value={editAdvances}
                        onChange={(e) => setEditAdvances(e.target.value)}
                        style={{ width: 50, padding: "2px 4px", borderRadius: 6, border: "1.5px solid #6366F1", fontSize: 11 }}
                      />
                    ) : (
                      <span style={{ color: "#374151" }}>{fmt(w.advances)}</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 6px", color: "#111827", fontWeight: 800 }}>{fmt(w.final)}</td>
                  <td style={{ padding: "8px 6px" }}>
                    {editingId === w.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => saveEdit(w)} style={{ padding: "2px 8px", borderRadius: 6, border: "none", background: "#059669", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Save</button>
                        <button onClick={() => setEditingId(null)} style={{ padding: "2px 8px", borderRadius: 6, border: "none", background: "#E5E7EB", color: "#374151", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(w)} style={{ padding: "2px 8px", borderRadius: 6, border: "none", background: "#EEF2FF", color: "#6366F1", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Edit</button>
                    )}
                  </td>
                </tr>
              ))}
              {/* Summary Row */}
              <tr style={{ background: "#F0FDF4", borderTop: "2px solid #059669" }}>
                <td style={{ padding: "8px 6px", fontWeight: 800, color: "#059669" }}>TOTALS</td>
                <td style={{ padding: "8px 6px", fontWeight: 700, color: "#059669" }}>{totals.hours}</td>
                <td style={{ padding: "8px 6px" }}>-</td>
                <td style={{ padding: "8px 6px", fontWeight: 700, color: "#059669" }}>{fmt(totals.gross)}</td>
                <td style={{ padding: "8px 6px", fontWeight: 700, color: "#DC2626" }}>{fmt(totals.zus)}</td>
                <td style={{ padding: "8px 6px", fontWeight: 700, color: "#D97706" }}>{fmt(totals.health)}</td>
                <td style={{ padding: "8px 6px", fontWeight: 700, color: "#7C3AED" }}>{fmt(totals.pit)}</td>
                <td style={{ padding: "8px 6px", fontWeight: 700, color: "#059669" }}>{fmt(totals.net)}</td>
                <td style={{ padding: "8px 6px", fontWeight: 700, color: "#059669" }}>{fmt(totals.advances)}</td>
                <td style={{ padding: "8px 6px", fontWeight: 800, color: "#059669" }}>{fmt(totals.final)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div style={{ height: 100 }} />
    </div>
  );
}

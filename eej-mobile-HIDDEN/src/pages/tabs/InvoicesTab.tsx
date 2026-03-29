import { useEffect, useState } from "react";
import { Receipt, Download, CheckCircle, Clock, Send } from "lucide-react";
import { fetchInvoices, updateInvoiceStatus } from "@/lib/api";

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientName?: string;
  monthYear?: string;
  subtotal?: number;
  vatAmount?: number;
  total?: number;
  status?: string;
  dueDate?: string;
  paidAt?: string;
}

export default function InvoicesTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "sent" | "paid">("all");

  useEffect(() => {
    fetchInvoices()
      .then(setInvoices)
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? invoices : invoices.filter((i) => i.status === filter);

  const totalRevenue = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + (i.total ?? 0), 0);

  const totalPending = invoices
    .filter((i) => i.status === "sent")
    .reduce((sum, i) => sum + (i.total ?? 0), 0);

  async function markPaid(id: string) {
    try {
      await updateInvoiceStatus(id, "paid");
      setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status: "paid" } : i)));
    } catch {}
  }

  async function markSent(id: string) {
    try {
      await updateInvoiceStatus(id, "sent");
      setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status: "sent" } : i)));
    } catch {}
  }

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Finance</div>
          <div className="tab-greeting-name">Invoices</div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, background: "#ECFDF5", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "#059669", fontWeight: 500 }}>Paid Revenue</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#059669" }}>{totalRevenue.toFixed(2)} PLN</div>
        </div>
        <div style={{ flex: 1, background: "#FFFBEB", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "#D97706", fontWeight: 500 }}>Pending</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#D97706" }}>{totalPending.toFixed(2)} PLN</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
        {(["all", "draft", "sent", "paid"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "5px 12px",
              borderRadius: 20,
              border: filter === f ? "2px solid #1B2A4A" : "1.5px solid #E5E7EB",
              background: filter === f ? "#1B2A4A" : "#fff",
              color: filter === f ? "#FFD600" : "#6B7280",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {f} ({f === "all" ? invoices.length : invoices.filter((i) => i.status === f).length})
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading invoices...</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
          <Receipt size={28} />
          <div style={{ marginTop: 8, fontSize: 14 }}>No invoices found</div>
        </div>
      )}

      {filtered.map((inv) => (
        <div key={inv.id} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{inv.invoiceNumber}</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                {inv.clientName ?? "Unknown Client"} · {inv.monthYear ?? ""}
              </div>
            </div>
            <InvoiceStatusBadge status={inv.status} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{(inv.total ?? 0).toFixed(2)} PLN</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                Net: {(inv.subtotal ?? 0).toFixed(2)} + VAT: {(inv.vatAmount ?? 0).toFixed(2)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {inv.status === "draft" && (
                <button onClick={() => markSent(inv.id)} style={actionBtnStyle}>
                  <Send size={12} /> Send
                </button>
              )}
              {inv.status === "sent" && (
                <button onClick={() => markPaid(inv.id)} style={{ ...actionBtnStyle, background: "#059669", borderColor: "#059669" }}>
                  <CheckCircle size={12} /> Paid
                </button>
              )}
              <button
                onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, "_blank")}
                style={{ ...actionBtnStyle, background: "#fff", color: "#1B2A4A" }}
              >
                <Download size={12} />
              </button>
            </div>
          </div>

          {inv.dueDate && (
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
              Due: {new Date(inv.dueDate).toLocaleDateString("en-GB")}
            </div>
          )}
        </div>
      ))}
      <div style={{ height: 100 }} />
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status?: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    draft: { bg: "#F3F4F6", text: "#6B7280" },
    sent: { bg: "#EFF6FF", text: "#3B82F6" },
    paid: { bg: "#ECFDF5", text: "#059669" },
  };
  const c = colors[status ?? "draft"] ?? colors.draft;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: c.bg, color: c.text, display: "inline-flex", alignItems: "center", gap: 3 }}>
      {status === "paid" ? <CheckCircle size={11} /> : status === "sent" ? <Clock size={11} /> : null}
      {(status ?? "draft").charAt(0).toUpperCase() + (status ?? "draft").slice(1)}
    </span>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1.5px solid #E5E7EB",
  borderRadius: 14,
  padding: 14,
  marginBottom: 8,
};

const actionBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "5px 10px",
  borderRadius: 8,
  border: "1.5px solid #1B2A4A",
  background: "#1B2A4A",
  color: "#FFD600",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

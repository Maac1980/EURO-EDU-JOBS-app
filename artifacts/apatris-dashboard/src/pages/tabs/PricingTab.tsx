import { useState, useEffect } from "react";
import { CreditCard, Check, Star, ExternalLink } from "lucide-react";
import { useToast } from "@/lib/toast";
function authHeaders(): Record<string, string> { const t = sessionStorage.getItem("eej_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
const PLANS = [
  { id: "starter", name: "Starter", price: 199, workers: 25, popular: false, features: ["25 workers", "Document tracking", "Email alerts", "Basic compliance"] },
  { id: "professional", name: "Professional", price: 499, workers: 100, popular: true, features: ["100 workers", "Full ATS pipeline", "AI document scanning", "WhatsApp/SMS alerts", "Invoice generation", "Regulatory intelligence"] },
  { id: "enterprise", name: "Enterprise", price: 999, workers: -1, popular: false, features: ["Unlimited workers", "Everything in Professional", "Custom branding", "API access", "Dedicated support"] },
];
export default function PricingTab() {
  const { showToast } = useToast();
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => { fetch("/api/billing/status", { headers: authHeaders() }).then(r => r.json()).then(d => { if (d.plan) setCurrent(d.plan); }).catch(() => {}); }, []);
  async function subscribe(planId: string) {
    try { const r = await fetch("/api/billing/checkout", { method: "POST", headers: authHeaders(), body: JSON.stringify({ plan: planId, agencyName: "My Agency", email: "admin@example.com" }) }); const d = await r.json(); if (d.url) window.open(d.url, "_blank"); else showToast("Stripe not configured", "error"); } catch { showToast("Failed to start checkout", "error"); }
  }
  async function manage() {
    try { const r = await fetch("/api/billing/portal", { method: "POST", headers: authHeaders() }); const d = await r.json(); if (d.url) window.open(d.url, "_blank"); } catch { showToast("Failed to open portal", "error"); }
  }
  return (
    <div className="tab-page">
      <div className="tab-greeting"><div><div className="tab-greeting-label">Subscription</div><div className="tab-greeting-name">Pricing & Plans</div></div></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {PLANS.map(p => (
          <div key={p.id} style={{ background: "#fff", border: p.popular ? "2px solid #1B2A4A" : "1.5px solid #E5E7EB", borderRadius: 16, padding: 20, position: "relative" }}>
            {p.popular && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#FFD600", color: "#1B2A4A", padding: "2px 12px", borderRadius: 10, fontSize: 11, fontWeight: 800 }}><Star size={10} style={{ display: "inline", marginRight: 2 }} />Most Popular</div>}
            <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{p.name}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#1B2A4A", marginTop: 4 }}>€{p.price}<span style={{ fontSize: 14, fontWeight: 400, color: "#6B7280" }}>/month</span></div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{p.workers === -1 ? "Unlimited" : p.workers} workers</div>
            <div style={{ marginTop: 12 }}>{p.features.map((f, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", marginBottom: 4 }}><Check size={14} color="#059669" />{f}</div>)}</div>
            {current === p.id ? (
              <button onClick={manage} style={{ width: "100%", marginTop: 12, padding: 12, borderRadius: 10, border: "1.5px solid #059669", background: "#ECFDF5", color: "#059669", fontWeight: 700, cursor: "pointer" }}>Current Plan — Manage</button>
            ) : (
              <button onClick={() => subscribe(p.id)} style={{ width: "100%", marginTop: 12, padding: 12, borderRadius: 10, border: "none", background: p.popular ? "#1B2A4A" : "#F3F4F6", color: p.popular ? "#FFD600" : "#374151", fontWeight: 700, cursor: "pointer" }}>Get Started</button>
            )}
          </div>
        ))}
      </div>
      <div style={{ height: 100 }} />
    </div>
  );
}

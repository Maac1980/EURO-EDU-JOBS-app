import { useEffect, useState } from "react";
import { CreditCard, Check, Star, ExternalLink } from "lucide-react";
import { useToast } from "@/lib/toast";

const API_BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("eej_token_v2");
  return token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" };
}

interface Plan {
  id: string;
  name: string;
  price: number;
  workerLimit: string;
  features: string[];
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 199,
    workerLimit: "Up to 25 workers",
    features: [
      "Basic compliance tracking",
      "Document management",
      "Email support",
      "ZUS calculator",
      "5 contract templates",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 499,
    workerLimit: "Up to 100 workers",
    popular: true,
    features: [
      "Everything in Starter",
      "ATS pipeline & recruitment",
      "Invoicing & Faktura VAT",
      "GPS tracking",
      "AI-powered immigration search",
      "Priority support",
      "Regulatory intelligence",
      "Unlimited templates",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 999,
    workerLimit: "Unlimited workers",
    features: [
      "Everything in Professional",
      "Custom integrations",
      "Dedicated account manager",
      "SLA guarantee",
      "AI audit trail",
      "GDPR compliance tools",
      "White-label options",
      "On-premise deployment",
    ],
  },
];

export default function PricingTab() {
  const { showToast } = useToast();
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/billing/status`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => setCurrentPlan(data.plan || data.planId || null))
      .catch(() => setCurrentPlan(null))
      .finally(() => setLoading(false));
  }, []);

  async function subscribe(planId: string) {
    setSubscribing(planId);
    try {
      const res = await fetch(`${API_BASE}/billing/checkout`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      } else {
        showToast("Checkout session created", "success");
      }
    } catch {
      showToast("Failed to start checkout", "error");
    } finally {
      setSubscribing(null);
    }
  }

  async function manageSubscription() {
    try {
      const res = await fetch(`${API_BASE}/billing/portal`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      }
    } catch {
      showToast("Failed to open billing portal", "error");
    }
  }

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Billing</div>
          <div className="tab-greeting-name">Pricing & Plans</div>
        </div>
      </div>

      {currentPlan && (
        <button
          onClick={manageSubscription}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", marginBottom: 12,
            borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151",
            fontWeight: 600, fontSize: 13, cursor: "pointer", width: "100%", justifyContent: "center",
          }}
        >
          <ExternalLink size={14} /> Manage Subscription
        </button>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          return (
            <div
              key={plan.id}
              style={{
                background: "#fff",
                borderRadius: 14,
                border: plan.popular ? "2px solid #6366F1" : "1.5px solid #E5E7EB",
                padding: "16px 14px",
                position: "relative",
                boxShadow: plan.popular ? "0 4px 16px rgba(99,102,241,0.15)" : undefined,
              }}
            >
              {plan.popular && (
                <div style={{
                  position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                  background: "#6366F1", color: "#fff", fontSize: 10, fontWeight: 800,
                  padding: "3px 12px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4,
                }}>
                  <Star size={10} fill="#fff" /> Most Popular
                </div>
              )}
              {isCurrent && (
                <div style={{
                  position: "absolute", top: -10, right: 12,
                  background: "#059669", color: "#fff", fontSize: 10, fontWeight: 800,
                  padding: "3px 10px", borderRadius: 20,
                }}>
                  Current Plan
                </div>
              )}
              <div style={{ textAlign: "center", marginBottom: 12, marginTop: plan.popular ? 8 : 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{plan.name}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: plan.popular ? "#6366F1" : "#111827", marginTop: 4 }}>
                  &euro;{plan.price}<span style={{ fontSize: 13, fontWeight: 500, color: "#6B7280" }}>/mo</span>
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{plan.workerLimit}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {plan.features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
                    <Check size={14} color="#059669" /> {f}
                  </div>
                ))}
              </div>
              <button
                onClick={() => !isCurrent && subscribe(plan.id)}
                disabled={!!subscribing || isCurrent}
                style={{
                  width: "100%", padding: "10px 16px", borderRadius: 10, border: "none",
                  background: isCurrent ? "#E5E7EB" : plan.popular ? "#6366F1" : "#111827",
                  color: isCurrent ? "#6B7280" : "#fff",
                  fontWeight: 700, fontSize: 13,
                  cursor: isCurrent || subscribing ? "not-allowed" : "pointer",
                }}
              >
                {isCurrent ? "Current Plan" : subscribing === plan.id ? "Redirecting..." : "Subscribe"}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}

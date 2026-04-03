import { useState, useEffect } from "react";
import { Award, Star, Loader2 } from "lucide-react";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";

const NAVY = "#1B2A4A";

const CATEGORIES = [
  { id: "welding", label: "Welding", icon: "W", color: "#F59E0B" },
  { id: "construction", label: "Construction", icon: "C", color: "#3B82F6" },
  { id: "warehouse", label: "Warehouse", icon: "H", color: "#10B981" },
  { id: "healthcare", label: "Healthcare", icon: "M", color: "#EC4899" },
  { id: "driving", label: "Driving", icon: "D", color: "#8B5CF6" },
  { id: "language", label: "Language", icon: "L", color: "#6366F1" },
];

interface SkillRating { category: string; level: number; date: string; }

export default function SkillsAssessmentTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isStaff = user?.role !== "candidate";
  const [skills, setSkills] = useState<SkillRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<{ category: string; level: number; date: string }[]>([]);

  useEffect(() => {
    setLoading(true);
    const id = user?.candidateId || "me";
    fetch(`/api/workers/${id}/skills`)
      .then(r => r.ok ? r.json() : { skills: [], history: [] })
      .then(d => {
        setSkills(d.skills || []);
        setHistory(d.history || []);
      })
      .catch(() => { setSkills([]); setHistory([]); })
      .finally(() => setLoading(false));
  }, [user?.candidateId]);

  const getLevel = (cat: string) => skills.find(s => s.category === cat)?.level || 0;

  const rate = (cat: string, level: number) => {
    if (isStaff) return;
    const now = new Date().toISOString().slice(0, 10);
    const updated = skills.filter(s => s.category !== cat).concat({ category: cat, level, date: now });
    setSkills(updated);
    setHistory(prev => [...prev, { category: cat, level, date: now }]);
    const id = user?.candidateId || "me";
    fetch(`/api/workers/${id}/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills: updated }),
    }).catch(() => toast("Failed to save skills"));
    toast(`${CATEGORIES.find(c => c.id === cat)?.label} rated ${level}/5`);
  };

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">{isStaff ? "Skills Matrix" : "Self Assessment"}</div>
          <div className="tab-greeting-name">Skills Assessment</div>
        </div>
        <Award size={28} color={NAVY} />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={28} className="spin" color={NAVY} /></div>
      ) : (
        <>
          {/* Skill cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {CATEGORIES.map(cat => {
              const level = getLevel(cat.id);
              return (
                <div key={cat.id} style={card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, background: `${cat.color}15`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 800, fontSize: 14, color: cat.color,
                    }}>{cat.icon}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{cat.label}</div>
                      <div style={{ fontSize: 11, color: "#6B7280" }}>
                        {level === 0 ? "Not rated" : `Level ${level}/5`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => rate(cat.id, n)}
                        style={{
                          background: "none", border: "none", cursor: isStaff ? "default" : "pointer",
                          padding: 2,
                        }}
                      >
                        <Star
                          size={24}
                          fill={n <= level ? "#FFD600" : "none"}
                          color={n <= level ? "#FFD600" : "#D1D5DB"}
                          strokeWidth={1.5}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Assessment history */}
          {history.length > 0 && (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginTop: 18, marginBottom: 8 }}>
                Assessment History
              </div>
              <div style={card}>
                {history.slice(-10).reverse().map((h, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "6px 0", borderBottom: i < Math.min(history.length, 10) - 1 ? "1px solid #F3F4F6" : "none",
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                      {CATEGORIES.find(c => c.id === h.category)?.label}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", gap: 1 }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <Star key={n} size={12} fill={n <= h.level ? "#FFD600" : "none"} color={n <= h.level ? "#FFD600" : "#D1D5DB"} strokeWidth={1.5} />
                        ))}
                      </div>
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>{h.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {skills.length === 0 && !isStaff && (
            <div style={{ textAlign: "center", padding: 24, color: "#9CA3AF", fontSize: 13 }}>
              Tap the stars to rate your skills
            </div>
          )}
        </>
      )}
      <div style={{ height: 100 }} />
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", padding: "14px 16px", marginBottom: 6 };

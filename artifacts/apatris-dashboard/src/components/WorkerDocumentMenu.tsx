/**
 * WorkerDocumentMenu — modal with grouped tabs showing templates per worker.
 * Opens from worker row document button.
 * Calls POST /api/templates/suggest/:workerId for AI suggestions.
 * Shows prefill readiness, reasons, and missing fields.
 */
import { useState, useEffect } from "react";
import { X, FileText, CheckCircle, AlertTriangle, XCircle, ChevronRight, Loader2, Upload, Clock, Shield } from "lucide-react";

function getToken() { return localStorage.getItem("apatris_jwt") ?? sessionStorage.getItem("eej_token") ?? ""; }

interface Props {
  workerId: string;
  workerName: string;
  onClose: () => void;
}

interface TemplateSuggestion {
  templateId: string;
  name: string;
  category: string;
  description: string;
  relevanceScore: number;
  reason: string;
  prefillStatus: { ready: string[]; missing: string[]; percentage: number };
  applicable: boolean;
}

const TAB_CONFIG: { id: string; label: string; icon: any; color: string }[] = [
  { id: "umowy", label: "Umowy", icon: FileText, color: "#3b82f6" },
  { id: "podatkowe", label: "Podatkowe", icon: FileText, color: "#8b5cf6" },
  { id: "compliance", label: "Compliance / RODO", icon: Shield, color: "#f59e0b" },
  { id: "certyfikaty", label: "Certyfikaty", icon: CheckCircle, color: "#22c55e" },
  { id: "badania", label: "Badania", icon: AlertTriangle, color: "#ef4444" },
  { id: "historia", label: "Historia", icon: Clock, color: "#6b7280" },
  { id: "upload", label: "Dodaj dokument", icon: Upload, color: "#d4e84b" },
];

export default function WorkerDocumentMenu({ workerId, workerName, onClose }: Props) {
  const [activeTab, setActiveTab] = useState("umowy");
  const [suggestions, setSuggestions] = useState<Record<string, TemplateSuggestion[]>>({});
  const [conditions, setConditions] = useState<string[]>([]);
  const [applicableCount, setApplicableCount] = useState(0);
  const [totalTemplates, setTotalTemplates] = useState(0);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<any[]>([]);

  useEffect(() => {
    // Load template suggestions
    fetch(`/api/templates/suggest/${workerId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    })
      .then(r => r.json())
      .then(d => {
        setSuggestions(d.byCategory ?? {});
        setConditions(d.workerConditions ?? []);
        setApplicableCount(d.applicableCount ?? 0);
        setTotalTemplates(d.totalTemplates ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Load existing documents for this worker
    fetch(`/api/legal/documents?workerId=${workerId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => setDocuments(d.documents ?? []))
      .catch(() => {});
  }, [workerId]);

  const tabTemplates = suggestions[activeTab] ?? [];
  const tabDocuments = documents.filter(d => {
    const type = d.doc_type ?? d.docType ?? "";
    if (activeTab === "umowy") return type.includes("umowa") || type.includes("aneks");
    if (activeTab === "compliance") return type.includes("rodo") || type.includes("risk") || type.includes("scope");
    if (activeTab === "certyfikaty") return type.includes("cover") || type.includes("poa") || type.includes("appeal") || type.includes("trc");
    if (activeTab === "badania") return type.includes("medical") || type.includes("badania");
    if (activeTab === "historia") return true;
    return false;
  });

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: "#0d1220", borderRadius: 16, width: "100%", maxWidth: 800,
        maxHeight: "85vh", display: "flex", flexDirection: "column",
        border: "1px solid rgba(212,232,75,0.15)", boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid rgba(212,232,75,0.1)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <h2 style={{ color: "#fff", fontWeight: 700, fontSize: 16, margin: 0 }}>
              Dokumenty — {workerName || "—"}
            </h2>
            <div style={{ fontSize: 11, color: "#7a8599", marginTop: 2 }}>
              {loading ? "Ładowanie..." : `${applicableCount} z ${totalTemplates} szablonów dopasowanych`}
              {conditions.length > 0 && (
                <span style={{ marginLeft: 8, color: "#d4e84b" }}>
                  ({conditions.map(c => c.replace(/_/g, " ")).join(", ")})
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#7a8599", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 2, padding: "8px 16px", borderBottom: "1px solid rgba(212,232,75,0.06)",
          overflowX: "auto",
        }}>
          {TAB_CONFIG.map(tab => {
            const count = tab.id === "historia" ? tabDocuments.length :
              tab.id === "upload" ? 0 :
              (suggestions[tab.id] ?? []).filter(s => s.applicable).length;
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                borderRadius: 6, border: "none", cursor: "pointer", whiteSpace: "nowrap",
                background: isActive ? "rgba(212,232,75,0.12)" : "transparent",
                color: isActive ? "#d4e84b" : "#7a8599", fontSize: 12, fontWeight: isActive ? 700 : 500,
                transition: "all 0.15s",
              }}>
                <Icon style={{ width: 14, height: 14 }} />
                {tab.label}
                {count > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 10,
                    background: isActive ? "#d4e84b" : "rgba(255,255,255,0.08)",
                    color: isActive ? "#0b101e" : "#7a8599",
                  }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#7a8599" }}>
              <Loader2 style={{ width: 24, height: 24, margin: "0 auto 8px", animation: "spin 1s linear infinite" }} />
              <p style={{ fontSize: 13 }}>Ładowanie szablonów...</p>
            </div>
          ) : activeTab === "upload" ? (
            <div style={{
              border: "2px dashed rgba(212,232,75,0.2)", borderRadius: 12, padding: 40,
              textAlign: "center", cursor: "pointer",
            }}>
              <Upload style={{ width: 32, height: 32, color: "#7a8599", margin: "0 auto 8px" }} />
              <p style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>Przeciągnij dokument tutaj</p>
              <p style={{ color: "#7a8599", fontSize: 12, marginTop: 4 }}>PDF, JPG, PNG — AI odczyta i dopasuje automatycznie</p>
            </div>
          ) : activeTab === "historia" ? (
            <div>
              {documents.length === 0 ? (
                <p style={{ color: "#7a8599", fontSize: 13, textAlign: "center", padding: 32 }}>Brak dokumentów w historii</p>
              ) : documents.map((d: any) => (
                <div key={d.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 12px", borderRadius: 8, marginBottom: 4,
                  background: "rgba(255,255,255,0.03)",
                }}>
                  <div>
                    <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{d.title || d.doc_type || "Dokument"}</div>
                    <div style={{ color: "#7a8599", fontSize: 11, marginTop: 2 }}>
                      {d.status || "draft"} · {d.created_at ? new Date(d.created_at).toLocaleDateString("pl-PL") : "—"}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                    background: d.status === "approved" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                    color: d.status === "approved" ? "#22c55e" : "#f59e0b",
                  }}>{d.status || "draft"}</span>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {tabTemplates.length === 0 ? (
                <p style={{ color: "#7a8599", fontSize: 13, textAlign: "center", padding: 32 }}>Brak szablonów w tej kategorii</p>
              ) : tabTemplates.map(tpl => (
                <div key={tpl.templateId} style={{
                  padding: "12px 14px", borderRadius: 10, marginBottom: 6,
                  background: tpl.applicable ? "rgba(212,232,75,0.04)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${tpl.applicable ? "rgba(212,232,75,0.1)" : "rgba(255,255,255,0.04)"}`,
                  opacity: tpl.applicable ? 1 : 0.5,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{tpl.name}</span>
                        {tpl.applicable && tpl.relevanceScore >= 50 && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                            background: "rgba(34,197,94,0.15)", color: "#22c55e",
                          }}>SUGEROWANY</span>
                        )}
                      </div>
                      <div style={{ color: "#7a8599", fontSize: 11, marginTop: 3 }}>{tpl.description || "—"}</div>
                      {tpl.applicable && tpl.reason && (
                        <div style={{ color: "#d4e84b", fontSize: 11, marginTop: 4, fontWeight: 500 }}>
                          💡 {tpl.reason}
                        </div>
                      )}
                    </div>

                    {/* Prefill indicator */}
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                      <div style={{
                        fontSize: 18, fontWeight: 800,
                        color: tpl.prefillStatus.percentage >= 80 ? "#22c55e" : tpl.prefillStatus.percentage >= 50 ? "#f59e0b" : "#ef4444",
                      }}>
                        {tpl.prefillStatus.percentage}%
                      </div>
                      <div style={{ fontSize: 9, color: "#7a8599" }}>wypełnienie</div>
                      {tpl.prefillStatus.missing.length > 0 && (
                        <div style={{ fontSize: 9, color: "#ef4444", marginTop: 2 }}>
                          brak: {tpl.prefillStatus.missing.map(f => f.replace(/_/g, " ")).join(", ")}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {tpl.applicable && (
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button style={{
                        display: "flex", alignItems: "center", gap: 4, padding: "5px 12px",
                        borderRadius: 6, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                        background: tpl.prefillStatus.percentage >= 50 ? "#d4e84b" : "rgba(255,255,255,0.08)",
                        color: tpl.prefillStatus.percentage >= 50 ? "#0b101e" : "#7a8599",
                      }}>
                        <FileText style={{ width: 12, height: 12 }} />
                        Generuj
                      </button>
                      <button style={{
                        display: "flex", alignItems: "center", gap: 4, padding: "5px 12px",
                        borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", fontSize: 11,
                        fontWeight: 600, cursor: "pointer", background: "transparent", color: "#7a8599",
                      }}>
                        <ChevronRight style={{ width: 12, height: 12 }} />
                        Podgląd
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

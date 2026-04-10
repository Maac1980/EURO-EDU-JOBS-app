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
  { id: "pliki", label: "Pliki robocze", icon: FileText, color: "#0ea5e9" },
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
  const [actionLog, setActionLog] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [workingDocs, setWorkingDocs] = useState<any[]>([]);
  const [workingDocsByType, setWorkingDocsByType] = useState<Record<string, number>>({});

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

    // Load existing generated documents
    fetch(`/api/legal/documents?workerId=${workerId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => setDocuments(d.documents ?? []))
      .catch(() => {});

    // Load action log
    fetch(`/api/doc-log/${workerId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => setActionLog(d.log ?? []))
      .catch(() => {});

    // Load working documents (uploaded files)
    fetch(`/api/worker-docs/${workerId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => {
        setWorkingDocs(d.documents ?? []);
        setWorkingDocsByType(d.byType ?? {});
      })
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
            const count = tab.id === "historia" ? documents.length :
              tab.id === "pliki" ? workingDocs.length :
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
          ) : activeTab === "pliki" ? (
            <div>
              {/* Upload button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>
                  {workingDocs.length} plików
                  {Object.keys(workingDocsByType).length > 0 && (
                    <span style={{ color: "#7a8599", fontWeight: 400, marginLeft: 8 }}>
                      ({Object.entries(workingDocsByType).map(([t, c]) => `${t}: ${c}`).join(", ")})
                    </span>
                  )}
                </span>
              </div>
              {workingDocs.length === 0 ? (
                <p style={{ color: "#7a8599", fontSize: 13, textAlign: "center", padding: 32 }}>Brak plików roboczych. Użyj zakładki "Dodaj dokument" aby przesłać.</p>
              ) : workingDocs.map((wd: any) => (
                <div key={wd.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 12px", borderRadius: 8, marginBottom: 4,
                  background: "rgba(255,255,255,0.03)",
                  border: wd.hasMismatch ? "1px solid rgba(239,68,68,0.3)" : "1px solid transparent",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{wd.filename || "Dokument"}</span>
                      <span style={{
                        fontSize: 9, padding: "2px 6px", borderRadius: 4, fontWeight: 700,
                        background: wd.verified ? "rgba(34,197,94,0.15)" : wd.hasMismatch ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                        color: wd.verified ? "#22c55e" : wd.hasMismatch ? "#ef4444" : "#f59e0b",
                      }}>
                        {wd.verified ? "✓ Zweryfikowany" : wd.hasMismatch ? "⚠ Niezgodność" : "Oczekuje"}
                      </span>
                    </div>
                    <div style={{ color: "#7a8599", fontSize: 11, marginTop: 2 }}>
                      {wd.type?.replace(/_/g, " ") || "—"} · {wd.uploadedAt ? new Date(wd.uploadedAt).toLocaleDateString("pl-PL") : "—"}
                      {wd.caseId && <span style={{ color: "#3b82f6", marginLeft: 6 }}>🔗 Powiązany ze sprawą</span>}
                    </div>
                    {wd.notes && <div style={{ color: "#5a6577", fontSize: 10, marginTop: 2 }}>{wd.notes}</div>}
                    {wd.ocrConfidence !== null && wd.ocrConfidence !== undefined && (
                      <div style={{ fontSize: 10, marginTop: 2, color: wd.ocrConfidence >= 70 ? "#22c55e" : "#f59e0b" }}>
                        OCR: {wd.ocrConfidence}%
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#7a8599", fontSize: 10, cursor: "pointer" }}>Podgląd</button>
                    <button style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#ef4444", fontSize: 10, cursor: "pointer" }}>Usuń</button>
                  </div>
                </div>
              ))}
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
            (() => {
              // Merge generated docs + uploaded files into unified timeline
              const generated = documents.map((d: any) => ({
                id: d.id, name: d.title || d.doc_type || "Dokument",
                type: d.doc_type ?? "document", source: "generated" as const,
                status: d.status ?? "draft",
                date: d.created_at ? new Date(d.created_at) : new Date(),
                dateStr: d.created_at ? new Date(d.created_at).toLocaleDateString("pl-PL") : "—",
                caseId: d.case_id ?? d.caseId ?? null,
                createdBy: d.approved_by ?? "system",
              }));
              const uploaded = workingDocs.map((wd: any) => ({
                id: wd.id, name: wd.filename || "Plik",
                type: wd.type ?? "file", source: "uploaded" as const,
                status: wd.verified ? "verified" : "pending",
                date: wd.uploadedAt ? new Date(wd.uploadedAt) : new Date(),
                dateStr: wd.uploadedAt ? new Date(wd.uploadedAt).toLocaleDateString("pl-PL") : "—",
                caseId: wd.caseId ?? null,
                createdBy: "upload",
              }));
              const all = [...generated, ...uploaded].sort((a, b) => b.date.getTime() - a.date.getTime());

              return (
                <div>
                  <div style={{ fontSize: 11, color: "#7a8599", marginBottom: 10 }}>
                    {generated.length} wygenerowanych · {uploaded.length} przesłanych · {all.length} łącznie
                  </div>
                  {all.length === 0 ? (
                    <p style={{ color: "#7a8599", fontSize: 13, textAlign: "center", padding: 32 }}>Brak dokumentów w historii</p>
                  ) : all.map(item => (
                    <div key={item.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 12px", borderRadius: 8, marginBottom: 4,
                      background: "rgba(255,255,255,0.03)",
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{item.name}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                            background: item.source === "generated" ? "rgba(139,92,246,0.15)" : "rgba(14,165,233,0.15)",
                            color: item.source === "generated" ? "#8b5cf6" : "#0ea5e9",
                          }}>{item.source === "generated" ? "WYGENEROWANY" : "PRZESŁANY"}</span>
                          {/* Override warning badge */}
                          {actionLog.some(l => l.document_id === item.id && l.action === "validation_override") && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                              ⚠️ POMINIĘTO WALIDACJĘ
                            </span>
                          )}
                        </div>
                        <div style={{ color: "#7a8599", fontSize: 11, marginTop: 2 }}>
                          {item.type?.replace(/_/g, " ") || "—"} · {item.dateStr}
                          {item.caseId && <span style={{ color: "#3b82f6", marginLeft: 6 }}>🔗 sprawa</span>}
                          {item.createdBy && item.createdBy !== "system" && item.createdBy !== "upload" && (
                            <span style={{ color: "#5a6577", marginLeft: 6 }}>· {item.createdBy}</span>
                          )}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                        background: item.status === "approved" || item.status === "verified" ? "rgba(34,197,94,0.15)"
                          : item.status === "sent" ? "rgba(59,130,246,0.15)"
                          : item.status === "reviewed" ? "rgba(139,92,246,0.15)"
                          : "rgba(245,158,11,0.15)",
                        color: item.status === "approved" || item.status === "verified" ? "#22c55e"
                          : item.status === "sent" ? "#3b82f6"
                          : item.status === "reviewed" ? "#8b5cf6"
                          : "#f59e0b",
                  }}>{item.status || "draft"}</span>
                    </div>
                  ))}
                </div>
              );
            })()
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

                  {/* Action buttons with pre-generation validation */}
                  {tpl.applicable && (() => {
                    const hasCriticalMissing = tpl.prefillStatus.missing.length > 0 && tpl.prefillStatus.percentage < 50;
                    const canGenerate = tpl.prefillStatus.percentage >= 50;
                    return (
                    <div style={{ marginTop: 10 }}>
                      {hasCriticalMissing && (
                        <div style={{
                          padding: "6px 10px", borderRadius: 6, marginBottom: 6,
                          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                          fontSize: 11, color: "#ef4444",
                        }}>
                          <XCircle style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                          Brakujące dane: {tpl.prefillStatus.missing.map(f => f.replace(/_/g, " ")).join(", ")}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          disabled={!canGenerate}
                          title={!canGenerate ? `Brakuje: ${tpl.prefillStatus.missing.join(", ")}` : "Generuj dokument"}
                          style={{
                            display: "flex", alignItems: "center", gap: 4, padding: "5px 12px",
                            borderRadius: 6, border: "none", fontSize: 11, fontWeight: 700,
                            cursor: canGenerate ? "pointer" : "not-allowed",
                            opacity: canGenerate ? 1 : 0.4,
                            background: canGenerate ? "#d4e84b" : "rgba(255,255,255,0.08)",
                            color: canGenerate ? "#0b101e" : "#7a8599",
                          }}>
                          <FileText style={{ width: 12, height: 12 }} />
                          {canGenerate ? "Generuj" : "Uzupełnij dane"}
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
                    </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

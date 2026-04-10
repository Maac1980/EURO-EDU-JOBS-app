/**
 * GlobalDropZone — wraps entire dashboard. Drop a file anywhere → triggers intake.
 * Shows overlay with extraction results. No navigation needed.
 */
import { useState, useCallback } from "react";
import { Upload, X } from "lucide-react";
import SmartDocumentDrop from "./SmartDocumentDrop";

interface Props {
  children: React.ReactNode;
}

export default function GlobalDropZone({ children }: Props) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only hide if leaving the entire zone
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      setShowOverlay(true);
    }
  }, []);

  const handleResult = (data: any) => {
    setResult(data);
  };

  const close = () => {
    setShowOverlay(false);
    setResult(null);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ position: "relative", minHeight: "100%" }}
    >
      {children}

      {/* Drag hint overlay */}
      {dragOver && !showOverlay && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(212,232,75,0.08)",
          border: "3px dashed #d4e84b",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            background: "#0b101e", borderRadius: 16, padding: "32px 48px",
            border: "2px solid #d4e84b", boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}>
            <Upload style={{ width: 48, height: 48, color: "#d4e84b", margin: "0 auto 12px", display: "block" }} />
            <div style={{ color: "#d4e84b", fontWeight: 800, fontSize: 18, textAlign: "center" }}>Drop document anywhere</div>
            <div style={{ color: "#7a8599", fontSize: 12, textAlign: "center", marginTop: 4 }}>AI will read, classify, and match to worker</div>
          </div>
        </div>
      )}

      {/* Processing overlay */}
      {showOverlay && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }}>
          <div style={{
            background: "#0d1220", borderRadius: 16, padding: 24,
            border: "1px solid rgba(212,232,75,0.15)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            width: "100%", maxWidth: 640, maxHeight: "80vh", overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ color: "#fff", fontWeight: 700, fontSize: 16, margin: 0 }}>Document Intelligence</h2>
              <button onClick={close} style={{ background: "none", border: "none", color: "#7a8599", cursor: "pointer", padding: 4 }}>
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>

            <SmartDocumentDrop
              endpoint="/api/smart-doc/process"
              label="Drop your document here or click to browse"
              onResult={handleResult}
            />

            {result && (
              <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "rgba(212,232,75,0.05)", border: "1px solid rgba(212,232,75,0.1)" }}>
                <div style={{ fontSize: 11, color: "#d4e84b", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
                  Processing complete — review results above
                </div>
                <button onClick={close} style={{
                  padding: "8px 16px", borderRadius: 8, background: "#d4e84b", color: "#0b101e",
                  border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer",
                }}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

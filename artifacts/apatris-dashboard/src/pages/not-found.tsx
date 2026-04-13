/**
 * EEJ 404 — Page Not Found.
 * Professional Blue/White branding. Recruitment-friendly copy.
 */
import React, { useState } from "react";
import { authHeaders, BASE } from "@/lib/api";
import { Search, Send, Loader2, CheckCircle2, Home } from "lucide-react";

export default function NotFound() {
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNotes, setReportNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReport = async () => {
    if (!reportNotes.trim()) return;
    setSending(true);
    try {
      await fetch(`${BASE}api/first-contact/ocr-feedback`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          docType: "SYSTEM_ERROR",
          fieldName: "404_not_found",
          correctedValue: window.location.pathname,
          errorType: "missing_field",
          severity: "low",
          notes: reportNotes,
        }),
      });
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch { /* best-effort */ }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Search className="w-8 h-8 text-blue-400" />
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">404</h1>
          <p className="text-sm text-blue-400 font-semibold uppercase tracking-wider">Page Not Found</p>
        </div>

        {/* Recruitment-friendly message */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-300">Candidate data is safe. The page you requested does not exist or has been moved.</p>
          <p className="text-xs text-slate-500 mt-2 font-mono">{window.location.pathname}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <a href="/" className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-bold hover:bg-blue-500/30 transition-colors flex items-center gap-2">
            <Home className="w-3.5 h-3.5" /> Dashboard
          </a>
          <button onClick={() => setReportOpen(!reportOpen)}
            className="px-4 py-2 rounded-lg bg-slate-700/50 text-slate-300 border border-slate-600 text-xs font-bold hover:bg-slate-700 transition-colors flex items-center gap-2">
            <Send className="w-3.5 h-3.5" /> Report to Developer
          </button>
        </div>

        {/* Report form */}
        {reportOpen && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3 text-left">
            {sent ? (
              <div className="flex items-center gap-2 text-xs text-green-400 justify-center py-2">
                <CheckCircle2 className="w-4 h-4" /> Report sent — logged with org_context: EEJ
              </div>
            ) : (
              <>
                <label className="text-[10px] text-slate-500 uppercase block">What were you trying to access?</label>
                <input type="text" value={reportNotes} onChange={e => setReportNotes(e.target.value)}
                  placeholder="Describe what you expected to find..."
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs placeholder-slate-600" />
                <button onClick={handleReport} disabled={!reportNotes.trim() || sending}
                  className="w-full py-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-bold hover:bg-blue-500/30 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  {sending ? <><Loader2 className="w-3 h-3 animate-spin" /> Sending...</> : <><Send className="w-3 h-3" /> Send Report</>}
                </button>
              </>
            )}
          </div>
        )}

        <p className="text-[10px] text-slate-600">EEJ Recruitment Platform &middot; org_context: EEJ</p>
      </div>
    </div>
  );
}

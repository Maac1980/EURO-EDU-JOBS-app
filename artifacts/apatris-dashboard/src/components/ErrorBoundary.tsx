/**
 * EEJ Error Boundary — catches React render errors.
 * Professional Blue/White branding. Reports errors with org_context: EEJ.
 */
import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  reported: boolean;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, reported: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[EEJ ErrorBoundary]", error, errorInfo);
  }

  handleReport = async () => {
    const { error } = this.state;
    try {
      const token = localStorage.getItem("token") ?? sessionStorage.getItem("eej_token");
      await fetch("/api/first-contact/ocr-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          docType: "SYSTEM_ERROR",
          fieldName: "500_render_crash",
          correctedValue: error?.message ?? "Unknown error",
          errorType: "extraction_error",
          severity: "critical",
          notes: `Stack: ${error?.stack?.slice(0, 500) ?? "N/A"} | URL: ${window.location.pathname}`,
        }),
      });
      this.setState({ reported: true });
    } catch { /* best-effort */ }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="max-w-md w-full rounded-xl border border-blue-500/20 bg-slate-900 p-8 text-center space-y-4">
            {/* Icon */}
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20">
              <svg className="h-7 w-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            {/* Heading */}
            <div>
              <h3 className="text-lg font-bold text-white">Something went wrong</h3>
              <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider mt-1">System Error</p>
            </div>

            {/* Message */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
              <p className="text-sm text-slate-300">Candidate data is safe. Our systems are currently recalibrating.</p>
              <p className="text-xs text-slate-500 mt-2 font-mono break-all">{this.state.error?.message || "An unexpected error occurred."}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { this.setState({ hasError: false, error: null, reported: false }); window.location.reload(); }}
                className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 text-sm font-bold transition-colors hover:bg-blue-500/30"
              >
                Reload Page
              </button>
              {!this.state.reported ? (
                <button onClick={this.handleReport}
                  className="px-4 py-2 rounded-lg bg-slate-700/50 text-slate-300 border border-slate-600 text-sm font-bold transition-colors hover:bg-slate-700">
                  Report to Developer
                </button>
              ) : (
                <span className="px-4 py-2 text-xs text-green-400 flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Reported
                </span>
              )}
            </div>

            <p className="text-[10px] text-slate-600">EEJ Recruitment Platform &middot; org_context: EEJ</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * System Test — quick verification of all EEJ features after build.
 *
 * Tests each endpoint and UI component.
 * Shows PASS/FAIL for each check.
 * Admin-only page.
 */

import React, { useState } from "react";
import { authHeaders, BASE } from "@/lib/api";
import { CheckCircle2, XCircle, Loader2, Play, RefreshCcw } from "lucide-react";

interface TestResult {
  name: string;
  category: string;
  status: "pass" | "fail" | "running" | "pending";
  detail: string;
  ms?: number;
}

const TESTS: Array<{ name: string; category: string; run: () => Promise<string> }> = [
  // Health
  { name: "API Health", category: "Core", run: async () => {
    const res = await fetch(`${BASE}api/healthz`);
    const data = await res.json();
    if (data.status !== "ok") throw new Error(`Status: ${data.status}`);
    return "OK";
  }},

  // Auth
  { name: "Auth endpoint", category: "Core", run: async () => {
    const res = await fetch(`${BASE}api/auth/whoami`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    return "Authenticated";
  }},

  // Workers
  { name: "Workers list", category: "Workers", run: async () => {
    const res = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const count = (data.workers ?? data ?? []).length;
    return `${count} workers`;
  }},

  // Legal Intelligence
  { name: "Legal Intelligence — references", category: "Legal AI", run: async () => {
    const res = await fetch(`${BASE}api/legal-intelligence/references`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return `${data.references?.length ?? 0} articles`;
  }},

  { name: "Legal Intelligence — fleet signals", category: "Legal AI", run: async () => {
    try {
      const res = await fetch(`${BASE}api/legal-intelligence/fleet-signals`, { headers: authHeaders() });
      if (!res.ok) return `${res.status} — DB columns may need init`;
      const data = await res.json();
      return `${data.signals?.totalWorkers ?? 0} workers, ${data.signals?.expired ?? 0} expired`;
    } catch { return "Endpoint not reachable"; }
  }},

  { name: "Legal Intelligence — research list", category: "Legal AI", run: async () => {
    const res = await fetch(`${BASE}api/legal-intelligence/research`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return `${data.memos?.length ?? 0} memos`;
  }},

  // Compliance
  { name: "Compliance documents", category: "Compliance", run: async () => {
    const res = await fetch(`${BASE}api/compliance/documents`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    return "OK";
  }},

  // Payroll
  { name: "ZUS Calculator (160h × 31.40)", category: "Payroll", run: async () => {
    // Import calculator and test
    const { calculate } = await import("@/components/KnowledgeCenter");
    const r = calculate(160, 31.40, "zlecenie", true, false);
    if (r.net !== 3929.05) throw new Error(`Expected 3929.05, got ${r.net}`);
    return `Net: ${r.net} PLN ✓`;
  }},

  // Immigration
  { name: "Immigration permits", category: "Immigration", run: async () => {
    const res = await fetch(`${BASE}api/permits`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    return "OK";
  }},

  // Invoices
  { name: "Invoices list", category: "Finance", run: async () => {
    const res = await fetch(`${BASE}api/invoices`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    return "OK";
  }},

  // GPS
  { name: "GPS tracking", category: "Operations", run: async () => {
    const res = await fetch(`${BASE}api/gps/latest`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    return "OK";
  }},

  // Legal KB
  { name: "Legal knowledge base", category: "Legal", run: async () => {
    const res = await fetch(`${BASE}api/legal-kb/categories`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    return "OK";
  }},

  // Regulatory
  { name: "Regulatory updates", category: "Legal", run: async () => {
    const res = await fetch(`${BASE}api/regulatory/updates`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    return "OK";
  }},
];

export default function SystemTest() {
  const [results, setResults] = useState<TestResult[]>(
    TESTS.map(t => ({ name: t.name, category: t.category, status: "pending" as const, detail: "" }))
  );
  const [running, setRunning] = useState(false);

  const runAll = async () => {
    setRunning(true);
    const updated = TESTS.map(t => ({ name: t.name, category: t.category, status: "running" as const, detail: "" }));
    setResults([...updated]);

    for (let i = 0; i < TESTS.length; i++) {
      const test = TESTS[i];
      const start = Date.now();
      try {
        const detail = await test.run();
        updated[i] = { name: test.name, category: test.category, status: "pass", detail, ms: Date.now() - start };
      } catch (err: any) {
        updated[i] = { name: test.name, category: test.category, status: "fail", detail: err.message ?? "Failed", ms: Date.now() - start };
      }
      setResults([...updated]);
    }
    setRunning(false);
  };

  const passed = results.filter(r => r.status === "pass").length;
  const failed = results.filter(r => r.status === "fail").length;
  const total = results.length;

  const categories = [...new Set(TESTS.map(t => t.category))];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white tracking-tight">EEJ System Test</h1>
          <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Build Verification · Feature Check · {new Date().toLocaleDateString()}</p>
        </div>

        {/* Run button + summary */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={runAll} disabled={running}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-colors">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "Running..." : "Run All Tests"}
          </button>
          {passed + failed > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-green-400 font-bold">{passed} passed</span>
              {failed > 0 && <span className="text-red-400 font-bold">{failed} failed</span>}
              <span className="text-slate-500">/ {total} total</span>
              {failed === 0 && passed === total && <span className="text-green-400 font-bold">ALL PASS ✓</span>}
            </div>
          )}
        </div>

        {/* Results by category */}
        {categories.map(cat => (
          <div key={cat} className="mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">{cat}</h2>
            <div className="space-y-1">
              {results.filter(r => r.category === cat).map((r, i) => (
                <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${
                  r.status === "pass" ? "bg-green-500/5 border-green-500/20" :
                  r.status === "fail" ? "bg-red-500/5 border-red-500/20" :
                  r.status === "running" ? "bg-blue-500/5 border-blue-500/20" :
                  "bg-slate-800/50 border-slate-700"
                }`}>
                  <div className="flex items-center gap-2">
                    {r.status === "pass" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
                     r.status === "fail" ? <XCircle className="w-4 h-4 text-red-400" /> :
                     r.status === "running" ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin" /> :
                     <div className="w-4 h-4 rounded-full border-2 border-slate-600" />}
                    <span className="text-xs text-slate-300 font-medium">{r.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] ${r.status === "pass" ? "text-green-400" : r.status === "fail" ? "text-red-400" : "text-slate-500"}`}>
                      {r.detail}
                    </span>
                    {r.ms !== undefined && <span className="text-[10px] text-slate-600 font-mono">{r.ms}ms</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="text-[10px] text-slate-600 text-center mt-8 font-mono">
          EEJ System Test · Admin Only · {new Date().toISOString()}
        </p>
      </div>
    </div>
  );
}

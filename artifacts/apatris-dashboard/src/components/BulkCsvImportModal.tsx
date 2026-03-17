import React, { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import { X, Upload, Download, FileText, Loader2, CheckCircle, AlertTriangle, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetWorkersQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const LIME = "#E9FF70";
const LIME_BORDER = "rgba(233,255,112,0.25)";

interface BulkCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CSV_COLUMNS: { header: string; field: string; required?: boolean; hint?: string }[] = [
  { header: "Name",               field: "name",                required: true,  hint: "Full name — required" },
  { header: "Job Role",           field: "specialization",                        hint: "e.g. TIG / MIG / Pipe Fitter" },
  { header: "Email",              field: "email",                                 hint: "email@example.com" },
  { header: "Phone",              field: "phone",                                 hint: "+48 123 456 789" },
  { header: "Site",               field: "siteLocation",                          hint: "e.g. Waterford" },
  { header: "IBAN",               field: "iban",                                  hint: "PL61 1090..." },
  { header: "Hourly Rate",        field: "hourlyNettoRate",                       hint: "Gross PLN/h e.g. 31.40" },
  { header: "TRC Expiry",         field: "trcExpiry",                             hint: "YYYY-MM-DD" },
  { header: "Work Permit Expiry", field: "workPermitExpiry",                      hint: "YYYY-MM-DD" },
  { header: "Contract End Date",  field: "contractEndDate",                       hint: "YYYY-MM-DD" },
  { header: "BHP Status",         field: "bhpStatus",                             hint: "Valid / Expired" },
  { header: "Medical Exam Expiry",field: "badaniaLekExpiry",                      hint: "YYYY-MM-DD" },
  { header: "Experience",         field: "yearsOfExperience",                     hint: "e.g. 5 years" },
  { header: "Qualification",      field: "highestQualification",                  hint: "e.g. EN ISO 9606" },
  { header: "Nationality",        field: "nationality",                           hint: "e.g. Polish" },
  { header: "Contract Type",      field: "contractType",                          hint: "Zlecenie / Umowa o pracę" },
  { header: "PESEL",              field: "pesel",                                 hint: "11-digit PESEL" },
  { header: "NIP",                field: "nip",                                   hint: "Tax ID" },
  { header: "Visa Type",          field: "visaType",                              hint: "e.g. Schengen / Work Visa" },
  { header: "Pipeline Stage",     field: "pipelineStage",                         hint: "Active / Screening / Placed..." },
];

type ParsedRow = Record<string, string>;
type MappedWorker = Record<string, string | number>;

function buildTemplate(): string {
  const header = CSV_COLUMNS.map((c) => c.header).join(",");
  const example = [
    "Jan Kowalski", "TIG", "jan@example.com", "+48123456789",
    "Waterford", "PL61109010140000071219812874", "31.40",
    "2026-12-31", "2026-06-30", "2026-12-31",
    "Valid", "2026-09-15", "5 years", "EN ISO 9606-1",
    "Polish", "Zlecenie", "12345678901", "", "Work Visa", "Active",
  ].join(",");
  return `${header}\r\n${example}\r\n`;
}

function downloadTemplate() {
  const bom = "\uFEFF";
  const blob = new Blob([bom + buildTemplate()], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "EEJ_Worker_Import_Template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function mapRow(row: ParsedRow): MappedWorker {
  const worker: MappedWorker = {};
  for (const col of CSV_COLUMNS) {
    const val = (row[col.header] ?? "").trim();
    if (!val) continue;
    if (col.field === "hourlyNettoRate") {
      const n = parseFloat(val.replace(",", "."));
      if (!isNaN(n)) worker[col.field] = n;
    } else {
      worker[col.field] = val;
    }
  }
  return worker;
}

export function BulkCsvImportModal({ isOpen, onClose }: BulkCsvImportModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [allRows, setAllRows] = useState<MappedWorker[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ succeeded: number; failed: number; results: { name: string; success: boolean; error?: string }[] } | null>(null);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const reset = useCallback(() => {
    setStage("upload");
    setDragging(false);
    setFileName("");
    setAllRows([]);
    setParseError(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = () => { reset(); onClose(); };

  const parseFile = (file: File) => {
    setParseError(null);
    setFileName(file.name);
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        if (results.errors.length && results.data.length === 0) {
          setParseError("Could not parse the CSV file. Please check the format and try again.");
          return;
        }
        const mapped = results.data
          .map(mapRow)
          .filter((r) => typeof r.name === "string" && (r.name as string).trim().length > 0);

        if (mapped.length === 0) {
          setParseError("No valid rows found. Make sure the 'Name' column is populated and matches the template headers exactly.");
          return;
        }
        setAllRows(mapped);
        setStage("preview");
      },
      error: (err) => setParseError(err.message),
    });
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleImport = async () => {
    setStage("importing");
    try {
      const res = await fetch(`${base}/api/workers/bulk-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workers: allRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setImportResult(data);
      setStage("done");
      await queryClient.invalidateQueries({ queryKey: getGetWorkersQueryKey() });
      if (data.succeeded > 0) {
        toast({ title: `Successfully imported ${data.succeeded} worker${data.succeeded !== 1 ? "s" : ""}!`, variant: "success" as any });
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Import failed");
      setStage("preview");
    }
  };

  if (!isOpen) return null;

  const previewRows = allRows.slice(0, 3);
  const previewCols = CSV_COLUMNS.filter((c) => allRows.some((r) => r[c.field] !== undefined));

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }} onClick={handleClose}>
      <div
        className="relative w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "#1a1a1a", border: `1px solid ${LIME_BORDER}`, maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(233,255,112,0.12)" }}>
              <Users className="w-4 h-4" style={{ color: LIME }} />
            </div>
            <div>
              <div className="text-sm font-black uppercase tracking-widest text-white">Bulk Import Workers</div>
              <div className="text-[10px] font-mono text-gray-500">Upload a CSV file to add multiple workers at once</div>
            </div>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* STAGE: UPLOAD */}
          {(stage === "upload" || stage === "preview") && (
            <>
              {/* Template download */}
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span className="text-xs text-gray-400">Need a template? Download the blank CSV with all expected column headers.</span>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-90 flex-shrink-0 ml-3"
                  style={{ background: "rgba(233,255,112,0.12)", color: LIME, border: `1px solid ${LIME_BORDER}` }}
                >
                  <Download className="w-3 h-3" />
                  Download CSV Template
                </button>
              </div>

              {/* Drop zone */}
              {stage === "upload" && (
                <div
                  className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-all py-12"
                  style={{
                    borderColor: dragging ? LIME : "rgba(255,255,255,0.12)",
                    background: dragging ? "rgba(233,255,112,0.05)" : "rgba(255,255,255,0.02)",
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: dragging ? "rgba(233,255,112,0.15)" : "rgba(255,255,255,0.05)" }}>
                    <Upload className="w-7 h-7" style={{ color: dragging ? LIME : "rgba(255,255,255,0.3)" }} />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{dragging ? "Drop it here!" : "Drag & drop your CSV file"}</div>
                    <div className="text-xs text-gray-500 mt-0.5">or <span style={{ color: LIME }} className="font-bold">click to browse</span> — .csv files only</div>
                  </div>
                </div>
              )}

              {/* Parse error */}
              {parseError && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-red-400">Parse Error</div>
                    <div className="text-xs text-red-300 mt-0.5">{parseError}</div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* STAGE: PREVIEW */}
          {stage === "preview" && allRows.length > 0 && (
            <>
              {/* File info */}
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: "rgba(233,255,112,0.06)", border: `1px solid ${LIME_BORDER}` }}>
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: LIME }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">{fileName}</div>
                  <div className="text-[10px] font-mono text-gray-400">{allRows.length} valid rows detected — previewing first 3 below</div>
                </div>
                <button onClick={reset} className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg transition-all hover:opacity-80 flex-shrink-0" style={{ color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  Change file
                </button>
              </div>

              {/* Preview table */}
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Preview — first 3 rows</div>
                <div className="eej-table-scroll overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <table className="w-full text-xs" style={{ minWidth: "700px", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-gray-500">#</th>
                        {previewCols.map((c) => (
                          <th key={c.field} className="px-3 py-2 text-left font-black uppercase tracking-widest whitespace-nowrap" style={{ color: c.required ? LIME : "rgba(255,255,255,0.5)" }}>
                            {c.header}{c.required && <span className="ml-0.5 text-red-400">*</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {previewRows.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                          <td className="px-3 py-2 font-mono text-gray-600">{i + 1}</td>
                          {previewCols.map((c) => (
                            <td key={c.field} className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: row[c.field] ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.15)" }}>
                              {row[c.field] !== undefined ? String(row[c.field]) : <span className="italic text-gray-600">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {allRows.length > 3 && (
                  <div className="text-[10px] font-mono text-gray-600 mt-1.5 text-right">…and {allRows.length - 3} more row{allRows.length - 3 !== 1 ? "s" : ""}</div>
                )}
              </div>

              {parseError && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-red-300">{parseError}</div>
                </div>
              )}
            </>
          )}

          {/* STAGE: IMPORTING */}
          {stage === "importing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: LIME }} />
              <div className="text-sm font-bold text-white">Importing {allRows.length} workers…</div>
              <div className="text-xs text-gray-500">Creating records in Airtable — please wait</div>
            </div>
          )}

          {/* STAGE: DONE */}
          {stage === "done" && importResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex gap-3">
                <div className="flex-1 rounded-xl px-4 py-3 text-center" style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)" }}>
                  <div className="text-2xl font-black text-green-400">{importResult.succeeded}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-green-500 mt-0.5">Imported Successfully</div>
                </div>
                {importResult.failed > 0 && (
                  <div className="flex-1 rounded-xl px-4 py-3 text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <div className="text-2xl font-black text-red-400">{importResult.failed}</div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-red-500 mt-0.5">Failed</div>
                  </div>
                )}
              </div>

              {/* Row-level results */}
              {importResult.results.length > 0 && (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    Import Log
                  </div>
                  <div className="divide-y divide-white/5 max-h-48 overflow-y-auto">
                    {importResult.results.map((r, i) => (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                        {r.success
                          ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 text-green-400" />
                          : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />}
                        <span className="text-xs font-mono flex-1 text-white">{r.name}</span>
                        {!r.success && <span className="text-[10px] font-mono text-red-400 truncate max-w-[200px]">{r.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          {stage === "upload" && (
            <>
              <span className="text-[10px] font-mono text-gray-600">Supports UTF-8 CSV with BOM · Max 500 rows per import</span>
              <button onClick={handleClose} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-all" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>Cancel</button>
            </>
          )}

          {stage === "preview" && (
            <>
              <span className="text-[10px] font-mono text-gray-500">
                {allRows.length} row{allRows.length !== 1 ? "s" : ""} ready to import · empty optional fields will be skipped
              </span>
              <div className="flex gap-2">
                <button onClick={reset} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-all" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>Back</button>
                <button
                  onClick={handleImport}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-black uppercase tracking-wide transition-all hover:opacity-90"
                  style={{ background: LIME, color: "#333333" }}
                >
                  <Upload className="w-4 h-4" />
                  Confirm &amp; Import {allRows.length} Worker{allRows.length !== 1 ? "s" : ""}
                </button>
              </div>
            </>
          )}

          {stage === "done" && (
            <>
              <span className="text-[10px] font-mono text-gray-500">Worker list has been refreshed automatically</span>
              <div className="flex gap-2">
                {importResult && importResult.failed > 0 && (
                  <button onClick={reset} className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90" style={{ border: `1px solid ${LIME_BORDER}`, color: LIME }}>
                    Import More
                  </button>
                )}
                <button onClick={handleClose} className="px-5 py-2 rounded-xl text-sm font-black uppercase tracking-wide transition-all hover:opacity-90" style={{ background: LIME, color: "#333333" }}>
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

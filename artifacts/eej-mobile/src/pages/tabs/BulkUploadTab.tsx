import { useState, useRef } from "react";
import { Upload, FileCheck, Paperclip, CheckCircle2, Search } from "lucide-react";
import { MOCK_CANDIDATES } from "@/data/mockData";
import { useToast } from "@/lib/toast";

const DOC_TYPES = [
  "Passport / ID Card",
  "TRC Residence Card",
  "Work Permit (A1)",
  "BHP Certificate",
  "Badania Lekarskie",
  "Oświadczenie",
  "UDT Certificate",
  "Employment Contract",
  "Other Document",
];

interface UploadEntry {
  candidateName: string;
  docType: string;
  fileName: string;
  uploadedAt: string;
}

export default function BulkUploadTab() {
  const { showToast } = useToast();
  const fileRef        = useRef<HTMLInputElement | null>(null);
  const [candidate,   setCandidate]   = useState("");
  const [docType,     setDocType]     = useState("");
  const [uploadedLog, setUploadedLog] = useState<UploadEntry[]>([
    { candidateName: "Daria Shevchenko",  docType: "TRC Residence Card", fileName: "trc_shevchenko_mar26.pdf",  uploadedAt: "Today, 09:14" },
    { candidateName: "Ahmed Al-Rashid",   docType: "Passport / ID Card", fileName: "passport_alrashid.jpg",     uploadedAt: "Today, 08:50" },
    { candidateName: "Oleksandr Bondar",  docType: "Work Permit (A1)",   fileName: "wp_bondar_2026.pdf",        uploadedAt: "Yesterday" },
  ]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!candidate) { showToast("Select a candidate first", "error"); e.target.value = ""; return; }
    if (!docType)   { showToast("Select a document type first", "error"); e.target.value = ""; return; }

    const name = MOCK_CANDIDATES.find((c) => c.id === candidate)?.name ?? candidate;
    setUploadedLog((prev) => [
      { candidateName: name, docType, fileName: file.name, uploadedAt: "Just now" },
      ...prev,
    ]);
    showToast(`Uploaded ${file.name} for ${name}`, "success");
    e.target.value = "";
    setCandidate("");
    setDocType("");
  }

  const sel = "add-cand-input add-cand-select";

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 3 · Workforce & Commercial Ops</div>
          <div className="tab-greeting-name">Bulk Document Upload</div>
        </div>
      </div>

      {/* Upload form */}
      <div className="bulk-upload-card">
        <div className="bulk-upload-icon-row">
          <div className="bulk-upload-icon">
            <Upload size={22} color="#6366F1" strokeWidth={2} />
          </div>
          <div>
            <div className="bulk-upload-title">Upload Candidate Document</div>
            <div className="bulk-upload-sub">Select a candidate, document type, then upload</div>
          </div>
        </div>

        <div className="add-cand-field" style={{ marginTop: 12 }}>
          <label className="add-cand-label">Candidate</label>
          <select className={sel} value={candidate} onChange={(e) => setCandidate(e.target.value)}>
            <option value="">— select candidate —</option>
            {MOCK_CANDIDATES.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {c.role}</option>
            ))}
          </select>
        </div>

        <div className="add-cand-field">
          <label className="add-cand-label">Document Type</label>
          <select className={sel} value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="">— select type —</option>
            {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <button
          className="bulk-upload-trigger"
          onClick={() => fileRef.current?.click()}
          style={{ opacity: candidate && docType ? 1 : 0.5 }}
        >
          <Paperclip size={15} strokeWidth={2.5} />
          Choose File &amp; Upload
        </button>
        <input
          type="file"
          ref={fileRef}
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          style={{ display: "none" }}
          onChange={handleFile}
        />
      </div>

      {/* Recent uploads log */}
      <div className="section-label" style={{ marginTop: 20 }}>
        <FileCheck size={13} color="#9CA3AF" strokeWidth={2} />
        Recent Uploads
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#6366F1" }}>
          {uploadedLog.length} files
        </span>
      </div>

      {uploadedLog.length === 0 ? (
        <div className="candidates-empty" style={{ paddingTop: 32 }}>
          <Search size={28} color="#D1D5DB" strokeWidth={1.5} />
          <div>No documents uploaded yet</div>
        </div>
      ) : (
        <div className="bulk-log-list">
          {uploadedLog.map((entry, i) => (
            <div key={i} className="bulk-log-row">
              <div className="bulk-log-icon">
                <CheckCircle2 size={16} color="#059669" strokeWidth={2} />
              </div>
              <div className="bulk-log-info">
                <div className="bulk-log-candidate">{entry.candidateName}</div>
                <div className="bulk-log-doc">{entry.docType}</div>
                <div className="bulk-log-file">{entry.fileName}</div>
              </div>
              <div className="bulk-log-time">{entry.uploadedAt}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 100 }} />
    </div>
  );
}

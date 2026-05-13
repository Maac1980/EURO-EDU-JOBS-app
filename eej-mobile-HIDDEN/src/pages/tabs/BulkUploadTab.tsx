import { useState, useRef } from "react";
import { Upload, FileCheck, Paperclip, CheckCircle2, Search } from "lucide-react";
import { useCandidates } from "@/lib/candidateContext";
import { useToast } from "@/lib/toast";
import { uploadWorkerDocument } from "@/lib/api";

// Display label → server doc-type slug. Server uses these slugs to route
// auto-OCR (passport / contract types trigger Claude vision extraction) and
// to map back into worker field updates via the upload endpoint.
const DOC_TYPES: { label: string; slug: string }[] = [
  { label: "Passport / ID Card",   slug: "passport"    },
  { label: "TRC Residence Card",   slug: "trc"         },
  { label: "Work Permit",          slug: "work-permit" },
  { label: "BHP Certificate",      slug: "bhp"         },
  { label: "Badania Lekarskie",    slug: "badania"     },
  { label: "Oświadczenie",         slug: "oswiad"      },
  { label: "UDT Certificate",      slug: "udt"         },
  { label: "Employment Contract",  slug: "contract"    },
  { label: "Other Document",       slug: "other"       },
];

interface UploadEntry {
  candidateName: string;
  docType: string;
  fileName: string;
  uploadedAt: string;
}

export default function BulkUploadTab() {
  const { showToast }  = useToast();
  const { candidates } = useCandidates();
  const fileRef        = useRef<HTMLInputElement | null>(null);
  const [candidate,    setCandidate]   = useState("");
  const [docType,      setDocType]     = useState("");
  // Append-only feed of THIS session's real uploads. Server-side state lives
  // in file_attachments. No mock seed entries — start empty and grow as the
  // user uploads. The cockpit's Documents panel is the canonical view of
  // a worker's full document history.
  const [uploadedLog,  setUploadedLog] = useState<UploadEntry[]>([]);
  const [uploading,    setUploading]   = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!candidate) { showToast("Select a candidate first", "error"); e.target.value = ""; return; }
    if (!docType)   { showToast("Select a document type first", "error"); e.target.value = ""; return; }

    const cand = candidates.find((c) => c.id === candidate);
    const name = cand?.name ?? candidate;
    setUploading(true);
    try {
      await uploadWorkerDocument(candidate, docType, file);
      setUploadedLog((prev) => [
        {
          candidateName: name,
          docType: DOC_TYPES.find((d) => d.slug === docType)?.label ?? docType,
          fileName: file.name,
          uploadedAt: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        },
        ...prev,
      ]);
      showToast(`Uploaded ${file.name} for ${name}`, "success");
      setCandidate("");
      setDocType("");
    } catch (err) {
      showToast(
        err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed",
        "error",
      );
    } finally {
      setUploading(false);
      e.target.value = "";
    }
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
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {c.role}</option>
            ))}
          </select>
        </div>

        <div className="add-cand-field">
          <label className="add-cand-label">Document Type</label>
          <select className={sel} value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="">— select type —</option>
            {DOC_TYPES.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
          </select>
        </div>

        <button
          className="bulk-upload-trigger"
          onClick={() => fileRef.current?.click()}
          style={{ opacity: candidate && docType && !uploading ? 1 : 0.5 }}
          disabled={uploading}
        >
          <Paperclip size={15} strokeWidth={2.5} />
          {uploading ? "Uploading…" : "Choose File & Upload"}
        </button>
        <input
          type="file"
          ref={fileRef}
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          style={{ display: "none" }}
          onChange={handleFile}
        />
      </div>

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

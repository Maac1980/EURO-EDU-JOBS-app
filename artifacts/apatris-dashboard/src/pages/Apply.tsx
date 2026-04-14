/**
 * EEJ Public Recruitment Form — /apply
 *
 * Public intake form for candidates. No auth required.
 * Collects: Name, Email, Phone, Nationality, CV upload, Passport/Visa upload.
 *
 * Pipeline:
 *  1. POST /api/apply → creates worker record (returns { id })
 *  2. If passport uploaded → POST /api/documents/smart-ingest → AI OCR extraction
 *  3. Anna reviews in dashboard Smart Ingest page
 *  4. Dashboard auto-refreshes via React Query invalidation
 *
 * Branding: EEJ Blue (#3B82F6).
 */
import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Upload, Loader2, FileText, Shield, Briefcase } from "lucide-react";
import { PublicLangToggle } from "@/components/PublicLangToggle";

const NATIONALITIES = [
  "Ukrainian", "Belarusian", "Georgian", "Moldovan", "Armenian",
  "Indian", "Philippine", "Nepali", "Bangladeshi", "Vietnamese",
  "Turkish", "Indonesian", "Sri Lankan", "Pakistani", "Uzbek",
  "Other",
];

export default function Apply() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nationality, setNationality] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const cvRef = useRef<HTMLInputElement>(null);
  const passportRef = useRef<HTMLInputElement>(null);

  const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Full Name and Email are required.");
      return;
    }
    setSubmitting(true);
    try {
      // Step 1: Submit application with CV
      const form = new FormData();
      form.append("name", name.trim());
      form.append("email", email.trim());
      form.append("phone", phone.trim());
      if (nationality) form.append("nationality", nationality);
      if (cvFile) form.append("cv", cvFile);
      if (passportFile) form.append("documents", passportFile);

      const res = await fetch(`${BASE}api/apply`, { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Submission failed." }));
        throw new Error(data.error ?? "Submission failed.");
      }

      const applyData = await res.json();
      const workerId = applyData.id;

      // Step 2: If passport/visa uploaded, route through Smart Ingest for OCR
      if (passportFile && workerId && isImageOrPdf(passportFile)) {
        try {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const base64 = (reader.result as string).split(",")[1];
              const ingestRes = await fetch(`${BASE}api/documents/smart-ingest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: base64, mimeType: passportFile.type, workerId, fileName: passportFile.name }),
              });
              if (ingestRes.ok) setOcrResult(await ingestRes.json());
            } catch { /* Smart Ingest is best-effort */ }
          };
          reader.readAsDataURL(passportFile);
        } catch { /* best-effort */ }
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4 py-12">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] blur-[140px] rounded-full" style={{ background: "rgba(59,130,246,0.06)" }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full" style={{ background: "rgba(59,130,246,0.04)" }} />
      </div>

      <PublicLangToggle />
      <div className="w-full max-w-md z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
            <span className="text-xl font-black tracking-tighter text-blue-400">EEJ</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide text-center">{t("public.apply.title")}</h1>
          <p className="text-sm text-slate-400 mt-1 text-center">{t("public.apply.subtitle")}</p>
        </div>

        {submitted ? (
          <div className="bg-slate-800 rounded-2xl p-10 flex flex-col items-center text-center shadow-xl border border-blue-500/20">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 border-2 border-blue-500/30 flex items-center justify-center mb-5">
              <CheckCircle2 className="w-8 h-8 text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">{t("public.apply.received")}</h2>
            <p className="text-slate-300 leading-relaxed">{t("public.apply.receivedMsg")}</p>

            {ocrResult && (
              <div className="mt-5 w-full rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-left space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-blue-400 uppercase">Document Detected</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">{ocrResult.docType}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${(ocrResult.confidence ?? 0) >= 0.7 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                    {Math.round((ocrResult.confidence ?? 0) * 100)}%
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">Your document has been queued for AI verification. Our team will confirm the details.</p>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-600">
              <Shield className="w-3 h-3" />
              <span>Your data is processed in accordance with GDPR and Polish data protection law.</span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl space-y-5">
            {error && (
              <div className="p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400">{error}</div>
            )}

            {/* Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                {t("public.apply.fullName")} <span className="text-blue-400">*</span>
              </label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Maria Kowalski" required
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60 transition-colors" />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                {t("public.apply.email")} <span className="text-blue-400">*</span>
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60 transition-colors" />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">{t("public.apply.phone")}</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+48 000 000 000"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60 transition-colors" />
            </div>

            {/* Nationality */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">{t("public.apply.nationality")}</label>
              <select value={nationality} onChange={e => setNationality(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/60 transition-colors">
                <option value="">{t("public.apply.selectNationality")}</option>
                {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {/* Two-Column Upload Zone */}
            <div className="grid grid-cols-2 gap-3">
              {/* CV Upload */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                  <Briefcase className="w-3 h-3 inline mr-1" />CV / Resume
                </label>
                <div onClick={() => cvRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-1.5 cursor-pointer transition-all text-center min-h-[100px] justify-center ${
                    cvFile ? "border-blue-500/50 bg-blue-500/5" : "border-slate-600 bg-slate-900 hover:border-blue-500/30"
                  }`}>
                  <input ref={cvRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={e => setCvFile(e.target.files?.[0] ?? null)} />
                  <Upload className="w-5 h-5 text-slate-500" />
                  {cvFile ? (
                    <span className="text-[10px] font-mono text-blue-400 break-all">{cvFile.name}</span>
                  ) : (
                    <span className="text-[10px] text-slate-500">Drop CV here</span>
                  )}
                </div>
              </div>

              {/* Passport Upload */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                  <Shield className="w-3 h-3 inline mr-1" />Passport / Visa
                </label>
                <div onClick={() => passportRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-1.5 cursor-pointer transition-all text-center min-h-[100px] justify-center ${
                    passportFile ? "border-blue-500/50 bg-blue-500/5" : "border-slate-600 bg-slate-900 hover:border-blue-500/30"
                  }`}>
                  <input ref={passportRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={e => setPassportFile(e.target.files?.[0] ?? null)} />
                  <Upload className="w-5 h-5 text-slate-500" />
                  {passportFile ? (
                    <span className="text-[10px] font-mono text-blue-400 break-all">{passportFile.name}</span>
                  ) : (
                    <span className="text-[10px] text-slate-500">Drop passport here</span>
                  )}
                </div>
              </div>
            </div>

            {(cvFile || passportFile) && (
              <div className="flex items-center gap-1.5 text-[10px] text-blue-400">
                <FileText className="w-3 h-3" />
                <span>{passportFile ? "Passport will be processed by AI for automatic data extraction" : "CV will be scanned for experience and qualifications"}</span>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={submitting}
              className="w-full py-3.5 rounded-xl font-bold uppercase tracking-wider text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70 bg-blue-500 text-white hover:bg-blue-600">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("public.apply.processing")}</> : t("public.apply.submit")}
            </button>

            <p className="text-xs text-slate-600 text-center">{t("public.apply.gdpr")}</p>
          </form>
        )}
      </div>
    </div>
  );
}

function isImageOrPdf(file: File): boolean {
  return /\.(pdf|jpg|jpeg|png|webp)$/i.test(file.name) || file.type.startsWith("image/") || file.type === "application/pdf";
}

import React, { useRef, useState } from "react";
import { CheckCircle2, Upload, Loader2 } from "lucide-react";

export default function Apply() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Full Name and Email are required.");
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("email", email.trim());
      form.append("phone", phone.trim());
      if (file) form.append("cv", file);

      const res = await fetch(`${import.meta.env.BASE_URL}api/apply`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Submission failed." }));
        throw new Error(data.error ?? "Submission failed.");
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
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-700/8 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-800/6 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-md z-10">
        {/* Logo + Header */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-4"
            style={{ boxShadow: "0 0 0 3px #1e40af, 0 0 24px rgba(30,64,175,0.25)" }}
          >
            <span
              className="text-3xl font-black tracking-tighter"
              style={{ color: "#1e40af", fontFamily: "Arial Black, Arial, sans-serif" }}
            >
              EEJ
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide text-center">
            Join Our Global Network
          </h1>
          <p className="text-sm text-slate-400 mt-1 text-center">
            EURO EDU JOBS · International Candidate Portal
          </p>
        </div>

        {submitted ? (
          <div className="bg-slate-800 border border-blue-600/40 rounded-2xl p-10 flex flex-col items-center text-center shadow-xl">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
              style={{ background: "rgba(30,64,175,0.15)", border: "2px solid #1e40af" }}
            >
              <CheckCircle2 className="w-8 h-8" style={{ color: "#1e40af" }} />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">Application Received</h2>
            <p className="text-slate-300 leading-relaxed">
              Your application has been received. Our team will review your profile shortly.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl space-y-5"
          >
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                Full Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maria Kowalski"
                required
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                Email Address <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+48 000 000 000"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                CV / Passport Upload
              </label>
              <div
                onClick={() => fileRef.current?.click()}
                className={`w-full border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                  file
                    ? "border-blue-500/60 bg-blue-500/5"
                    : "border-slate-600 bg-slate-900 hover:border-blue-500/50 hover:bg-blue-500/5"
                }`}
              >
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <Upload className="w-6 h-6 text-slate-400" />
                <span className="text-sm text-slate-400 text-center">
                  {file ? (
                    <span className="text-blue-400 font-mono font-semibold">{file.name}</span>
                  ) : (
                    <>
                      <span className="text-white font-semibold">Click to upload</span> your CV or Passport
                    </>
                  )}
                </span>
                <span className="text-xs text-slate-600">PDF, JPG, PNG or WebP · max 20MB</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-xl text-white font-bold uppercase tracking-wider text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70"
              style={{ background: "#1e40af" }}
              onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.background = "#1d3a9a"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1e40af"; }}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit Application"
              )}
            </button>

            <p className="text-xs text-slate-600 text-center">
              By submitting, you agree to our candidate data processing policy.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

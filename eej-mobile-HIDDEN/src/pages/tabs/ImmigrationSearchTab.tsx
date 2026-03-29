import { useState, useRef } from "react";
import { Search, Globe, BookOpen, ExternalLink, ChevronDown, Loader2 } from "lucide-react";
import { searchImmigration, fetchPopularQuestions } from "@/lib/api";
import { useEffect } from "react";

interface SearchResult {
  answer: string;
  sources: { url: string; title?: string }[];
  confidence: number;
  actionItems: string[];
}

export default function ImmigrationSearchTab() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState<"en" | "pl">("en");
  const [popular, setPopular] = useState<{ en: string; pl: string }[]>([]);
  const [history, setHistory] = useState<{ query: string; answer: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPopularQuestions()
      .then(setPopular)
      .catch(() => setPopular([]));
  }, []);

  async function handleSearch(q?: string) {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await searchImmigration(searchQuery, language);
      setResult(res);
      setHistory((prev) => [{ query: searchQuery, answer: res.answer.slice(0, 100) }, ...prev.slice(0, 9)]);
    } catch {
      setResult({ answer: "Search is currently unavailable. Please try again later.", sources: [], confidence: 0, actionItems: [] });
    }
    setLoading(false);
  }

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">AI-Powered</div>
          <div className="tab-greeting-name">Immigration Search</div>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={language === "en" ? "Ask about Polish immigration law..." : "Zapytaj o polskie prawo imigracyjne..."}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          style={{
            width: "100%",
            padding: "12px 44px 12px 40px",
            borderRadius: 14,
            border: "2px solid #1B2A4A",
            fontSize: 14,
            outline: "none",
            background: "#F9FAFB",
          }}
        />
        <Search size={18} color="#1B2A4A" style={{ position: "absolute", left: 14, top: 13 }} />
        <button
          onClick={() => handleSearch()}
          disabled={loading || !query.trim()}
          style={{
            position: "absolute",
            right: 6,
            top: 6,
            padding: "6px 12px",
            borderRadius: 10,
            border: "none",
            background: "#1B2A4A",
            color: "#FFD600",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            opacity: loading || !query.trim() ? 0.5 : 1,
          }}
        >
          {loading ? "..." : "Search"}
        </button>
      </div>

      {/* Language toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <button
          onClick={() => setLanguage("en")}
          style={{
            padding: "4px 10px",
            borderRadius: 8,
            border: language === "en" ? "2px solid #1B2A4A" : "1.5px solid #E5E7EB",
            background: language === "en" ? "#1B2A4A" : "#fff",
            color: language === "en" ? "#FFD600" : "#6B7280",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          English
        </button>
        <button
          onClick={() => setLanguage("pl")}
          style={{
            padding: "4px 10px",
            borderRadius: 8,
            border: language === "pl" ? "2px solid #1B2A4A" : "1.5px solid #E5E7EB",
            background: language === "pl" ? "#1B2A4A" : "#fff",
            color: language === "pl" ? "#FFD600" : "#6B7280",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Polski
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "30px 20px", color: "#1B2A4A" }}>
          <Loader2 size={28} className="animate-spin" style={{ margin: "0 auto 8px" }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>Searching Polish immigration databases...</div>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>Analyzing praca.gov.pl, MOS portal, legislation...</div>
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 16, marginBottom: 12 }}>
          {/* Confidence */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>AI Analysis</span>
            {result.confidence > 0 && (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 6,
                background: result.confidence >= 0.8 ? "#ECFDF5" : result.confidence >= 0.5 ? "#FFFBEB" : "#FEF2F2",
                color: result.confidence >= 0.8 ? "#059669" : result.confidence >= 0.5 ? "#D97706" : "#DC2626",
              }}>
                {Math.round(result.confidence * 100)}% confident
              </span>
            )}
          </div>

          {/* Answer */}
          <div style={{ fontSize: 14, color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {result.answer}
          </div>

          {/* Action Items */}
          {result.actionItems && result.actionItems.length > 0 && (
            <div style={{ marginTop: 12, padding: 10, background: "#FFFBEB", borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#D97706", marginBottom: 6 }}>Action Required:</div>
              {result.actionItems.map((a, i) => (
                <div key={i} style={{ fontSize: 12, color: "#92400E", paddingLeft: 8, borderLeft: "2px solid #F59E0B", marginBottom: 4 }}>
                  {a}
                </div>
              ))}
            </div>
          )}

          {/* Sources */}
          {result.sources && result.sources.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6 }}>Sources:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {result.sources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener"
                    style={{
                      fontSize: 11,
                      color: "#3B82F6",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "3px 8px",
                      background: "#EFF6FF",
                      borderRadius: 6,
                      textDecoration: "none",
                    }}
                  >
                    <ExternalLink size={10} /> {s.title ?? new URL(s.url).hostname}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Popular questions */}
      {!result && !loading && (
        <>
          <div className="section-label" style={{ marginTop: 8 }}>Popular Questions</div>
          {popular.length > 0
            ? popular.slice(0, 6).map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    const text = language === "en" ? q.en : q.pl;
                    setQuery(text);
                    handleSearch(text);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1.5px solid #E5E7EB",
                    background: "#fff",
                    fontSize: 13,
                    color: "#374151",
                    marginBottom: 6,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <BookOpen size={14} color="#3B82F6" style={{ flexShrink: 0 }} />
                  {language === "en" ? q.en : q.pl}
                </button>
              ))
            : [
                "What documents are needed for a Type A work permit?",
                "How long does a work permit application take?",
                "What is the 7-day reporting obligation?",
                "Can I change employers while on a work permit?",
                "What are the current ZUS contribution rates?",
                "What is the Oswiadczenie process?",
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(q);
                    handleSearch(q);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1.5px solid #E5E7EB",
                    background: "#fff",
                    fontSize: 13,
                    color: "#374151",
                    marginBottom: 6,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <BookOpen size={14} color="#3B82F6" style={{ flexShrink: 0 }} />
                  {q}
                </button>
              ))}
        </>
      )}
      <div style={{ height: 100 }} />
    </div>
  );
}

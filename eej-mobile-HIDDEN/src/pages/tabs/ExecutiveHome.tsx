import { useState, useEffect } from "react";
import {
  Users,
  TrendingUp,
  Clock,
  Plane,
  FileText,
  ArrowUpRight,
  UserPlus,
  ShieldCheck,
  Scale,
  AlertTriangle,
  Info,
  Search,
  ChevronRight,
  Loader2,
  Sparkles,
} from "lucide-react";
// EXEC_STATS removed — Anna now sees real-or-empty from /admin/stats, never
// the synthetic mock fallback. If stats fail to load, we show an error banner
// rather than a misleading number.
import PlatformModules from "@/components/PlatformModules";
import AddCandidateModal from "@/components/AddCandidateModal";
import AddUserModal from "@/components/AddUserModal";
import ModuleSheet from "@/components/ModuleSheet";
import DocumentScanFlow from "@/components/DocumentScanFlow";
import type { ModuleId } from "@/components/PlatformModules";
import type { ActiveTab } from "@/types";
import { fetchRegulatorySummary, searchImmigration, fetchAdminStats, fetchNotifications, fetchWorkers } from "@/lib/api";

interface Props {
  onNavigate?: (tab: ActiveTab) => void;
}

export default function ExecutiveHome({ onNavigate }: Props) {
  const [showAdd,      setShowAdd]      = useState(false);
  const [showAddUser,  setShowAddUser]  = useState(false);
  const [openModule,   setOpenModule]   = useState<ModuleId | null>(null);
  const [showScanFlow, setShowScanFlow] = useState(false);

  // Live stats — initialized to real-or-empty zeroes. Anna sees what the
  // system actually knows, not a mock-data illusion.
  const [stats, setStats] = useState({
    totalCandidates: 0,
    placementPct: 0,
    pendingReviews: 0,
    activeDeployments: 0,
    monthlyRevenue: "0.00",
    zusLiability: "0.00",
    b2bContracts: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsMeta, setStatsMeta] = useState<{
    newApplicationsToday: number;
    schengenAlerts: number;
    schengenTrackingEnabled: boolean;
    stripeConfigured: boolean;
    stripeMonthlyRevenue: string;
    monthlyRevenueByCurrency: { PLN: string; EUR: string };
    weightedPipeline: { PLN: string; EUR: string };
    stagnantLeads: number;
  } | null>(null);

  // Regulatory Intelligence widget state
  const [regSummary, setRegSummary] = useState<any>(null);
  const [regLoading, setRegLoading] = useState(true);

  // Immigration search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<string | null>(null);

  // New applications state
  const [newApps, setNewApps] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    fetchWorkers()
      .then((workers) => setNewApps(workers.filter((w: any) => w.pipelineStage === "New" || (!w.pipelineStage && w.createdAt))))
      .catch(() => setNewApps([]));
    fetchNotifications()
      .then(setNotifications)
      .catch(() => setNotifications([]));
  }, []);

  const todayApps = newApps.filter((w: any) => {
    if (!w.createdAt) return false;
    return new Date(w.createdAt).toDateString() === new Date().toDateString();
  });

  // Real-or-empty: each stat reads from the API; if the API doesn't return
  // a value, we show 0 (or empty) instead of falling back to mockData.
  // Anna should see what the system actually knows about the business — a
  // fake number is worse than no number when she's making decisions.
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminStats()
      .then((data) => {
        setStats({
          totalCandidates: data.totalCandidates ?? 0,
          placementPct: data.placementPct ?? 0,
          pendingReviews: data.pendingReviews ?? 0,
          activeDeployments: data.activeDeployments ?? 0,
          monthlyRevenue: data.monthlyRevenue ?? "0.00",
          zusLiability: data.zusLiability ?? "0.00",
          b2bContracts: data.b2bContracts ?? 0,
        });
        setStatsMeta({
          newApplicationsToday: data.newApplicationsToday ?? 0,
          schengenAlerts: data.schengenAlerts ?? 0,
          schengenTrackingEnabled: data.schengenTrackingEnabled ?? false,
          stripeConfigured: data.stripeConfigured ?? false,
          stripeMonthlyRevenue: data.stripeMonthlyRevenue ?? "0.00",
          monthlyRevenueByCurrency: {
            PLN: data.monthlyRevenueByCurrency?.PLN ?? data.monthlyRevenue ?? "0.00",
            EUR: data.monthlyRevenueByCurrency?.EUR ?? "0.00",
          },
          weightedPipeline: {
            PLN: data.weightedPipeline?.PLN ?? "0.00",
            EUR: data.weightedPipeline?.EUR ?? "0.00",
          },
          stagnantLeads: data.stagnantLeads ?? 0,
        });
        setStatsError(null);
      })
      .catch((e) => {
        // Don't fall back to fake numbers. Surface that the data is missing.
        setStatsError(e instanceof Error ? e.message : "Stats unavailable");
      })
      .finally(() => setStatsLoading(false));

    fetchRegulatorySummary()
      .then(setRegSummary)
      .catch(() => setRegSummary(null))
      .finally(() => setRegLoading(false));
  }, []);

  async function handleImmigrationSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await searchImmigration(searchQuery);
      setSearchResult(res.answer);
    } catch {
      setSearchResult("Search unavailable. Try again later.");
    }
    setSearching(false);
  }

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 1 · Full Access</div>
          <div className="tab-greeting-name">Executive Overview</div>
        </div>
        <div className="tab-greeting-date">{formatDate()}</div>
      </div>

      <button className="lh-scan-btn" onClick={() => setShowScanFlow(true)}>
        <Sparkles size={16} strokeWidth={2.2} />
        <div className="lh-scan-text">
          <div className="lh-scan-title">Scan a document</div>
          <div className="lh-scan-sub">AI reads it and matches to the right worker</div>
        </div>
        <ChevronRight size={14} strokeWidth={2.2} />
      </button>

      {statsError && (
        <div
          style={{
            margin: "0 0 12px",
            padding: "8px 12px",
            background: "#FFFBEB",
            border: "1px solid #FCD34D",
            borderRadius: 8,
            fontSize: 12,
            color: "#92400E",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AlertTriangle size={13} strokeWidth={2.2} />
          <span style={{ flex: 1 }}>
            Stats unavailable — showing what's loaded so far. {statsError}
          </span>
        </div>
      )}

      {/* ── New Applications Today ── */}
      {(todayApps.length > 0 || newApps.length > 0) && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <UserPlus size={16} color="#059669" />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>New Applications</span>
              {todayApps.length > 0 && (
                <span style={{ background: "#ECFDF5", color: "#059669", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                  {todayApps.length} today
                </span>
              )}
            </div>
            <button onClick={() => onNavigate?.("applications")} style={{ fontSize: 11, color: "#3B82F6", background: "none", border: "none", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}>
              View All ({newApps.length}) <ChevronRight size={12} />
            </button>
          </div>
          {newApps.slice(0, 3).map((w: any, i: number) => (
            <div key={w.id ?? i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: i > 0 ? "1px solid #F3F4F6" : "none" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{w.name}</div>
                <div style={{ fontSize: 11, color: "#6B7280" }}>{w.jobRole ?? "General"} {w.nationality ? `· ${w.nationality}` : ""}</div>
              </div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                {w.createdAt ? new Date(w.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Immigration Search Bar ── */}
      <div style={{
        background: "linear-gradient(135deg, #1B2A4A 0%, #2D4270 100%)",
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Search size={16} color="#FFD600" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#FFD600" }}>Immigration Search</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginLeft: "auto" }}>AI-powered</span>
        </div>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            placeholder="Ask about Polish immigration law..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleImmigrationSearch()}
            style={{
              width: "100%",
              padding: "10px 70px 10px 12px",
              borderRadius: 10,
              border: "none",
              fontSize: 13,
              outline: "none",
              background: "rgba(255,255,255,0.95)",
              color: "#111827",
            }}
          />
          <button
            onClick={handleImmigrationSearch}
            disabled={searching || !searchQuery.trim()}
            style={{
              position: "absolute",
              right: 4,
              top: 4,
              padding: "6px 12px",
              borderRadius: 8,
              border: "none",
              background: "#FFD600",
              color: "#1B2A4A",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              opacity: searching || !searchQuery.trim() ? 0.5 : 1,
            }}
          >
            {searching ? "..." : "Ask"}
          </button>
        </div>
        {searching && (
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
            <Loader2 size={12} className="animate-spin" /> Searching databases...
          </div>
        )}
        {searchResult && !searching && (
          <div style={{
            marginTop: 8,
            padding: 10,
            background: "rgba(255,255,255,0.1)",
            borderRadius: 8,
            fontSize: 12,
            color: "#fff",
            lineHeight: 1.5,
            maxHeight: 120,
            overflowY: "auto",
          }}>
            {searchResult.slice(0, 300)}{searchResult.length > 300 ? "..." : ""}
            <button
              onClick={() => onNavigate?.("immigration")}
              style={{ display: "block", marginTop: 6, fontSize: 11, color: "#FFD600", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
            >
              View full results →
            </button>
          </div>
        )}
        {!searchResult && !searching && (
          <button
            onClick={() => onNavigate?.("immigration")}
            style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.6)", background: "none", border: "none", cursor: "pointer" }}
          >
            Open full search engine <ChevronRight size={12} />
          </button>
        )}
      </div>

      {/* ── Regulatory Intelligence Widget ── */}
      <div style={{
        background: "#fff",
        border: "1.5px solid #E5E7EB",
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Scale size={16} color="#DC2626" />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Regulatory Intelligence</span>
          </div>
          <button
            onClick={() => onNavigate?.("regulatory")}
            style={{ fontSize: 11, color: "#3B82F6", background: "none", border: "none", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}
          >
            View All <ChevronRight size={12} />
          </button>
        </div>

        {regLoading ? (
          <div style={{ textAlign: "center", padding: 12, color: "#9CA3AF", fontSize: 13 }}>Loading updates...</div>
        ) : regSummary ? (
          <>
            {/* Severity counts */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, background: "#FEF2F2", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#DC2626" }}>{regSummary.criticalCount ?? 0}</div>
                <div style={{ fontSize: 10, color: "#DC2626" }}>Critical</div>
              </div>
              <div style={{ flex: 1, background: "#FFFBEB", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#D97706" }}>{regSummary.warningCount ?? 0}</div>
                <div style={{ fontSize: 10, color: "#D97706" }}>Warning</div>
              </div>
              <div style={{ flex: 1, background: "#ECFDF5", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#059669" }}>{regSummary.workersAffected ?? 0}</div>
                <div style={{ fontSize: 10, color: "#059669" }}>Affected</div>
              </div>
            </div>

            {/* Latest updates */}
            {(regSummary.latest ?? []).slice(0, 3).map((u: any, i: number) => (
              <div key={i} style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                padding: "8px 0",
                borderTop: i > 0 ? "1px solid #F3F4F6" : "none",
              }}>
                {u.severity === "critical" ? (
                  <AlertTriangle size={14} color="#DC2626" style={{ flexShrink: 0, marginTop: 2 }} />
                ) : u.severity === "warning" ? (
                  <AlertTriangle size={14} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
                ) : (
                  <Info size={14} color="#3B82F6" style={{ flexShrink: 0, marginTop: 2 }} />
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", lineHeight: 1.3 }}>{u.title}</div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.3 }}>
                    {u.summary?.slice(0, 80)}{(u.summary?.length ?? 0) > 80 ? "..." : ""}
                  </div>
                </div>
              </div>
            ))}

            {(!regSummary.latest || regSummary.latest.length === 0) && (
              <div style={{ textAlign: "center", padding: 8, color: "#9CA3AF", fontSize: 12 }}>
                No recent updates. Run a scan to check.
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: 12, color: "#9CA3AF", fontSize: 12 }}>
            Unable to load regulatory data.
            <button onClick={() => onNavigate?.("regulatory")} style={{ color: "#3B82F6", background: "none", border: "none", cursor: "pointer", fontWeight: 600, marginLeft: 4 }}>
              Open module →
            </button>
          </div>
        )}
      </div>

      {/* Quick Actions Row */}
      <button className="ops-add-btn" style={{ margin: "0 0 8px" }} onClick={() => setShowAdd(true)}>
        <div className="ops-add-icon">
          <UserPlus size={20} color="#1B2A4A" strokeWidth={2.5} />
        </div>
        <div className="ops-add-text">
          <div className="ops-add-title">Add New Candidate</div>
          <div className="ops-add-sub">Register to the workforce pipeline</div>
        </div>
        <div className="ops-add-arrow">+</div>
      </button>

      {/* ── Add User button — T1 only ── */}
      <button className="ops-add-btn" style={{ margin: "0 0 4px", background: "#F0F4FF", border: "1.5px solid #C7D2FE" }} onClick={() => setShowAddUser(true)}>
        <div className="ops-add-icon" style={{ background: "#EEF2FF" }}>
          <ShieldCheck size={20} color="#6366F1" strokeWidth={2.5} />
        </div>
        <div className="ops-add-text">
          <div className="ops-add-title" style={{ color: "#4338CA" }}>Manage Staff Accounts</div>
          <div className="ops-add-sub">Add / remove system users via Airtable</div>
        </div>
        <div className="ops-add-arrow" style={{ color: "#6366F1" }}>+</div>
      </button>

      {/* KPI Row */}
      <div className="kpi-row">
        <div className="kpi-card kpi-navy">
          <div className="kpi-icon-row">
            <Users size={16} color="rgba(255,255,255,0.5)" strokeWidth={2} />
          </div>
          <div className="kpi-value">{stats.totalCandidates}</div>
          <div className="kpi-label">Total Candidates</div>
        </div>
        <div className="kpi-card kpi-yellow">
          <div className="kpi-icon-row">
            <TrendingUp size={16} color="rgba(27,42,74,0.5)" strokeWidth={2} />
          </div>
          <div className="kpi-value" style={{ color: "#1B2A4A" }}>{stats.placementPct}%</div>
          <div className="kpi-label" style={{ color: "#1B2A4A" }}>Placement Rate</div>
        </div>
      </div>

      {/* Ops Summary */}
      <div className="section-label">Operations at a Glance</div>
      <div className="summary-grid">
        <SummaryCard Icon={Clock}    value={stats.pendingReviews}    label="Pending Reviews"    accent="#F59E0B" bg="#FFFBEB" />
        <SummaryCard Icon={Plane}    value={stats.activeDeployments} label="Active Deployments" accent="#10B981" bg="#ECFDF5" />
        <SummaryCard Icon={FileText} value={stats.b2bContracts}      label="B2B Contracts"      accent="#6366F1" bg="#EEF2FF" />
        <SummaryCard Icon={Users}    value={stats.totalCandidates}   label="Workforce Pool"     accent="#1B2A4A" bg="#F0F4FF" />
      </div>

      {/* FINANCIAL — Tier 1 Only */}
      <div className="section-label">
        Monthly Revenue
        <span className="access-badge access-t1">Tier 1 Only</span>
      </div>
      <div className="revenue-card">
        <div className="revenue-left">
          <div className="revenue-amount">
            zl {statsMeta?.monthlyRevenueByCurrency?.PLN ?? stats.monthlyRevenue}
          </div>
          <div className="revenue-sub">March 2026 · Paid Invoices</div>
          {statsMeta?.monthlyRevenueByCurrency && Number(statsMeta.monthlyRevenueByCurrency.EUR) > 0 && (
            <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
              + EUR {statsMeta.monthlyRevenueByCurrency.EUR}
            </div>
          )}
        </div>
        <div className="revenue-badge">
          <ArrowUpRight size={12} />
          <span>12%</span>
        </div>
      </div>

      {/* Weighted Pipeline — Tier 1 Only */}
      <div className="section-label">
        Weighted Pipeline
        <span className="access-badge access-t1">Tier 1 Only</span>
      </div>
      <div style={{
        background: "#fff",
        border: "1.5px solid #E5E7EB",
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
        display: "flex",
        gap: 12,
      }}>
        <div style={{ flex: 1, background: "#F0F4FF", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "#1B2A4A", fontWeight: 700, opacity: 0.7 }}>PLN · weighted</div>
          <div style={{ fontSize: 20, color: "#1B2A4A", fontWeight: 800, marginTop: 2 }}>
            zl {statsMeta?.weightedPipeline?.PLN ?? "0.00"}
          </div>
          <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>Open deals × probability</div>
        </div>
        <div style={{ flex: 1, background: "#FFF8DC", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "#1B2A4A", fontWeight: 700, opacity: 0.7 }}>EUR · weighted</div>
          <div style={{ fontSize: 20, color: "#1B2A4A", fontWeight: 800, marginTop: 2 }}>
            EUR {statsMeta?.weightedPipeline?.EUR ?? "0.00"}
          </div>
          <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>Open deals × probability</div>
        </div>
      </div>

      {/* Stagnant Leads alert */}
      {statsMeta && statsMeta.stagnantLeads > 0 && (
        <button
          onClick={() => onNavigate?.("crm")}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "#FFFBEB",
            border: "1.5px solid #FCD34D",
            borderRadius: 12,
            padding: "10px 12px",
            marginBottom: 12,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <AlertTriangle size={16} color="#D97706" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>
              {statsMeta.stagnantLeads} lead{statsMeta.stagnantLeads === 1 ? "" : "s"} idle ≥7 days — needs follow-up
            </div>
            <div style={{ fontSize: 11, color: "#92400E", opacity: 0.8, marginTop: 2 }}>
              Open CRM pipeline
            </div>
          </div>
          <ChevronRight size={14} color="#D97706" />
        </button>
      )}

      <div className="section-label">
        ZUS & Payroll Exposure
        <span className="access-badge access-t1">Tier 1 Only</span>
      </div>
      <div className="zus-row">
        <div className="zus-card">
          <div className="zus-label">ZUS Liability</div>
          <div className="zus-value">zl {stats.zusLiability}</div>
          <div className="zus-sub">Mar 2026 · 47 workers</div>
        </div>
        <div className="zus-card zus-card-alt">
          <div className="zus-label">Rate (Zlecenie)</div>
          <div className="zus-value">11.26%</div>
          <div className="zus-sub">Social + pension</div>
        </div>
      </div>

      {/* Schengen 90/180 Tracker */}
      <div className="section-label">
        Schengen 90/180 Tracker
        <span className="access-badge access-t1">Tier 1 Only</span>
      </div>
      <div style={{
        background: statsMeta?.schengenTrackingEnabled ? "#fff" : "#F9FAFB",
        border: `1.5px solid ${statsMeta?.schengenTrackingEnabled ? "#E5E7EB" : "#D1D5DB"}`,
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Plane size={16} color={statsMeta?.schengenTrackingEnabled ? "#DC2626" : "#9CA3AF"} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
                {statsMeta?.schengenTrackingEnabled
                  ? `${statsMeta.schengenAlerts} workers near 90-day limit`
                  : "Tracking not configured"}
              </div>
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                {statsMeta?.schengenTrackingEnabled
                  ? "Non-EU workers approaching 90/180 Schengen cap"
                  : "Connect a border-crossing data source to enable"}
              </div>
            </div>
          </div>
          {!statsMeta?.schengenTrackingEnabled && (
            <span style={{ background: "#F3F4F6", color: "#6B7280", padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600 }}>
              Phase 2
            </span>
          )}
        </div>
      </div>

      {/* Document Health */}
      <div className="section-label">Document Health</div>
      <div className="health-bar-card">
        <HealthBar label="Cleared"         pct={62} cls="green-dot" fillCls="green-fill" />
        <HealthBar label="Expiring Soon"   pct={21} cls="amber-dot" fillCls="amber-fill" />
        <HealthBar label="Action Required" pct={17} cls="red-dot"   fillCls="red-fill"   />
      </div>

      {/* PLATFORM MODULES — Tier 1 (ZUS included) */}
      <div className="section-label">
        Platform Modules
        <span className="access-badge access-t1">Tier 1 Only</span>
      </div>
      <PlatformModules
        modules={["zus-ledger", "timesheets", "pip-compliance", "b2b-contracts", "bhp-medical"]}
        onOpen={setOpenModule}
      />

      <div style={{ height: 100 }} />
      {showAdd     && <AddCandidateModal onClose={() => setShowAdd(false)} />}
      {showAddUser && <AddUserModal      onClose={() => setShowAddUser(false)} />}
      {openModule  && <ModuleSheet moduleId={openModule} onClose={() => setOpenModule(null)} />}
      {showScanFlow && <DocumentScanFlow onClose={() => setShowScanFlow(false)} />}
    </div>
  );
}

function SummaryCard({ Icon, value, label, accent, bg }: {
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  value: number; label: string; accent: string; bg: string;
}) {
  return (
    <div className="summary-card" style={{ background: bg, borderColor: accent + "40" }}>
      <Icon size={18} color={accent} strokeWidth={2} />
      <div className="summary-card-value" style={{ color: accent }}>{value}</div>
      <div className="summary-card-label">{label}</div>
    </div>
  );
}

function HealthBar({ label, pct, cls, fillCls }: { label: string; pct: number; cls: string; fillCls: string }) {
  return (
    <>
      <div className="health-bar-row" style={{ marginTop: 10 }}>
        <span className={`health-bar-legend ${cls}`}>{label}</span>
        <span className="health-bar-pct">{pct}%</span>
      </div>
      <div className="health-track">
        <div className={`health-fill ${fillCls}`} style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

function formatDate() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppShell } from "@/components/AppShell";
import GlobalDropZone from "@/components/GlobalDropZone";

// Pages
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Apply from "@/pages/Apply";
import WorkerPortal from "@/pages/WorkerPortal";
import AdminSettings from "@/pages/AdminSettings";
import ComplianceAlerts from "@/pages/ComplianceAlerts";
import PayrollPage from "@/pages/PayrollPage";
import { KnowledgeCenter } from "@/components/KnowledgeCenter";
import HistoryPage from "@/pages/HistoryPage";
import ContractHub from "@/pages/ContractHub";
import DocumentWorkflow from "@/pages/DocumentWorkflow";
import GpsTracking from "@/pages/GpsTracking";
import AnalyticsPage from "@/pages/AnalyticsPage";
import AiCopilot from "@/pages/AiCopilot";
import RegulatoryIntelligence from "@/pages/RegulatoryIntelligence";
import ImmigrationSearch from "@/pages/ImmigrationSearch";
import TRCService from "@/pages/TRCService";
import WorkerAvailability from "@/pages/WorkerAvailability";
import ShiftSchedule from "@/pages/ShiftSchedule";
import SkillsMatrix from "@/pages/SkillsMatrix";
import SalaryBenchmark from "@/pages/SalaryBenchmark";
import AiAuditTrail from "@/pages/AiAuditTrail";
import GDPRManagement from "@/pages/GDPRManagement";
import PostedWorkers from "@/pages/PostedWorkers";
import CountryCompliance from "@/pages/CountryCompliance";
import HoursManagement from "@/pages/HoursManagement";
import SystemLogs from "@/pages/SystemLogs";
import ClientManagement from "@/pages/ClientManagement";
import PayTransparency from "@/pages/PayTransparency";
import ApplicationsFeed from "@/pages/ApplicationsFeed";
import JobBoard from "@/pages/JobBoard";
import InvoiceManagement from "@/pages/InvoiceManagement";
import ImmigrationDashboard from "@/pages/ImmigrationDashboard";
import PricingPage from "@/pages/PricingPage";
import WorkerUpload from "@/pages/WorkerUpload";
import ATSPipeline from "@/pages/ATSPipeline";
import Interviews from "@/pages/Interviews";
import Candidates from "@/pages/Candidates";
import AgencySettings from "@/pages/AgencySettings";
import BulkUpload from "@/pages/BulkUpload";
import Profile from "@/pages/Profile";
import MyDocs from "@/pages/MyDocs";
import Updates from "@/pages/Updates";
import CrmPage from "@/pages/CrmPage";
import OnboardingPage from "@/pages/OnboardingPage";
import WorkerMatching from "@/pages/WorkerMatching";
import ContractGenerator from "@/pages/ContractGenerator";
import SalaryAdvances from "@/pages/SalaryAdvances";
import SelfService from "@/pages/SelfService";
import ZusFilings from "@/pages/ZusFilings";
import Messaging from "@/pages/Messaging";
import MoodTracker from "@/pages/MoodTracker";
import LegalKB from "@/pages/LegalKB";
import GoogleWorkspace from "@/pages/GoogleWorkspace";
import PIPReadiness from "@/pages/PIPReadiness";
import RevenueForecast from "@/pages/RevenueForecast";
import LegalDashboard from "@/pages/LegalDashboard";
import CaseManagement from "@/pages/CaseManagement";
import DocumentTemplates from "@/pages/DocumentTemplates";
import ClientPortalPage from "@/pages/ClientPortal";
import LegalQueue from "@/pages/LegalQueue";
import RejectionIntelligence from "@/pages/RejectionIntelligence";
import InspectionReport from "@/pages/InspectionReport";
import WorkerTimeline from "@/pages/WorkerTimeline";
import FinesRiskReport from "@/pages/FinesRiskReport";
import CrmPipeline from "@/pages/CrmPipeline";
import OnboardingChecklist from "@/pages/OnboardingChecklist";
import WorkerUploadPage from "@/pages/WorkerUploadPage";
import GeofenceMap from "@/pages/GeofenceMap";
import AiCopilotChat from "@/pages/AiCopilotChat";
import LinkedCases from "@/pages/LinkedCases";
import CaseActionCenter from "@/pages/CaseActionCenter";
import PostedDeadlines from "@/pages/PostedDeadlines";
import SignatureTracking from "@/pages/SignatureTracking";
import SafetyMonitor from "@/pages/SafetyMonitor";
import MarginAnalysis from "@/pages/MarginAnalysis";
import HousingOverview from "@/pages/HousingOverview";
import NotFound from "@/pages/not-found";

// Lazy load new features to prevent blank page if import fails
const LegalIntelligence = React.lazy(() => import("@/pages/LegalIntelligence"));
const TrcWorkspace = React.lazy(() => import("@/pages/TrcWorkspace"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const full = window.location.search + window.location.hash;
      if (full) sessionStorage.setItem("eej_return_to", full);
      setLocation("/login");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) return null;
  if (!isAuthenticated) return null;

  return <Component />;
}

function Router() {
  return (
    <AppShell>
      <GlobalDropZone>
      <Switch>
        <Route path="/login">
          {() => <ErrorBoundary><Login /></ErrorBoundary>}
        </Route>
        <Route path="/apply">
          {() => <ErrorBoundary><Apply /></ErrorBoundary>}
        </Route>
        <Route path="/portal">
          {() => <ErrorBoundary><WorkerPortal /></ErrorBoundary>}
        </Route>
        <Route path="/worker-upload/:id">
          {() => <ErrorBoundary><WorkerUpload /></ErrorBoundary>}
        </Route>
        <Route path="/pricing">
          {() => <ErrorBoundary><PricingPage /></ErrorBoundary>}
        </Route>
        <Route path="/admin-settings">
          {() => <ProtectedRoute component={AdminSettings} />}
        </Route>
        <Route path="/compliance-alerts">
          {() => <ProtectedRoute component={ComplianceAlerts} />}
        </Route>
        <Route path="/payroll">
          {() => <ProtectedRoute component={PayrollPage} />}
        </Route>
        <Route path="/history">
          {() => <ProtectedRoute component={HistoryPage} />}
        </Route>
        <Route path="/contracts">
          {() => <ProtectedRoute component={ContractHub} />}
        </Route>
        <Route path="/doc-workflow">
          {() => <ProtectedRoute component={DocumentWorkflow} />}
        </Route>
        <Route path="/gps-tracking">
          {() => <ProtectedRoute component={GpsTracking} />}
        </Route>
        <Route path="/analytics">
          {() => <ProtectedRoute component={AnalyticsPage} />}
        </Route>
        <Route path="/ai-copilot">
          {() => <ProtectedRoute component={AiCopilot} />}
        </Route>
        <Route path="/regulatory">
          {() => <ProtectedRoute component={RegulatoryIntelligence} />}
        </Route>
        <Route path="/immigration-search">
          {() => <ProtectedRoute component={ImmigrationSearch} />}
        </Route>
        <Route path="/trc-service">
          {() => <ProtectedRoute component={TRCService} />}
        </Route>
        <Route path="/availability">
          {() => <ProtectedRoute component={WorkerAvailability} />}
        </Route>
        <Route path="/shift-schedule">
          {() => <ProtectedRoute component={ShiftSchedule} />}
        </Route>
        <Route path="/skills-matrix">
          {() => <ProtectedRoute component={SkillsMatrix} />}
        </Route>
        <Route path="/salary-benchmark">
          {() => <ProtectedRoute component={SalaryBenchmark} />}
        </Route>
        <Route path="/ai-audit">
          {() => <ProtectedRoute component={AiAuditTrail} />}
        </Route>
        <Route path="/gdpr">
          {() => <ProtectedRoute component={GDPRManagement} />}
        </Route>
        <Route path="/posted-workers">
          {() => <ProtectedRoute component={PostedWorkers} />}
        </Route>
        <Route path="/country-compliance">
          {() => <ProtectedRoute component={CountryCompliance} />}
        </Route>
        <Route path="/hours">
          {() => <ProtectedRoute component={HoursManagement} />}
        </Route>
        <Route path="/system-logs">
          {() => <ProtectedRoute component={SystemLogs} />}
        </Route>
        <Route path="/clients">
          {() => <ProtectedRoute component={ClientManagement} />}
        </Route>
        <Route path="/pay-transparency">
          {() => <ProtectedRoute component={PayTransparency} />}
        </Route>
        <Route path="/applications">
          {() => <ProtectedRoute component={ApplicationsFeed} />}
        </Route>
        <Route path="/job-board">
          {() => <ProtectedRoute component={JobBoard} />}
        </Route>
        <Route path="/invoices">
          {() => <ProtectedRoute component={InvoiceManagement} />}
        </Route>
        <Route path="/immigration">
          {() => <ProtectedRoute component={ImmigrationDashboard} />}
        </Route>
        <Route path="/calculator">
          {() => <ProtectedRoute component={() => <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background"><KnowledgeCenter /></div>} />}
        </Route>
        <Route path="/ats-pipeline">
          {() => <ProtectedRoute component={ATSPipeline} />}
        </Route>
        <Route path="/interviews">
          {() => <ProtectedRoute component={Interviews} />}
        </Route>
        <Route path="/candidates">
          {() => <ProtectedRoute component={Candidates} />}
        </Route>
        <Route path="/agency-settings">
          {() => <ProtectedRoute component={AgencySettings} />}
        </Route>
        <Route path="/bulk-upload">
          {() => <ProtectedRoute component={BulkUpload} />}
        </Route>
        <Route path="/profile">
          {() => <ProtectedRoute component={Profile} />}
        </Route>
        <Route path="/my-docs">
          {() => <ProtectedRoute component={MyDocs} />}
        </Route>
        <Route path="/updates">
          {() => <ProtectedRoute component={Updates} />}
        </Route>
        <Route path="/crm">
          {() => <ProtectedRoute component={CrmPage} />}
        </Route>
        <Route path="/onboarding">
          {() => <ProtectedRoute component={OnboardingPage} />}
        </Route>
        <Route path="/matching">
          {() => <ProtectedRoute component={WorkerMatching} />}
        </Route>
        <Route path="/contract-gen">
          {() => <ProtectedRoute component={ContractGenerator} />}
        </Route>
        <Route path="/advances">
          {() => <ProtectedRoute component={SalaryAdvances} />}
        </Route>
        <Route path="/self-service">
          {() => <ProtectedRoute component={SelfService} />}
        </Route>
        <Route path="/zus">
          {() => <ProtectedRoute component={ZusFilings} />}
        </Route>
        <Route path="/messages">
          {() => <ProtectedRoute component={Messaging} />}
        </Route>
        <Route path="/mood">
          {() => <ProtectedRoute component={MoodTracker} />}
        </Route>
        <Route path="/legal-kb">
          {() => <ProtectedRoute component={LegalKB} />}
        </Route>
        <Route path="/google">
          {() => <ProtectedRoute component={GoogleWorkspace} />}
        </Route>
        <Route path="/pip-readiness">
          {() => <ProtectedRoute component={PIPReadiness} />}
        </Route>
        <Route path="/revenue">
          {() => <ProtectedRoute component={RevenueForecast} />}
        </Route>
        <Route path="/legal-dashboard">
          {() => <ProtectedRoute component={LegalDashboard} />}
        </Route>
        <Route path="/case-management">
          {() => <ProtectedRoute component={CaseManagement} />}
        </Route>
        <Route path="/document-templates">
          {() => <ProtectedRoute component={DocumentTemplates} />}
        </Route>
        <Route path="/client-portal">
          {() => <ProtectedRoute component={ClientPortalPage} />}
        </Route>
        <Route path="/legal-queue">
          {() => <ProtectedRoute component={LegalQueue} />}
        </Route>
        <Route path="/rejection-intel">
          {() => <ProtectedRoute component={RejectionIntelligence} />}
        </Route>
        <Route path="/inspection-report">
          {() => <ProtectedRoute component={InspectionReport} />}
        </Route>
        <Route path="/worker-timeline">
          {() => <ProtectedRoute component={WorkerTimeline} />}
        </Route>
        <Route path="/fines-report">
          {() => <ProtectedRoute component={FinesRiskReport} />}
        </Route>
        <Route path="/case-action-center">
          {() => <ProtectedRoute component={CaseActionCenter} />}
        </Route>
        <Route path="/linked-cases">
          {() => <ProtectedRoute component={LinkedCases} />}
        </Route>
        <Route path="/legal-intelligence">
          {() => <React.Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}><ProtectedRoute component={LegalIntelligence} /></React.Suspense>}
        </Route>
        <Route path="/trc-workspace">
          {() => <React.Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}><ProtectedRoute component={TrcWorkspace} /></React.Suspense>}
        </Route>
        <Route path="/posted-deadlines">
          {() => <ProtectedRoute component={PostedDeadlines} />}
        </Route>
        <Route path="/signature-tracking">
          {() => <ProtectedRoute component={SignatureTracking} />}
        </Route>
        <Route path="/safety-monitor">
          {() => <ProtectedRoute component={SafetyMonitor} />}
        </Route>
        <Route path="/margin-analysis">
          {() => <ProtectedRoute component={MarginAnalysis} />}
        </Route>
        <Route path="/housing">
          {() => <ProtectedRoute component={HousingOverview} />}
        </Route>
        <Route path="/crm-pipeline">
          {() => <ProtectedRoute component={CrmPipeline} />}
        </Route>
        <Route path="/onboarding-checklist">
          {() => <ProtectedRoute component={OnboardingChecklist} />}
        </Route>
        <Route path="/worker-upload-portal">
          {() => <ProtectedRoute component={WorkerUploadPage} />}
        </Route>
        <Route path="/geofence-map">
          {() => <ProtectedRoute component={GeofenceMap} />}
        </Route>
        <Route path="/ai-copilot-chat">
          {() => <ProtectedRoute component={AiCopilotChat} />}
        </Route>
        <Route path="/">
          {() => <ErrorBoundary><ProtectedRoute component={Dashboard} /></ErrorBoundary>}
        </Route>
        <Route>
          {() => <ErrorBoundary><NotFound /></ErrorBoundary>}
        </Route>
      </Switch>
      </GlobalDropZone>
    </AppShell>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

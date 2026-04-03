import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import ErrorBoundary from "@/components/ErrorBoundary";

// Pages
import Login from "@/pages/Login";
import Dashboard from "@/pages/DashboardShell";
import Apply from "@/pages/Apply";
import WorkerPortal from "@/pages/WorkerPortal";
import NotFound from "@/pages/not-found";

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
      <Route path="/">
        {() => <ErrorBoundary><ProtectedRoute component={Dashboard} /></ErrorBoundary>}
      </Route>
      <Route>
        {() => <ErrorBoundary><NotFound /></ErrorBoundary>}
      </Route>
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
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
// force rebuild Sat Mar 21 11:39:00 AM UTC 2026
// fix typo Sat Mar 21 11:45:03 AM UTC 2026

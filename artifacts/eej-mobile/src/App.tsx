import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";

const queryClient = new QueryClient();

function AppRouter() {
  const { user } = useAuth();
  return user ? <Dashboard /> : <Login />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </QueryClientProvider>
  );
}

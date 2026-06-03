import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryCache, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import Home from "@/pages/Home";
import Contractors from "@/pages/Contractors";
import Projects from "@/pages/Projects";
import WorkOrders from "@/pages/WorkOrders";
import Capture from "@/pages/Capture";

const queryClient = new QueryClient({
  // Surface query failures instead of silently rendering "empty". The most
  // common one is PGRST106 (schema not exposed) — make that actionable.
  queryCache: new QueryCache({
    onError: (error) => {
      const msg = error instanceof Error ? error.message : "Request failed";
      const friendly = /invalid schema|PGRST106/i.test(msg)
        ? "LCS database isn't reachable: the 'lcs' schema is not exposed to the API. An admin must enable it in Supabase → Settings → API → Exposed schemas."
        : msg;
      toast.error(friendly, { id: "query-error" });
    },
  }),
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/contractors" element={<ProtectedRoute><Contractors /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
            <Route path="/work-orders" element={<ProtectedRoute><WorkOrders /></ProtectedRoute>} />
            <Route path="/capture" element={<ProtectedRoute><Capture /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
        <Toaster richColors position="top-center" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

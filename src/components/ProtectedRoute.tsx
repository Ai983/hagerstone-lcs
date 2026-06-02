import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2 } from "lucide-react";

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-6 bg-background">{children}</div>;
}

/**
 * Gates the app on three things, in order:
 *  1. a Supabase session (else → /login)
 *  2. a matching active row in public.employees
 *  3. module_id='lcs' access (can_access)
 * Failing (2) or (3) shows a clear "no access" screen, never a blank app.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated, employee, hasLcsAccess, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <FullScreen>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </FullScreen>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!employee || !hasLcsAccess) {
    return (
      <FullScreen>
        <div className="max-w-md text-center space-y-4">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">No access to LCS</h1>
          <p className="text-sm text-muted-foreground">
            {employee
              ? "Your account isn't enabled for the Labour & Contractor System yet. Ask an admin to grant LCS access in the Hub."
              : "We couldn't find an active employee record for your login. Contact IT at admin@hagerstone.com."}
          </p>
          <Button variant="outline" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </FullScreen>
    );
  }

  return <>{children}</>;
}

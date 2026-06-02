import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { LCS_MODULE_ID, type Employee } from "@/types";

interface AuthState {
  /** True until the identity load for the current session has fully settled. */
  loading: boolean;
  /** Supabase auth session present. */
  isAuthenticated: boolean;
  /** The matched row in public.employees (by auth_user_id), or null. */
  employee: Employee | null;
  /** Role from public.get_my_role() (== employees.role). */
  role: string | null;
  /** Whether this employee has module_id='lcs' access (can_access). */
  hasLcsAccess: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [hasLcsAccess, setHasLcsAccess] = useState(false);

  // Monotonic token: only the latest session resolution may apply its result.
  // This is what kills the brief "No access" flash — concurrent/duplicate
  // resolutions (getSession + onAuthStateChange both fire on load) no longer
  // race to flip `loading` while `employee` is transiently null.
  const seqRef = useRef(0);

  const resolveSession = useCallback(async (userId: string | null) => {
    const seq = ++seqRef.current;

    if (!userId) {
      if (seq === seqRef.current) {
        setIsAuthenticated(false);
        setEmployee(null);
        setRole(null);
        setHasLcsAccess(false);
        setLoading(false);
      }
      return;
    }

    setIsAuthenticated(true);

    // Load identity. Keep `loading` true throughout so ProtectedRoute shows the
    // spinner (never the access decision) until everything below is known.
    const { data: emp } = await supabase
      .from("employees")
      .select("id, auth_user_id, name, email, phone, role, department, designation, employee_code, is_active")
      .eq("auth_user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    let nextRole: string | null = null;
    let nextAccess = false;

    if (emp) {
      const { data: roleData } = await supabase.rpc("get_my_role");
      nextRole = (roleData as string | null) ?? (emp as Employee).role ?? null;

      const { data: access } = await supabase
        .from("employee_module_access")
        .select("can_access")
        .eq("employee_id", (emp as Employee).id)
        .eq("module_id", LCS_MODULE_ID)
        .maybeSingle();
      nextAccess = Boolean(access?.can_access);
    }

    // A newer auth event superseded this load — drop the stale result.
    if (seq !== seqRef.current) return;

    // Apply everything atomically, so the gate is evaluated only once the
    // employee + access are both known together.
    setEmployee((emp as Employee) ?? null);
    setRole(nextRole);
    setHasLcsAccess(nextAccess);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) resolveSession(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer off the auth-callback tick: making supabase DB calls directly
      // inside this callback can deadlock on the auth lock.
      const uid = session?.user?.id ?? null;
      setTimeout(() => {
        if (!cancelled) resolveSession(uid);
      }, 0);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [resolveSession]);

  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await resolveSession(session?.user?.id ?? null);
  }, [resolveSession]);

  const signOut = useCallback(async () => {
    seqRef.current++; // invalidate any in-flight resolution
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setEmployee(null);
    setRole(null);
    setHasLcsAccess(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ loading, isAuthenticated, employee, role, hasLcsAccess, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Surfaced loudly in dev; in prod these are injected by Vercel env.
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

/**
 * Default client — operates on the `public` schema (shared Hub auth:
 * employees, roles, employee_module_access) and is also used to read
 * `cps.cps_suppliers` (read-only). This is the SAME Hub Supabase project
 * (tpfvnerrjhqwipyonngf) used by the Hub portal and CPS.
 *
 * Session is persisted in this app's own localStorage (per-origin), mirroring
 * how CPS behaves today. Sub-apps each authenticate independently against the
 * shared project (no token handoff yet — planned SSO switch later).
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "lcs.auth.token",
  },
});

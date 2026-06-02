import { supabase } from "./supabase";

/**
 * LCS-schema accessor. Reuses the SINGLE authenticated client via
 * `supabase.schema('lcs')` instead of a second createClient instance.
 *
 * Why: two clients sharing the same auth storageKey caused lock contention in
 * supabase-js (lcs queries could hang → e.g. the supplier search returned
 * nothing). One client = one session, attached to every lcs request.
 */
export const supabaseLcs = supabase.schema("lcs");

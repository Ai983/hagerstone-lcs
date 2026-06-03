import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { supabaseLcs } from "@/lib/supabaseLcs";

export interface AiCheck {
  id: string;
  project_id: string | null;
  entity: string;
  entity_id: string;
  gate: string;
  result: Record<string, unknown>;
  confidence: number | null;
  confidence_reason: string | null;
  flags: string[];
  passed: boolean;
  model: string | null;
  human_corrected: boolean;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
}

/** Map an evidence kind to the gate the AI should run. */
export function gateForKind(kind: string): "attendance" | "G2" | "G1" {
  if (kind === "muster") return "attendance";
  if (kind === "measurement") return "G2";
  return "G1";
}

/** AI checks already recorded for a project, keyed lookups by entity_id done in the page. */
export function useAiChecks(projectId: string | null) {
  return useQuery({
    queryKey: ["ai_checks", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<AiCheck[]> => {
      const { data, error } = await supabaseLcs
        .from("ai_checks")
        .select("*")
        .eq("project_id", projectId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiCheck[];
    },
  });
}

/** Calls the lcs-ai-check Edge Function (server-side Claude; key never in browser). */
export function useRunAiCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { gate: string; entity_id: string; projectId: string; claim?: string }) => {
      const { data, error } = await supabase.functions.invoke("lcs-ai-check", {
        body: { gate: p.gate, entity_id: p.entity_id, claim: p.claim },
      });
      if (error) {
        // surface the function's JSON error body if present
        const ctx = (error as { context?: Response }).context;
        let detail = error.message;
        try { if (ctx) detail = JSON.stringify(await ctx.json()); } catch { /* ignore */ }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);
      return data as { ai_check: AiCheck; threshold: number };
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["ai_checks", v.projectId] }),
  });
}

/** Human confirms (or flags) an AI check — the named-human step (AI never confirms itself). */
export function useResolveAiCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; projectId: string; employeeId: string | null; flagReason?: string }) => {
      const patch: Record<string, unknown> = p.flagReason
        ? { human_corrected: true, result: { human_flag_reason: p.flagReason } }
        : { confirmed_by: p.employeeId, confirmed_at: new Date().toISOString() };
      const { error } = await supabaseLcs.from("ai_checks").update(patch).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["ai_checks", v.projectId] }),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { supabaseLcs } from "@/lib/supabaseLcs";
import type {
  BoqItem,
  ContractorProfile,
  ContractorView,
  CpsProject,
  Project,
  SupplierOption,
  WorkOrder,
  Worker,
} from "@/types";

/** Small employee shape for PM / project-head pickers (read from public). */
export interface EmployeeOption {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
}

// ---------------- Queries ----------------

export function useContractors() {
  return useQuery({
    queryKey: ["contractors"],
    queryFn: async (): Promise<ContractorView[]> => {
      const { data, error } = await supabaseLcs
        .from("v_contractors")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContractorView[];
    },
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabaseLcs
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Project[];
    },
  });
}

export function useWorkOrders() {
  return useQuery({
    queryKey: ["work_orders"],
    queryFn: async (): Promise<WorkOrder[]> => {
      const { data, error } = await supabaseLcs
        .from("work_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkOrder[];
    },
  });
}

export function useEmployees() {
  return useQuery({
    queryKey: ["employees_min"],
    queryFn: async (): Promise<EmployeeOption[]> => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, email, role")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as EmployeeOption[];
    },
  });
}

/** Supplier directory search for the optional contractor↔supplier link. */
export function useSupplierSearch(term: string) {
  return useQuery({
    queryKey: ["suppliers", term],
    enabled: term.trim().length >= 2,
    queryFn: async (): Promise<SupplierOption[]> => {
      const { data, error } = await supabaseLcs
        .from("v_cps_suppliers")
        .select("*")
        .ilike("name", `%${term.trim()}%`)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as SupplierOption[];
    },
  });
}

export function useLcsConfig() {
  return useQuery({
    queryKey: ["lcs_config"],
    queryFn: async (): Promise<Record<string, unknown>> => {
      const { data, error } = await supabaseLcs.from("lcs_config").select("key, value");
      if (error) throw error;
      const out: Record<string, unknown> = {};
      (data ?? []).forEach((r: { key: string; value: unknown }) => (out[r.key] = r.value));
      return out;
    },
  });
}

// ---------------- Mutations ----------------

export function useCreateContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ContractorProfile> & { type: ContractorProfile["type"] }) => {
      const { data, error } = await supabaseLcs
        .from("contractor_profiles")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as ContractorProfile;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contractors"] });
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Project> & { name: string }) => {
      const { data, error } = await supabaseLcs.from("projects").insert(payload).select().single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

// ---- Workers (labour model B + C) ----

export function useWorkers(contractorId: string | null) {
  return useQuery({
    queryKey: ["workers", contractorId],
    enabled: !!contractorId,
    queryFn: async (): Promise<Worker[]> => {
      const { data, error } = await supabaseLcs
        .from("workers")
        .select("*")
        .eq("contractor_profile_id", contractorId as string)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Worker[];
    },
  });
}

export function useCreateWorkersBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contractorId, rows }: { contractorId: string; rows: Record<string, unknown>[] }) => {
      if (!rows.length) return;
      const { error } = await supabaseLcs.from("workers").insert(rows);
      if (error) throw error;
      return contractorId;
    },
    onSuccess: (contractorId) => {
      if (contractorId) qc.invalidateQueries({ queryKey: ["workers", contractorId] });
    },
  });
}

export function useCreateWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Worker> & { contractor_profile_id: string; name: string }) => {
      const { data, error } = await supabaseLcs.from("workers").insert(payload).select().single();
      if (error) throw error;
      return data as Worker;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["workers", vars.contractor_profile_id] }),
  });
}

// ---- CPS project import ----

export function useCpsProjects() {
  return useQuery({
    queryKey: ["cps_projects"],
    queryFn: async (): Promise<CpsProject[]> => {
      const { data, error } = await supabaseLcs.from("v_cps_projects").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as CpsProject[];
    },
  });
}

export function useImportProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Array<Partial<Project> & { name: string }>) => {
      const { data, error } = await supabaseLcs.from("projects").insert(rows).select();
      if (error) throw error;
      return data as Project[];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Project> }) => {
      const { data, error } = await supabaseLcs.from("projects").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      wo,
      boq,
    }: {
      wo: Partial<WorkOrder> & { contractor_profile_id: string; project_id: string; track: WorkOrder["track"] };
      boq: BoqItem[];
    }) => {
      const { data, error } = await supabaseLcs.from("work_orders").insert(wo).select().single();
      if (error) throw error;
      const created = data as WorkOrder;
      const items = boq.filter((b) => b.description.trim());
      if (items.length) {
        const { error: bErr } = await supabaseLcs
          .from("wo_boq_items")
          .insert(items.map((b) => ({ ...b, work_order_id: created.id })));
        if (bErr) throw bErr;
      }
      return created;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work_orders"] }),
  });
}

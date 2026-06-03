import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { supabaseLcs } from "@/lib/supabaseLcs";

export interface ProjectAssignment {
  id: string;
  employee_id: string;
  project_id: string;
  gate_roles: string[];
}

export interface AttendanceRow {
  id: string;
  project_id: string;
  contractor_profile_id: string;
  work_date: string;
  headcount: number;
  man_days: number;
  source: string;
  created_at: string;
}

export interface SiteEvidenceRow {
  id: string;
  project_id: string;
  kind: string;
  file_path: string;
  geo_lat: number | null;
  geo_lng: number | null;
  taken_at: string | null;
  note: string | null;
  created_at: string;
}

/** Assignments for the logged-in employee (used to scope capture for field staff). */
export function useMyAssignments(employeeId: string | null) {
  return useQuery({
    queryKey: ["my_assignments", employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<ProjectAssignment[]> => {
      const { data, error } = await supabaseLcs
        .from("project_assignments")
        .select("*")
        .eq("employee_id", employeeId as string);
      if (error) throw error;
      return (data ?? []) as ProjectAssignment[];
    },
  });
}

export function useProjectAssignments(projectId: string | null) {
  return useQuery({
    queryKey: ["project_assignments", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectAssignment[]> => {
      const { data, error } = await supabaseLcs
        .from("project_assignments")
        .select("*")
        .eq("project_id", projectId as string);
      if (error) throw error;
      return (data ?? []) as ProjectAssignment[];
    },
  });
}

export function useAssignStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { employee_id: string; project_id: string; gate_roles: string[] }) => {
      const { error } = await supabaseLcs
        .from("project_assignments")
        .upsert(p, { onConflict: "employee_id,project_id" });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["project_assignments", v.project_id] }),
  });
}

/** Today's attendance for a project (to show what's already captured). */
export function useTodayAttendance(projectId: string | null, day: string) {
  return useQuery({
    queryKey: ["attendance", projectId, day],
    enabled: !!projectId,
    queryFn: async (): Promise<AttendanceRow[]> => {
      const { data, error } = await supabaseLcs
        .from("attendance")
        .select("*")
        .eq("project_id", projectId as string)
        .eq("work_date", day)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttendanceRow[];
    },
  });
}

export interface MarkAttendanceInput {
  project_id: string;
  contractor_profile_id: string;
  work_date: string;
  headcount: number;
  man_days: number;
  created_by: string | null;
  /** present-worker lines for DIRECT labour */
  lines?: Array<{ worker_id: string; man_day: number; day_rate: number }>;
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MarkAttendanceInput) => {
      const { lines, ...header } = input;
      const { data, error } = await supabaseLcs.from("attendance").insert(header).select().single();
      if (error) throw error;
      const att = data as AttendanceRow;
      if (lines && lines.length) {
        const { error: lErr } = await supabaseLcs
          .from("attendance_lines")
          .insert(lines.map((l) => ({ ...l, attendance_id: att.id, present: true })));
        if (lErr) throw lErr;
      }
      return att;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["attendance", v.project_id] }),
  });
}

/** Today's evidence for a project. */
export function useTodayEvidence(projectId: string | null, sinceIso: string) {
  return useQuery({
    queryKey: ["site_evidence", projectId, sinceIso],
    enabled: !!projectId,
    queryFn: async (): Promise<SiteEvidenceRow[]> => {
      const { data, error } = await supabaseLcs
        .from("site_evidence")
        .select("*")
        .eq("project_id", projectId as string)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SiteEvidenceRow[];
    },
  });
}

export function useUploadEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      project_id: string;
      file: File;
      kind: string;
      note: string | null;
      geo: { lat: number; lng: number } | null;
      uploaded_by: string | null;
    }) => {
      const safe = p.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${p.project_id}/${Date.now()}_${safe}`;
      const up = await supabase.storage.from("lcs-evidence").upload(path, p.file, { upsert: false });
      if (up.error) throw up.error;
      const { error } = await supabaseLcs.from("site_evidence").insert({
        project_id: p.project_id,
        kind: p.kind,
        file_path: path,
        geo_lat: p.geo?.lat ?? null,
        geo_lng: p.geo?.lng ?? null,
        taken_at: new Date().toISOString(),
        note: p.note,
        uploaded_by: p.uploaded_by,
      });
      if (error) throw error;
      return path;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["site_evidence", v.project_id] }),
  });
}

export function useSaveDpr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { project_id: string; work_date: string; summary: string; created_by: string | null }) => {
      const { error } = await supabaseLcs.from("dpr_entries").insert(p);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["dpr", v.project_id] }),
  });
}

/** Signed URL to view a private evidence file. */
export async function signedEvidenceUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("lcs-evidence").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

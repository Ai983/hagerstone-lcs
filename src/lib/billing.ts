import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseLcs } from "@/lib/supabaseLcs";
import type { BoqItem } from "@/types";

export interface RaBill {
  id: string;
  ra_no: string;
  work_order_id: string;
  bill_date: string;
  gross: number;
  cumulative: number;
  pct_utilised: number | null;
  status: string;
  created_at: string;
}

export interface WageSheet {
  id: string;
  wage_no: string;
  project_id: string;
  contractor_profile_id: string;
  period_start: string;
  period_end: string;
  total_man_days: number;
  rate: number | null;
  gross: number;
  status: string;
  created_at: string;
}

export interface BoqRow extends BoqItem { id: string; work_order_id: string; }

// ---------- RA bills (Track A — measured) ----------

export function useBoqItems(workOrderId: string | null) {
  return useQuery({
    queryKey: ["boq_items", workOrderId],
    enabled: !!workOrderId,
    queryFn: async (): Promise<BoqRow[]> => {
      const { data, error } = await supabaseLcs
        .from("wo_boq_items").select("*").eq("work_order_id", workOrderId as string).order("created_at");
      if (error) throw error;
      return (data ?? []) as BoqRow[];
    },
  });
}

export function useRaBills(workOrderId: string | null) {
  return useQuery({
    queryKey: ["ra_bills", workOrderId],
    enabled: !!workOrderId,
    queryFn: async (): Promise<RaBill[]> => {
      const { data, error } = await supabaseLcs
        .from("ra_bills").select("*").eq("work_order_id", workOrderId as string).order("ra_no");
      if (error) throw error;
      return (data ?? []) as RaBill[];
    },
  });
}

export interface RaLineInput { boq_item_id: string; description: string; unit: string | null; qty: number; rate: number; }

export function useCreateRaBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { work_order_id: string; lines: RaLineInput[]; created_by: string | null }) => {
      const items = p.lines.filter((l) => l.qty > 0);
      const gross = items.reduce((s, l) => s + l.qty * l.rate, 0);
      // ceiling enforced by DB trigger; throws if cumulative > WO value
      const { data: bill, error } = await supabaseLcs
        .from("ra_bills").insert({ work_order_id: p.work_order_id, gross, created_by: p.created_by }).select().single();
      if (error) throw error;
      const b = bill as RaBill;
      if (items.length) {
        const { error: iErr } = await supabaseLcs.from("ra_bill_items").insert(
          items.map((l) => ({ ra_bill_id: b.id, boq_item_id: l.boq_item_id, description: l.description, unit: l.unit, qty: l.qty, rate: l.rate, amount: l.qty * l.rate }))
        );
        if (iErr) throw iErr;
        // lock the measured quantities into the Measurement Book
        const { error: mErr } = await supabaseLcs.from("measurements").insert(
          items.map((l) => ({ work_order_id: p.work_order_id, boq_item_id: l.boq_item_id, qty: l.qty, locked: true, certified_by: p.created_by, certified_at: new Date().toISOString(), ra_bill_id: b.id, created_by: p.created_by }))
        );
        if (mErr) throw mErr;
      }
      return b;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["ra_bills", v.work_order_id] }),
  });
}

// ---------- Wage sheets (Track B — attendance) ----------

interface AttLine { worker_id: string; man_day: number; day_rate: number; }
interface AttRow { id: string; work_date: string; man_days: number; headcount: number; attendance_lines: AttLine[] }

/** Pull confirmed attendance for a contractor+project in a period, with per-worker lines. */
export function useWageAttendance(projectId: string, contractorId: string, start: string, end: string, enabled: boolean) {
  return useQuery({
    queryKey: ["wage_attendance", projectId, contractorId, start, end],
    enabled: enabled && !!projectId && !!contractorId,
    queryFn: async () => {
      const { data, error } = await supabaseLcs
        .from("attendance")
        .select("id, work_date, man_days, headcount, attendance_lines(worker_id, man_day, day_rate)")
        .eq("project_id", projectId).eq("contractor_profile_id", contractorId)
        .gte("work_date", start).lte("work_date", end)
        .order("work_date");
      if (error) throw error;
      const rows = (data ?? []) as unknown as AttRow[];
      const gangManDays = rows.reduce((s, r) => s + Number(r.man_days || 0), 0);
      // per-worker aggregation (direct)
      const perWorker = new Map<string, { man_days: number; amount: number; rate: number }>();
      for (const r of rows) for (const l of r.attendance_lines ?? []) {
        const cur = perWorker.get(l.worker_id) ?? { man_days: 0, amount: 0, rate: Number(l.day_rate) || 0 };
        cur.man_days += Number(l.man_day) || 0;
        cur.amount += (Number(l.man_day) || 0) * (Number(l.day_rate) || 0);
        cur.rate = Number(l.day_rate) || cur.rate;
        perWorker.set(l.worker_id, cur);
      }
      return { rows, gangManDays, perWorker: Array.from(perWorker.entries()).map(([worker_id, v]) => ({ worker_id, ...v })) };
    },
  });
}

export function useWageSheets(projectId: string | null) {
  return useQuery({
    queryKey: ["wage_sheets", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<WageSheet[]> => {
      const { data, error } = await supabaseLcs
        .from("wage_sheets").select("*").eq("project_id", projectId as string).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WageSheet[];
    },
  });
}

export interface WageLineInput { worker_id: string; worker_name: string; man_days: number; rate: number; amount: number; }

export function useCreateWageSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      project_id: string; contractor_profile_id: string; period_start: string; period_end: string;
      total_man_days: number; rate: number | null; gross: number; lines: WageLineInput[]; created_by: string | null;
    }) => {
      const { lines, ...header } = p;
      const { data, error } = await supabaseLcs.from("wage_sheets").insert(header).select().single();
      if (error) throw error;
      const ws = data as WageSheet;
      if (lines.length) {
        const { error: lErr } = await supabaseLcs.from("wage_sheet_lines").insert(lines.map((l) => ({ ...l, wage_sheet_id: ws.id })));
        if (lErr) throw lErr;
      }
      return ws;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["wage_sheets", v.project_id] }),
  });
}

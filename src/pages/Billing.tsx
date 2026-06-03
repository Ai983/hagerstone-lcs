import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkOrders, useContractors, useProjects, useWorkers } from "@/lib/masters";
import {
  useBoqItems, useRaBills, useCreateRaBill,
  useWageAttendance, useWageSheets, useCreateWageSheet,
  type RaLineInput, type WageLineInput,
} from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ReceiptText, Users, FileCheck2, AlertTriangle } from "lucide-react";

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (d: number) => { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };

export default function Billing() {
  const [tab, setTab] = useState<"ra" | "wage">("ra");
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">Build bills only from verified data — RA bills from locked BOQ rates (capped at the WO value), wages from confirmed attendance.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([["ra", "RA bills (measured)", ReceiptText], ["wage", "Wage sheets (attendance)", Users]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm ${tab === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {tab === "ra" ? <RaBillsTab /> : <WageSheetsTab />}
      </div>
    </AppShell>
  );
}

// ---------------- RA bills ----------------
function RaBillsTab() {
  const { employee } = useAuth();
  const { data: workOrders = [] } = useWorkOrders();
  const { data: contractors = [] } = useContractors();
  const { data: projects = [] } = useProjects();
  const create = useCreateRaBill();

  const measuredWOs = workOrders.filter((w) => w.track === "measured");
  const [woId, setWoId] = useState("");
  const { data: boq = [] } = useBoqItems(woId || null);
  const { data: bills = [] } = useRaBills(woId || null);

  const [qty, setQty] = useState<Record<string, string>>({});
  const wo = workOrders.find((w) => w.id === woId);
  const cName = (id: string) => contractors.find((c) => c.id === id)?.display_name ?? id;
  const pName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

  const priorCumulative = bills.reduce((s, b) => s + (b.status !== "rejected" ? Number(b.gross) : 0), 0);
  const billGross = boq.reduce((s, b) => s + (Number(qty[b.id]) || 0) * Number(b.agreed_rate), 0);
  const woValue = Number(wo?.wo_value ?? 0);
  const projected = priorCumulative + billGross;
  const overCeiling = woValue > 0 && projected > woValue;

  const reset = () => setQty({});

  const submit = async () => {
    const lines: RaLineInput[] = boq
      .filter((b) => (Number(qty[b.id]) || 0) > 0)
      .map((b) => ({ boq_item_id: b.id, description: b.description, unit: b.unit, qty: Number(qty[b.id]), rate: Number(b.agreed_rate) }));
    if (!lines.length) return toast.error("Enter a measured quantity on at least one item");
    if (overCeiling) return toast.error("This bill would exceed the work-order ceiling");
    try {
      const bill = await create.mutateAsync({ work_order_id: woId, lines, created_by: employee?.id ?? null });
      toast.success(`Raised ${bill.ra_no} · ${inr(bill.gross)} (${bill.pct_utilised}% of WO)`);
      reset();
    } catch (err) {
      const m = err instanceof Error ? err.message : "Could not raise RA bill";
      toast.error(/ceiling/i.test(m) ? "RA bill exceeds the work-order ceiling" : m);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Work order (measured track)</Label>
        <Select value={woId} onChange={(e) => { setWoId(e.target.value); setQty({}); }}>
          <option value="">— Select —</option>
          {measuredWOs.map((w) => <option key={w.id} value={w.id}>{w.wo_no} · {cName(w.contractor_profile_id)} · {pName(w.project_id)}</option>)}
        </Select>
        {measuredWOs.length === 0 && <p className="text-xs text-muted-foreground">No measured work orders yet.</p>}
      </div>

      {woId && (
        <>
          {/* Ceiling bar */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">WO value</span><span className="font-medium">{inr(woValue)}</span>
              </div>
              <div className="h-2 rounded bg-muted overflow-hidden">
                <div className={`h-full ${overCeiling ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, woValue ? (projected / woValue) * 100 : 0)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Billed so far {inr(priorCumulative)}</span>
                <span>This bill {inr(billGross)} → {inr(projected)} {woValue ? `(${Math.round((projected / woValue) * 100)}%)` : ""}</span>
              </div>
              {overCeiling && <p className="flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3 w-3" /> Exceeds WO ceiling — reduce quantities.</p>}
            </CardContent>
          </Card>

          {/* BOQ lines */}
          <Card>
            <CardHeader><CardTitle className="text-base">Measured quantities (rates locked from BOQ)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {boq.length === 0 ? <p className="text-sm text-muted-foreground">This work order has no BOQ items.</p> : boq.map((b) => {
                const q = Number(qty[b.id]) || 0;
                return (
                  <div key={b.id} className="grid grid-cols-12 gap-2 items-center text-sm">
                    <div className="col-span-5">
                      <div className="font-medium text-foreground">{b.description}</div>
                      <div className="text-xs text-muted-foreground">{inr(Number(b.agreed_rate))}/{b.unit ?? "unit"} · BOQ qty {b.total_qty}</div>
                    </div>
                    <Input className="col-span-3" type="number" placeholder="Qty this bill" value={qty[b.id] ?? ""} onChange={(e) => setQty({ ...qty, [b.id]: e.target.value })} />
                    <div className="col-span-4 text-right font-medium">{inr(q * Number(b.agreed_rate))}</div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm font-medium">Bill gross</span><span className="font-semibold">{inr(billGross)}</span>
              </div>
              <Button onClick={submit} disabled={create.isPending || overCeiling || billGross <= 0}>
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} Raise RA bill
              </Button>
            </CardContent>
          </Card>

          {/* History */}
          {bills.length > 0 && (
            <Card>
              <CardContent className="p-0 divide-y divide-border">
                {bills.map((b) => (
                  <div key={b.id} className="flex items-center justify-between px-5 py-2 text-sm">
                    <span className="font-medium">{b.ra_no}</span>
                    <span className="text-muted-foreground">{inr(Number(b.gross))} · cum {inr(Number(b.cumulative))} ({b.pct_utilised}%)</span>
                    <Badge variant="outline">{b.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- Wage sheets ----------------
function WageSheetsTab() {
  const { employee } = useAuth();
  const { data: projects = [] } = useProjects();
  const { data: contractors = [] } = useContractors();
  const create = useCreateWageSheet();

  const [projectId, setProjectId] = useState("");
  const [contractorId, setContractorId] = useState("");
  const [start, setStart] = useState(daysAgoStr(7));
  const [end, setEnd] = useState(todayStr());
  const [loaded, setLoaded] = useState(false);
  const [rate, setRate] = useState("600");

  const labour = contractors.filter((c) => c.type === "labour" && c.status === "active");
  const contractor = contractors.find((c) => c.id === contractorId);
  const isDirect = contractor?.labour_engagement === "direct";
  const { data: workers = [] } = useWorkers(isDirect ? contractorId : null);
  const wName = (id: string) => workers.find((w) => w.id === id)?.name ?? "Worker";

  const att = useWageAttendance(projectId, contractorId, start, end, loaded);
  const { data: sheets = [] } = useWageSheets(projectId || null);

  const directGross = att.data?.perWorker.reduce((s, w) => s + w.amount, 0) ?? 0;
  const directManDays = att.data?.perWorker.reduce((s, w) => s + w.man_days, 0) ?? 0;
  const gangManDays = att.data?.gangManDays ?? 0;
  const gangGross = gangManDays * (Number(rate) || 0);

  const generate = async () => {
    if (!projectId || !contractorId) return toast.error("Pick project and contractor");
    try {
      if (isDirect) {
        if (!att.data?.perWorker.length) return toast.error("No attendance found in this period");
        const lines: WageLineInput[] = att.data.perWorker.map((w) => ({ worker_id: w.worker_id, worker_name: wName(w.worker_id), man_days: w.man_days, rate: w.rate, amount: w.amount }));
        const ws = await create.mutateAsync({ project_id: projectId, contractor_profile_id: contractorId, period_start: start, period_end: end, total_man_days: directManDays, rate: null, gross: directGross, lines, created_by: employee?.id ?? null });
        toast.success(`Generated ${ws.wage_no} · ${inr(directGross)}`);
      } else {
        if (gangManDays <= 0) return toast.error("No attendance found in this period");
        const ws = await create.mutateAsync({ project_id: projectId, contractor_profile_id: contractorId, period_start: start, period_end: end, total_man_days: gangManDays, rate: Number(rate) || 0, gross: gangGross, lines: [{ worker_id: "", worker_name: "Gang", man_days: gangManDays, rate: Number(rate) || 0, amount: gangGross }], created_by: employee?.id ?? null });
        toast.success(`Generated ${ws.wage_no} · ${inr(gangGross)}`);
      }
      setLoaded(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate wage sheet");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Project</Label>
              <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setLoaded(false); }}>
                <option value="">— Select —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Labour contractor</Label>
              <Select value={contractorId} onChange={(e) => { setContractorId(e.target.value); setLoaded(false); }}>
                <option value="">— Select —</option>
                {labour.map((c) => <option key={c.id} value={c.id}>{c.display_name} ({c.labour_engagement ?? "—"})</option>)}
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Period start</Label><Input type="date" value={start} onChange={(e) => { setStart(e.target.value); setLoaded(false); }} /></div>
            <div className="space-y-1.5"><Label>Period end</Label><Input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setLoaded(false); }} /></div>
          </div>
          <Button variant="outline" onClick={() => setLoaded(true)} disabled={!projectId || !contractorId}>Load attendance</Button>
        </CardContent>
      </Card>

      {loaded && (
        <Card>
          <CardHeader><CardTitle className="text-base">Wage for {start} → {end}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {att.isFetching ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : isDirect ? (
              (att.data?.perWorker.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No confirmed attendance for this contractor in the period.</p> : (
                <>
                  {att.data!.perWorker.map((w) => (
                    <div key={w.worker_id} className="flex justify-between text-sm">
                      <span>{wName(w.worker_id)} · {w.man_days} man-days × {inr(w.rate)}</span>
                      <span className="font-medium">{inr(w.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-border font-semibold"><span>Gross ({directManDays} man-days)</span><span>{inr(directGross)}</span></div>
                </>
              )
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span>{gangManDays} man-days × rate</span>
                  <Input type="number" className="w-28" value={rate} onChange={(e) => setRate(e.target.value)} />
                </div>
                <div className="flex justify-between pt-2 border-t border-border font-semibold"><span>Gross</span><span>{inr(gangGross)}</span></div>
              </>
            )}
            <Button onClick={generate} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} Generate wage sheet
            </Button>
          </CardContent>
        </Card>
      )}

      {sheets.length > 0 && (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {sheets.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-2 text-sm">
                <span className="font-medium">{s.wage_no}</span>
                <span className="text-muted-foreground">{s.period_start}→{s.period_end} · {s.total_man_days} md · {inr(Number(s.gross))}</span>
                <Badge variant="outline">{s.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

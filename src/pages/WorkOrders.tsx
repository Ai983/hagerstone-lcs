import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  useContractors,
  useProjects,
  useWorkOrders,
  useCreateWorkOrder,
  useLcsConfig,
} from "@/lib/masters";
import { canManageOps, type BoqItem, type WorkOrderTrack } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, X, Loader2, Trash2, AlertTriangle } from "lucide-react";

const blankBoq = (): BoqItem => ({ description: "", unit: "", agreed_rate: 0, total_qty: 0 });

export default function WorkOrders() {
  const { employee, role } = useAuth();
  const canManage = canManageOps(role);
  const { data: workOrders = [], isLoading } = useWorkOrders();
  const { data: contractors = [] } = useContractors();
  const { data: projects = [] } = useProjects();
  const { data: config } = useLcsConfig();
  const create = useCreateWorkOrder();

  const defaultRetention = useMemo(() => {
    const r = config?.default_retention_pct as { civil_mep?: number } | undefined;
    return r?.civil_mep ?? 10;
  }, [config]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    contractor_profile_id: "",
    project_id: "",
    track: "measured" as WorkOrderTrack,
    scope: "",
    wo_value: "",
    retention_pct: defaultRetention,
    advance_pct: 0,
    dlp_months: Number(config?.dlp_default_months ?? 12),
  });
  const [boq, setBoq] = useState<BoqItem[]>([blankBoq()]);

  const contractorName = (id: string) => contractors.find((c) => c.id === id)?.display_name ?? id;
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const verifiedContractors = contractors.filter((c) => c.bank_verified && c.status === "active");
  const selectedContractor = contractors.find((c) => c.id === form.contractor_profile_id);

  const reset = () => {
    setForm({ contractor_profile_id: "", project_id: "", track: "measured", scope: "", wo_value: "", retention_pct: defaultRetention, advance_pct: 0, dlp_months: Number(config?.dlp_default_months ?? 12) });
    setBoq([blankBoq()]);
    setOpen(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contractor_profile_id) return toast.error("Select a contractor");
    if (!form.project_id) return toast.error("Select a project");
    if (selectedContractor && !selectedContractor.bank_verified) return toast.error("Contractor must be bank-verified first");
    try {
      const created = await create.mutateAsync({
        wo: {
          contractor_profile_id: form.contractor_profile_id,
          project_id: form.project_id,
          track: form.track,
          scope: form.scope.trim() || null,
          wo_value: Number(form.wo_value) || 0,
          retention_pct: Number(form.retention_pct) || 0,
          advance_pct: Number(form.advance_pct) || 0,
          dlp_months: Number(form.dlp_months) || 12,
          status: "active",
          created_by: employee?.id ?? null,
        },
        boq: form.track === "measured" ? boq : [],
      });
      toast.success(`Work order ${created.wo_no} raised`);
      reset();
    } catch (err) {
      // DB trigger message (bank-verification gate) surfaces here verbatim.
      toast.error(err instanceof Error ? err.message : "Could not raise work order");
    }
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Work Orders</h1>
            <p className="text-sm text-muted-foreground mt-1">Raise a WO against a project for a bank-verified contractor. WO number is auto-assigned (HI-LWO-YYYY-NNNN).</p>
          </div>
          {canManage && !open && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Raise work order</Button>}
        </div>

        {open && canManage && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>New work order</CardTitle>
              <Button variant="ghost" size="icon" onClick={reset}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                {verifiedContractors.length === 0 && (
                  <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4" /> No bank-verified contractors yet — verify one on the Contractors page first.
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Contractor (bank-verified only)</Label>
                    <Select
                      value={form.contractor_profile_id}
                      onChange={(e) => {
                        const c = contractors.find((x) => x.id === e.target.value);
                        // pre-fill retention from the chosen contractor's default
                        setForm({
                          ...form,
                          contractor_profile_id: e.target.value,
                          retention_pct: c ? Number(c.default_retention_pct) : form.retention_pct,
                        });
                      }}
                    >
                      <option value="">— Select —</option>
                      {verifiedContractors.map((c) => <option key={c.id} value={c.id}>{c.display_name} ({c.type})</option>)}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Project</Label>
                    <Select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                      <option value="">— Select —</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Track</Label>
                    <Select value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value as WorkOrderTrack })}>
                      <option value="measured">Measured (agency · RA bills)</option>
                      <option value="attendance">Attendance (daily-wage labour)</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>WO value (₹)</Label>
                    <Input type="number" value={form.wo_value} onChange={(e) => setForm({ ...form, wo_value: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Retention %</Label>
                    <Input type="number" step="0.1" value={form.retention_pct} onChange={(e) => setForm({ ...form, retention_pct: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Advance %</Label>
                    <Input type="number" step="0.1" value={form.advance_pct} onChange={(e) => setForm({ ...form, advance_pct: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>DLP (months)</Label>
                    <Input type="number" value={form.dlp_months} onChange={(e) => setForm({ ...form, dlp_months: Number(e.target.value) })} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Scope</Label>
                  <Textarea value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} placeholder="Brief scope of work…" />
                </div>

                {/* BOQ items for measured track */}
                {form.track === "measured" && (
                  <div className="rounded-md border border-border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>BOQ line items (locked rates)</Label>
                      <Button type="button" variant="outline" size="sm" onClick={() => setBoq([...boq, blankBoq()])}><Plus className="h-3.5 w-3.5" /> Add row</Button>
                    </div>
                    {boq.map((b, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <Input className="col-span-5" placeholder="Description" value={b.description} onChange={(e) => setBoq(boq.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                        <Input className="col-span-2" placeholder="Unit" value={b.unit ?? ""} onChange={(e) => setBoq(boq.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
                        <Input className="col-span-2" type="number" placeholder="Rate" value={b.agreed_rate} onChange={(e) => setBoq(boq.map((x, j) => j === i ? { ...x, agreed_rate: Number(e.target.value) } : x))} />
                        <Input className="col-span-2" type="number" placeholder="Qty" value={b.total_qty} onChange={(e) => setBoq(boq.map((x, j) => j === i ? { ...x, total_qty: Number(e.target.value) } : x))} />
                        <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => setBoq(boq.length > 1 ? boq.filter((_, j) => j !== i) : boq)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button type="submit" disabled={create.isPending || verifiedContractors.length === 0}>
                    {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Raise work order
                  </Button>
                  <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
            ) : workOrders.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No work orders yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {workOrders.map((wo) => (
                  <div key={wo.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{wo.wo_no}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {contractorName(wo.contractor_profile_id)} · {projectName(wo.project_id)} · ₹{Number(wo.wo_value).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary">{wo.track}</Badge>
                      <Badge variant="outline">{wo.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

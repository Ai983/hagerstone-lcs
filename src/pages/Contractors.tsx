import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { WorkersPanel } from "@/components/WorkersPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useContractors, useCreateContractor, useSupplierSearch } from "@/lib/masters";
import { canManageOps, type ContractorType, type LabourEngagement, type SupplierOption } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Link2, X, Loader2, ShieldCheck, Search, ChevronDown, ChevronRight, Users } from "lucide-react";

const empty = {
  type: "agency" as ContractorType,
  labour_engagement: "thekedar" as LabourEngagement,
  name: "",
  phone: "",
  gstin: "",
  pan: "",
  bank_name: "",
  bank_account_number: "",
  bank_account_holder_name: "",
  bank_ifsc: "",
  default_retention_pct: 10,
  bank_verified: false,
};

export default function Contractors() {
  const { employee, role } = useAuth();
  const canManage = canManageOps(role);
  const { data: contractors = [], isLoading } = useContractors();
  const create = useCreateContractor();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [linkedSupplier, setLinkedSupplier] = useState<SupplierOption | null>(null);
  const [supplierTerm, setSupplierTerm] = useState("");
  const { data: supplierResults = [], isFetching } = useSupplierSearch(supplierTerm);
  const [expanded, setExpanded] = useState<string | null>(null);

  const linked = !!linkedSupplier;

  const reset = () => {
    setForm({ ...empty });
    setLinkedSupplier(null);
    setSupplierTerm("");
    setOpen(false);
  };

  const linkSupplier = (s: SupplierOption) => {
    setLinkedSupplier(s);
    setForm((f) => ({
      ...f,
      name: s.name ?? "",
      phone: s.phone ?? f.phone,
      gstin: s.gstin ?? "",
      pan: s.pan ?? "",
      bank_name: s.bank_name ?? "",
      bank_account_holder_name: s.bank_account_holder_name ?? "",
      bank_account_number: s.bank_account_number ?? "",
      bank_ifsc: s.bank_ifsc ?? "",
    }));
    setSupplierTerm("");
  };

  // Lock a field only when the linked supplier actually has that value;
  // suppliers with no bank/contact data stay editable so they can be completed.
  const locked = (val: string | null | undefined) => linked && !!val && !!String(val).trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Mandatory fields (so we can actually identify + pay the contractor).
    const missing: string[] = [];
    if (!form.name.trim()) missing.push("name");
    if (!form.phone.trim()) missing.push("phone");
    if (!form.bank_name.trim()) missing.push("bank name");
    if (!form.bank_account_holder_name.trim()) missing.push("account holder");
    if (!form.bank_account_number.trim()) missing.push("account number");
    if (!form.bank_ifsc.trim()) missing.push("IFSC");
    if (missing.length) {
      toast.error(`Please fill: ${missing.join(", ")}`);
      return;
    }
    try {
      await create.mutateAsync({
        type: form.type,
        labour_engagement: form.type === "labour" ? form.labour_engagement : null,
        supplier_ref: linkedSupplier?.id ?? null,
        name: form.name.trim() || null,
        phone: form.phone.trim() || null,
        gstin: form.gstin.trim() || null,
        pan: form.pan.trim() || null,
        bank_name: form.bank_name.trim() || null,
        bank_account_number: form.bank_account_number.trim() || null,
        bank_account_holder_name: form.bank_account_holder_name.trim() || null,
        bank_ifsc: form.bank_ifsc.trim() || null,
        default_retention_pct: Number(form.default_retention_pct) || 0,
        bank_verified: form.bank_verified,
        kyc_status: form.bank_verified ? "verified" : "pending",
        created_by: employee?.id ?? null,
      });
      toast.success("Contractor onboarded");
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save contractor");
    }
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Contractors</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Onboard agencies & labour groups. A contractor must be <strong>bank-verified</strong> before a work order can be raised.
            </p>
          </div>
          {canManage && !open && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add contractor</Button>}
        </div>

        {open && canManage && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>New contractor</CardTitle>
              <Button variant="ghost" size="icon" onClick={reset}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-5">
                {/* Optional supplier link → auto-fills + locks identity/bank-routing */}
                <div className="rounded-md border border-dashed border-border p-3 space-y-2">
                  <Label className="flex items-center gap-1.5 text-xs"><Link2 className="h-3.5 w-3.5" /> Link to an existing CPS supplier (optional — auto-fills details)</Label>
                  {linkedSupplier ? (
                    <div className="flex items-center justify-between rounded bg-muted px-3 py-2 text-sm">
                      <span>{linkedSupplier.name} {linkedSupplier.gstin ? `· ${linkedSupplier.gstin}` : ""}{linkedSupplier.bank_account_last4 ? ` · a/c …${linkedSupplier.bank_account_last4}` : ""}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setLinkedSupplier(null)}>Unlink</Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search suppliers by name…" value={supplierTerm} onChange={(e) => setSupplierTerm(e.target.value)} />
                        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      </div>
                      {supplierResults.length > 0 && (
                        <div className="mt-1 max-h-44 overflow-auto rounded-md border border-border bg-popover">
                          {supplierResults.map((s) => (
                            <button key={s.id} type="button" onClick={() => linkSupplier(s)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent">
                              <span>{s.name}</span>
                              <span className="text-xs text-muted-foreground">{s.city ?? ""}{s.bank_account_last4 ? ` · …${s.bank_account_last4}` : ""}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ContractorType })}>
                      <option value="agency">Agency / sub-contractor (measured)</option>
                      <option value="labour">Labour (attendance)</option>
                    </Select>
                  </div>
                  {form.type === "labour" && (
                    <div className="space-y-1.5">
                      <Label>Labour engagement</Label>
                      <Select value={form.labour_engagement} onChange={(e) => setForm({ ...form, labour_engagement: e.target.value as LabourEngagement })}>
                        <option value="thekedar">Thekedar — we pay the contractor (gang)</option>
                        <option value="direct">Direct — we pay each worker</option>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Name *</Label>
                    <Input value={form.name} disabled={locked(linkedSupplier?.name)} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sharma Civil Works" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone *</Label>
                    <Input value={form.phone} disabled={locked(linkedSupplier?.phone)} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>GSTIN</Label>
                    <Input value={form.gstin} disabled={locked(linkedSupplier?.gstin)} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>PAN</Label>
                    <Input value={form.pan} disabled={locked(linkedSupplier?.pan)} onChange={(e) => setForm({ ...form, pan: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Default retention %</Label>
                    <Input type="number" step="0.1" value={form.default_retention_pct} onChange={(e) => setForm({ ...form, default_retention_pct: Number(e.target.value) })} />
                  </div>
                </div>

                {/* Bank details + human verification gate */}
                <div className="rounded-md border border-border p-3 space-y-4">
                  {linked && <p className="text-xs text-muted-foreground">Auto-filled from the linked supplier where CPS has the data; complete any blank fields. A human must still tick "verified".</p>}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Bank name *</Label>
                      <Input value={form.bank_name} disabled={locked(linkedSupplier?.bank_name)} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Account holder *</Label>
                      <Input value={form.bank_account_holder_name} disabled={locked(linkedSupplier?.bank_account_holder_name)} onChange={(e) => setForm({ ...form, bank_account_holder_name: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Account number *</Label>
                      <Input value={form.bank_account_number} disabled={locked(linkedSupplier?.bank_account_number)} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>IFSC *</Label>
                      <Input value={form.bank_ifsc} disabled={locked(linkedSupplier?.bank_ifsc)} onChange={(e) => setForm({ ...form, bank_ifsc: e.target.value })} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.bank_verified} onChange={(e) => setForm({ ...form, bank_verified: e.target.checked })} className="h-4 w-4" />
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Bank details verified by a human (required before any work order)
                  </label>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={create.isPending}>
                    {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save contractor
                  </Button>
                  <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* List */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
            ) : contractors.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No contractors yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {contractors.map((c) => {
                  const isLabour = c.type === "labour";
                  const isOpen = expanded === c.id;
                  return (
                    <div key={c.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          className="flex items-center gap-2 min-w-0 text-left"
                          onClick={() => isLabour && setExpanded(isOpen ? null : c.id)}
                        >
                          {isLabour ? (isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />) : <span className="w-4" />}
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate">{c.display_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {isLabour ? `Labour · ${c.labour_engagement ?? "—"}` : "Agency"}
                              {c.supplier_ref ? " · linked to CPS" : ""}
                              {c.gstin ? ` · ${c.gstin}` : ""}
                            </div>
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          {isLabour && <Badge variant="outline"><Users className="h-3 w-3 mr-1" />workers</Badge>}
                          {c.bank_verified ? <Badge variant="success">Bank verified</Badge> : <Badge variant="warning">Bank unverified</Badge>}
                          <Badge variant="outline">{c.status}</Badge>
                        </div>
                      </div>
                      {isLabour && isOpen && <WorkersPanel contractorId={c.id} engagement={c.labour_engagement} />}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

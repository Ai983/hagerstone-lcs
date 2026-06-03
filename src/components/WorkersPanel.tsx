import { useState } from "react";
import { useWorkers, useCreateWorker } from "@/lib/masters";
import { useAuth } from "@/contexts/AuthContext";
import { WorkerFields } from "@/components/WorkerFields";
import { canManageOps, emptyWorkerDraft, validateWorkerDraft, workerDraftToRow, type WorkerDraft } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

const blank = { name: "", phone: "", skill: "", day_rate: "" };

/**
 * Manage workers under a labour contractor.
 * - Direct (C): each worker has payment details (cash/UPI/bank) + verify — paid individually.
 * - Thekedar (B): roster is attendance-only (you pay the thekedar's group account).
 */
export function WorkersPanel({ contractorId, engagement }: { contractorId: string; engagement: string | null }) {
  const { employee, role } = useAuth();
  const canManage = canManageOps(role) || role === "site_engineer" || role === "project_manager";
  const { data: workers = [], isLoading } = useWorkers(contractorId);
  const create = useCreateWorker();
  const isDirect = engagement === "direct";

  const [simple, setSimple] = useState({ ...blank }); // thekedar quick-add
  const [draft, setDraft] = useState<WorkerDraft>(emptyWorkerDraft()); // direct full-add

  const addSimple = async () => {
    if (!simple.name.trim()) return toast.error("Worker name is required");
    try {
      await create.mutateAsync({
        contractor_profile_id: contractorId,
        name: simple.name.trim(),
        phone: simple.phone.trim() || null,
        skill: simple.skill.trim() || null,
        day_rate: Number(simple.day_rate) || 0,
        created_by: employee?.id ?? null,
      });
      setSimple({ ...blank });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add worker");
    }
  };

  const addDirect = async () => {
    const bad = validateWorkerDraft(draft);
    if (bad) return toast.error(`Enter ${bad}`);
    try {
      await create.mutateAsync(workerDraftToRow(draft, contractorId, employee?.id ?? null));
      setDraft(emptyWorkerDraft());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add worker");
    }
  };

  return (
    <div className="mt-2 rounded-md bg-muted/40 p-3 space-y-3">
      <div className="text-xs text-muted-foreground">
        {isDirect
          ? "Direct workers — paid individually (man-days × day rate), in cash / UPI / bank."
          : engagement === "thekedar"
          ? "Thekedar gang — you pay the thekedar; roster is for attendance."
          : "Workers in this labour group."}
      </div>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : workers.length === 0 ? (
        <div className="text-xs text-muted-foreground">No workers added yet.</div>
      ) : (
        <div className="divide-y divide-border rounded border border-border bg-background">
          {workers.map((w) => (
            <div key={w.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
              <span>{w.name}{w.skill ? ` · ${w.skill}` : ""}{w.phone ? ` · ${w.phone}` : ""}</span>
              <div className="flex items-center gap-1.5">
                {isDirect && <Badge variant="outline">{w.payment_mode === "bank_transfer" ? "bank" : w.payment_mode}</Badge>}
                {isDirect && (w.payment_verified ? <Badge variant="success">verified</Badge> : <Badge variant="warning">unverified</Badge>)}
                <Badge variant="outline">₹{Number(w.day_rate).toLocaleString("en-IN")}/day</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && !isDirect && (
        <div className="grid grid-cols-12 gap-2">
          <Input className="col-span-4" placeholder="Worker name" value={simple.name} onChange={(e) => setSimple({ ...simple, name: e.target.value })} />
          <Input className="col-span-3" placeholder="Phone" value={simple.phone} onChange={(e) => setSimple({ ...simple, phone: e.target.value })} />
          <Input className="col-span-3" placeholder="Skill (mason…)" value={simple.skill} onChange={(e) => setSimple({ ...simple, skill: e.target.value })} />
          <Input className="col-span-2" type="number" placeholder="₹/day" value={simple.day_rate} onChange={(e) => setSimple({ ...simple, day_rate: e.target.value })} />
          <div className="col-span-12">
            <Button type="button" size="sm" variant="outline" onClick={addSimple} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Add worker
            </Button>
          </div>
        </div>
      )}

      {canManage && isDirect && (
        <div className="rounded-md border border-border bg-background p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Add a worker</div>
          <WorkerFields value={draft} onChange={setDraft} compact />
          <Button type="button" size="sm" variant="outline" onClick={addDirect} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Add worker
          </Button>
        </div>
      )}
    </div>
  );
}

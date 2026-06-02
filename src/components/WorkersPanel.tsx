import { useState } from "react";
import { useWorkers, useCreateWorker } from "@/lib/masters";
import { useAuth } from "@/contexts/AuthContext";
import { canManageOps } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Loader2, UserPlus } from "lucide-react";

const blank = { name: "", phone: "", skill: "", day_rate: "" };

/**
 * Manage the workers under a labour contractor.
 * - Thekedar (B): roster is optional (you pay the thekedar; gang members for reference).
 * - Direct (C): roster matters — you pay each worker man-days × day_rate.
 */
export function WorkersPanel({ contractorId, engagement }: { contractorId: string; engagement: string | null }) {
  const { employee, role } = useAuth();
  const canManage = canManageOps(role) || role === "site_engineer" || role === "project_manager";
  const { data: workers = [], isLoading } = useWorkers(contractorId);
  const create = useCreateWorker();
  const [form, setForm] = useState({ ...blank });

  const add = async () => {
    if (!form.name.trim()) return toast.error("Worker name is required");
    try {
      await create.mutateAsync({
        contractor_profile_id: contractorId,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        skill: form.skill.trim() || null,
        day_rate: Number(form.day_rate) || 0,
        created_by: employee?.id ?? null,
      });
      setForm({ ...blank });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add worker");
    }
  };

  return (
    <div className="mt-2 rounded-md bg-muted/40 p-3 space-y-3">
      <div className="text-xs text-muted-foreground">
        {engagement === "direct"
          ? "Direct workers — paid individually (man-days × day rate)."
          : engagement === "thekedar"
          ? "Thekedar gang — you pay the thekedar; roster is for reference."
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
              <Badge variant="outline">₹{Number(w.day_rate).toLocaleString("en-IN")}/day</Badge>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="grid grid-cols-12 gap-2">
          <Input className="col-span-4" placeholder="Worker name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input className="col-span-3" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input className="col-span-3" placeholder="Skill (mason…)" value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })} />
          <Input className="col-span-2" type="number" placeholder="₹/day" value={form.day_rate} onChange={(e) => setForm({ ...form, day_rate: e.target.value })} />
          <div className="col-span-12">
            <Button type="button" size="sm" variant="outline" onClick={add} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Add worker
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

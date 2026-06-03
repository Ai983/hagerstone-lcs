import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { useProjects } from "@/lib/masters";
import { useMyAssignments, useProjectEvidence, signedEvidenceUrl } from "@/lib/capture";
import { useAiChecks, useRunAiCheck, useResolveAiCheck, gateForKind, type AiCheck } from "@/lib/aichecks";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Sparkles, Check, Flag, Loader2, Image as ImageIcon, CheckCircle2, AlertTriangle } from "lucide-react";

const MANAGER_ROLES = ["admin", "ai", "management", "founder"];

export default function Confirmations() {
  const { employee, role } = useAuth();
  const isManager = !!role && MANAGER_ROLES.includes(role);
  const { data: projects = [] } = useProjects();
  const { data: assignments = [] } = useMyAssignments(employee?.id ?? null);

  const myProjects = useMemo(() => {
    if (isManager) return projects;
    const ids = new Set(assignments.map((a) => a.project_id));
    return projects.filter((p) => ids.has(p.id));
  }, [projects, assignments, isManager]);

  const [projectId, setProjectId] = useState("");
  const { data: evidence = [], isLoading } = useProjectEvidence(projectId || null);
  const { data: checks = [] } = useAiChecks(projectId || null);

  // latest ai_check per evidence id
  const checkByEvidence = useMemo(() => {
    const m = new Map<string, AiCheck>();
    for (const c of checks) if (!m.has(c.entity_id)) m.set(c.entity_id, c); // checks are newest-first
    return m;
  }, [checks]);

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Confirmations</h1>
          <p className="text-sm text-muted-foreground mt-1">AI checks each photo; you confirm with one tap. AI never confirms itself.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Project</Label>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— Select a site —</option>
            {myProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>

        {projectId && (
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
              ) : evidence.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No evidence captured for this site yet.</div>
              ) : (
                <div className="divide-y divide-border">
                  {evidence.map((e) => (
                    <EvidenceRow key={e.id} evidence={e} check={checkByEvidence.get(e.id)} projectId={projectId} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function EvidenceRow({ evidence, check, projectId }: { evidence: { id: string; kind: string; file_path: string; note: string | null; geo_lat: number | null }; check?: AiCheck; projectId: string }) {
  const { employee } = useAuth();
  const run = useRunAiCheck();
  const resolve = useResolveAiCheck();
  const gate = gateForKind(evidence.kind);

  const view = async () => {
    const url = await signedEvidenceUrl(evidence.file_path);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open photo");
  };

  const runCheck = async () => {
    try {
      await run.mutateAsync({ gate, entity_id: evidence.id, projectId, claim: evidence.note ?? undefined });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI check failed");
    }
  };

  const confirm = async () => {
    if (!check) return;
    await resolve.mutateAsync({ id: check.id, projectId, employeeId: employee?.id ?? null });
    toast.success("Confirmed");
  };
  const flag = async () => {
    if (!check) return;
    const reason = window.prompt("Reason for flagging this (logged)?");
    if (!reason) return;
    await resolve.mutateAsync({ id: check.id, projectId, employeeId: employee?.id ?? null, flagReason: reason });
    toast.success("Flagged — needs resolution");
  };

  return (
    <div className="px-5 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <button onClick={view} className="flex items-center gap-2 min-w-0 text-left">
          <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="font-medium text-foreground">{evidence.kind}</span>
            {evidence.note ? <span className="text-muted-foreground"> · {evidence.note}</span> : ""}
            {evidence.geo_lat ? <span className="text-muted-foreground"> · 📍</span> : ""}
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {!check && (
            <Button size="sm" variant="outline" onClick={runCheck} disabled={run.isPending}>
              {run.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} AI check ({gate})
            </Button>
          )}
        </div>
      </div>

      {check && (
        <div className="rounded-md bg-muted/40 p-3 text-sm space-y-2">
          <div className="flex items-center gap-2">
            {check.passed ? (
              <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" /> AI: checked</Badge>
            ) : (
              <Badge variant="warning"><AlertTriangle className="h-3 w-3 mr-1" /> needs a look</Badge>
            )}
            {check.confidence != null && <span className="text-xs text-muted-foreground">{check.confidence}% confidence</span>}
            {check.confirmed_at && <Badge variant="secondary">confirmed</Badge>}
            {check.human_corrected && <Badge variant="destructive">flagged</Badge>}
          </div>
          {check.confidence_reason && <p className="text-xs text-muted-foreground">{check.confidence_reason}</p>}
          <ResultSummary check={check} />
          {check.flags?.length > 0 && (
            <div className="flex flex-wrap gap-1">{check.flags.map((f, i) => <Badge key={i} variant="warning">{f}</Badge>)}</div>
          )}
          {!check.confirmed_at && !check.human_corrected && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={confirm} disabled={resolve.isPending}><Check className="h-3.5 w-3.5" /> Confirm</Button>
              <Button size="sm" variant="outline" onClick={flag} disabled={resolve.isPending}><Flag className="h-3.5 w-3.5" /> Flag</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultSummary({ check }: { check: AiCheck }) {
  const r = check.result ?? {};
  if (check.gate === "attendance" && typeof r.headcount_estimate === "number")
    return <p className="text-sm text-foreground">AI counts <strong>{r.headcount_estimate as number}</strong> worker(s) in the photo.</p>;
  if (check.gate === "G1" && typeof r.consistent === "boolean")
    return <p className="text-sm text-foreground">Photo {r.consistent ? "appears consistent" : "does NOT clearly match"} the claim. {(r.observations as string) ?? ""}</p>;
  if (check.gate === "G2" && Array.isArray(r.line_items))
    return <p className="text-sm text-foreground">Read <strong>{(r.line_items as unknown[]).length}</strong> measurement line(s).</p>;
  return null;
}

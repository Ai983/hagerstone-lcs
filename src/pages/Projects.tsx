import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  useProjects,
  useCreateProject,
  useEmployees,
  useCpsProjects,
  useImportProjects,
  useUpdateProject,
} from "@/lib/masters";
import { canManageProjects } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, X, Loader2, DownloadCloud, Pencil, Check } from "lucide-react";

const empty = { name: "", client: "", location: "", budget: "", design_pm_employee_id: "", project_head_employee_id: "" };

export default function Projects() {
  const { employee, role } = useAuth();
  const canManage = canManageProjects(role);
  const { data: projects = [], isLoading } = useProjects();
  const { data: employees = [] } = useEmployees();
  const { data: cpsProjects = [] } = useCpsProjects();
  const create = useCreateProject();
  const importProjects = useImportProjects();
  const updateProject = useUpdateProject();

  const [open, setOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);

  const empName = (id: string | null) => employees.find((e) => e.id === id)?.name ?? "—";
  const aiTeam = useMemo(
    () => employees.find((e) => e.name === "AI Team" || (e.email ?? "").toLowerCase() === "admin@hagerstone.com"),
    [employees]
  );
  const existingNames = useMemo(() => new Set(projects.map((p) => p.name.trim().toLowerCase())), [projects]);
  const importable = cpsProjects.filter((c) => c.name && c.name.toLowerCase() !== "test project" && !existingNames.has(c.name.trim().toLowerCase()));

  const reset = () => { setForm({ ...empty }); setOpen(false); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Project name is required"); return; }
    try {
      await create.mutateAsync({
        name: form.name.trim(),
        client: form.client.trim() || null,
        location: form.location.trim() || null,
        budget: form.budget ? Number(form.budget) : null,
        design_pm_employee_id: form.design_pm_employee_id || aiTeam?.id || null,
        project_head_employee_id: form.project_head_employee_id || aiTeam?.id || null,
        created_by: employee?.id ?? null,
      });
      toast.success("Project created");
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create project");
    }
  };

  const runImport = async () => {
    const rows = importable
      .filter((c) => picked.has(c.id))
      .map((c) => ({
        name: c.name,
        location: c.site_address ?? null,
        design_pm_employee_id: aiTeam?.id ?? null,
        project_head_employee_id: aiTeam?.id ?? null,
        created_by: employee?.id ?? null,
      }));
    if (!rows.length) { toast.error("Select at least one project"); return; }
    try {
      await importProjects.mutateAsync(rows);
      toast.success(`Imported ${rows.length} project${rows.length > 1 ? "s" : ""} (PM/head = AI Team)`);
      setPicked(new Set());
      setShowImport(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  const pmOptions = employees.filter((e) => ["project_manager", "site_engineer", "management", "admin", "ai"].includes(e.role ?? ""));
  const headOptions = employees.filter((e) => ["management", "founder", "admin", "ai"].includes(e.role ?? ""));

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">Sites that work orders are raised against.</p>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowImport((v) => !v)}><DownloadCloud className="h-4 w-4" /> Import from CPS</Button>
              {!open && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add project</Button>}
            </div>
          )}
        </div>

        {/* Import from CPS */}
        {showImport && canManage && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Import projects from CPS</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowImport(false)}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {importable.length === 0
                  ? "All CPS projects are already imported."
                  : `Tick projects to copy into LCS. Design PM and Project head will be set to ${aiTeam?.name ?? "AI Team"} (you can change them below afterwards).`}
              </p>
              <div className="divide-y divide-border rounded border border-border">
                {importable.map((c) => (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={picked.has(c.id)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        e.target.checked ? next.add(c.id) : next.delete(c.id);
                        setPicked(next);
                      }}
                    />
                    <span className="flex-1">
                      <span className="font-medium text-foreground">{c.name}</span>
                      {c.site_address ? <span className="text-muted-foreground"> · {c.site_address}</span> : ""}
                    </span>
                  </label>
                ))}
              </div>
              {importable.length > 0 && (
                <Button onClick={runImport} disabled={importProjects.isPending}>
                  {importProjects.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />} Import {picked.size || ""} selected
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {open && canManage && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>New project</CardTitle>
              <Button variant="ghost" size="icon" onClick={reset}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Project name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. DLF Office Fit-out" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Client</Label>
                    <Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Location</Label>
                    <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Budget (₹)</Label>
                    <Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Design PM</Label>
                    <Select value={form.design_pm_employee_id} onChange={(e) => setForm({ ...form, design_pm_employee_id: e.target.value })}>
                      <option value="">AI Team (default)</option>
                      {pmOptions.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Project head</Label>
                    <Select value={form.project_head_employee_id} onChange={(e) => setForm({ ...form, project_head_employee_id: e.target.value })}>
                      <option value="">AI Team (default)</option>
                      {headOptions.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={create.isPending}>
                    {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save project
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
            ) : projects.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No projects yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {projects.map((p) => (
                  <div key={p.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[p.client, p.location].filter(Boolean).join(" · ") || "—"} · PM: {empName(p.design_pm_employee_id)} · Head: {empName(p.project_head_employee_id)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline">{p.status}</Badge>
                        {canManage && (
                          <Button variant="ghost" size="icon" onClick={() => setEditing(editing === p.id ? null : p.id)}><Pencil className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </div>
                    {editing === p.id && canManage && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 rounded-md bg-muted/40 p-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Design PM</Label>
                          <Select
                            defaultValue={p.design_pm_employee_id ?? ""}
                            onChange={(e) => updateProject.mutate({ id: p.id, patch: { design_pm_employee_id: e.target.value || null } })}
                          >
                            <option value="">— None —</option>
                            {pmOptions.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Project head</Label>
                          <Select
                            defaultValue={p.project_head_employee_id ?? ""}
                            onChange={(e) => updateProject.mutate({ id: p.id, patch: { project_head_employee_id: e.target.value || null } })}
                          >
                            <option value="">— None —</option>
                            {headOptions.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
                          </Select>
                        </div>
                        <div className="sm:col-span-2">
                          <Button size="sm" variant="outline" onClick={() => setEditing(null)}><Check className="h-3.5 w-3.5" /> Done</Button>
                        </div>
                      </div>
                    )}
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

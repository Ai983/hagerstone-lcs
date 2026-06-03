import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { useProjects, useContractors, useWorkers } from "@/lib/masters";
import {
  useMyAssignments,
  useTodayAttendance,
  useTodayEvidence,
  useMarkAttendance,
  useUploadEvidence,
  useSaveDpr,
} from "@/lib/capture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Camera, Users, NotebookPen, Loader2, Check, MapPin } from "lucide-react";

const MANAGER_ROLES = ["admin", "ai", "management", "founder"];
const todayStr = () => new Date().toISOString().slice(0, 10);
const startOfTodayIso = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

export default function Capture() {
  const { employee, role } = useAuth();
  const isManager = !!role && MANAGER_ROLES.includes(role);
  const { data: projects = [] } = useProjects();
  const { data: assignments = [] } = useMyAssignments(employee?.id ?? null);
  const { data: contractors = [] } = useContractors();

  const myProjects = useMemo(() => {
    if (isManager) return projects;
    const ids = new Set(assignments.map((a) => a.project_id));
    return projects.filter((p) => ids.has(p.id));
  }, [projects, assignments, isManager]);

  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState<"attendance" | "photo" | "dpr">("attendance");
  const day = todayStr();

  const { data: todayAtt = [] } = useTodayAttendance(projectId || null, day);
  const { data: todayEv = [] } = useTodayEvidence(projectId || null, startOfTodayIso());

  const projName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const contrName = (id: string) => contractors.find((c) => c.id === id)?.display_name ?? id;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Capture</h1>
          <p className="text-sm text-muted-foreground mt-1">Today's site — mark attendance, add photos, log progress.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Today's site</Label>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— Select your site —</option>
            {myProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          {!isManager && myProjects.length === 0 && (
            <p className="text-xs text-amber-700">You're not assigned to any project yet. Ask your manager to assign you (Projects → Assign staff).</p>
          )}
        </div>

        {projectId && (
          <>
            {/* segmented control */}
            <div className="grid grid-cols-3 gap-2">
              {([["attendance", "Attendance", Users], ["photo", "Photo", Camera], ["dpr", "Progress", NotebookPen]] as const).map(
                ([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm ${tab === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                )
              )}
            </div>

            {tab === "attendance" && <AttendanceTab projectId={projectId} day={day} />}
            {tab === "photo" && <PhotoTab projectId={projectId} />}
            {tab === "dpr" && <DprTab projectId={projectId} day={day} />}

            {/* Today's captures */}
            <Card>
              <CardHeader><CardTitle className="text-base">Today on {projName(projectId)}</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Attendance</div>
                  {todayAtt.length === 0 ? <p className="text-muted-foreground">None yet.</p> : todayAtt.map((a) => (
                    <div key={a.id} className="flex justify-between py-0.5">
                      <span>{contrName(a.contractor_profile_id)}</span>
                      <span className="text-muted-foreground">{a.headcount} present · {a.man_days} man-days</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Photos / evidence</div>
                  {todayEv.length === 0 ? <p className="text-muted-foreground">None yet.</p> : (
                    <div className="flex flex-wrap gap-2">
                      {todayEv.map((e) => <Badge key={e.id} variant="outline">{e.kind}{e.geo_lat ? " 📍" : ""}</Badge>)}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

// ---------------- Attendance ----------------
function AttendanceTab({ projectId, day }: { projectId: string; day: string }) {
  const { employee } = useAuth();
  const { data: contractors = [] } = useContractors();
  const mark = useMarkAttendance();
  const labour = contractors.filter((c) => c.type === "labour" && c.status === "active");

  const [contractorId, setContractorId] = useState("");
  const selected = contractors.find((c) => c.id === contractorId);
  const isDirect = selected?.labour_engagement === "direct";

  const { data: workers = [] } = useWorkers(isDirect ? contractorId : null);
  const [present, setPresent] = useState<Record<string, number>>({}); // worker_id -> man_day
  const [headcount, setHeadcount] = useState("");
  const [manDays, setManDays] = useState("");

  const togglePresent = (id: string) => setPresent((p) => { const n = { ...p }; if (n[id] != null) delete n[id]; else n[id] = 1; return n; });

  const submit = async () => {
    if (!contractorId) return toast.error("Select a contractor");
    try {
      if (isDirect) {
        const lines = workers.filter((w) => present[w.id] != null).map((w) => ({ worker_id: w.id, man_day: present[w.id], day_rate: Number(w.day_rate) || 0 }));
        if (!lines.length) return toast.error("Tick at least one present worker");
        await mark.mutateAsync({
          project_id: projectId, contractor_profile_id: contractorId, work_date: day,
          headcount: lines.length, man_days: lines.reduce((s, l) => s + l.man_day, 0),
          created_by: employee?.id ?? null, lines,
        });
      } else {
        if (!headcount) return toast.error("Enter headcount");
        await mark.mutateAsync({
          project_id: projectId, contractor_profile_id: contractorId, work_date: day,
          headcount: Number(headcount), man_days: Number(manDays || headcount),
          created_by: employee?.id ?? null,
        });
      }
      toast.success("Attendance marked");
      setContractorId(""); setPresent({}); setHeadcount(""); setManDays("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not mark attendance";
      toast.error(/duplicate|unique/i.test(msg) ? "Attendance already marked for this contractor today" : msg);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Mark attendance · {day}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Labour contractor</Label>
          <Select value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
            <option value="">— Select —</option>
            {labour.map((c) => <option key={c.id} value={c.id}>{c.display_name} ({c.labour_engagement ?? "—"})</option>)}
          </Select>
          {labour.length === 0 && <p className="text-xs text-muted-foreground">No labour contractors yet — add one on the Contractors page.</p>}
        </div>

        {contractorId && isDirect && (
          <div className="space-y-2">
            <Label>Present workers (tap to toggle; ½ for half-day)</Label>
            {workers.length === 0 ? <p className="text-xs text-muted-foreground">No workers in this group yet.</p> : workers.map((w) => {
              const on = present[w.id] != null;
              return (
                <div key={w.id} className={`flex items-center justify-between rounded-md border px-3 py-2 ${on ? "border-primary bg-accent/40" : "border-border"}`}>
                  <button type="button" className="flex items-center gap-2 text-left" onClick={() => togglePresent(w.id)}>
                    <span className={`h-4 w-4 rounded-sm border flex items-center justify-center ${on ? "bg-primary text-primary-foreground" : ""}`}>{on && <Check className="h-3 w-3" />}</span>
                    {w.name}{w.skill ? ` · ${w.skill}` : ""} <span className="text-xs text-muted-foreground">₹{Number(w.day_rate).toLocaleString("en-IN")}/day</span>
                  </button>
                  {on && (
                    <Select className="h-8 w-24" value={String(present[w.id])} onChange={(e) => setPresent((p) => ({ ...p, [w.id]: Number(e.target.value) }))}>
                      <option value="1">Full</option>
                      <option value="0.5">Half</option>
                    </Select>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {contractorId && !isDirect && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Headcount</Label><Input type="number" value={headcount} onChange={(e) => setHeadcount(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Man-days</Label><Input type="number" value={manDays} onChange={(e) => setManDays(e.target.value)} placeholder="= headcount" /></div>
          </div>
        )}

        <Button onClick={submit} disabled={mark.isPending || !contractorId}>
          {mark.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Submit attendance
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------- Photo ----------------
function PhotoTab({ projectId }: { projectId: string }) {
  const { employee } = useAuth();
  const upload = useUploadEvidence();
  const [kind, setKind] = useState("work_photo");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState("");

  const pick = (f: File | null) => {
    setFile(f);
    if (f && navigator.geolocation) {
      setGeoMsg("locating…");
      navigator.geolocation.getCurrentPosition(
        (pos) => { setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoMsg("location captured"); },
        () => setGeoMsg("location unavailable"),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  };

  const submit = async () => {
    if (!file) return toast.error("Choose or take a photo");
    try {
      await upload.mutateAsync({ project_id: projectId, file, kind, note: note.trim() || null, geo, uploaded_by: employee?.id ?? null });
      toast.success("Photo uploaded");
      setFile(null); setNote(""); setGeo(null); setGeoMsg("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Add work photo</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Kind</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="work_photo">Work photo</option>
            <option value="measurement">Measurement sheet</option>
            <option value="muster">Muster / attendance sheet</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Photo</Label>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => pick(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
          {geoMsg && <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {geoMsg}</p>}
        </div>
        <div className="space-y-1.5"><Label>Note (optional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <Button onClick={submit} disabled={upload.isPending || !file}>
          {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Upload
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------- DPR ----------------
function DprTab({ projectId, day }: { projectId: string; day: string }) {
  const { employee } = useAuth();
  const save = useSaveDpr();
  const [summary, setSummary] = useState("");

  const submit = async () => {
    if (!summary.trim()) return toast.error("Write a short progress note");
    try {
      await save.mutateAsync({ project_id: projectId, work_date: day, summary: summary.trim(), created_by: employee?.id ?? null });
      toast.success("Progress logged");
      setSummary("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Daily progress · {day}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>What happened on site today?</Label>
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Ground-floor slab shuttering done; 12 masons; tiles delivered." className="min-h-[120px]" />
        </div>
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <NotebookPen className="h-4 w-4" />} Log progress
        </Button>
      </CardContent>
    </Card>
  );
}

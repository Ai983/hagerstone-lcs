import { useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/AppShell";
import { CheckCircle2 } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  site_engineer: "Site Engineer",
  project_manager: "Project Manager",
  procurement: "Procurement",
  finance: "Finance",
  management: "Management",
  founder: "Founder",
  admin: "Admin (IT)",
  ai: "AI",
  hr: "HR",
  mis: "MIS",
};

/** "What to do next" header — one line, by role (PRD §11). Placeholder copy. */
function nextStep(role: string | null): string {
  switch (role) {
    case "site_engineer":
      return "Capture today's attendance and site photos — coming in Phase 3.";
    case "project_manager":
      return "Review and confirm AI-checked items for your projects — coming soon.";
    case "finance":
      return "Deduction review, bank-match and payments — coming soon.";
    case "management":
    case "founder":
      return "Approvals, spot-checks and project spend — coming soon.";
    case "procurement":
      return "Onboard contractors (with bank verification) and raise work orders.";
    default:
      return "Your LCS workspace is being set up. Modules will appear here as they go live.";
  }
}

export default function Home() {
  const { employee, role } = useAuth();
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : "—";
  const firstName = employee?.name?.split(/\s+/)[0] ?? "there";

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4" />
          <span>You're signed in to LCS</span>
        </div>

        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
            Welcome, {firstName}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{employee?.name}</span>
            {" · "}
            <span className="font-medium text-foreground">{roleLabel}</span>
          </p>
        </div>

        {/* One-line "what to do next" header */}
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">What to do next</p>
          <p className="text-foreground">{nextStep(role)}</p>
        </div>

        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Masters are live (Phase 2): onboard <strong>Contractors</strong>, set up <strong>Projects</strong>,
            and raise <strong>Work Orders</strong> from the menu. Capture, confirmations, billing, approvals and
            dashboards light up in later phases.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

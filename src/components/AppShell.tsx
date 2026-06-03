import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Users,
  Building2,
  FileText,
  Camera,
  CheckCircle2,
  ReceiptText,
  Stamp,
  LayoutDashboard,
  LogOut,
  HardHat,
} from "lucide-react";

/** Live field capture (Phase 3) + masters (Phase 2). */
const FIELD = [{ to: "/capture", label: "Capture", icon: Camera }] as const;
const MASTERS = [
  { to: "/contractors", label: "Contractors", icon: Users },
  { to: "/projects", label: "Projects", icon: Building2 },
  { to: "/work-orders", label: "Work Orders", icon: FileText },
] as const;
/** Live items shown in the mobile bottom-nav. */
const BOTTOM = [{ to: "/capture", label: "Capture", icon: Camera }, ...MASTERS] as const;

/** Workflow sections — wired in later phases. */
const SOON = [
  { key: "confirmations", label: "Confirmations", icon: CheckCircle2, hint: "AI-checked items to confirm (Phase 4)" },
  { key: "billing", label: "Billing", icon: ReceiptText, hint: "RA bills & wage sheets (Phase 5)" },
  { key: "approvals", label: "Approvals", icon: Stamp, hint: "Approval matrix (Phase 7)" },
  { key: "dashboards", label: "Dashboards", icon: LayoutDashboard, hint: "Role dashboards (Phase 9)" },
] as const;

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export function AppShell({ children }: { children: ReactNode }) {
  const { employee, role, signOut } = useAuth();

  const navItemCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
    );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
          <HardHat className="h-6 w-6 text-sidebar-primary" />
          <div className="leading-tight">
            <div className="font-semibold text-sidebar-foreground">Hagerstone LCS</div>
            <div className="text-[10px] uppercase tracking-wide text-sidebar-foreground/60">Labour &amp; Contractor</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-1 text-[10px] uppercase tracking-wide text-sidebar-foreground/40">Field</div>
          {FIELD.map((m) => (
            <NavLink key={m.to} to={m.to} className={navItemCls}>
              <m.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{m.label}</span>
            </NavLink>
          ))}
          <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wide text-sidebar-foreground/40">Masters</div>
          {MASTERS.map((m) => (
            <NavLink key={m.to} to={m.to} className={navItemCls}>
              <m.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{m.label}</span>
            </NavLink>
          ))}

          <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wide text-sidebar-foreground/40">Workflow</div>
          {SOON.map((s) => (
            <button key={s.key} disabled title={s.hint} className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/50 cursor-not-allowed">
              <s.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{s.label}</span>
              <span className="text-[9px] uppercase tracking-wide text-sidebar-foreground/40">soon</span>
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="h-9 w-9 rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-xs font-semibold">
              {initials(employee?.name)}
            </div>
            <div className="leading-tight overflow-hidden">
              <div className="text-sm font-medium truncate">{employee?.name ?? "—"}</div>
              <div className="text-[11px] text-sidebar-foreground/60 truncate">{role ?? "—"}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between h-14 px-4 bg-sidebar text-sidebar-foreground">
          <div className="flex items-center gap-2">
            <HardHat className="h-5 w-5 text-sidebar-primary" />
            <span className="font-semibold">Hagerstone LCS</span>
          </div>
          <Button variant="ghost" size="icon" className="text-sidebar-foreground/80" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8 pb-24 md:pb-8">{children}</main>

        {/* Bottom nav (mobile) — live masters */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-sidebar text-sidebar-foreground border-t border-sidebar-border flex">
          {BOTTOM.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              className={({ isActive }) =>
                cn("flex-1 flex flex-col items-center gap-0.5 py-2", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70")
              }
            >
              <m.icon className="h-5 w-5" />
              <span className="text-[10px]">{m.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

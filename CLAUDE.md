# Hagerstone LCS — Labour & Contractor System

> **The one rule:** pay only for work actually done, at the agreed rate, confirmed by the right people, with a tamper-proof record. **AI checks, a named human confirms — AI never approves or pays.** When two options conflict, pick stronger verification + clearer audit trail.

This file is the **always-current snapshot** of the project. Overwrite stale lines; don't append history. Full history → `/docs/sessions/`. Full spec → `LCS_PRD_FOR_CLAUDE_v1.1.md`.

---

## What this is
LCS governs every payment to every contractor and daily-wage worker for site work: onboarding → daily capture → AI verification → payment → retention release → closure. It's a new Vercel sub-app of the Hagerstone Hub, living in a new isolated **`lcs` schema** inside the **shared Hub Supabase project**. Mobile-first.

Two payment tracks: **A — Measured** (agency/sub-contractors, RA bills at locked BOQ rates) and **B — Attendance** (daily-wage labour, man-days × rate). Both merge into deduction → AI-check → confirm → approve → pay → audit.

## Supabase (Hub project — shared, schema-per-module)
- **Project id:** `tpfvnerrjhqwipyonngf` · URL `https://tpfvnerrjhqwipyonngf.supabase.co`
- Schemas: `public` (shared auth), `cps`, `finance`, `scraper`, **`lcs` (ours — all LCS objects)**.
- **All new objects go in `lcs` only.** Never create in public/cps/finance.
- **Read-only** (never alter/drop/rewrite): `cps.cps_suppliers` (759 rows), `public.employees`, `public.roles`, `public.employee_module_access`.
- **Only allowed shared write:** additive module-access rows — add `'lcs'` to roles' `default_modules` + insert `employee_module_access` rows. Done in `lcs_002`.
- ✅ **`lcs` schema is exposed to the API.** ⚠️ The Dashboard → Settings → API → Exposed schemas toggle did **NOT persist** on this shared project (checking `lcs` + Save left the stored value as `public, finance, cps, facade`). Verified via REST (`PGRST106 Invalid schema: lcs`) and `select rolconfig from pg_roles where rolname='authenticator'`. **Fixed by setting it directly:** `alter role authenticator set pgrst.db_schemas = 'public, finance, cps, facade, lcs';` then `notify pgrst, 'reload config'; notify pgrst, 'reload schema';` (2026-06-03). This is shared infra — change is **additive** (preserves cps/finance/facade/public). **If lcs API ever returns PGRST106 again** (another team re-saves exposed schemas and clobbers it), re-run that ALTER ROLE + NOTIFY. Always verify exposure with a REST curl (`Accept-Profile: lcs`), NOT just `set role` in SQL (that bypasses PostgREST).

### Shared helpers (read/reuse, don't duplicate)
- `public.get_my_role()` → role from employees by `auth_user_id`.
- `public.is_admin()`, `public.is_founder_viewer()`.
- `public.sync_module_access(p_employee_id uuid, p_modules jsonb)` — **admin-only, manual**; also writes cps_users/finance.employees. **Does NOT handle `lcs`** — do not route lcs through it; insert access rows directly (as `lcs_002` does).
- `cps.is_cps_user()`, `cps.cps_current_user_role()` — resolve via `cps.cps_users.auth_uid`.

## Tech stack (mirrors CPS)
React 18 + TypeScript + Vite 5 · Tailwind v3 (brown `hsl(20 50% 35%)` / gold `hsl(45 85% 65%)` via CSS vars, no hardcoded colors) · shadcn/ui · TanStack Query v5 · React Router v6 · React Hook Form + Zod · Lucide · Sonner. Mobile-first.
- **Build:** `npm run build` (= `vite build`, NOT `tsc -b && vite build`).
- **Deploy:** `npm run build && vercel --prod --yes`. **Live: https://hagerstone-lcs.vercel.app** (Vercel project `ai-hagerstones-projects/hagerstone-lcs`). CLI deploy from local folder — no git push needed.
- **Env vars** (same values as Hub/CPS): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Local in `.env.local`; set in Vercel for Production + Preview + Development.

## Auth & module gating (matches the live Hub mechanism — confirmed in repos)
- The Hub does **NO token handoff**: `ModuleCard` calls `window.open(url, '_blank')`; each sub-app logs in independently against the same Supabase project (session in per-origin localStorage). CPS works this way too.
- **LCS today = 2 logins** (Hub, then LCS) by design decision. Planned future switch to single-sign-on once all modules are configured — `/auth/callback` already handles the URL-token→`setSession()` path, so SSO will be a Hub-side change only.
- Identity: `auth.users.id` → `public.employees.auth_user_id` → `employees.role`. LCS gates on an active employee row **and** `employee_module_access.module_id='lcs' AND can_access`.
- Two Supabase clients: `src/lib/supabase.ts` (default/`public` + reads `cps`), `src/lib/supabaseLcs.ts` (`{ db: { schema: 'lcs' } }`). Shared auth storageKey `lcs.auth.token`.

## Live `lcs` objects so far
**Migrations applied:**
- `lcs_001_init` — `create schema lcs`; `lcs.lcs_config` (seeded: `ai_confidence_threshold`=70, `default_retention_pct`={civil_mep:10,finishing:5}, `dlp_default_months`=12); sequences `lcs_wo_seq`/`lcs_wage_seq`/`lcs_payment_seq`; numbering fns `lcs_next_wo_number()` (HI-LWO-YYYY-NNNN), `lcs_next_wage_number()` (HI-WAGE-…), `lcs_next_payment_number()` (HI-PAY-…), `lcs_next_ra_number(p_wo uuid)` (RA-NNN, per-WO, table-guarded); RLS helpers `lcs.current_user_role()`, `lcs.is_lcs_user()` (resolve via `public.employees.auth_user_id`).
- `lcs_002_module_access` — additive: `'lcs'` added to `default_modules` for admin, ai, finance, founder, management, procurement, project_manager, site_engineer (hr/mis excluded); `employee_module_access` `lcs` rows granted to 64 active employees in those roles.

- `lcs_003_masters` — tables `contractor_profiles`, `projects`, `project_assignments`, `work_orders` (wo_no default `lcs_next_wo_number()`), `wo_boq_items`; views `v_contractors` (contractor_profiles ⟕ cps.cps_suppliers) + `v_cps_suppliers` (read-only supplier directory for the link picker); `set_updated_at()` triggers; `enforce_wo_bank_verified()` trigger (blocks WO for non-bank-verified contractor); grants to anon/authenticated (usage + table DML + sequence usage; RLS governs rows). Cross-schema refs to public/cps are **soft uuid columns, no hard FK**; hard FKs only within lcs.
- `lcs_004_masters_rls` — RLS enabled on all 6 lcs tables (incl. `lcs_config`). Read = `lcs.is_lcs_user()`. Write: contractors/WOs/BOQ = procurement/admin/ai/management/founder; projects/assignments = admin/ai/management/founder (+project_manager for assignments); lcs_config = admin/ai.

- `lcs_005_workers_labour_mode` — `contractor_profiles.labour_engagement` (`thekedar`|`direct`, for type='labour'); new `workers` table (per-worker registry for labour model B+C: name, phone, skill, day_rate, aadhaar_last4) + RLS (read=lcs user; write=ops + site_engineer/project_manager) + grants; `v_cps_projects` read-only view over `cps.cps_projects` for the import picker.

**Tables:** `lcs_config`, `contractor_profiles`, `projects`, `project_assignments`, `work_orders`, `wo_boq_items`, `workers`. **Views:** `v_contractors`, `v_cps_suppliers`, `v_cps_projects`.

**Labour model (decided):** mix of **B = thekedar** (we pay the contractor; gang roster optional) and **C = direct** (we pay each worker; roster used for man-days × day_rate). Set via `contractor_profiles.labour_engagement`.

## Phase checklist (PRD §13)
- [x] **Phase 0** — Re-verify Hub; `lcs` schema; `lcs_config`; numbering fns; RLS helpers. *(schema exposure = pending user)*
- [x] **Phase 1** — DONE. App built + deployed (https://hagerstone-lcs.vercel.app), gating live, `lcs` schema exposed, Hub tile registered + **Hub redeployed** (commit `c0307f3` → Vercel deployment READY). LCS tile is live on the Hub for LCS-enabled users.
- [x] **Phase 2** — DONE. Masters live: contractor_profiles (+ optional supplier link via `v_contractors`), projects, project_assignments, work_orders, wo_boq_items. Onboarding with bank-verification gate (DB trigger blocks WO for unverified contractor). UI: Contractors / Projects / Work Orders pages (deployed). Round-trip verified live.
- [ ] Phase 3 — Mobile capture: attendance, site_evidence, dpr; storage bucket `lcs-evidence`.
- [ ] Phase 4 — Edge Function `lcs-ai-check` + per-gate checkers + `ai_checks` + confirm UI.
- [ ] Phase 5 — Billing: ra_bills/items, wage_sheets, ceiling, contractor portal token.
- [ ] Phase 6 — Deduction engine + ledgers.
- [ ] Phase 7 — Gate pipeline + approval matrix + escalations + holds.
- [ ] Phase 8 — Payment + UTR + payslip; retention tranches + DLP tracker.
- [ ] Phase 9 — Role dashboards + spot-check queue + audit views.
- [ ] Phase 10 — n8n + Maytapi notifications + director WhatsApp approval.

## Guardrails (do not violate)
1. Re-verify live Hub state before each migration; live DB is truth.
2. New objects in `lcs` only; expose `lcs` via API settings.
3. Read existing tables; only shared writes are additive module-access rows — never alter/drop/rewrite existing data.
4. Migrations numbered, idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`), applied via Supabase MCP `apply_migration`, verified with a `SELECT`.
5. AI runs only in the `lcs-ai-check` Edge Function (key server-side, never in browser). AI never approves/pays.
6. Honest-limit controls: submitter binding, spot-check queue, no auto-dismiss of flags.
7. Audit log append-only; log same-person consecutive gates + off-hours actions.
8. One phase at a time; confirm via live Supabase + live page audit before advancing.

## Known gotchas
- `public.roles.id` is **text**; `default_modules` is `text[]`.
- `public.employees.role` is text; matches `roles.id`.
- DB has roles `founder`, `ai`, `mis` that the Hub's TS `RoleId`/`ROLE_DEFAULT_MODULES` don't list (Hub type is narrower) — fine; DB is source of truth for gating.
- Numbering fns use **sequences** (not MAX-from-table) so they work before data-model tables exist. `lcs_next_ra_number` is `to_regclass`-guarded for the same reason.
- Vite 5 + React 18 chosen over CPS's React 19/Vite 8 to avoid local-toolchain friction; same stack contract.
- **Supplier read-views** (`v_contractors`, `v_cps_suppliers`) rely on default `security_invoker=off` so they run as the view owner and can read `cps.cps_suppliers` without granting LCS users cps access. They are read-only and the ONLY places that name `cps`. (PRD §5.3 named only `v_contractors`; `v_cps_suppliers` is an intentional minor addition for the onboarding supplier picker.)
- LCS-schema reads/writes go through `supabaseLcs` — which is now `supabase.schema('lcs')` on the SINGLE client (NOT a second createClient). The old two-client setup shared an auth storageKey and caused lock contention (supplier search hung). Never reintroduce a second client. `public.employees` (PM pickers) via the default `supabase`. Exposing the schema did NOT auto-grant — grants are explicit per migration.
- Frontend routes: `/` `/contractors` `/projects` `/work-orders` (all protected). Data layer in `src/lib/masters.ts` (TanStack Query).

## Workflow standard (every LCS prompt)
Do the work → update this `CLAUDE.md` → write a new `/docs/sessions/<date>_<phase>.md` → update `/docs/sessions/INDEX.md` → report. Always, even if a prompt forgets to say so.

## Repos (local paths)
- LCS (this): `/Users/aniketawasthi/Desktop/hagerstone-lcs`
- Hub portal: `/Users/aniketawasthi/Downloads/Unified System/hagerstone-hub` (module registry `src/config/modules.ts`)
- CPS (pattern reference): `/Users/aniketawasthi/hagerstone-cps`
- Finance: `/Users/aniketawasthi/Downloads/Expense-Automation--main`

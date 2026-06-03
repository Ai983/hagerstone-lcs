# Hagerstone LCS — Labour & Contractor System

> **The one rule:** pay only for work actually done, at the agreed rate, confirmed by the right people, with a tamper-proof record. **AI checks, a named human confirms — AI never approves or pays.** When two options conflict, pick stronger verification + clearer audit trail.

This file is the **always-current snapshot** of the project. Overwrite stale lines; don't append history. Consolidated build summary → `/docs/PROJECT_SUMMARY.md`. Full history → `/docs/sessions/`. Full spec → `LCS_PRD_FOR_CLAUDE_v1.1.md`.

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

- `lcs_006_expand_supplier_view` — `v_cps_suppliers` extended with `phone`, `bank_account_holder_name`, `bank_account_number` (so the contractor form auto-fills them); `anon` SELECT revoked from the view (bank data → authenticated only). NB: across 760 CPS suppliers only ~38 have any bank details; `bank_account_last4` is unused/empty.
- `lcs_007_capture` — Phase 3 capture: `attendance` (header muster: project, contractor, work_date, headcount, man_days, evidence_path, source, confirmed_*), `attendance_lines` (per-worker for DIRECT labour: worker_id, present, man_day, day_rate snapshot), `site_evidence` (project/WO, kind, file_path, geo_lat/lng, taken_at, note), `dpr_entries` (daily progress); helpers `lcs.my_employee_id()` + `lcs.can_capture_for(project)` (managers anywhere, field staff only for assigned projects); RLS on all 4; grants.
- `lcs_008_evidence_bucket` — private Storage bucket `lcs-evidence` + `storage.objects` policies scoped to `bucket_id='lcs-evidence'` AND `lcs.is_lcs_user()` (read/insert/update for authenticated). Files stored at `{project_id}/{ts}_{name}`; viewed via signed URLs.

- `lcs_010_ai_checks` — `ai_checks` table (entity/entity_id, gate G1|G2|attendance, result jsonb, confidence, confidence_reason, flags[], passed, model, human_corrected, confirmed_by/at) + RLS + grants. Written by the Edge Function (service role); humans confirm/flag from the app.

**Tables:** `lcs_config`, `contractor_profiles`, `projects`, `project_assignments`, `work_orders`, `wo_boq_items`, `workers`, `attendance`, `attendance_lines`, `site_evidence`, `dpr_entries`, `ai_checks`. **Views:** `v_contractors`, `v_cps_suppliers`, `v_cps_projects`. **Storage:** bucket `lcs-evidence` (private).
**Edge Function:** `lcs-ai-check` (ACTIVE, `verify_jwt: true`) — the ONLY server-side code. Routes by `gate` (attendance = muster headcount; G1 = photo↔claim; G2 = measurement OCR), reads the evidence image from `lcs-evidence` via the service role, calls Claude **`claude-sonnet-4-6`** (vision), records `ai_checks`. **Key is server-side** (Supabase secret `ANTHROPIC_API_KEY` — already set on the project; SUPABASE_* injected automatically). Source: `supabase/functions/lcs-ai-check/index.ts`. NEVER call Claude from the browser. Threshold from `lcs_config.ai_confidence_threshold` (70); `passed` = confidence≥threshold AND no flags.

- `lcs_009_worker_payment` — per-worker payment on `workers`: `payment_mode` (cash|upi|bank_transfer), `upi_id`, `bank_*`, `payment_verified`. `contractor_profiles.payment_mode` added. **WO bank-gate relaxed for DIRECT labour** (`enforce_wo_bank_verified` returns early when type='labour' & engagement='direct' — no group account; verification is per-worker at pay time).

**Labour model (decided):** mix of **B = thekedar** and **C = direct**, via `contractor_profiles.labour_engagement`.
- **Thekedar/Agency:** we pay the GROUP → group bank details required + human "verified" tick on onboarding; workers added later (expand panel) are attendance-only.
- **Direct:** we pay EACH WORKER → onboarding form has NO group bank; instead capture each worker inline with `payment_mode` cash/UPI/bank + details + per-worker "verified". Group `bank_verified` stays false and the WO gate is exempt for direct. More workers can be added later via the expand panel (also with payment fields).
- Payment modes everywhere: **cash / UPI / bank_transfer** (PRD's tamper-proof record — capture HOW each person is paid).

## Phase checklist (PRD §13)
- [x] **Phase 0** — Re-verify Hub; `lcs` schema; `lcs_config`; numbering fns; RLS helpers. *(schema exposure = pending user)*
- [x] **Phase 1** — DONE. App built + deployed (https://hagerstone-lcs.vercel.app), gating live, `lcs` schema exposed, Hub tile registered + **Hub redeployed** (commit `c0307f3` → Vercel deployment READY). LCS tile is live on the Hub for LCS-enabled users.
- [x] **Phase 2** — DONE. Masters live: contractor_profiles (+ optional supplier link via `v_contractors`), projects, project_assignments, work_orders, wo_boq_items. Onboarding with bank-verification gate (DB trigger blocks WO for unverified contractor). UI: Contractors / Projects / Work Orders pages (deployed). Round-trip verified live.
- [x] **Phase 3** — DONE. Mobile Capture screen (attendance: headcount for thekedar / per-worker muster for direct; site photo upload to `lcs-evidence` with geo+timestamp; daily progress report). Project staff assignment UI. Capture scoped via `project_assignments` (managers see all). Deployed.
- [x] **Phase 4** — DONE. `lcs-ai-check` Edge Function (server-side Claude vision `claude-sonnet-4-6`, key never in browser) + `ai_checks` + **Confirmations** UI (run per-gate check on a photo → ✓ checked / ⚠ needs a look → human Confirm/Flag). Deployed; `ANTHROPIC_API_KEY` present. Live Claude test pending a captured photo.
- [ ] Phase 5 — Billing: ra_bills/items, wage_sheets, ceiling, contractor portal token.
- [ ] Phase 6 — Deduction engine + ledgers.
- [ ] Phase 7 — Gate pipeline + approval matrix + escalations + holds.
- [ ] Phase 8 — Payment + UTR + payslip; retention tranches + DLP tracker.
- [ ] Phase 9 — Role dashboards + spot-check queue + audit views.
- [ ] Phase 10 — n8n + Maytapi notifications + director WhatsApp approval.

## Design notes for upcoming phases
- **Phase 7 approval matrix — resolve approvers dynamically, never hardcode.** The approval engine must look up each bill's approver from the project's **currently assigned PM / Project Head** (`projects.design_pm_employee_id` / `project_head_employee_id`, plus the role→level mapping) **at the moment of routing** — not from any baked-in name. Projects currently default PM/Head to "AI Team" for testing; real people get assigned after end-to-end testing. Because routing resolves from project assignments at runtime, that switch is a **pure data reassignment — no code change**. Also enforce **segregation of duties**: the approver must not be the same person who captured the work (cross-check against `attendance.created_by` / `site_evidence.uploaded_by`).

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
- **Vercel deploys BLOCK if the git commit author isn't a Vercel team member.** Commits authored by `it@3tattva.com` landed in state `BLOCKED` (empty build logs, before build). Local git is set to `user.email=ai@hagerstone.com` (a team member) — keep it that way so `git push` → auto-deploy works. (CLI `vercel --prod` deploying a dirty tree on top of an unauthorized-author commit also blocks.)
- **Supplier read-views** (`v_contractors`, `v_cps_suppliers`) rely on default `security_invoker=off` so they run as the view owner and can read `cps.cps_suppliers` without granting LCS users cps access. They are read-only and the ONLY places that name `cps`. (PRD §5.3 named only `v_contractors`; `v_cps_suppliers` is an intentional minor addition for the onboarding supplier picker.)
- LCS-schema reads/writes go through `supabaseLcs` — which is now `supabase.schema('lcs')` on the SINGLE client (NOT a second createClient). The old two-client setup shared an auth storageKey and caused lock contention (supplier search hung). Never reintroduce a second client. `public.employees` (PM pickers) via the default `supabase`. Exposing the schema did NOT auto-grant — grants are explicit per migration.
- Frontend routes: `/` `/contractors` `/projects` `/work-orders` (all protected). Data layer in `src/lib/masters.ts` (TanStack Query).

## Workflow standard (every LCS prompt)
Do the work → update this `CLAUDE.md` → write a new `/docs/sessions/<date>_<phase>.md` → update `/docs/sessions/INDEX.md` → report. Always, even if a prompt forgets to say so.
**Do NOT update `docs/PROJECT_SUMMARY.md` per session** — it's a static one-off handout, not maintained going forward.

## Repos (local paths)
- LCS (this): `/Users/aniketawasthi/Desktop/hagerstone-lcs`
- Hub portal: `/Users/aniketawasthi/Downloads/Unified System/hagerstone-hub` (module registry `src/config/modules.ts`)
- CPS (pattern reference): `/Users/aniketawasthi/hagerstone-cps`
- Finance: `/Users/aniketawasthi/Downloads/Expense-Automation--main`

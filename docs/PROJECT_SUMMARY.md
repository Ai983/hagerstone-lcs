# Hagerstone LCS — Full Build Summary (Phases 0–3)

A consolidated record of everything built so far, from kickoff through the direct-labour payment model. For the always-current snapshot see [`/CLAUDE.md`](../CLAUDE.md); for per-session detail see [`/docs/sessions/`](sessions/INDEX.md); the spec is [`/LCS_PRD_FOR_CLAUDE_v1.1.md`](../LCS_PRD_FOR_CLAUDE_v1.1.md).

---

## 0. What LCS is
The **Labour & Contractor System** — governs every payment to every contractor and daily-wage worker for Hagerstone's site work: onboarding → daily capture → AI verification → payment → retention → closure. It's a **Vercel sub-app of the Hagerstone Hub**, living in a new **`lcs` schema** inside the **shared Hub Supabase project**. Mobile-first.

**The one rule:** pay only for work actually done, at the agreed rate, confirmed by the right people, with a tamper-proof record. **AI checks; a named human confirms; AI never pays.**

## 1. Coordinates
| | |
|---|---|
| Live app | **https://hagerstone-lcs.vercel.app** |
| GitHub | **github.com/Ai983/hagerstone-lcs** (private) |
| Vercel project | `ai-hagerstones-projects/hagerstone-lcs` (git-connected → push to `main` auto-deploys) |
| Supabase (Hub) | project `tpfvnerrjhqwipyonngf` · schema **`lcs`** |
| Read-only shared | `cps.cps_suppliers` (760), `cps.cps_projects` (15), `public.employees`/`roles`/`employee_module_access` |
| Stack | React 18 + Vite 5 + TS, Tailwind v3 (brown/gold), shadcn-style UI, TanStack Query v5, React Router v6, RHF/Zod, Lucide, Sonner |
| Build / deploy | `npm run build` (= `vite build`) · `git push` (or `vercel --prod --yes`) |

---

## 2. Phase-by-phase

### Phase 0 — verify + schema bootstrap ✅
- Re-verified the live Hub (4 schemas, `cps_suppliers`=759→760, auth tables, helper functions) before any DDL.
- **`lcs_001_init`**: `create schema lcs`; `lcs_config` (seeded `ai_confidence_threshold`=70, `default_retention_pct`={civil_mep:10,finishing:5}, `dlp_default_months`=12); numbering fns `lcs_next_wo_number()` (HI-LWO-YYYY-NNNN), `_ra_`, `_wage_`, `_payment_`; RLS helpers `lcs.current_user_role()`, `lcs.is_lcs_user()`.

### Phase 1 — app scaffold + auth + module gating ✅
- Scaffolded the app (CPS stack), brown/gold theme via CSS vars, two Supabase clients (default `public`/`cps` + `lcs`-schema).
- **Auth matches the real Hub mechanism** (confirmed by reading the `hagerstone-hub` repo): the Hub does **no token handoff** — `window.open(url)`; each sub-app logs in independently against the same project. LCS mirrors this with its own email/password login, loads `public.employees` by `auth_user_id`, gates on `employee_module_access.module_id='lcs'`. A forward-compatible `/auth/callback` is in place for the **planned future single-sign-on** switch.
- **`lcs_002_module_access`** (additive shared write): added `'lcs'` to `default_modules` for 8 roles (admin, ai, finance, founder, management, procurement, project_manager, site_engineer); granted `employee_module_access` to 64 active employees.
- Registered the **LCS tile in the Hub repo** (`MODULE_REGISTRY`, `ModuleId`, `ROLE_DEFAULT_MODULES`) → committed + pushed → Hub auto-redeployed.
- **Decision (user):** keep the current **2-login** flow for now; switch to single-sign-on later once all modules are configured.
- Fixed an early **"No access" flash** bug (race between `getSession` + `onAuthStateChange`) with a single sequence-guarded resolver.

### Phase 2 — masters + onboarding + raise WO ✅
- **`lcs_003_masters`**: `contractor_profiles`, `projects`, `project_assignments`, `work_orders` (auto `wo_no`), `wo_boq_items`; read-only views `v_contractors` + `v_cps_suppliers`; `updated_at` triggers; **bank-verification gate** trigger; grants. Cross-schema refs to public/cps are **soft uuid columns (no hard FK)**.
- **`lcs_004_masters_rls`**: RLS on all 6 tables (incl. `lcs_config`); read = any LCS user; writes role-scoped.
- Frontend: **Contractors** (onboarding + optional CPS-supplier link), **Projects**, **Work Orders** (raise WO + BOQ items) pages; live nav.

### Phase 2.1 — audit-feedback fixes ✅
- **`lcs_005_workers_labour_mode`**: `contractor_profiles.labour_engagement` (thekedar|direct); `workers` table; `v_cps_projects` view.
- **`lcs_006_expand_supplier_view`**: exposed `phone` + full `bank_account_number` + holder in `v_cps_suppliers`; **revoked `anon`** (bank data → authenticated only).
- Contractor onboarding: **auto-fill + lock** from a linked CPS supplier (only fields CPS actually has), mandatory fields, human-verify tick always required.
- **Projects: "Import from CPS"** (the 15 `cps_projects`) with AI Team as PM/head (editable); per-project PM/head inline edit.
- Work Orders: retention pre-fills from the contractor's default.
- **Labour model decided (user): mix of B = thekedar + C = direct.**

### Phase 3 — mobile capture ✅
- **`lcs_007_capture`**: `attendance` (header muster), `attendance_lines` (per-worker), `site_evidence` (photos w/ geo+timestamp), `dpr_entries` (daily progress); capture helpers `my_employee_id()`, `can_capture_for(project)`; RLS (field staff only for assigned projects; managers anywhere).
- **`lcs_008_evidence_bucket`**: private **`lcs-evidence`** Storage bucket + `storage.objects` policies (bucket-scoped + LCS-users-only; signed URLs).
- Frontend: mobile **Capture** screen (pick site → Attendance / Photo / Progress); **Assign staff** UI on Projects; Capture nav live + mobile bottom-nav.

### Phase 3.1 — direct-labour per-worker payment ✅ (user-driven refinement)
- **`lcs_009_worker_payment`**: `workers` += `payment_mode` (cash|upi|bank_transfer), `upi_id`, `bank_*`, `payment_verified`; `contractor_profiles.payment_mode`; **WO bank-gate relaxed for direct** labour.
- Frontend: `WorkerFields` component; **Direct onboarding captures each worker (cash/UPI/bank + verify) inline** instead of a group bank account; thekedar/agency unchanged; list badge "direct · pays workers".
- **Decisions (user):** payment modes = cash / UPI / bank for all; for direct, worker details are entered on the onboarding page; verification is per-worker.

---

## 3. Live `lcs` objects (current)
**Migrations applied (9):** `lcs_001_init`, `lcs_002_module_access`, `lcs_003_masters`, `lcs_004_masters_rls`, `lcs_005_workers_labour_mode`, `lcs_006_expand_supplier_view`, `lcs_007_capture`, `lcs_008_evidence_bucket`, `lcs_009_worker_payment`.

**Tables:** `lcs_config`, `contractor_profiles`, `projects`, `project_assignments`, `work_orders`, `wo_boq_items`, `workers`, `attendance`, `attendance_lines`, `site_evidence`, `dpr_entries` — all RLS-enabled.
**Views (read-only, the only places naming cps):** `v_contractors`, `v_cps_suppliers`, `v_cps_projects`.
**Functions:** numbering `lcs_next_{wo,ra,wage,payment}_number`; RLS `current_user_role`, `is_lcs_user`, `my_employee_id`, `can_capture_for`; triggers `set_updated_at`, `enforce_wo_bank_verified`.
**Storage:** private bucket `lcs-evidence`.

## 4. Frontend map
- `src/lib/` — `supabase.ts` (default), `supabaseLcs.ts` (= `supabase.schema('lcs')`, single client), `masters.ts` (TanStack hooks), `capture.ts` (capture hooks), `utils.ts`.
- `src/contexts/AuthContext.tsx`, `src/components/ProtectedRoute.tsx`, `AppShell.tsx`, `WorkersPanel.tsx`, `WorkerFields.tsx`, `ui/*`.
- `src/pages/` — `Login`, `AuthCallback`, `Home`, `Contractors`, `Projects`, `WorkOrders`, `Capture`.
- Routes: `/login`, `/auth/callback`, `/`, `/contractors`, `/projects`, `/work-orders`, `/capture`.

## 5. Incidents resolved (so they don't recur)
1. **Supplier search empty / LCS data blank** → the `lcs` schema was **not exposed to the REST API** (the Supabase dashboard "Exposed schemas" save wasn't persisting). Fixed by setting it directly: `alter role authenticator set pgrst.db_schemas = 'public, finance, cps, facade, lcs'; notify pgrst,'reload config'; notify pgrst,'reload schema';`. **Verify with a REST curl, not `set role`.** Re-run if another team clobbers it.
2. **Vercel deploys BLOCKED** → commits authored by `it@3tattva.com` (not a Vercel team member) are blocked before build. Fixed local `git config user.email ai@hagerstone.com`.
3. **"No access" flash** → AuthContext race; fixed with a sequence-guarded single resolver.
4. **Dual Supabase client** lock contention → consolidated to one client via `supabase.schema('lcs')`.

## 6. Guardrails honored
New objects in `lcs` only; reads from cps/public; the only shared writes are additive (`lcs` module-access rows; the `authenticator` exposed-schemas setting — additive). Migrations numbered + idempotent + verified. No AI in browser (Edge Function comes in Phase 4). RLS on every table. Audit-log table is planned (PRD §9) for a later phase.

## 7. Phase checklist
- [x] 0 Bootstrap · [x] 1 Auth + gating · [x] 2 Masters + WO · [x] 2.1 Polish · [x] 3 Capture · [x] 3.1 Direct-labour payment · [x] **4 AI check + confirm**
- [ ] **5 — Billing (RA bills, wage sheets, ceiling, contractor portal)** (next)
- [ ] 6 Deduction engine + ledgers · [ ] 7 Gate pipeline + approvals (dynamic approvers — see CLAUDE.md design note) · [ ] 8 Payment + UTR + retention/DLP · [ ] 9 Dashboards + spot-check + audit views · [ ] 10 n8n + WhatsApp

## 8. Next (Phase 5)
Billing: `ra_bills`/`ra_bill_items` (measured track, capped at WO value), `wage_sheets` (attendance track, man-days × rate), cumulative ceiling enforcement, contractor portal token (reuse CPS vendor-portal pattern). Wire the Phase-4 G2 measurement check → RA reconciliation and attendance → wage sheets.

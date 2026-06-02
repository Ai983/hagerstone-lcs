# Session — 2026-06-02 · Phase 2 (Masters + onboarding + raise WO)

**Covers:** PRD Phase 2 — masters tables, contractor onboarding with bank-verification gate, raise a work order.
**Instruction given:** "no everything is check, lets proceed" (user audited Phase 0/1, approved Phase 2).
**Done when (PRD):** onboard a contractor + raise a WO. ✅

---

## Pre-DDL verification (guardrail)
- `public.employees` PK = `id`; `cps.cps_suppliers` PK = `id`; `gen_random_uuid()` available.
- `authenticated` had **no** grants in `lcs` (exposing the schema did not auto-grant) → explicit grants added in `lcs_003`.

## Migrations applied (via MCP `apply_migration`)

### `lcs_003_masters`
- Tables (all in `lcs`, uuid pk, created_at/updated_at, created_by): `contractor_profiles`, `projects`, `project_assignments`, `work_orders`, `wo_boq_items`.
  - `contractor_profiles`: type (agency|labour), supplier_ref (soft, UNIQUE when set), name/phone/gstin/pan, bank_* fields, kyc_status, bank_verified, default_retention_pct, status; check `(supplier_ref is not null or name is not null)`.
  - `work_orders`: `wo_no` UNIQUE default `lcs.lcs_next_wo_number()`; track (measured|attendance); wo_value≥0; retention_pct/advance_pct/dlp_months; FK contractor_profile_id, project_id (within lcs).
  - `wo_boq_items`: FK work_order_id (cascade), description/unit/agreed_rate/total_qty.
- **Cross-schema refs to public/cps are soft uuid columns (no hard FK)** to avoid coupling/locking shared tables. Hard FKs only within lcs.
- Triggers: `set_updated_at()` on all 5 tables; `enforce_wo_bank_verified()` BEFORE INSERT on work_orders → raises if contractor not bank_verified.
- Views (read-only, the only places naming cps; `security_invoker` off so they read cps as owner): `v_contractors` (contractor_profiles LEFT JOIN cps.cps_suppliers, surfaces display_name + supplier_*), `v_cps_suppliers` (supplier directory for the link picker).
- Grants: `usage` on schema + DML on all lcs tables + `usage,select` on sequences + select on the two views, to anon/authenticated (RLS governs rows).

### `lcs_004_masters_rls`
- RLS enabled on all 6 lcs tables (incl. `lcs_config`, which previously had none).
- Read policies: `lcs.is_lcs_user()`. Write policies via `lcs.current_user_role()`:
  - contractor_profiles / work_orders / wo_boq_items → procurement, admin, ai, management, founder.
  - projects → admin, ai, management, founder. project_assignments → + project_manager.
  - lcs_config → admin, ai.

## Verification (live)
- `pg_class`/`pg_policies`: all 6 tables `relrowsecurity=true`, 2 policies each. ✅
- Round-trip (as postgres): inserted bank-verified contractor → project → WO (`wo_no` auto = **HI-LWO-2026-0004**) + 1 BOQ item. ✅
- Bank-verification gate: inserting a WO for a `bank_verified=false` contractor **raised** the expected exception. ✅
- Cleaned up all `__TEST%` rows → counts back to contractors 0 / projects 0 / work_orders 0. ✅

## Frontend (LCS app)
- UI primitives added: `card`, `textarea`, `select` (native), `badge`.
- `src/types.ts` — masters interfaces + `OPS_ROLES`/`PROJECT_ADMIN_ROLES` + `canManageOps`/`canManageProjects` helpers.
- `src/lib/masters.ts` — TanStack Query hooks: useContractors (v_contractors), useProjects, useWorkOrders, useEmployees (public.employees), useSupplierSearch (v_cps_suppliers, ilike), useLcsConfig; mutations useCreateContractor/Project/WorkOrder (WO insert + BOQ items).
- Pages: `Contractors.tsx` (onboarding form: type, optional supplier link search, identity, bank details + bank-verified checkbox gate, default retention; list with verified/unverified badges), `Projects.tsx` (name/client/location/budget + design-PM/head selects from employees), `WorkOrders.tsx` (raise WO — only bank-verified contractors selectable; track; value; retention default from `lcs_config.default_retention_pct.civil_mep`; advance; dlp; BOQ line items for measured track; surfaces the DB gate error verbatim if hit).
- `AppShell.tsx` — sidebar/bottom-nav reworked: live **Masters** group (Contractors/Projects/Work Orders via NavLink) + still-"soon" Workflow group. Role-gated action buttons (RLS also enforces).
- Routes added in `App.tsx`: `/contractors`, `/projects`, `/work-orders` (protected). Home copy updated.
- `tsc --noEmit` clean (after adding `created_by` to the 3 interfaces). Build green.

## Deploy
- `npm run build && vercel --prod --yes` → READY, aliased https://hagerstone-lcs.vercel.app.
- Smoke test: `/`, `/contractors`, `/projects`, `/work-orders` all HTTP 200 (SPA rewrite).

## Deviations from PRD
- `v_cps_suppliers` view added in addition to `v_contractors` (PRD §5.3 named only `v_contractors` as the place naming cps). Needed for the onboarding supplier picker; read-only, in lcs. Documented in CLAUDE.md.
- Cross-schema references kept as soft uuid columns (no hard FK to public/cps) — stricter adherence to "never couple/lock shared objects" than the PRD's "references" wording.

## Next (Phase 3)
Mobile capture: `attendance`, `site_evidence`, `dpr_entries`; Storage bucket `lcs-evidence`. Field user submits attendance + photos. Add `project_assignments` UI (assign field staff to projects) since capture is project-scoped. **Before Phase 3:** audit Phase 2 live (onboard a real contractor, verify bank, raise a WO; confirm the gate blocks an unverified one).

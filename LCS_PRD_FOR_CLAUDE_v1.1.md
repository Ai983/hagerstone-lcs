# Labour & Contractor System (LCS) — Product Requirements Document

**For:** Claude Code (implementation)
**Owner:** Hagerstone International — AI & Automation Team
**Version:** 1.1 — corrected against the **live** Hub Supabase (verified, not assumed)
**Deploy target:** Vercel sub-app of the Hagerstone Hub, all data inside the Hub Supabase project

> **v1.1 changelog (what was wrong in v1.0 and is now fixed against live DB):**
> - It is **one** Supabase project, not several. No cross-project sync, no cross-project SSO problem.
> - The Hub already uses **schema-per-module** (`cps`, `finance`, `scraper`, `public`). `lcs` is the correct new schema — it's the house pattern.
> - The supplier master is `cps.cps_suppliers` with **759 rows** (not ~500), and it is mostly **material suppliers**. Contractors are not separated out yet.
> - Auth/roles/module-gating use **`public.employees`, `public.roles`, `public.employee_module_access`** — not the `user_roles`/`module_permissions` tables assumed in v1.0.
> - Architecture confirmed: **DB-centric (RLS + Postgres functions), no backend server, plus exactly one Edge Function for AI.**

---

## 0. The one rule that governs everything

LCS exists for **one reason**: pay only for work that was actually done, at the agreed rate, confirmed by the right people, with a complete tamper-proof record. When two options conflict, choose the one with stronger verification and a clearer audit trail — even if slightly slower.

**Disruption rule (updated):** Minor *additive* changes to shared objects are allowed (e.g. adding `'lcs'` to a role's `default_modules`, reading `cps.cps_suppliers`) **as long as no existing team's workflow changes.** Never alter or drop existing columns/tables, never rewrite CPS/Finance data, never change their behaviour.

---

## 1. Executive summary

LCS governs **every payment to every contractor and every daily-wage worker** for site work — onboarding → daily capture → AI verification → payment → retention release → closure.

Built for a lean field team that has always worked manually: the site team barely touches software. **They capture evidence on one simple mobile app; an AI layer reads it, files it, checks it at every step, and flags problems; a human confirms with one tap. AI never releases money.**

LCS is a new sub-app of the Hagerstone Hub. It lives in a new isolated **`lcs` schema** inside the **same Hub Supabase project**, shares the Hub's auth, mirrors CPS/Finance conventions, and links read-only to the existing supplier master.

---

## 2. Non-negotiable goals
1. Zero unauthorised / leaked payments — multi-layer verification + tamper-proof audit.
2. Verify before pay — nothing billable unless in verified measurement (agency) or confirmed attendance (labour).
3. AI as independent verifier at every step.
4. Human accountability retained — AI checks, a named human confirms; AI cannot pay.
5. Self-explanatory UX — every screen says what to do next; no training needed.
6. Additive integration — existing systems and their workflows untouched.

---

## 3. Scope

**In scope:** all contractor + daily-wage labour payments, all projects/trades — onboarding, advances, RA bills, labour wages, deductions, approvals, payment, retention, DLP, closure.

**Out of scope:** material purchase → CPS (`cps` schema); employee salaries/reimbursements → Finance (`finance` schema); tax filing → LCS prepares data, Finance files.

**Two payment tracks (both required):**
| Track | Who | Paid on | Proof |
|---|---|---|---|
| A — Measured | Agency / sub-contractors | Measured qty → RA bill at locked BOQ rates, capped at WO value | Locked Measurement Book entry |
| B — Attendance | Direct daily-wage labour | Man-days × agreed rate | Confirmed digital muster |

Both merge into the same deduction → AI-check → confirm → approve → pay → audit pipeline.

---

## 4. Architecture — DB-centric, no backend, one Edge Function

**This answers the core question: LCS runs like CPS — almost entirely on RLS policies + Postgres functions, with no traditional backend server. There is exactly one piece of server code, only because of the AI.**

```
LCS React app + mobile  ──supabase-js (direct)──▶  Hub Supabase (tpfvnerrjhqwipyonngf)
                                                     ├── lcs schema      (new — all LCS objects, RLS)
                                                     ├── cps schema      (read-only: cps_suppliers)
                                                     ├── public schema   (shared auth: employees, roles, module access)
                                                     ├── Edge Function   lcs-ai-check  (ONLY server code)
                                                     └── Storage         bucket lcs-evidence
```

- **No Express/Railway backend** (unlike Finance). Postgres is the backend.
  - **Access control → RLS** on every `lcs.*` table, using existing helpers (`public.get_my_role()`, `public.is_admin()`) + a new `lcs.is_lcs_user()` / `lcs.current_user_role()` mirroring `cps.is_cps_user()` / `cps.cps_current_user_role()`.
  - **Business logic → Postgres functions**: gate checks, deduction math, cumulative-ceiling enforcement, ID numbering (`lcs_next_*`), retention/DLP triggers. Mirrors CPS's `cps_next_*` / `cps_auto_create_*`.
  - **Integrity → constraints + triggers**: net payable ≥ 0; same-person-consecutive-gates logged; audit log append-only.
- **One Edge Function `lcs-ai-check`** — the only server-side code. It calls the Claude API, holds the API key server-side (key never in the browser), routes by `gate`, returns `{fields, confidence, confidence_reason, flags}`. **Do NOT copy CPS's current browser-direct Claude call** (`anthropic-dangerous-direct-browser-access`) — CPS's own notes say that should move to an Edge Function; LCS does it right from day one.

**Stack (mirror CPS):** React + TypeScript + Vite, Tailwind v3 (Hagerstone brown `hsl(20,50%,35%)` / gold `hsl(45,85%,65%)`), shadcn/ui, TanStack Query v5, React Router, React Hook Form + Zod, Lucide, Sonner. Mobile-first; the capture app is the mobile view of the same React app. Build script `vite build` (skip `tsc -b`). Deploy: Vercel.
**AI model:** confirm the current model string from `docs.claude.com` before coding — do not hardcode a stale one. CPS currently uses `claude-sonnet-4-20250514`; a vision-capable Sonnet-class model is needed (it reads photos + measurement sheets).

---

## 5. Supabase integration — verified facts + rules

### 5.1 Confirmed live state (Hub project `tpfvnerrjhqwipyonngf`)
- Schemas: `public` (8 tables, shared auth), `cps` (65 tables), `finance` (10), `scraper` (1).
- `cps.cps_suppliers` — **759 rows**, columns include `id uuid`, `name`, `gstin`, `pan`, `bank_name`, `bank_account_number`, `bank_account_holder_name`, `bank_ifsc`, `bank_account_last4`, `categories text[]`. Mostly material suppliers (Tiles, Plywood, Hardware, Electrical, Civil, …).
- `cps.cps_contractors` (33 cols) & `cps.cps_contractor_work_orders` (26 cols) exist but hold **1 row each** — abandoned manual record-keeping (work orders typed into CPS instead of Excel). **Treat as legacy reference only; do NOT build LCS on them.** Optional one-time read/import later if the user wants those entries.
- Auth: `public.employees` (66 rows; `id`, `auth_user_id`, `name`, `email`, `phone`, `role` text, `is_active`, …). `public.roles` (10 rows; `id`, `label`, `default_modules text[]`). `public.employee_module_access` (`employee_id`, `module_id` text, `can_access`).
- Existing `module_id`s in use: `attendance`, `cps`, `finance_admin`, `finance_employee`, `hireflow`.
- Existing role ids: `admin`, `ai`, `finance`, `founder`, `hr`, `management`, `mis`, `procurement`, `project_manager`, `site_engineer`.
- RLS helpers present: `public.get_my_role()`, `public.is_admin()`, `public.is_founder_viewer()`, `public.sync_module_access()`, `cps.cps_current_user_role()`, `cps.has_role()`, `cps.is_cps_user()`.

> **Re-verify before any DDL.** The above was captured during design; run `list_tables` / `execute_sql` on `tpfvnerrjhqwipyonngf` to confirm current state before each migration. The live DB is ground truth.

### 5.2 Schema isolation
- `CREATE SCHEMA IF NOT EXISTS lcs;` — **every** new table/view/function/type goes in `lcs`. No new objects in `public` or `cps`.
- Expose `lcs` to the API: Dashboard → Settings → API → Exposed schemas → add `lcs`.
- Frontend uses a `supabase-js` client with `{ db: { schema: 'lcs' } }` for LCS tables, and the default-schema client for reading `public` auth and `cps.cps_suppliers` (via the view below).
- **No `ALTER`/`DROP`/writes** to any `public`, `cps`, or `finance` object. The single allowed shared write is additive: adding `'lcs'` to chosen roles' `default_modules` and inserting `employee_module_access` rows.

### 5.3 Contractor ↔ supplier link (decision: Option B, one-way read link)
- `lcs.contractor_profiles` is the LCS-owned record for **every** contractor and labour group: `type` (`agency`|`labour`), kyc/bank-verification status for payment, retention defaults, performance ledger, status.
- Optional `supplier_ref uuid` → references `cps.cps_suppliers.id`. If this contractor is also one of the 759 suppliers, set the ref; otherwise null (all direct labour, most pure labour thekedars).
- `lcs.v_contractors` view = `lcs.contractor_profiles` LEFT JOIN `cps.cps_suppliers` on `supplier_ref`, surfacing name/bank/GSTIN for overlap firms. **Read-only; never copy or write back.** This view is the only place that names the cps table.

### 5.4 Migration discipline (CPS/Finance convention)
- Numbered, sequential, never edit-in-place: `lcs_001_schema.sql`, `lcs_002_rls.sql`, …
- Idempotent: `CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `INSERT … ON CONFLICT DO NOTHING`.
- Apply via Supabase MCP `apply_migration`; verify each with a `SELECT`.
- All config (webhook URLs, AI thresholds, default rates) in `lcs.lcs_config` (key/value), never env vars.

---

## 6. Hub & auth integration (verified mechanism)

LCS is a Vercel sub-app sharing the Hub Supabase. Integration is via the **existing** auth model:

1. **Module gating:** add `module_id = 'lcs'` rows to `public.employee_module_access` for employees who get access; and add `'lcs'` to `default_modules` for the right roles in `public.roles` (`site_engineer`, `project_manager`, `procurement`, `finance`, `management`, `founder`, `admin`, `ai` as appropriate). Reuse `public.sync_module_access()` if that is how defaults propagate (confirm in the portal repo).
2. **Auth identity:** logged-in `auth.users.id` → `public.employees.auth_user_id` → `employees.role`. LCS reads role via `public.get_my_role()`.
3. **Portal registration + SSO handoff:** the Hub portal lists modules and hands tokens to sub-apps. **Confirm the live portal's exact mechanism in Claude Code** (its module registry/config + the `/auth/callback` token-handoff route) and match it — do not assume the generic pattern. Add LCS there + a `/auth/callback` receiver + a `ProtectedRoute` in the LCS app.
4. **Env vars:** `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` identical to the portal (set in Vercel).

---

## 7. LCS roles & flexible per-site assignment

LCS maps onto existing Hub roles — **no new role system**:
- `site_engineer` → field capture (may cover supervisor+engineer+quality on a small site).
- `project_manager` → the design-team PM; remote review + L1 approver.
- `management` → L2 (Project Head) / L3 oversight.
- `founder` → L4 / MD override + read-all.
- `finance` → deduction check, bank-match, release.
- `procurement` → contractor onboarding / rate verification (already owns suppliers).
- `admin`/`ai`/`mis` → superuser / build / read.

**Flexible field roles (handles collapsed-role sites):** `lcs.project_assignments (employee_id, project_id, gate_roles text[])`. A one-person site gets `{'G1','G2','G3'}` on that person. Permission helpers in the app's `AuthContext`: `canCaptureFor(project)`, `canConfirmGate(project, gate)`, `canApprove(level)`, `isDesignPM`, `isFinance`, `isAuditor`. Where one person covers consecutive field gates, the **AI check + remote PM confirmation** are the two independent checks (Section 8.4); the audit log records same-person gates for director review.

---

## 8. Agentic AI operating model (the heart)

### 8.1 Core loop at every required step
`Site sends (app) → AI checks (lcs-ai-check) → Human confirms (one tap)`

### 8.2 Per-gate checkers (specialised prompts, not a trained model)
One Edge Function routes by `gate`; each gate = tailored prompt + output schema + real Hagerstone examples:
- G1 work-evidence (photo ↔ claim, geo/time), G2 measurement (OCR + reconcile to BOQ, ceiling, gross), G3 quality (snag/defect), G4 PM summary (schedule/budget), G5 deductions (recompute + bank match), G6 approval pack, G7 release check, plus attendance (man-day count from muster photo).

### 8.3 Extraction contract (reuse CPS pattern)
`{ ...fields, confidence 0–100, confidence_reason, flags[] }` → ≥70% auto-fill + confirm; <70% editable form + warning. Every AI field stores `*_source` (`ai_extracted|manual|ai_override`). Corrections set `human_corrected=true`. Writes only after human confirmation.

### 8.4 Independent-second-check guarantee
For collapsed-role sites, payment can't proceed unless **both** the AI checker passed (or the flag was resolved with a logged reason) **and** the remote `project_manager` confirmed.

### 8.5 Honest limit (build it in)
AI confirms evidence is consistent/plausible — it can't prove work physically happened. So: every submission bound to its `employee_id`; a **director spot-check queue** randomly samples confirmed bills; AI flags are never auto-dismissed (a human resolves each with a logged reason).

---

## 9. Data model (`lcs` schema)

All tables in `lcs`, all with `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`, RLS enabled.

| Table | Key columns |
|---|---|
| `contractor_profiles` | supplier_ref (uuid→cps.cps_suppliers.id, nullable, UNIQUE when set), type (`agency`/`labour`), name (used when no supplier_ref), phone, gstin, pan, bank fields (when no supplier_ref), kyc_status, bank_verified, default_retention_pct, performance_score, status |
| `projects` | name, client, location, budget, design_pm_employee_id, project_head_employee_id, status |
| `project_assignments` | employee_id, project_id, gate_roles text[] |
| `work_orders` | wo_no UNIQUE, contractor_profile_id, project_id, track, scope, wo_value, payment_terms, retention_pct, advance_pct, ld_clause, dlp_months, status |
| `wo_boq_items` | work_order_id, description, unit, agreed_rate, total_qty |
| `advances` | work_order_id, amount, security_ref, status, recovered_to_date |
| `attendance` | project_id, contractor_profile_id, work_date, headcount, man_days, evidence_path, ai_confidence, source, confirmed_by, confirmed_at |
| `dpr_entries` | project_id, work_date, summary, evidence_paths[] |
| `site_evidence` | work_order_id, kind, file_path, geo_lat, geo_lng, taken_at, uploaded_by |
| `measurements` | work_order_id, boq_item_id, qty, mb_ref, locked, certified_by, certified_at |
| `ra_bills` | ra_no UNIQUE, work_order_id, bill_date, gross, cumulative, pct_utilised, status |
| `ra_bill_items` | ra_bill_id, boq_item_id, qty, rate, amount |
| `wage_sheets` | wage_no UNIQUE, project_id, contractor_profile_id, period_start, period_end, total_man_days, rate, gross, status |
| `deductions` | bill_id, retention, advance_recovery, debit_notes, tds_it, gst_tds, ld, hold, net_payable, each with `*_source` |
| `ai_checks` | bill_id, gate, result jsonb, confidence, confidence_reason, flags[], passed, human_corrected, confirmed_by, confirmed_at |
| `approvals` | bill_id, level, required_role, status, approver_employee_id, acted_at, remarks |
| `payments` | payment_no UNIQUE, bill_id, amount_paid, mode, utr, bank, paid_at, payslip_path |
| `retention_ledger` | work_order_id, held_total, tranche1_released_at, tranche2_released_at, dlp_start, dlp_end |
| `advance_ledger` | work_order_id, opening, recovered, balance |
| `holds` | bill_id, category, amount, reason, evidence_path, created_by, released_by, released_at |
| `change_orders` | work_order_id, value, reason, schedule_impact, status, approved_by |
| `audit_log` | entity, entity_id, action, before jsonb, after jsonb, employee_id, user_name, user_role, device_fingerprint, off_hours, logged_at |
| `lcs_config` | key UNIQUE, value, description |

**Numbering functions:** `lcs_next_wo_number()` → `HI-LWO-YYYY-NNNN`; `lcs_next_ra_number(wo)`; `lcs_next_wage_number()`; `lcs_next_payment_number()`.
**RLS:** enable on all; policies read `public.get_my_role()` + `lcs.project_assignments`; `auditor`/`founder` read-all; field writes only for assigned projects; audit log append-only; Edge-Function/n8n writes use `user_name` system markers.

---

## 10. Workflow & state machines
- **Gate pipeline per bill/wage:** `submitted → ai_checked → (flagged ⇄ resolved) → confirmed → approved → paid`. No gate skipped; a flag must be resolved with a logged reason; rejection returns upstream with reason. Bills `< ₹10,000` use short path (G1,G2,G5,G7) — *threshold to confirm*.
- **Approval matrix (net payable; thresholds to confirm):** L1 ≤₹1L `project_manager` · L2 ₹1L–5L `management` (Project Head) · L3 ₹5L–25L `management`/Director Ops · L4 >₹25L `founder`. Escalations: cumulative >80% WO → +1; ≥3 open bills → +1; first bill new contractor → +1; idle 48h → backup; founder override anywhere (logged).
- **Deductions:** `Net = Gross − Retention − Advance recovery − Debit notes − TDS − GST TDS − LD − Hold`. Defaults (confirm): retention 10% civil/MEP or 5% finishing; advance recovery = (advance ÷ WO value) × gross each bill until cleared; TDS 1% w/PAN, 20% w/o; GST TDS 2% govt/PSU only. Net ≥ 0; below-default override needs finance-head approval (logged).
- **Retention & DLP:** auto-deducted to `retention_ledger`; Tranche 1 (50%) on PC; DLP default 12 months; Tranche 2 (50%) on DLP expiry + no-dues + no-defect.

---

## 11. Screens (self-explanatory)
Every screen states *what to do now* in one line; one primary action; AI result shown as “✓ checked” / “⚠ needs a look — <reason>”.
- Mobile capture (`site_engineer`): Today's site → Mark attendance / Add work photo / Add measurement / Submit bill.
- My confirmations: queue of AI-checked items with Confirm / Flag.
- Design PM (`project_manager`): assigned projects, pending confirmations, remote gate review, L1 approvals.
- Finance: deduction review, bank-match, payment + UTR + payslip.
- Director/MD (`management`/`founder`): approvals by level, spot-check queue, retention exposure, project spend, exceptions log.
- Auditor: read-only + audit log.
- Contractor submission (agency): tokenised typeform-style RA-bill upload (reuse CPS vendor-portal token pattern; validate with simple `.maybeSingle()` query, no nested joins).

---

## 12. n8n + WhatsApp (notifications only)
Reuse Maytapi + n8n (Railway) for alerts + out-of-app director approval (PDF + TinyURL link, like CPS Build 5). **Never for capture.** Webhook URLs in `lcs.lcs_config`. Follow CPS n8n gotchas (remove `pinData` before deploy; Maytapi media = base64 data URI; Supabase REST `=eq.{{…}}`; `Prefer: return=representation`; audit rows `user_name='n8n-automation'`).

---

## 13. Build sequence (one phase at a time; confirm via live Supabase + page audit between phases)
| Phase | Delivers | Done when |
|---|---|---|
| 0 | Re-verify live Hub; `CREATE SCHEMA lcs`; expose it; `lcs_config`; numbering fns; RLS helpers | `SELECT` confirms schema + `v_contractors` reads suppliers |
| 1 | App scaffold (CPS stack) + token-handoff `/auth/callback` + `ProtectedRoute` + module gating (`lcs` in roles/`employee_module_access`) | Login at Hub → LCS opens logged-in, gated |
| 2 | Masters: `contractor_profiles` (+supplier link), `projects`, `project_assignments`, `work_orders`, `wo_boq_items`; onboarding w/ bank-verification gate | Onboard a contractor + raise a WO |
| 3 | Mobile capture: attendance, site_evidence, dpr; storage bucket `lcs-evidence` | Field user submits attendance + photos |
| 4 | Edge Function `lcs-ai-check` + per-gate checkers + `ai_checks` + confirm UI | G1/G2/attendance check→confirm end-to-end |
| 5 | Billing: `ra_bills`/items, `wage_sheets`, ceiling, contractor portal token | Bill/wage built from verified data |
| 6 | Deduction engine + ledgers | Net payable matches worked example |
| 7 | Gate pipeline + approval matrix + escalations + holds | Bill flows G1→G7 with routing |
| 8 | Payment + UTR + payslip; retention tranches + DLP tracker | Payment recorded; retention tracked |
| 9 | Role dashboards + spot-check queue + audit views | Each role sees its self-explanatory view |
| 10 | n8n + Maytapi notifications + director WhatsApp approval | Alerts fire; L3/L4 WhatsApp approval works |

Each phase: descriptive migration → verify with `SELECT` → frontend → `npm run build && vercel --prod --yes`.

---

## 14. Impact map
**New (all additive):** one Vercel sub-app; the `lcs` schema (all objects above); storage bucket `lcs-evidence`; Edge Function `lcs-ai-check`; new n8n workflows; portal module entry; `module_id='lcs'` rows + `'lcs'` added to chosen roles' `default_modules`.
**Read-only touch:** `cps.cps_suppliers` (via `lcs.v_contractors`), `public.employees`/`roles`/`employee_module_access`.
**Never touched:** existing columns/tables/functions in `public`/`cps`/`finance`; CPS & Finance behaviour and workflows.

---

## 15. Guardrails (do not violate)
1. Re-verify live Hub state before each migration; live DB is truth.
2. New objects in `lcs` only; expose `lcs` via API settings.
3. Read existing tables; the only shared writes are additive module-access rows — never alter/drop/rewrite existing data.
4. Migrations numbered, idempotent, verified; config in `lcs_config`.
5. AI runs via the `lcs-ai-check` Edge Function (key server-side); **AI never approves or pays** — a human confirms.
6. Keep honest-limit controls: submitter binding, spot-check queue, no auto-dismiss of flags.
7. Audit log append-only; log same-person consecutive gates + off-hours actions.
8. One build phase / one task at a time; confirm via live Supabase + live page audit before advancing.

---

## 16. Open items to confirm (do not block Phases 0–3)
1. `project_manager` structure — one assigned design lead per project, or collective? Who is Project Head (`management`)?
2. Thresholds/rates — approval levels, retention/advance %, DLP months, < ₹10,000 short-path.
3. Direct-labour wage cycle — weekly or fortnightly? Day rate per trade or per worker?
4. Any site that genuinely can't use the app (then add office-staff-enters-on-behalf fallback in Phase 3).

---

*Hagerstone International Pvt. Ltd. · +91 88829 79328 · www.hagerstone.com · world@hagerstone.com*

# Session — 2026-06-03 · Phase 5 (Billing)

**Covers:** PRD Phase 5 — bills/wages built from verified data.
**Done when:** bill/wage built from verified data. ✅ (core; contractor portal token deferred as a sub-item)

---

## Migration `lcs_011_billing`
- **Track A (measured):**
  - `measurements` — Measurement Book: work_order_id, boq_item_id, qty, mb_ref, locked, certified_by/at, ra_bill_id. RA-bill creation writes locked MB rows.
  - `ra_bills` — `ra_no` UNIQUE (per-WO, set by `set_ra_no` trigger via `lcs_next_ra_number`), bill_date, gross, cumulative, pct_utilised, status.
  - `ra_bill_items` — boq_item_id, description/unit snapshot, qty, locked rate, amount.
- **Track B (attendance):**
  - `wage_sheets` — `wage_no` default `lcs_next_wage_number()`, project, contractor, period, total_man_days, rate (thekedar) / null (direct), gross, status.
  - `wage_sheet_lines` — per-worker (worker_id, name snapshot, man_days, rate, amount) for direct.
- **Cumulative ceiling:** `enforce_ra_ceiling` trigger (BEFORE INSERT/UPDATE of gross,status) sets `cumulative` = prior non-rejected bills + this gross, sets `pct_utilised`, and **raises if cumulative > work_orders.wo_value**.
- updated_at triggers; RLS (read=is_lcs_user; write=procurement/admin/ai/management/founder/project_manager/site_engineer); grants.

## DB verification (then cleaned up)
- WO value 100000 → RA-001 60000 (cum 60000, 60%), RA-002 30000 (cum 90000, 90%) ✅; RA-003 (+20000 → 110%) **blocked by the ceiling trigger** ✅; wage sheet generated (`HI-WAGE-2026-0003`). All `__BILLTEST%` rows deleted.

## Frontend
- `src/lib/billing.ts` — `useBoqItems`, `useRaBills`, `useCreateRaBill` (computes gross, inserts bill → items → locked measurements; ceiling enforced by DB), `useWageAttendance` (pulls attendance + per-worker `attendance_lines`, aggregates gang man-days and per-worker man-days×rate), `useWageSheets`, `useCreateWageSheet`.
- `src/pages/Billing.tsx` — two tabs:
  - **RA bills (measured):** pick a measured WO → live **ceiling bar** (billed-so-far + this bill vs WO value, turns red if over) → enter measured qty per BOQ item at locked rate → "Raise RA bill" (blocked client-side and by DB if over ceiling). History list with ra_no/cum/%.
  - **Wage sheets (attendance):** pick project + labour contractor + period → "Load attendance" → **direct**: per-worker man-days×rate table → gross; **thekedar**: gang man-days × rate input → gross → "Generate wage sheet". History list.
- `AppShell` — new **Billing** nav group (live); removed from "soon". Route `/billing` added.
- `tsc` clean; build green; deployed `9bc5b92`.

## Notes / deviations
- RA `gross` is computed in the app and validated by the DB ceiling trigger (defence in depth). Bill status starts `submitted` (the Phase 7 gate pipeline will advance it).
- Wage sheets currently include all attendance in the period; tightening to only `confirmed` attendance can be added when the capture-confirm step is wired.
- **Contractor portal token (tokenised RA-bill upload)** is the remaining Phase 5 sub-item — deferred; will reuse the CPS vendor-portal token pattern (public route, `.maybeSingle()` validation).

## Next
Finish the contractor portal token (optional), or proceed to Phase 6 (deduction engine + ledgers: Net = Gross − retention − advance recovery − debit notes − TDS − GST TDS − LD − hold).

# Session — 2026-06-03 · Phase 3 (mobile capture) + Phase 2 polish

**Covers:** contractor autofill fix, the lcs-schema-exposure incident, and Phase 3 (mobile capture).
**Done when (PRD Phase 3):** field user submits attendance + photos. ✅

---

## Phase 2 polish (from audit feedback)
- **Supplier search was empty** → root cause was NOT the dual client; it was that **`lcs` was not exposed to the REST API**. The Dashboard "Exposed schemas" save did not persist (stored `authenticator.pgrst.db_schemas` stayed `public, finance, cps, facade`). Verified via REST (`PGRST106`) + `pg_roles`. **Fixed** with `alter role authenticator set pgrst.db_schemas = 'public, finance, cps, facade, lcs'; notify pgrst,'reload config'; notify pgrst,'reload schema';` (additive — preserves other schemas). Re-test REST → 200. If it recurs (another team re-saves exposed schemas), re-run that ALTER. Always verify with a REST curl, not `set role`.
- Added global query-error surfacing (`QueryCache.onError` toast) so failures (esp. PGRST106) aren't silent empty states.
- **`lcs_006_expand_supplier_view`** — exposed `phone`, `bank_account_holder_name`, `bank_account_number` in `v_cps_suppliers`; **revoked anon** (bank data → authenticated only). Contractor form now auto-fills phone + account holder + account number on link, and locks a field only when CPS actually has that value (the 722 suppliers without bank data stay editable). Coverage: 38/760 have bank details; `last4` column is empty/unused.

## Vercel deploy gotcha (resolved)
- Deploys were landing in **BLOCKED** state (empty build logs) — cause: the **git commit author** was `it@3tattva.com`, not a Vercel team member; Vercel blocks prod deploys from unauthorized authors. **Fix:** set local `git config user.email ai@hagerstone.com`. Subsequent pushes → READY. Recorded in CLAUDE.md.

## Phase 3 — mobile capture
### Migrations
- **`lcs_007_capture`**: `attendance` (header muster), `attendance_lines` (per-worker, DIRECT), `site_evidence` (photos w/ geo+timestamp), `dpr_entries` (daily progress). Helpers `lcs.my_employee_id()`, `lcs.can_capture_for(project)` (managers anywhere; field staff only for assigned projects via `project_assignments`). RLS on all 4; grants. Verified: 4 tables, 8 policies, 2 helpers.
- **`lcs_008_evidence_bucket`**: private `lcs-evidence` Storage bucket + `storage.objects` policies scoped to that bucket AND `lcs.is_lcs_user()`. Verified: bucket + 3 policies.

### Frontend
- `src/lib/capture.ts` — hooks: useMyAssignments, useProjectAssignments, useAssignStaff, useTodayAttendance, useMarkAttendance (header + per-worker lines), useTodayEvidence, useUploadEvidence (storage upload → site_evidence insert, captures geolocation + timestamp), useSaveDpr, signedEvidenceUrl.
- `src/pages/Capture.tsx` — mobile-first: pick assigned site → segmented **Attendance / Photo / Progress**.
  - Attendance: pick labour contractor → **thekedar** = headcount + man-days; **direct** = tick present workers from roster (full/half day), auto-computes headcount + man-days; unique-per-day guard surfaces a friendly message.
  - Photo: file input with `capture="environment"` (camera), grabs geolocation, kind selector, note → uploads to `lcs-evidence`.
  - Progress: daily summary note.
  - "Today on <site>" recap of attendance + evidence.
- `src/pages/Projects.tsx` — added **ProjectStaff** assign UI in the project edit panel (managers assign site_engineer/PM with gate_roles G1–G3).
- `AppShell.tsx` — **Capture** nav now live (Field group + mobile bottom-nav); removed from "soon".
- Routes: `/capture` added (protected).
- `tsc --noEmit` clean; build green.

### Deploy
- Pushed `b237f7c` (author ai@hagerstone.com) → Vercel auto-deploy **READY** (`dpl_A2bqD2…`). `/capture` live (200).

## Deviations / notes
- Altered shared `authenticator` role config to expose `lcs` (additive) — necessary because the dashboard wasn't persisting. Documented.
- `v_cps_suppliers` now returns full account numbers to authenticated LCS users (needed for autofill); anon revoked. Tightening to lcs-users-only via a SECURITY DEFINER function is a possible future hardening.

## Direct-labour payment model (post-Phase-3 refinement, user-driven)
- **Decision:** for DIRECT labour we pay each worker individually (cash/UPI/bank), so payment details + verification live on each **worker**, captured **on the onboarding page** — not a group bank account. Thekedar/agency unchanged (pay the group).
- **`lcs_009_worker_payment`:** workers += payment_mode (cash|upi|bank_transfer), upi_id, bank_*, payment_verified; contractor_profiles += payment_mode; `enforce_wo_bank_verified` now exempts direct labour groups (per-worker verification enforced later at wage/payment time).
- **Frontend:** new `WorkerFields` component (name/phone/skill/rate + payment mode + conditional UPI/bank + verify). Contractor onboarding: for direct, the group-bank block is replaced by an inline "Workers (paid individually)" list (add/remove, each with payment details); validation requires ≥1 valid worker instead of group bank; on save creates the group + bulk-inserts workers. WorkersPanel: direct uses `WorkerFields` for adding more later + shows payment mode/verified badges; thekedar keeps the simple attendance-only quick-add. Contractor list shows "direct · pays workers" instead of a bank badge for direct groups.
- Deployed `5acaec0`.

## Next (Phase 4)
Edge Function `lcs-ai-check` + per-gate AI checkers (G1 work-evidence, attendance man-day count from muster photo, G2 measurement) + `ai_checks` table + confirm UI. Key server-side (never browser). Confirm current vision-capable Claude model string from docs.claude.com first.

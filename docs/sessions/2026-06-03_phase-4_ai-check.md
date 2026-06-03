# Session — 2026-06-03 · Phase 4 (lcs-ai-check Edge Function + confirm UI)

**Covers:** PRD Phase 4 — the first server-side/AI piece.
**Done when:** G1/attendance check → confirm end-to-end. ✅ (built & deployed; live Claude call verifiable once a photo is captured)

---

## Model + key
- Confirmed via CPS codebase + environment: **`claude-sonnet-4-6`** (vision-capable, current). CPS calls Claude from the **browser** (`VITE_ANTHROPIC_API_KEY`) — PRD says NOT to copy that; LCS keeps the key **server-side**.
- Supabase secret **`ANTHROPIC_API_KEY` is already set** on the project (probe returned "evidence not found", not "key not set"). `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are auto-injected into Edge Functions.

## Migration
- **`lcs_010_ai_checks`**: `ai_checks` (project_id, entity, entity_id, gate, result jsonb, confidence, confidence_reason, flags[], passed, model, human_corrected, confirmed_by/at, created_by) + indexes + RLS (read/write = `is_lcs_user`; Edge Function uses service role) + grants.

## Edge Function `lcs-ai-check` (the ONLY server-side code)
- Source: `supabase/functions/lcs-ai-check/index.ts`. Deployed via MCP, **ACTIVE, verify_jwt=true**.
- Input `{ gate, entity_id, claim? }`. Resolves the `site_evidence` row (service role, schema `lcs`) → downloads the image from the private `lcs-evidence` bucket → base64 → Claude vision (`claude-sonnet-4-6`) with a **gate-specific system prompt**:
  - `attendance` → headcount estimate from a muster/group photo.
  - `G1` → is the photo consistent with the claim (note)?
  - `G2` → OCR a measurement sheet into line items.
- Forces JSON output `{ ...fields, confidence 0-100, confidence_reason, flags[] }`; reads threshold from `lcs_config.ai_confidence_threshold` (70); `passed` = confidence≥threshold AND no flags; inserts the `ai_checks` row; returns it. CORS + robust JSON-extraction fallback included.

## Frontend
- `src/lib/aichecks.ts` — `useAiChecks`, `useRunAiCheck` (calls `supabase.functions.invoke('lcs-ai-check')`, surfaces function error bodies), `useResolveAiCheck` (confirm sets confirmed_by/at; flag sets human_corrected + logged reason), `gateForKind` (muster→attendance, measurement→G2, else G1).
- `src/lib/capture.ts` — added `useProjectEvidence` (recent evidence per project).
- `src/pages/Confirmations.tsx` — pick site → list recent evidence → per item **Run AI check (gate)** → shows **✓ checked / ⚠ needs a look** + confidence + reason + flags + a plain-language result line → **Confirm / Flag** (flag prompts for a logged reason). View opens a signed URL to the photo.
- `AppShell` — **Confirmations** nav now live (Field group + bottom-nav); removed from "soon". Route `/confirmations` added.
- `tsc` clean; build green; deployed `c1fe78b` (READY).

## Honest-limit controls (PRD §8.5) honored
- AI records an assessment; a **named human confirms** (sets confirmed_by). AI never confirms itself. Flags are not auto-dismissed — flagging logs a reason. Submitter binding is via `site_evidence.uploaded_by`.

## How to test live
Capture → upload a photo (muster for attendance, work photo for G1) → Confirmations → pick the site → **Run AI check** → see result → Confirm or Flag. If the API key is invalid you'll see a `claude_error` toast.

## Next (Phase 5)
Billing: `ra_bills`/`ra_bill_items`, `wage_sheets`, cumulative ceiling vs WO value, contractor portal token (reuse CPS vendor-portal token pattern). Wire G2 measurement → RA bill reconciliation; attendance → wage sheet.

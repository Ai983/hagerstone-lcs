// LCS AI checker — the ONLY server-side code (PRD §4). Routes by `gate`, reads an
// evidence image from the private lcs-evidence bucket via the service role, asks
// Claude (vision) to assess it, records the result in lcs.ai_checks, and returns it.
// The Claude API key stays server-side (Supabase secret ANTHROPIC_API_KEY) — never in the browser.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL = "claude-sonnet-4-6"; // vision-capable, current (mirrors CPS)
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Gate → prompt + output contract. Every gate returns confidence 0-100 + confidence_reason + flags[].
function promptFor(gate: string, ctx: { kind?: string; note?: string; claim?: string }) {
  const base =
    "You are an independent verification assistant for a construction labour & contractor system. " +
    "You are shown one site photo. Be precise and conservative. Respond with ONLY a JSON object, no prose, no markdown.";
  if (gate === "attendance") {
    return {
      system:
        base +
        ' Count the people visible who appear to be workers. Return JSON: {"headcount_estimate": <int>, "confidence": <0-100>, "confidence_reason": "<short>", "flags": ["<issue>", ...], "notes": "<short>"}. ' +
        "Lower confidence if faces/bodies are occluded, blurry, or the photo is not a clear muster/group shot. flags=[] if none.",
    };
  }
  if (gate === "G2") {
    return {
      system:
        base +
        ' This is a measurement sheet / BOQ photo. OCR it. Return JSON: {"line_items": [{"description": "<str>", "unit": "<str|null>", "qty": <number|null>}], "confidence": <0-100>, "confidence_reason": "<short>", "flags": ["<issue>", ...]}. ' +
        "Lower confidence for unclear handwriting or partial sheets.",
    };
  }
  // default G1 work-evidence: does the photo support the claimed work?
  return {
    system:
      base +
      ` The site team claims: "${ctx.claim ?? ctx.note ?? "work was done"}". ` +
      'Assess whether the photo is consistent with that claim. Return JSON: {"consistent": <true|false>, "observations": "<what you see, short>", "confidence": <0-100>, "confidence_reason": "<short>", "flags": ["<issue>", ...]}. ' +
      "flags should include things like 'photo too generic', 'cannot verify location', 'image unclear'.",
  };
}

function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function mediaType(path: string, blobType?: string) {
  if (blobType && blobType.startsWith("image/")) return blobType;
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not set on the Edge Function" }, 500);

    const { gate, entity_id, claim } = await req.json();
    if (gate !== "attendance" && gate !== "G1" && gate !== "G2") return json({ error: "invalid gate" }, 400);
    if (!entity_id) return json({ error: "entity_id (a site_evidence id) is required" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, serviceKey, { db: { schema: "lcs" } });

    // 1) Resolve the evidence row (trusted: project_id/path come from the DB, not the caller).
    const { data: ev, error: evErr } = await db
      .from("site_evidence")
      .select("id, project_id, kind, note, file_path")
      .eq("id", entity_id)
      .maybeSingle();
    if (evErr || !ev) return json({ error: "evidence not found" }, 404);

    // 2) Download the image (private bucket, service role).
    const dl = await db.storage.from("lcs-evidence").download(ev.file_path);
    if (dl.error || !dl.data) return json({ error: "could not read evidence file" }, 404);
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const media = mediaType(ev.file_path, (dl.data as Blob).type);

    // 3) Ask Claude (vision).
    const { system } = promptFor(gate, { kind: ev.kind, note: ev.note, claim });
    const aiResp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data: b64(bytes) } },
            { type: "text", text: "Analyse the photo and return the JSON described in your instructions." },
          ],
        }],
      }),
    });
    if (!aiResp.ok) {
      const t = await aiResp.text();
      return json({ error: "claude_error", detail: t.slice(0, 500) }, 502);
    }
    const ai = await aiResp.json();
    const text: string = ai?.content?.[0]?.text ?? "";
    let result: Record<string, unknown> = {};
    try {
      result = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      result = m ? JSON.parse(m[0]) : { parse_error: true, raw: text.slice(0, 500) };
    }

    const confidence = typeof result.confidence === "number" ? Math.round(result.confidence) : null;
    const flags = Array.isArray(result.flags) ? result.flags.map(String) : [];

    // 4) Threshold from lcs_config (default 70).
    const { data: cfg } = await db.from("lcs_config").select("value").eq("key", "ai_confidence_threshold").maybeSingle();
    const threshold = typeof cfg?.value === "number" ? cfg.value : 70;
    const passed = confidence != null && confidence >= threshold && flags.length === 0;

    // 5) Record the AI assessment (human confirmation happens later, in the app).
    const { data: row, error: insErr } = await db
      .from("ai_checks")
      .insert({
        project_id: ev.project_id,
        entity: "site_evidence",
        entity_id: ev.id,
        gate,
        result,
        confidence,
        confidence_reason: (result.confidence_reason as string) ?? null,
        flags,
        passed,
        model: MODEL,
      })
      .select()
      .single();
    if (insErr) return json({ error: "could not save ai_check", detail: insErr.message }, 500);

    return json({ ai_check: row, threshold });
  } catch (e) {
    return json({ error: "unhandled", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});

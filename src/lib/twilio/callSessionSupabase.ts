import { getSupabaseAdmin } from "@/lib/supabase/admin";

function nowIso() {
  return new Date().toISOString();
}

/** Observability row (table exists in `supabase_schema.sql`). */
export async function insertVoicePipelineEvent(entry: {
  callId: string;
  step: string;
  detail: string;
  durationMs?: number;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from("voice_pipeline_events").insert({
    call_id: entry.callId,
    step: entry.step,
    detail: entry.detail.slice(0, 8000),
    duration_ms: entry.durationMs ?? null,
  });
  if (error) console.warn("[voice_pipeline_events]", error.message);
}

type TwilioParams = Record<string, string>;

export async function upsertCallSessionInbound(params: TwilioParams): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || !params.CallSid) return;

  const row: Record<string, unknown> = {
    call_sid: params.CallSid,
    account_sid: params.AccountSid ?? null,
    from_e164: params.From ?? null,
    to_e164: params.To ?? null,
    direction: params.Direction ?? "inbound",
    call_status: params.CallStatus ?? "in-progress",
    updated_at: nowIso(),
    started_at: nowIso(),
    raw_last_payload: params,
  };

  const { error } = await admin.from("call_sessions").upsert(row, { onConflict: "call_sid" });
  if (error) console.warn("[call_sessions] inbound", error.message);
}

export async function recordCallSessionGatherTurn(params: {
  callSid: string;
  from?: string;
  speech: string;
  aiReply: string;
  geminiError?: string | null;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || !params.callSid) return;

  const patch = {
    speech_input: params.speech.slice(0, 4000),
    ai_reply_preview: params.aiReply.slice(0, 4000),
    gemini_error: params.geminiError?.slice(0, 2000) ?? null,
    updated_at: nowIso(),
  };

  const { data: row, error: selErr } = await admin
    .from("call_sessions")
    .select("call_sid")
    .eq("call_sid", params.callSid)
    .maybeSingle();

  if (selErr) {
    console.warn("[call_sessions] gather select", selErr.message);
    return;
  }

  if (row) {
    const { error } = await admin.from("call_sessions").update(patch).eq("call_sid", params.callSid);
    if (error) console.warn("[call_sessions] gather update", error.message);
    return;
  }

  const insert: Record<string, unknown> = {
    call_sid: params.callSid,
    from_e164: params.from ?? null,
    ...patch,
    started_at: nowIso(),
    call_status: "in-progress",
    raw_last_payload: {},
  };
  const { error } = await admin.from("call_sessions").insert(insert);
  if (error) console.warn("[call_sessions] gather insert", error.message);
}

export async function updateCallSessionStatus(params: TwilioParams): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || !params.CallSid) return;

  const duration = params.CallDuration ? parseInt(params.CallDuration, 10) : null;
  const terminal = ["completed", "busy", "failed", "no-answer", "canceled"].includes(
    (params.CallStatus || "").toLowerCase()
  );

  const patch: Record<string, unknown> = {
    call_status: params.CallStatus ?? null,
    duration_sec: Number.isFinite(duration) ? duration : null,
    updated_at: nowIso(),
    raw_last_payload: params,
  };
  if (terminal) patch.ended_at = nowIso();

  const { error } = await admin.from("call_sessions").update(patch).eq("call_sid", params.CallSid);
  if (error) console.warn("[call_sessions] status", error.message);
}

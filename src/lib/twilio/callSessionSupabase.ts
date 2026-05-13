import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { displayNameForCaller, guessDealerHint } from "@/lib/twilio/voiceIntent";

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

  const from = params.From ?? "";
  const defaultAgent = process.env.VOICE_DEFAULT_AGENT_ID?.trim() || "agent-support-1";

  const row: Record<string, unknown> = {
    call_sid: params.CallSid,
    account_sid: params.AccountSid ?? null,
    from_e164: from || null,
    to_e164: params.To ?? null,
    direction: params.Direction ?? "inbound",
    agent_id: defaultAgent,
    call_status: params.CallStatus ?? "in-progress",
    updated_at: nowIso(),
    started_at: nowIso(),
    raw_last_payload: params,
    dashboard_state: "ringing",
    pipeline_step_index: 0,
    caller_display_name: from ? displayNameForCaller(from) : null,
    dealer_code_hint: from ? guessDealerHint(from) : null,
    human_takeover: false,
    escalation: false,
  };

  const { error } = await admin.from("call_sessions").upsert(row, { onConflict: "call_sid" });
  if (error) console.warn("[call_sessions] inbound", error.message);
}

export async function patchCallSessionBySid(
  callSid: string,
  patch: Record<string, unknown>
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || !callSid) return;
  const { error } = await admin
    .from("call_sessions")
    .update({ ...patch, updated_at: nowIso() })
    .eq("call_sid", callSid);
  if (error) console.warn("[call_sessions] patch", error.message);
}

export async function getCallSessionFlags(callSid: string): Promise<{
  human_takeover: boolean;
} | null> {
  const admin = getSupabaseAdmin();
  if (!admin || !callSid) return null;
  const { data, error } = await admin
    .from("call_sessions")
    .select("human_takeover")
    .eq("call_sid", callSid)
    .maybeSingle();
  if (error || !data) return null;
  return { human_takeover: Boolean((data as { human_takeover?: boolean }).human_takeover) };
}

export async function insertVoiceCallTranscript(entry: {
  callSid: string;
  speaker: "system" | "caller" | "ai";
  body: string;
  pipelineStep?: string | null;
  intentHint?: string | null;
  confidence?: number | null;
  meta?: Record<string, unknown>;
}): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin || !entry.callSid) return null;
  const row = {
    call_sid: entry.callSid,
    speaker: entry.speaker,
    body: entry.body.slice(0, 8000),
    pipeline_step: entry.pipelineStep ?? null,
    intent_hint: entry.intentHint ?? null,
    confidence: entry.confidence ?? null,
    meta: entry.meta ?? {},
  };
  const { data, error } = await admin.from("voice_call_transcripts").insert(row).select("id").single();
  if (error) {
    console.warn("[voice_call_transcripts]", error.message);
    return null;
  }
  return (data as { id?: string })?.id ?? null;
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
    dashboard_state: "thinking",
    pipeline_step_index: 3,
    agent_id: process.env.VOICE_DEFAULT_AGENT_ID?.trim() || "agent-support-1",
  };
  const { error } = await admin.from("call_sessions").insert(insert);
  if (error) console.warn("[call_sessions] gather insert", error.message);
}

/**
 * Inserts a record into the `escalations` table when the AI detects a
 * handover signal. The dashboard subscribes to this table via Realtime
 * so supervisors see an alert within seconds.
 */
export async function insertEscalationRecord(params: {
  callSid: string;
  reason: string;
  fromE164?: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || !params.callSid) return;
  const { error } = await admin.from("escalations").insert({
    call_sid: params.callSid,
    reason: params.reason.slice(0, 1000),
    status: "open",
    meta: { from_e164: params.fromE164 ?? null },
  });
  if (error) console.warn("[escalations] insert", error.message);
}

/**
 * Returns previous caller + AI transcript turns for a call, oldest-first.
 * Used to build Gemini conversation history so the AI remembers prior turns
 * within the same inbound call session.
 */
export async function getCallConversationHistory(
  callSid: string,
  limit = 20
): Promise<{ role: string; content: string }[]> {
  const admin = getSupabaseAdmin();
  if (!admin || !callSid) return [];
  const { data, error } = await admin
    .from("voice_call_transcripts")
    .select("speaker,body,created_at")
    .eq("call_sid", callSid)
    .in("speaker", ["caller", "ai"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return (data as { speaker: string; body: string }[]).map((row) => ({
    role: row.speaker === "caller" ? "user" : "assistant",
    content: row.body,
  }));
}

/**
 * When Twilio only hits the status callback (inbound webhook timed out, or race),
 * ensure a row exists so the dashboard and logs still show From / To / failed state.
 */
export async function ensureCallSessionFromStatusIfMissing(params: TwilioParams): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || !params.CallSid) return;

  const { data, error: selErr } = await admin
    .from("call_sessions")
    .select("call_sid")
    .eq("call_sid", params.CallSid)
    .maybeSingle();
  if (selErr || data) return;

  const from = params.From ?? "";
  const tsRaw = params.Timestamp;
  const tsSec = tsRaw ? parseInt(tsRaw, 10) : NaN;
  const startedAt = Number.isFinite(tsSec) ? new Date(tsSec * 1000).toISOString() : nowIso();

  const row: Record<string, unknown> = {
    call_sid: params.CallSid,
    account_sid: params.AccountSid ?? null,
    from_e164: from || null,
    to_e164: params.To ?? null,
    direction: params.Direction ?? "inbound",
    agent_id: process.env.VOICE_DEFAULT_AGENT_ID?.trim() || "agent-support-1",
    call_status: params.CallStatus ?? null,
    started_at: startedAt,
    updated_at: nowIso(),
    raw_last_payload: params,
    dashboard_state: "ended",
    pipeline_step_index: 0,
    caller_display_name: from ? displayNameForCaller(from) : null,
    dealer_code_hint: from ? guessDealerHint(from) : null,
    human_takeover: false,
    escalation: false,
  };

  const { error } = await admin.from("call_sessions").upsert(row, {
    onConflict: "call_sid",
    ignoreDuplicates: true,
  });
  if (error) console.warn("[call_sessions] ensure from status", error.message);
}

/** Fire-and-forget after TwiML is returned — never block Twilio on Supabase latency. */
export async function persistInboundVoiceTelemetry(params: TwilioParams): Promise<void> {
  if (!params.CallSid) return;
  try {
    await upsertCallSessionInbound(params);
    await Promise.all([
      insertVoicePipelineEvent({
        callId: params.CallSid,
        step: "CALL_RECEIVED",
        detail: `From=${params.From ?? ""} To=${params.To ?? ""} Status=${params.CallStatus ?? ""}`,
      }),
      insertVoiceCallTranscript({
        callSid: params.CallSid,
        speaker: "system",
        body: `Inbound call — ${params.From ?? "?"} → ${params.To ?? "?"}. AI agent answering via Gemini + Twilio TTS.`,
        pipelineStep: "Incoming Call",
      }),
      patchCallSessionBySid(params.CallSid, {
        pipeline_step_index: 2,
        dashboard_state: "ringing",
      }),
    ]);
  } catch (e) {
    console.error("[voice inbound] persist telemetry failed", e instanceof Error ? e.message : e);
  }
}

export async function updateCallSessionStatus(params: TwilioParams): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || !params.CallSid) return;

  await ensureCallSessionFromStatusIfMissing(params);

  const duration = params.CallDuration ? parseInt(params.CallDuration, 10) : null;
  const terminal = ["completed", "busy", "failed", "no-answer", "canceled"].includes(
    (params.CallStatus || "").toLowerCase()
  );

  const patch: Record<string, unknown> = {
    call_status: params.CallStatus ?? null,
    duration_sec: Number.isFinite(duration) ? duration : null,
    updated_at: nowIso(),
    raw_last_payload: params,
    pipeline_step_index: 8,
  };
  if (terminal) {
    patch.ended_at = nowIso();
    patch.dashboard_state = "ended";
  }

  const { error } = await admin.from("call_sessions").update(patch).eq("call_sid", params.CallSid);
  if (error) console.warn("[call_sessions] status", error.message);
}

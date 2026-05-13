import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generateGeminiResponse } from "@/services/gemini";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(12_000),
  senderRole: z.enum(["customer", "agent"]),
});

export async function POST(req: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for inbox writes." },
      { status: 503 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  const { conversationId, body, senderRole } = parsed.data;

  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .select("id, customer_name, dealer_code, locale, customer_phone, organization_id, ai_confidence")
    .eq("id", conversationId)
    .maybeSingle();

  if (convErr || !conv) {
    return NextResponse.json({ error: convErr?.message || "Conversation not found" }, { status: 404 });
  }

  const orgId = conv.organization_id as string | null;

  const { data: prior, error: priorErr } = await admin
    .from("conversation_messages")
    .select("role, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(60);

  if (priorErr) {
    return NextResponse.json(
      { error: priorErr.message + " (run docs/sql/mvp_platform_tables.sql if the table is missing.)" },
      { status: 500 }
    );
  }

  const roleDb = senderRole === "agent" ? "agent" : "customer";
  const { error: insUserErr } = await admin.from("conversation_messages").insert({
    conversation_id: conversationId,
    role: roleDb,
    body,
  });
  if (insUserErr) {
    return NextResponse.json({ error: insUserErr.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("conversations")
    .update({ last_message: body, updated_at: nowIso })
    .eq("id", conversationId);

  await admin.from("analytics_events").insert({
    organization_id: orgId,
    event_type: senderRole === "agent" ? "inbox_agent_message" : "inbox_customer_message",
    payload: { conversationId, preview: body.slice(0, 240) },
  });

  if (senderRole === "agent") {
    return NextResponse.json({ ok: true, aiReply: null });
  }

  const historyRows = prior ?? [];
  const geminiMessages = [
    ...historyRows.map((m) => {
      if (m.role === "ai") return { role: "assistant" as const, content: m.body };
      if (m.role === "agent") return { role: "user" as const, content: `[Human agent] ${m.body}` };
      return { role: "user" as const, content: m.body };
    }),
    { role: "user" as const, content: body },
  ];

  const dealer = conv.dealer_code ? `Dealer code: ${conv.dealer_code}.` : "";
  const phone = conv.customer_phone ? `Customer line: ${conv.customer_phone}.` : "";
  const systemPrompt = `You are the AI assistant for an omnichannel CRM inbox (Bangladesh operations: Dhaka, Chattogram, Savar logistics).
${dealer} ${phone}
Customer display name: ${conv.customer_name}.
Preferred locale hint: ${conv.locale || "auto"} — reply in Bangla and/or English to match the customer's last message (mixed is fine).
Be concise, operational, and helpful (orders, dealers, delivery). If you lack data, say what you need next.`;

  const { text: aiText, error: gemErr } = await generateGeminiResponse(geminiMessages, systemPrompt);

  const { error: insAiErr } = await admin.from("conversation_messages").insert({
    conversation_id: conversationId,
    role: "ai",
    body: aiText,
    meta: gemErr ? { gemini_error: gemErr } : {},
  });
  if (insAiErr) {
    return NextResponse.json({ error: insAiErr.message }, { status: 500 });
  }

  await admin
    .from("conversations")
    .update({ last_message: aiText, updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  await admin.from("analytics_events").insert({
    organization_id: orgId,
    event_type: "inbox_ai_reply",
    payload: { conversationId, preview: aiText.slice(0, 240), geminiError: gemErr ?? null },
  });

  return NextResponse.json({ ok: true, aiReply: aiText, geminiError: gemErr ?? null });
}

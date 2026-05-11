import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const text = await req.text().catch(() => "");
  return NextResponse.json({
    ok: true,
    receivedBytes: text.length,
    hint: "Persist to Supabase whatsapp_inbound (see schema) and fan-out via Realtime.",
  });
}

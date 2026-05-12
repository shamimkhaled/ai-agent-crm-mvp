import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Twilio **Media Streams** expect a long-lived **WebSocket** endpoint.
 * Vercel serverless and default Next.js 14 App Router **cannot** host that upgrade.
 *
 * Deploy a small **Node `ws`**, **FastAPI**, or **Django Channels** service on Fly.io / Render / EC2,
 * then point `<Connect><Stream url="wss://your-worker/…" /></Connect>` there.
 *
 * @see docs/TWILIO_VOICE_INBOUND_PRODUCTION.md §12
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "not_implemented",
      message:
        "Bidirectional Media Streams require a dedicated WebSocket server. This route is a placeholder so dashboard links resolve.",
      doc: "docs/TWILIO_VOICE_INBOUND_PRODUCTION.md",
    },
    { status: 501 }
  );
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "not_implemented",
      message:
        "Bidirectional Media Streams require a dedicated WebSocket server. This route is a placeholder so dashboard links resolve.",
      doc: "docs/TWILIO_VOICE_INBOUND_PRODUCTION.md",
    },
    { status: 501 }
  );
}

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * MVP stub — replace with Twilio/Plivo/Telnyx/Exotel signature validation and TwiML / XML generation.
 */
export async function POST() {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">This is a stub voice webhook. Configure media streams in the dashboard.</Say>
</Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}

# Real-time AI voice with real callers (production-style guide)

This document explains how to go from **simulator / mock** to **real users on the phone**, using Twilio + this Next.js app + Gemini + your product REST API.

---

## 1. Why you saw “I am currently unable to answer that”

That text is returned when **Gemini throws** (see `src/services/gemini.ts`). Common causes:

| Cause | What to do |
|--------|------------|
| `GOOGLE_GEMINI_API_KEY` missing on the **server** | Add to `.env` in the project root (same place as `npm run dev` / Vercel env). **Restart** `next dev` or redeploy. |
| Key only in browser / Zustand | Gemini runs in **API routes** — only `process.env` on the server counts. |
| Model not enabled for your key | Set `GEMINI_MODEL=gemini-2.0-flash` (default in code) or another model shown in Google AI Studio. |
| Quota / billing / region | Check Google Cloud / AI Studio errors; the API now returns `geminiError` in `/api/chat` JSON for debugging. |

**Quick check:** open `GET /api/voice/gemini-health` on your deployed site (or locally). It must return `"ok": true`.

---

## 2. Environment variables (server)

```env
# Required for AI text (chat + voice transcript path)
GOOGLE_GEMINI_API_KEY=your_key

# Optional — defaults to gemini-2.0-flash
GEMINI_MODEL=gemini-2.0-flash

# Twilio — recommended for production tests (avoids pasting secrets in the browser)
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx

# Your product / CRM REST (example — use in your own route)
PRODUCTS_API_BASE=https://api.yourcompany.com
PRODUCTS_API_KEY=secret
```

Never expose `PRODUCTS_API_KEY` to the client. Call it only from **Route Handlers** under `src/app/api/`.

---

## 3. Two real-time voice architectures (pick one)

### A) **`<Gather>` + HTTP** (simplest “real call”, not streaming audio)

1. Twilio hits your webhook on each user **utterance** (speech result or DTMF).
2. Your route runs **STT** (Twilio can send text in `SpeechResult`) or you use Twilio’s `<Gather input="speech">`.
3. You call **`POST /api/chat`** with `{ messages, crmContext }` where `crmContext` is JSON from **your** `GET /api/crm/...` that proxies `PRODUCTS_API_*`.
4. You return **TwiML** `<Say>` with Gemini’s reply (truncate for voice length).

**Pros:** Few moving parts, easy to demo to investors on a real phone.  
**Cons:** Not sub-second “streaming”; more round trips.

### B) **Media Streams (WebSocket)** (true streaming audio)

1. Twilio opens a **WebSocket** to your server (`<Connect><Stream url="wss://...">`).
2. You decode μ-law/PCM, send frames to **STT** (Google, Deepgram, etc.), get partial text.
3. On “end of utterance”, call Gemini, then **TTS**, then stream audio back on the same WS (or use Twilio’s `<Say>` with polling).

**Pros:** Feels like a product.  
**Cons:** You need a WS server (can be Next.js with a custom server, or a small Node worker). Not included as full code in this MVP repo — the dashboard documents the URL for when you add it.

---

## 4. Twilio console checklist (real phone → your app)

1. **Buy / configure a number** in Twilio.
2. **Voice & Fax** → *A CALL COMES IN* → **Webhook** → `POST` →  
   `https://<your-public-domain>/api/webhooks/voice/inbound`
3. Deploy the app on **HTTPS** (Twilio requires a public URL).
4. Replace the stub in `src/app/api/webhooks/voice/inbound/route.ts` with real TwiML:
   - Either **Gather** flow (section 3A), or  
   - **Connect Stream** (section 3B).
5. **Validate `X-Twilio-Signature`** on every webhook in production (Twilio docs: “Request Validation”).

The current stub only **speaks a sentence** — it does not yet run Gemini. That is expected until you implement 3A or 3B.

---

## 5. Wiring your **product REST API** into the AI (not mock)

Pattern used in this repo:

1. **Optional** `crmContext` on `POST /api/chat` — see `src/app/api/chat/route.ts`.  
   It is appended to the system prompt so Gemini answers with **real** product/dealer/order text.

2. Add a **server-only** route, for example:

   `src/app/api/crm/product-context/route.ts`

   - Reads caller phone or `?sku=` from query.
   - Server-side `fetch(`${process.env.PRODUCTS_API_BASE}/products/...`, { headers: { Authorization: \`Bearer ${process.env.PRODUCTS_API_KEY}\` } })`.
   - Returns JSON.

3. From your **voice webhook handler** (after you know the caller / intent):

   ```ts
   const crmRes = await fetch(`${origin}/api/crm/product-context?phone=${encodeURIComponent(From)}`);
   const crmContext = await crmRes.text();
   const geminiRes = await fetch(`${origin}/api/chat`, {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({
       messages: [{ role: "user", content: userText }],
       crmContext,
     }),
   });
   ```

4. Map **CRM fields → AI fields** in the UI (`/connectors/mapping`) and later mirror that mapping when building `crmContext` JSON in your API route.

---

## 6. Live test plan (production-style, with a real phone)

1. Deploy Next.js with env vars set; confirm `/api/voice/gemini-health` → `ok: true`.
2. Point Twilio voice URL to `/api/webhooks/voice/inbound` (still stub until you add TwiML).
3. Implement **minimal Gather TwiML** that:
   - `<Gather input="speech" action="/api/webhooks/voice/gather" />`
   - `gather` handler calls `/api/chat` with `SpeechResult` + optional `crmContext`.
   - Returns `<Say voice="Polly.Matthew">` + truncated reply.
4. Call your Twilio number from your mobile — you should hear **Gemini-backed** speech (not the dashboard simulator).
5. Add signature validation before any investor demo on a public URL.

---

## 7. How this maps to the 9-step pipeline

| Step | Real implementation |
|------|----------------------|
| Incoming call | Twilio routes to your number. |
| Provider webhook | `POST /api/webhooks/voice/*` |
| AI agent | Your code picks agent ID from routing store / DB. |
| STT | Twilio `<Gather speech>` or external stream + STT API. |
| Intent | Your rules + optional Gemini classification. |
| CRM / ERP | Your `api/crm/*` route calling REST/DB. |
| Gemini | `POST /api/chat` with `crmContext`. |
| TTS | Twilio `<Say>`, Polly, Google, ElevenLabs, etc. |
| Reply | TwiML back to Twilio. |

The **Live Calls** page in the app is still a **browser simulator** for UX; **real users** use Twilio → your webhooks → TwiML, as above.

---

## 8. Support

If Gemini still fails after env + model fix, read the **`[Debug: …]`** line appended to the AI bubble in the simulator, or inspect the JSON field `geminiError` from `POST /api/chat`.

# Twilio incoming voice + IVR → AI Voice Agent CRM (production guide)

This guide matches the **crm-mvp** stack: **Next.js 14 (App Router)**, **Supabase**, **Gemini** (`@google/genai`), and optional **Twilio Studio**. After MVP you can move heavy audio work to **FastAPI / Django** behind the same webhooks.

> **Security:** Never commit `.env.local`. If keys or tokens were pasted into chat, issue, or screenshots, **rotate** them in [Twilio Console](https://console.twilio.com/) and [Google AI Studio](https://aistudio.google.com/apikey). Use placeholders in docs and CI.

---

## 1. How your repo handles a real call today

| Step | Implementation |
|------|------------------|
| Twilio receives call on your number | Twilio Console (or Studio → redirect) |
| HTTP webhook | `POST /api/webhooks/voice/inbound` → TwiML |
| Optional DTMF IVR | `TWILIO_VOICE_DTMF_MENU=true` → `POST /api/webhooks/voice/ivr` → `Redirect` to `inbound?lang=en|bn` |
| IVR / capture speech | `<Gather input="speech">` → `POST /api/webhooks/voice/gather` |
| Multi-turn (light IVR) | After each Gemini reply, another `<Gather>` (disable with `TWILIO_VOICE_MULTI_TURN=false`) |
| Fast hang-up | Phrases like “no”, “goodbye”, “that’s all” end without another LLM call |
| AI text | `generateGeminiResponse` (`src/services/gemini.ts`) |
| CRM context (optional) | `GET /api/crm/product-context?phone=…` merged into system prompt |
| TTS | Twilio `<Say voice="Polly.Matthew">` |
| Status callbacks | `POST /api/webhooks/voice/status` → `204` + Supabase patch |
| Call session persistence | `call_sessions` + `voice_pipeline_events` when `SUPABASE_SERVICE_ROLE_KEY` is set |
| Webhook authenticity | `X-Twilio-Signature` + `TWILIO_AUTH_TOKEN` |
| Media Streams (binary audio) | **Not in Next.js** — `GET/POST /api/voice/media` returns `501` + JSON (see §12) |

**Not in this repo:** long-lived **WebSocket** Media Stream worker, call recording storage, OpenAI Realtime voice (add a separate service).

---

## 2. End-to-end architecture (MVP)

```mermaid
sequenceDiagram
  participant C as Customer phone
  participant T as Twilio
  participant N as Next.js (Vercel/ngrok)
  participant G as Gemini API
  participant S as Supabase (optional)

  C->>T: PSTN call +1…
  T->>N: POST /api/webhooks/voice/inbound (form body + signature)
  N->>T: TwiML Gather speech
  T->>C: TTS prompt
  C->>T: User speaks
  T->>N: POST /api/webhooks/voice/gather (SpeechResult)
  N->>N: Optional GET /api/crm/product-context
  N->>G: generateGeminiResponse
  G-->>N: Text reply
  N->>T: TwiML Say reply + goodbye
  T->>C: Spoken answer
  N->>S: call_sessions + voice_pipeline_events (service role)
  Note over N,S: Service role bypasses RLS; optional Realtime on tables
```

**Future (streaming) architecture:** Twilio **Media Streams** WebSocket → your worker (Node/FastAPI) → STT stream → LLM → TTS stream → μ-law frames back (see §12).

---

## 3. Twilio account & phone number (+1 571 725 3447)

1. **Twilio Console** → Account → copy **Account SID** and **Auth Token** (server-only).
2. **Phone Numbers** → Active numbers → select **+1 571 725 3447** (or buy one).
3. Under **Voice & Fax** → **A call comes in**:
   - **Webhook**, **HTTP POST**
   - **URL:** `https://<YOUR_PUBLIC_HOST>/api/webhooks/voice/inbound`
4. **Status callback** (recommended):  
   `https://<YOUR_PUBLIC_HOST>/api/webhooks/voice/status`  
   Tick statuses you care about (`completed`, `busy`, `failed`, …).

Save. Twilio sends `application/x-www-form-urlencoded` bodies (not JSON).

---

## 4. Twilio Studio vs direct webhook (your URLs)

Twilio gives you **two different kinds of “Studio” URLs**. Only one of them is about **your** server.

### 4.0 Twilio-hosted Flow URL (`webhooks.twilio.com/.../Flows/{FlowSid}`)

When a number’s **Voice & Fax → A call comes in** is set to **Studio** and you pick a Flow, Twilio stores a URL shaped like:

`https://webhooks.twilio.com/v1/Accounts/{AccountSid}/Flows/{FlowSid}`

That URL is **Twilio’s execution endpoint** for the Flow canvas. **Inbound PSTN hits Twilio here first** — your Next.js app is **not** in this path unless a Studio widget later calls or redirects to you.

- You **do not** configure this string inside **crm-mvp**.
- You **do not** validate `X-Twilio-Signature` against this URL in your app (Twilio signs requests **to your** URLs, not this one).

To route callers into **this CRM’s AI** (`/api/webhooks/voice/inbound`), either:

1. Change the number to **Webhook** → your public `https://<host>/api/webhooks/voice/inbound`, **or**
2. Keep Studio and add a **TwiML Redirect** (or equivalent) widget so the live call is sent to your webhook after your IVR steps.

### 4.1 Studio REST — start a Flow (`studio.twilio.com/v2/Flows/{FlowSid}/Executions`)

`POST https://studio.twilio.com/v2/Flows/{FlowSid}/Executions` (with Basic auth / API key) **starts a new Studio execution** from **your backend** (e.g. outbound campaign, callback after SMS). It is **not** the same thing as the phone number’s **incoming voice webhook**.

Use it when **you** want to programmatically open a Flow; it does **not** replace wiring **inbound customer calls** to your AI unless you build that logic yourself.

You shared **Studio Flow** execution URLs (`studio.twilio.com/.../Flows/FW…`). Those are used to **start or resume** Studio flows from the REST API—not usually pasted as the number’s “voice webhook.”

| Approach | When to use |
|----------|-------------|
| **A. Direct webhook (recommended for this repo)** | Number → `POST` your Next.js `/api/webhooks/voice/inbound`. Full control; code in Git. |
| **B. Studio-first** | Visual IVR, menus, branches. Add **HTTP Request** or **Connect Call To** widget to call your API, or **Function** that returns TwiML fetched from your app. |
| **C. Hybrid** | Studio handles legal disclaimer + language selection → **Redirect** to your webhook with query params. |

For **“AI agent receives the call in my CRM system”**, start with **A**: point the number’s voice URL straight at this app. Keep Studio for marketing lines or complex DTMF trees, then hand off to your URL.

### 4.2 Wiring **+1 571 725 3447** when it still shows a Studio / `webhooks.twilio.com` URL

If the number currently uses **Studio** (console shows Twilio’s `webhooks.twilio.com/.../Flows/...` target):

1. **Simplest:** **Phone Numbers → your number → Voice** → set **A call comes in** to **Webhook** → `https://<YOUR_HOST>/api/webhooks/voice/inbound` (that Flow is no longer invoked for this number).
2. **Keep Studio, then AI:** After disclaimer / DTMF widgets, add **TwiML Redirect** to `https://<YOUR_HOST>/api/webhooks/voice/inbound` so Twilio `POST`s with `CallSid`, `From`, `To`, and this app returns **Gather → Gemini** TwiML.

Treat **Account SID** and **Flow SID** like infrastructure secrets in public repos (avoid committing them in README/issues).

---

## 5. Environment variables

Add to **`.env.local`** (local) and **Vercel / host env** (production). Do not prefix secrets with `NEXT_PUBLIC_`.

| Variable | Required | Purpose |
|----------|----------|---------|
| `TWILIO_ACCOUNT_SID` | Yes for API work | `AC…` |
| `TWILIO_AUTH_TOKEN` | Yes for **signature validation** | Shared secret with Twilio |
| `TWILIO_WEBHOOK_BASE_URL` | **Strongly recommended** | Public origin **exactly** as Twilio calls (e.g. `https://abc.ngrok-free.app` or `https://yourapp.vercel.app`). Used to build `action` URLs and to validate signatures. |
| `TWILIO_SKIP_SIGNATURE_VERIFY` | Dev only | Set to `true` **only** if signatures fail while debugging URL mismatches. **Never** in production. |
| `GOOGLE_GEMINI_API_KEY` | Yes | Gemini for gather replies |
| `GEMINI_MODEL` | Optional | Default in app is `gemini-2.5-flash` |
| `NEXT_PUBLIC_APP_URL` | Optional fallback | If `TWILIO_WEBHOOK_BASE_URL` unset, server-to-server CRM fetch may use this |
| `PRODUCTS_API_BASE` / `PRODUCTS_API_KEY` | Optional | Enables `GET /api/crm/product-context` for caller-aware prompts |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional (recommended) | Server-only; enables `call_sessions` + `voice_pipeline_events` writes from webhooks |
| `TWILIO_VOICE_DTMF_MENU` | Optional | Set to `true` for **press 1 = English, 2 = Bangla** before speech recognition. |
| `TWILIO_VOICE_MULTI_TURN` | Optional | Default **on** (`true`). Set to `false` for single Gemini reply then hang up. |

**Signature pitfall:** Twilio signs the **full URL** configured in the console. If you terminate TLS at a proxy, the signed URL must match what Twilio uses (`https://…/api/webhooks/voice/inbound`). Mismatch → `403` from this app.

---

## 6. Webhook security (production)

- Validate **`X-Twilio-Signature`** on **every** `POST` from Twilio using `TWILIO_AUTH_TOKEN` (implemented in `src/lib/twilio/signature.ts`). The signed URL includes **path and query** (`twilioWebhookRequestUrl`) so `?lang=en` after IVR redirect stays valid.
- Use **HTTPS** only.
- Optionally restrict by Twilio **IP ranges** at your edge (extra layer; Twilio publishes ranges).
- **Idempotency:** Twilio may retry; use `CallSid` + `RecordingSid` as keys if you write DB rows.
- **Do not** trust `From` alone for authorization—spoofing is a telephony concern; use verified caller workflows for sensitive actions.

---

## 7. Local development with ngrok

1. Run Next: `npm run dev` (default `http://localhost:3000`).
2. Start ngrok: `ngrok http 3000` → copy **HTTPS** URL, e.g. `https://abcd-12-34-56-78.ngrok-free.app`.
3. Set in `.env.local`:
   ```env
   TWILIO_WEBHOOK_BASE_URL=https://abcd-12-34-56-78.ngrok-free.app
   ```
4. In Twilio, set voice webhook to:  
   `https://abcd-12-34-56-78.ngrok-free.app/api/webhooks/voice/inbound`
5. Restart `next dev` after env changes.
6. Call your Twilio number. Watch server logs for `[voice inbound]` / `[voice gather]`.

If you get **403**: signature vs URL mismatch → fix `TWILIO_WEBHOOK_BASE_URL` or temporarily set `TWILIO_SKIP_SIGNATURE_VERIFY=true` **only while debugging**.

### 7.1 ngrok in front of **nginx** → Next.js

If **ngrok** tunnels to **nginx** (not straight to port 3000), keep the same public host in env and Twilio:

- **`TWILIO_WEBHOOK_BASE_URL`** = your ngrok origin only, e.g. `https://YOUR-SUBDOMAIN.ngrok-free.dev` (no path, no trailing slash).
- **Twilio voice URL** = `https://YOUR-SUBDOMAIN.ngrok-free.dev/api/webhooks/voice/inbound`

Nginx should **reverse-proxy** `/` (or at least `/api/`) to the Next process, and forward headers Twilio cares about:

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_read_timeout 60s;
}
```

**Important:** Without `TWILIO_WEBHOOK_BASE_URL`, Next.js builds TwiML `action` URLs from `X-Forwarded-Host` + `X-Forwarded-Proto`. If nginx does **not** pass those headers, Twilio may receive TwiML pointing at `http://127.0.0.1:3000/...` (unreachable from Twilio’s cloud) — the call can **complete** but **Gather / AI never runs**. Set **`TWILIO_WEBHOOK_BASE_URL`** to your ngrok HTTPS origin, or fix the proxy headers.

**ngrok free “browser warning” interstitial:** If non-browser requests ever receive HTML instead of your app, see [ngrok’s docs on the warning / agent traffic](https://ngrok.com/docs/guides/how-to-bypass-warning-page) or use a **reserved domain** / paid tier so Twilio always hits your app cleanly.

### 7.2 Live test from your mobile (e.g. Bangladesh → your Twilio number)

**How your system “knows” a call arrived:** Twilio does not push to your browser. When someone dials your Twilio number, Twilio’s cloud sends an **`HTTP POST`** to whatever URL you configured under **Phone number → Voice → A call comes in**. That URL must be **your** Next.js route:

`https://<PUBLIC_HOST>/api/webhooks/voice/inbound`

Your app responds with **TwiML** (`<Gather>`, `<Say>`). Twilio plays that audio on the **phone call** and, when the caller speaks, Twilio **`POST`s speech to `/api/webhooks/voice/gather`**, where **your** `GOOGLE_GEMINI_API_KEY` generates the reply text, then Twilio **TTS** (`Polly.Matthew`) speaks it. So the “voice agent” is **your stack** (Gemini + TwiML + Twilio Media as transport)—not a separate “Twilio AI agent” product, and **not** Twilio Studio unless Studio **redirects** to this webhook.

**Live test checklist (any handset, any country):**

1. **Twilio Console** → **Phone Numbers** → your number → **Voice & Fax** → **A call comes in** = **Webhook**, **HTTP POST** → paste `https://<PUBLIC_HOST>/api/webhooks/voice/inbound` (must **not** be only `webhooks.twilio.com/.../Flows/...` unless that Flow ends with a **Redirect** to this URL).
2. **`TWILIO_WEBHOOK_BASE_URL`** in `.env` = same origin as that URL (no trailing slash). **`TWILIO_AUTH_TOKEN`** = this Twilio account. Restart the server after env changes.
3. **`GOOGLE_GEMINI_API_KEY`** set (Gather calls Gemini).
4. From **any phone** (e.g. a Bangladesh mobile), dial your **Twilio E.164** number. You should hear the **inbound prompt** from your app, then after speaking, a **conversational reply** driven by Gemini (multi-turn stays on until you say goodbye / silence, depending on env).
5. **Verify:** Twilio **Monitor → Logs / Debugger** shows `POST` to your host on `/voice/inbound` (200, not 403). Your server logs show `[voice inbound] POST received` and `[voice gather] POST`. Browser: open `GET https://<PUBLIC_HOST>/api/webhooks/voice/diagnostic` and confirm `urls.voiceWebhookUrl` matches the Console character-for-character.

If you hear Twilio’s generic behavior or no AI, the number is still on **Studio**, **403** blocked your TwiML, or **Gather `action` URLs** pointed at `localhost` (fix `TWILIO_WEBHOOK_BASE_URL` or proxy `X-Forwarded-*` headers per §7.1).

---

## 8. Production deployment (e.g. Vercel)

1. Deploy the Next.js app; confirm `https://your-domain.com/api/webhooks/voice/inbound` returns `200` on **GET** (`OK — POST…`).
2. Set all env vars in the hosting dashboard (not in Git).
3. Point Twilio number voice URL to production `…/api/webhooks/voice/inbound`.
4. Load-test gently; Gemini and Twilio have **rate limits** and cold starts.
5. Add **observability:** Vercel logs, LogDrain, or OpenTelemetry; alert on 5xx from webhooks.

---

## 9. Example Twilio POST fields (trimmed)

**Inbound (`/voice/inbound`):**

```
CallSid=CAxxxx
AccountSid=ACxxxx
From=+15551234567
To=+15717253447
CallStatus=ringing
Direction=inbound
ApiVersion=2010-04-01
```

**Gather (`/voice/gather`):**

```
CallSid=CAxxxx
SpeechResult=I need help with my last order
Confidence=0.91
From=+15551234567
To=+15717253447
```

Your handlers read `SpeechResult`, `From`, `To`, `CallSid`.

---

## 10. TwiML examples (reference)

**Inbound greeting + speech gather (conceptually what the app returns):**

```xml
<Response>
  <Gather input="speech" action="https://YOUR_HOST/api/webhooks/voice/gather" method="POST" speechTimeout="auto" language="en-US">
    <Say voice="Polly.Matthew">Thanks for calling. How can we help?</Say>
  </Gather>
  <Say voice="Polly.Matthew">We could not hear you. Goodbye.</Say>
</Response>
```

**Gather response (AI reply + optional follow-up turn):**

```xml
<Response>
  <Say voice="Polly.Matthew">…escaped plain text from Gemini…</Say>
  <Gather input="speech" action="https://YOUR_HOST/api/webhooks/voice/gather" method="POST" speechTimeout="5" language="en-US">
    <Say voice="Polly.Matthew">Anything else? Or say goodbye.</Say>
  </Gather>
  <Say voice="Polly.Matthew">Thank you for calling. Goodbye.</Say>
</Response>
```

---

## 11. Database / Supabase

**Implemented:**

- Table **`call_sessions`** — one row per `CallSid` (inbound upsert, gather updates speech/AI preview, status updates duration + terminal `ended_at`). DDL: `supabase_schema.sql` (bottom) or `docs/sql/call_sessions.sql`.
- Table **`voice_pipeline_events`** — append-only steps (`INBOUND`, `USER_SPEECH`, `GEMINI`, `STATUS`, …).

**Setup:**

1. In Supabase → **Settings → API**, copy the **`service_role`** secret.
2. Add to server env only: `SUPABASE_SERVICE_ROLE_KEY=…` (never `NEXT_PUBLIC_`).
3. Run the SQL for `call_sessions` if the table does not exist yet.

Webhooks use `getSupabaseAdmin()` (`src/lib/supabase/admin.ts`). If the service key is **unset**, calls still work; only **stdout** logging applies.

**CRM UI — Settings → Webhooks live log:** With `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, the dashboard polls `voice_pipeline_events` and maps each row to a synthetic `POST …/voice/inbound|gather|status` line. For **instant** updates, add that table to the Realtime publication (see the `DO $$ … $$` block in `supabase_schema.sql`).

**RLS:** The service role bypasses RLS. Dashboard reads with the **anon** key rely on the read policies in the SQL file—tighten before production SaaS.

---

## 12. After MVP: Media Streams, workers, queues

| Capability | Typical pattern |
|------------|-----------------|
| **Media Streams** | Dedicated **WebSocket** server (Fly.io, Render, EC2). Twilio `<Connect><Stream url="wss://worker.example/voice/stream" track="inbound_track">`. **Vercel** and Next.js Route Handlers **cannot** host this stream — use a sidecar. |
| **Placeholder in repo** | `GET` / `POST` `/api/voice/media` → **501** JSON explaining the above (so dashboard links do not 404). |
| **STT** | Deepgram / Google Speech-to-Text streaming on audio frames. |
| **LLM** | Same Gemini or OpenAI Realtime API. |
| **TTS** | ElevenLabs / Google Cloud TTS streaming; or Twilio `<Say>` with pre-generated audio URL. |
| **FastAPI / Django** | Move `/voice/*` and WS to Python; Next.js keeps CRM UI + admin. Twilio webhooks point to Python or API gateway. |
| **Redis / PubSub** | Fan-out stream events, rate limits, session cache keyed by `CallSid`. |
| **Jobs** | Celery / RQ / Cloud Tasks for post-call transcription, CRM updates, billing. |

**Recording / transcription:** Start Twilio **Record** verb or Recording API on the call, then a background job pulls the recording URL and runs STT; store transcript in `call_sessions` or a child table.

---

## 13. Testing & debugging

| Symptom | Check |
|---------|--------|
| Twilio **11200** / HTTP failure | URL reachable from internet, TLS valid, not `localhost`. |
| **403** on webhook | Signature: `TWILIO_WEBHOOK_BASE_URL` matches Twilio’s request URL exactly; token correct. |
| Silent / instant hangup | TwiML invalid XML; check server logs; validate `&`, `<` in dynamic `Say` text (use escaping—see `src/lib/twilio/twiml.ts`). |
| Generic “unable to answer” | Gemini env / quota; `GET /api/voice/gemini-health`. |
| No CRM context | `PRODUCTS_API_BASE` set; `product-context` returns 200. |
| No rows in `call_sessions` | `SUPABASE_SERVICE_ROLE_KEY` missing or SQL not applied; check server logs for `[call_sessions]`. |
| Call **Completed** but **no AI / no prompts** | Twilio never got valid TwiML, or **Gather `action` URL** was `localhost`. Set `TWILIO_WEBHOOK_BASE_URL` **or** nginx `X-Forwarded-Host` / `X-Forwarded-Proto`. Open `GET /api/webhooks/voice/diagnostic` and compare `voiceWebhookUrl` to the Console. In Twilio **Monitor → Logs / Debugger**, find the `CallSid` and check HTTP status on `/voice/inbound` (403 = signature). |
| **Settings → Telephony → Test** shows timeout / `ConnectTimeoutError` | Your **dev machine** must reach `https://api.twilio.com` outbound. Try another network, disable VPN, set `HTTP_PROXY`/`HTTPS_PROXY` if required, or run the app on a host with open egress (e.g. deployed Vercel). The telephony test uses a 28s HTTPS client; if it still fails, verify with `curl -I https://api.twilio.com/`. |
| **Python / Colab** (same prompts as Gather) | Run `docs/examples/colab_voice_gemini_agent_test.py` with `GOOGLE_GEMINI_API_KEY` set; optional `NEXT_BASE_URL` + dev-only `TWILIO_SKIP_SIGNATURE_VERIFY` to POST a fake Gather. |

---

## 14. File map (implementation)

| Path | Role |
|------|------|
| `src/app/api/webhooks/voice/inbound/route.ts` | Inbound TwiML + optional DTMF + speech Gather |
| `src/app/api/webhooks/voice/ivr/route.ts` | DTMF digit → `Redirect` to `inbound?lang=` |
| `src/app/api/webhooks/voice/gather/route.ts` | `SpeechResult` → Gemini → TwiML |
| `src/app/api/webhooks/voice/diagnostic/route.ts` | `GET` JSON — env + exact webhook URLs to paste in Twilio (no secrets) |
| `src/app/api/telephony/test/route.ts` | Settings → Telephony “Test live connection” (Twilio / Plivo / Telnyx HTTPS) |
| `src/lib/telephony/carrierHttps.ts` | Long-timeout `https` GET helper for carrier APIs |
| `src/app/api/voice/media/route.ts` | Media Streams placeholder (`501`) |
| `src/lib/twilio/signature.ts` | Signature validation + form parsing |
| `src/lib/twilio/twiml.ts` | XML escaping + truncation |
| `src/lib/twilio/voiceSystemPrompt.ts` | Voice-specific system prompt |
| `src/lib/twilio/callSessionSupabase.ts` | `call_sessions` + `voice_pipeline_events` writes |
| `src/lib/supabase/admin.ts` | Service-role Supabase client |
| `src/services/gemini.ts` | Gemini client |
| `src/app/api/chat/route.ts` | JSON chat (dashboard / future tools) |
| `docs/sql/call_sessions.sql` | Standalone DDL for `call_sessions` |
| `.env.example` | Safe template for all voice + Supabase + Gemini vars |
| `docs/VOICE_REALTIME_PRODUCTION.md` | Shorter realtime overview |

---

## 15. API route index (operator quick reference)

| Method | Path | Role |
|--------|------|------|
| `GET` | `/api/webhooks/voice/inbound` | Health / probe |
| `POST` | `/api/webhooks/voice/inbound` | Twilio voice URL → TwiML |
| `POST` | `/api/webhooks/voice/ivr` | DTMF menu result (when `TWILIO_VOICE_DTMF_MENU=true`) |
| `POST` | `/api/webhooks/voice/gather` | Speech → Gemini → TwiML |
| `POST` | `/api/webhooks/voice/status` | Call status callbacks |
| `GET` / `POST` | `/api/voice/media` | Placeholder `501` (Media Streams need a WS worker) |
| `GET` | `/api/voice/gemini-health` | Gemini connectivity check |
| `POST` | `/api/chat` | JSON chat (dashboard; same model family) |
| `POST` | `/api/telephony/test` | Dashboard telephony credential check (outbound HTTPS to carrier) |
| `GET` | `/api/crm/product-context` | Optional caller CRM JSON for gather |

---

## 16. Scalable SaaS patterns (multi-tenant, load)

| Concern | Pattern |
|---------|---------|
| **Tenant routing** | Subdomain or path → resolve `tenant_id` from Twilio number (`To`) in inbound; pass into `call_sessions.tenant_id` (add column when ready). |
| **Rate limits** | Per-tenant Redis token bucket before Gemini; Twilio concurrency limits per account. |
| **Webhook fan-out** | Ingest Twilio POST → enqueue **SQS / Pub/Sub / BullMQ**; worker returns TwiML within Twilio timeout (~15s for some verbs — keep hot path fast). |
| **Secrets** | Twilio master per tenant in **Vault** / **KMS**; never store in browser. |

---

## 17. Recording & transcription

1. Add `<Record>` or use **Recording API** after answer (legal disclosure first).  
2. On `RecordingStatusCallback`, POST to a new route (e.g. `/api/webhooks/voice/recording`) — validate signature, store `RecordingUrl` + `CallSid` in Supabase.  
3. **Async job** (Cloud Tasks / Celery): download WAV, run STT (Google, Deepgram), append transcript to `call_sessions` or `call_transcripts` child table.

---

## 18. OpenAI Realtime / Voice (post-MVP)

- Run a **small WebSocket gateway** (Node or Python) that speaks OpenAI Realtime protocol on one side and Twilio **Media Streams** μ-law on the other—or use Twilio `<Connect>` to vendor “AI bridge” products.  
- CRM Next.js remains source of truth for **agent config**; worker fetches config via signed internal API.

---

## 19. Logging & monitoring

| Layer | Suggestion |
|-------|------------|
| **App** | Structured JSON logs: `CallSid`, `step`, `latencyMs`, `tenant_id`. |
| **Host** | Vercel Log Drain → Datadog / Grafana Loki; alert on 5xx rate on `/api/webhooks/voice/*`. |
| **Twilio** | Debugger + Event Streams; alert on error webhooks. |
| **DB** | Supabase dashboard for `voice_pipeline_events` volume; add retention job for old rows. |

---

## 20. Example payloads (reference)

**Inbound POST (form body, truncated):**

```
CallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
AccountSid=ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
From=%2B15551234567
To=%2B15717253447
CallStatus=ringing
ApiVersion=2010-04-01
Direction=inbound
```

**Gather POST:**

```
CallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
SpeechResult=track+my+order
Confidence=0.92
From=%2B15551234567
```

**Status POST:**

```
CallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
CallStatus=completed
CallDuration=42
Timestamp=Mon,+12+May+2026+12:00:00+%2B0000
```

---

## 21. Compliance & product

- Record **disclosure** where legally required (“this call may be recorded…”).
- **Opt-out** and human transfer paths for regulated industries.
- **911 / emergency** numbers must not be blocked by AI; follow Twilio and local telecom rules.

---

## 22. Checklist before investor / customer demo

- [ ] Production HTTPS URL on Twilio number  
- [ ] `TWILIO_AUTH_TOKEN` + signature validation on, `TWILIO_SKIP_SIGNATURE_VERIFY` off  
- [ ] `TWILIO_WEBHOOK_BASE_URL` matches deployed host (including any `?lang=` redirect path used in signatures)  
- [ ] `GET /api/voice/gemini-health` → `ok: true`  
- [ ] Live call: speech → sensible Gemini reply over phone  
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set → rows in `call_sessions` + `voice_pipeline_events`  
- [ ] SQL applied: `docs/sql/call_sessions.sql` or updated `supabase_schema.sql`  

This document is the **authoritative Twilio inbound + IVR + AI** guide for **crm-mvp**; keep `VOICE_REALTIME_PRODUCTION.md` as a shorter cross-link for operators.

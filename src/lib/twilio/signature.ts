import { createHmac, timingSafeEqual } from "node:crypto";

const SMOKE_HEADER = "x-voice-webhook-smoke-secret";

/**
 * Optional operator-only bypass for webhook smoke tests (curl, Postman).
 * Set `VOICE_WEBHOOK_SMOKE_SECRET` to a long random value and send the same value in this header.
 * Twilio real traffic never sends this header — keep the secret out of git and rotate if leaked.
 */
export function isVoiceWebhookSmokeAuthorized(req: Request): boolean {
  const secret = process.env.VOICE_WEBHOOK_SMOKE_SECRET?.trim();
  if (!secret || secret.length < 24) return false;
  const got = req.headers.get(SMOKE_HEADER)?.trim();
  if (!got) return false;
  try {
    const a = Buffer.from(secret, "utf8");
    const b = Buffer.from(got, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Validates `X-Twilio-Signature` per Twilio request validation.
 * @param fullUrl — Exact public URL Twilio posted to (scheme + host + path, no trailing slash unless Twilio used one).
 * @param params — Flat POST body key/value pairs (Twilio sends `application/x-www-form-urlencoded`).
 * @see https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function validateTwilioSignature(
  fullUrl: string,
  params: Record<string, string>,
  signatureHeader: string | null,
  authToken: string
): boolean {
  if (!signatureHeader || !authToken) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signatureHeader, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Twilio signs the **exact** public URL of the webhook. On Vercel that is often
 * `https://${VERCEL_URL}/...` or the `Host` / `x-forwarded-*` URL, while
 * `TWILIO_WEBHOOK_BASE_URL` may still point at a different host (www, custom domain, typo).
 * Try every plausible base + pathname so legitimate Twilio traffic still validates.
 */
export function twilioWebhookSignatureUrlCandidates(req: Request): string[] {
  const u = new URL(req.url);
  const pathQS = `${u.pathname}${u.search}`;

  const bases: string[] = [];
  const pushBase = (raw: string | null | undefined) => {
    const t = raw?.trim().replace(/\/$/, "");
    if (!t) return;
    if (!bases.includes(t)) bases.push(t);
  };

  pushBase(forwardedPublicOrigin(req));

  const proto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim() || "https";
  const hostHeader = req.headers.get("host")?.split(",")[0].trim();
  if (hostHeader && !/^127\.0\.0\.1(:\d+)?$/.test(hostHeader) && hostHeader !== "localhost") {
    pushBase(`${proto}://${hostHeader}`);
  }

  pushBase(process.env.TWILIO_WEBHOOK_BASE_URL);
  pushBase(process.env.NEXT_PUBLIC_APP_URL);

  const vercelHost = process.env.VERCEL_URL?.trim().replace(/^https?:\/\//, "");
  if (vercelHost) pushBase(`https://${vercelHost}`);

  pushBase(u.origin);

  const urls: string[] = [];
  for (const b of bases) {
    const full = `${b}${pathQS}`;
    if (!urls.includes(full)) urls.push(full);
  }
  return urls;
}

export function validateTwilioSignatureAnyCandidate(
  req: Request,
  params: Record<string, string>,
  signatureHeader: string | null,
  authToken: string
): boolean {
  if (!signatureHeader || !authToken) return false;
  for (const url of twilioWebhookSignatureUrlCandidates(req)) {
    if (validateTwilioSignature(url, params, signatureHeader, authToken)) return true;
  }
  return false;
}

export async function twilioFormBodyToRecord(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || "";
  const out: Record<string, string> = {};
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    fd.forEach((v, k) => {
      if (typeof v === "string") out[k] = v;
    });
    return out;
  }
  const raw = await req.text();
  const sp = new URLSearchParams(raw);
  sp.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

/** Public origin for Twilio callbacks when env is unset (nginx / ngrok must forward these headers). */
function forwardedPublicOrigin(req: Request): string | null {
  const xfHost = req.headers.get("x-forwarded-host");
  const xfProto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  if (!xfHost) return null;
  const host = xfHost.split(",")[0].trim();
  return `${xfProto}://${host}`;
}

/** Build absolute URL for a path (no query) — e.g. TwiML `action` / `Redirect` targets. */
export function twilioWebhookFullUrl(req: Request, pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const envBase = process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "");
  if (envBase) return `${envBase}${path}`;
  const xf = forwardedPublicOrigin(req);
  if (xf) return `${xf}${path}`;
  const u = new URL(req.url);
  return `${u.origin}${path}`;
}

/**
 * Full URL Twilio used for `X-Twilio-Signature` (path + **query string**).
 * Use this for validating **every** webhook POST, including `?lang=en` after IVR redirect.
 */
export function twilioWebhookRequestUrl(req: Request): string {
  const u = new URL(req.url);
  const pathWithSearch = `${u.pathname}${u.search}`;
  const envBase = process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "");
  if (envBase) return `${envBase}${pathWithSearch}`;
  const xf = forwardedPublicOrigin(req);
  if (xf) return `${xf}${pathWithSearch}`;
  return `${u.origin}${pathWithSearch}`;
}

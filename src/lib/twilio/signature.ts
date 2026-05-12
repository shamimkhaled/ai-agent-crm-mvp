import { createHmac, timingSafeEqual } from "node:crypto";

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

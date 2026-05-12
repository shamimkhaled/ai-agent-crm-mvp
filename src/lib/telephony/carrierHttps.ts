import * as https from "https";
import type { ClientRequest } from "http";

/**
 * HTTPS GET with a single wall-clock deadline (covers slow TCP/TLS connect and transfer).
 * Used for carrier credential checks where default `fetch` connect timeouts are too tight.
 */
export function httpsGetJson(
  urlStr: string,
  headers: Record<string, string>,
  deadlineMs: number
): Promise<{ statusCode: number; text: string }> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(urlStr);
    } catch {
      reject(new Error("Invalid URL"));
      return;
    }
    if (u.protocol !== "https:") {
      reject(new Error("Only https URLs are supported"));
      return;
    }

    let req: ClientRequest | null = null;

    const timer = setTimeout(() => {
      req?.destroy();
      reject(
        new Error(
          `HTTPS deadline ${deadlineMs}ms reached for ${u.hostname}. Try another network, VPN off, or curl -I https://${u.hostname}/`
        )
      );
    }, deadlineMs);

    req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: `${u.pathname}${u.search}`,
        method: "GET",
        headers: { ...headers, "User-Agent": "crm-mvp-telephony-test/1.0" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          clearTimeout(timer);
          resolve({
            statusCode: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    req.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end();
  });
}

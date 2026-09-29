import { createHmac, timingSafeEqual } from "node:crypto";

export function twilioConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

export function expectedSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

export function validSignature(authToken: string, url: string, params: Record<string, string>, signature: string | null) {
  if (!signature) return false;
  const want = Buffer.from(expectedSignature(authToken, url, params));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export type TwimlVerb =
  | { say: string }
  | { pause: number }
  | { stream: { url: string; params?: Record<string, string> } }
  | { gather: { action: string; input?: "dtmf" | "speech" | "dtmf speech"; numDigits?: number; timeout?: number; say?: string } }
  | { redirect: string }
  | { hangup: true }
  | { message: string };

export function twiml(verbs: TwimlVerb[]) {
  const body = verbs
    .map((v) => {
      if ("say" in v) return `<Say voice="Polly.Joanna-Neural">${esc(v.say)}</Say>`;
      if ("pause" in v) return `<Pause length="${Math.max(1, Math.round(v.pause))}"/>`;
      if ("stream" in v) {
        const params = Object.entries(v.stream.params ?? {})
          .map(([k, val]) => `<Parameter name="${esc(k)}" value="${esc(val)}"/>`)
          .join("");
        return `<Connect><Stream url="${esc(v.stream.url)}">${params}</Stream></Connect>`;
      }
      if ("gather" in v) {
        const g = v.gather;
        const attrs = [`action="${esc(g.action)}"`, `method="POST"`, `input="${g.input ?? "dtmf"}"`];
        if (g.numDigits) attrs.push(`numDigits="${g.numDigits}"`);
        if (g.timeout) attrs.push(`timeout="${g.timeout}"`);
        const inner = g.say ? `<Say voice="Polly.Joanna-Neural">${esc(g.say)}</Say>` : "";
        return `<Gather ${attrs.join(" ")}>${inner}</Gather>`;
      }
      if ("redirect" in v) return `<Redirect method="POST">${esc(v.redirect)}</Redirect>`;
      if ("hangup" in v) return `<Hangup/>`;
      return `<Message>${esc(v.message)}</Message>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

export function publicOrigin(reqUrl: string, headers: Headers) {
  const env = process.env.CHARTSIDE_PUBLIC_URL;
  if (env) return env.replace(/\/$/, "");
  const u = new URL(reqUrl);
  const proto = headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
  const host = headers.get("host") || u.host;
  return `${proto}://${host}`;
}

export function wsOrigin(httpOrigin: string) {
  return httpOrigin.replace(/^http/, "ws");
}

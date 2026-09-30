import { mediaResourceUrl, mediaUrlAllowed, type MediaItem } from "../../engine/media";

export function twilioBase() {
  return (process.env.TWILIO_BASE_URL || "https://api.twilio.com").replace(/\/$/, "");
}

function mediaAuth() {
  const user = process.env.TWILIO_API_KEY_SID || process.env.TWILIO_ACCOUNT_SID || "";
  const pass = process.env.TWILIO_API_KEY_SID ? process.env.TWILIO_API_KEY_SECRET || "" : process.env.TWILIO_AUTH_TOKEN || "";
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

export function maxMemoBytes() {
  const mb = Number(process.env.CHARTSIDE_MEMO_MAX_MB || 25);
  return (Number.isFinite(mb) && mb > 0 ? mb : 25) * 1024 * 1024;
}

export type Downloaded = { ok: true; buffer: Buffer; contentType: string } | { ok: false; reason: "too_big" | "blocked" | "failed"; status?: number };

export async function downloadMedia(item: Pick<MediaItem, "url" | "contentType">): Promise<Downloaded> {
  if (!mediaUrlAllowed(item.url, twilioBase())) return { ok: false, reason: "blocked" };
  const max = maxMemoBytes();
  try {
    const res = await fetch(item.url, { headers: { authorization: mediaAuth() }, signal: AbortSignal.timeout(12000) });
    if (!res.ok || !res.body) return { ok: false, reason: "failed", status: res.status };
    if (Number(res.headers.get("content-length") ?? 0) > max) {
      await res.body.cancel().catch(() => undefined);
      return { ok: false, reason: "too_big" };
    }
    const parts: Buffer[] = [];
    let n = 0;
    for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) {
      n += c.length;
      if (n > max) return { ok: false, reason: "too_big" };
      parts.push(Buffer.from(c));
    }
    return { ok: true, buffer: Buffer.concat(parts), contentType: (res.headers.get("content-type") || item.contentType).split(";")[0].trim().toLowerCase() };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export async function deleteMedia(url: string) {
  if (!mediaUrlAllowed(url, twilioBase())) return false;
  try {
    const res = await fetch(mediaResourceUrl(url), { method: "DELETE", headers: { authorization: mediaAuth() }, signal: AbortSignal.timeout(10000) });
    return res.status === 204 || res.status === 404 || res.ok;
  } catch {
    return false;
  }
}

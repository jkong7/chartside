import { guestForPhone } from "@/lib/server/guest";
import { userByPhone } from "@/lib/server/magic";
import { normalizePhone } from "@/lib/server/notify";
import { createHash } from "node:crypto";
import { get } from "@/lib/db";
import { audit } from "@/lib/server/repo";
import { phoneSpeechReady } from "@/lib/server/telephony/speech";
import { mintCallToken } from "@/lib/server/telephony/token";
import { publicOrigin, twiml, validSignature, wsOrigin } from "@/lib/server/telephony/twilio";

const xml = (body: string) => new Response(body, { headers: { "content-type": "text/xml; charset=utf-8" } });

export async function POST(req: Request) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const origin = publicOrigin(req.url, req.headers);
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    const url = `${origin}${new URL(req.url).pathname}${new URL(req.url).search}`;
    if (!validSignature(token, url, params, req.headers.get("x-twilio-signature"))) return new Response("Invalid signature", { status: 403 });
  } else if (process.env.NODE_ENV === "production") {
    return new Response("Voice webhooks need TWILIO_AUTH_TOKEN", { status: 503 });
  }
  if (!phoneSpeechReady()) return xml(twiml([{ say: "Chartside's phone line isn't set up yet. Please try again later." }, { hangup: true }]));
  const phone = normalizePhone(params.From ?? "");
  const callSid = params.CallSid ?? "";
  if (!phone || !callSid) return xml(twiml([{ say: "Sorry, Chartside can't take calls from a hidden number. Please call from your own phone." }, { hangup: true }]));
  const verified = await userByPhone(phone);
  const known = verified && !verified.guestUntil ? verified : null;
  const phoneTag = createHash("sha256").update(`${process.env.CHARTSIDE_SECRET ?? ""}:${phone}`).digest("hex").slice(0, 16);
  const since = new Date(Date.now() - 86400_000).toISOString();
  const count = async (extra: string, ...args: string[]) => Number((await get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit WHERE action = 'phone.call' AND created_at > ? AND detail LIKE '%"guest":true%' ${extra}`, since, ...args))?.n ?? 0);
  if (!known && ((await count("AND detail LIKE ?", `%"phoneTag":"${phoneTag}"%`)) >= Number(process.env.CHARTSIDE_GUEST_CALLS_PER_NUMBER || 5) || (await count("")) >= Number(process.env.CHARTSIDE_GUEST_CALL_DAILY_CAP || 200))) {
    return xml(twiml([{ say: "Chartside's free line is at capacity right now. Please try again tomorrow, or sign up at chartside's website to call any time." }, { hangup: true }]));
  }
  const user = known ?? verified ?? (await guestForPhone(phone));
  await audit.log(user, null, "phone.call", { callSid, guest: !known, phoneTag });
  const callToken = mintCallToken({ userId: user.id, orgId: user.orgId, phone, callSid, guest: !known, sim: false });
  return xml(twiml([{ stream: { url: `${wsOrigin(origin)}/api/voice/stream`, params: { callToken } } }, { hangup: true }]));
}

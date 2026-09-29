import { guestForPhone } from "@/lib/server/guest";
import { userByPhone } from "@/lib/server/magic";
import { normalizePhone } from "@/lib/server/notify";
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
  } else if (process.env.NODE_ENV === "production" && !process.env.CHARTSIDE_ALLOW_UNSIGNED_VOICE) {
    return new Response("Voice webhooks need TWILIO_AUTH_TOKEN", { status: 503 });
  }
  if (!phoneSpeechReady()) return xml(twiml([{ say: "Chartside's phone line isn't set up yet. Please try again later." }, { hangup: true }]));
  const phone = normalizePhone(params.From ?? "");
  const callSid = params.CallSid ?? "";
  if (!phone || !callSid) return xml(twiml([{ say: "Sorry, Chartside can't take calls from a hidden number. Please call from your own phone." }, { hangup: true }]));
  const known = await userByPhone(phone);
  const user = known ?? (await guestForPhone(phone));
  await audit.log(user, null, "phone.call", { callSid, guest: !known });
  const callToken = mintCallToken({ userId: user.id, orgId: user.orgId, phone, callSid, guest: !known, sim: false });
  return xml(twiml([{ stream: { url: `${wsOrigin(origin)}/api/voice/stream`, params: { callToken } } }, { hangup: true }]));
}

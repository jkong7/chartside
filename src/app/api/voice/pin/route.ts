import { body, json } from "@/lib/server/http";
import { confirmPinOffer } from "@/lib/server/telephony/pinByPhone";

export async function POST(req: Request) {
  const b = await body<{ t?: string; pin?: string }>(req);
  const r = await confirmPinOffer(b.t ?? "", String(b.pin ?? ""));
  return json(r, r.ok ? 200 : 410);
}

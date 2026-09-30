import { mediaItems } from "../../engine/media";
import { memoIntent } from "../../engine/memo";
import { orgJurisdiction, whatsappAllowed } from "../jurisdiction";
import { userByPhone } from "../magic";
import { audit } from "../repo";
import { deleteMedia } from "./media";
import { dictateByText, inboundMemo, purgeMemoHolds, resolveHolds } from "./memos";
import { touchSession, waNumber } from "./whatsapp";

const HELP = "Send a voice note after a visit, or type your note starting with NOTE. I'll reply here with the written record and a link to edit and sign it. To reach a person, reply with your question and email support@chartside.app.";

export async function inboundWhatsApp(params: Record<string, string>, origin: string) {
  const phone = waNumber(params.From ?? "");
  if (!phone) return "Chartside couldn't read your number.";
  const items = mediaItems(params);
  const user = await userByPhone(phone);
  const jurisdiction = user ? await orgJurisdiction(user.orgId) : null;
  if (!user || !whatsappAllowed(jurisdiction, !user.guestUntil)) {
    for (const i of items) {
      const deleted = await deleteMedia(i.url);
      await audit.log(user ?? null, null, "whatsapp.media_deleted", { deleted, unread: true });
    }
    await audit.log(user ?? null, null, "whatsapp.refused", { reason: user ? "hipaa" : "unknown_sender", media: items.length });
    if (!user) return `Chartside on WhatsApp is only for veterinary practices and clinics outside the US. To try Chartside, call or text this number from a regular phone, or visit ${origin}/line`;
    return "Chartside can't take patient recordings over WhatsApp for US medical practices, because WhatsApp is not covered by a HIPAA agreement. Your recording was deleted unread. Call or text this number instead.";
  }
  await purgeMemoHolds();
  await touchSession(phone, "whatsapp");
  await audit.log(user, null, "whatsapp.inbound", { media: items.length, jurisdiction });
  if (items.length) return inboundMemo({ user, phone, channel: "whatsapp", items, messageSid: params.MessageSid ?? null, origin });
  const body = params.Body ?? "";
  const intent = memoIntent(body);
  if (intent === "yes" || intent === "no" || intent === "always") {
    const r = await resolveHolds(phone, intent, "whatsapp");
    if (r) return r;
  }
  if (intent === "note") return dictateByText(user, phone, "whatsapp", body);
  return HELP;
}

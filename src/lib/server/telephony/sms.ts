import { deliver } from "../delivery";
import { normalizePhone } from "../notify";

export interface OutboxMessage {
  to: string;
  body: string;
  at: string;
  channel: "twilio" | "sim";
}

const g = globalThis as unknown as { __chartsideSimOutbox?: Map<string, OutboxMessage[]> };
const outbox = (g.__chartsideSimOutbox ??= new Map());

export function isSimNumber(phone: string) {
  return /^\+1555\d{7}$/.test(phone);
}

export function simMessages(phone: string) {
  return outbox.get(phone) ?? [];
}

export function clearSim(phone: string) {
  outbox.delete(phone);
}

export async function sendText(to: string, body: string, kind = "phone_note"): Promise<OutboxMessage> {
  const phone = normalizePhone(to);
  if (!phone) throw new Error("Invalid phone number");
  if (looksLikePhi(body)) throw new Error("Refusing to text something that looks like patient information");
  const msg: OutboxMessage = { to: phone, body, at: new Date().toISOString(), channel: "sim" };
  if (isSimNumber(phone)) {
    const list = outbox.get(phone) ?? [];
    list.push(msg);
    outbox.set(phone, list.slice(-50));
    return msg;
  }
  const r = await deliver({ channel: "sms", to: phone, body, kind });
  if (r.status !== "sent") throw new Error(r.error || "Text could not be sent");
  return { ...msg, channel: "twilio" };
}

const PHI_HINTS = [/\b\d{3}-\d{2}-\d{4}\b/, /\b(diagnos|assessment|plan:|mg\b|medication|hypertension|diabetes|depress|anxiety|cancer|hiv|pregnan)/i, /\b(DOB|MRN|date of birth)\b/i, /\b[A-Z]\d{2}(\.\d{1,4})?\b/];

export function looksLikePhi(body: string) {
  const text = body.replace(/https?:\/\/\S+/g, " ");
  return PHI_HINTS.some((r) => r.test(text));
}

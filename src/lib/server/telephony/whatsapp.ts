import { get, now, run } from "../../db";
import { splitNumbered } from "../../engine/memo";
import { normalizePhone } from "../notify";
import { isSimNumber, type OutboxMessage } from "./sms";

export const WINDOW_MS = 24 * 3600_000;

const g = globalThis as unknown as { __chartsideWaOutbox?: Map<string, OutboxMessage[]> };
const outbox = (g.__chartsideWaOutbox ??= new Map());

export function waNumber(raw: string) {
  return normalizePhone((raw ?? "").replace(/^whatsapp:/i, ""));
}

export function simWhatsApp(phone: string) {
  return outbox.get(phone) ?? [];
}

export async function touchSession(phone: string, channel: string, at = new Date()) {
  const ts = at.toISOString();
  const had = await get<{ phone: string }>("SELECT phone FROM messaging_sessions WHERE phone = ? AND channel = ?", phone, channel);
  if (had) await run("UPDATE messaging_sessions SET last_inbound_at = ? WHERE phone = ? AND channel = ?", ts, phone, channel);
  else await run("INSERT INTO messaging_sessions (phone, channel, last_inbound_at) VALUES (?, ?, ?)", phone, channel, ts);
}

export async function sessionOpen(phone: string, channel = "whatsapp", at = new Date()) {
  const r = await get<{ last_inbound_at: string }>("SELECT last_inbound_at FROM messaging_sessions WHERE phone = ? AND channel = ?", phone, channel);
  return !!r && at.getTime() - Date.parse(r.last_inbound_at) < WINDOW_MS;
}

export function inWindow(lastInbound: string | null | undefined, at = new Date()) {
  return !!lastInbound && at.getTime() - Date.parse(lastInbound) < WINDOW_MS;
}

async function post(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const base = (process.env.TWILIO_BASE_URL || "https://api.twilio.com").replace(/\/$/, "");
  const from = process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_FROM || "";
  const res = await fetch(`${base}/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: `whatsapp:${to}`, From: `whatsapp:${from.replace(/^whatsapp:/, "")}`, Body: body }).toString(),
    signal: AbortSignal.timeout(10000),
  });
  const j = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(j.message || `WhatsApp provider error ${res.status}`);
  return j.sid ?? null;
}

export async function sendWhatsApp(toRaw: string, body: string): Promise<{ sent: number; skipped: "outside_window" | null }> {
  const to = waNumber(toRaw);
  if (!to) throw new Error("Invalid WhatsApp number");
  if (!(await sessionOpen(to))) return { sent: 0, skipped: "outside_window" };
  const parts = splitNumbered(body, 1600);
  for (const p of parts) {
    if (isSimNumber(to)) {
      const list = outbox.get(to) ?? [];
      list.push({ to, body: p, at: now(), channel: "sim" });
      outbox.set(to, list.slice(-50));
    } else await post(to, p);
  }
  return { sent: parts.length, skipped: null };
}

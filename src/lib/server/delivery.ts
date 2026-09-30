import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir, uid } from "../db";
import { providers, sendEmail, sendSms } from "./notify";

export interface OutboundMessage {
  channel: "email" | "sms";
  to: string;
  subject?: string;
  body: string;
  kind: string;
}

export interface DeliveryResult {
  status: "sent" | "failed" | "unconfigured";
  transport: string;
  id?: string | null;
  error?: string | null;
}

export type Transport = (m: OutboundMessage) => Promise<DeliveryResult>;

let override: Transport | null = null;

export function setTransport(t: Transport | null) {
  override = t;
}

export function outboxDir() {
  return path.join(dataDir(), "outbox");
}

export function transportName(channel: OutboundMessage["channel"]) {
  if (override) return "custom";
  const mode = process.env.CHARTSIDE_DELIVERY;
  if (mode === "file") return "file";
  if (mode === "none") return "none";
  const p = providers();
  if (channel === "email" && p.email) return p.email;
  if (channel === "sms" && p.sms) return p.sms;
  return process.env.NODE_ENV === "production" ? "none" : "file";
}

export function emailReady() {
  return transportName("email") !== "none";
}

export async function deliver(m: OutboundMessage): Promise<DeliveryResult> {
  const transport = transportName(m.channel);
  try {
    if (override) return await override(m);
    if (transport === "file") {
      const id = uid("msg_");
      mkdirSync(outboxDir(), { recursive: true, mode: 0o700 });
      writeFileSync(path.join(outboxDir(), `${Date.now()}-${id}.json`), JSON.stringify({ id, ...m, at: new Date().toISOString() }), { mode: 0o600 });
      return { status: "sent", transport, id };
    }
    if (transport === "sendgrid") return { status: "sent", transport, id: await sendEmail(m.to, m.subject ?? "Chartside", m.body, "Chartside") };
    if (transport === "twilio") return { status: "sent", transport, id: await sendSms(m.to, m.body) };
    return { status: "unconfigured", transport, error: `No ${m.channel} provider is configured` };
  } catch (err) {
    return { status: "failed", transport, error: err instanceof Error ? err.message : "Delivery failed" };
  }
}

import { all, now, run, uid } from "../db";
import { Forbidden, Invalid } from "./policy";
import { audit, encounters, orgs, patients, type User } from "./repo";

export type Channel = "sms" | "email";

export function providers() {
  return {
    fax: process.env.PHAXIO_KEY && process.env.PHAXIO_SECRET ? "phaxio" : null,
    sms: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM ? "twilio" : null,
    email: process.env.SENDGRID_API_KEY && process.env.CHARTSIDE_EMAIL_FROM ? "sendgrid" : null,
  };
}

export function normalizePhone(p: string) {
  const d = p.replace(/[^\d+]/g, "");
  if (/^\+\d{10,15}$/.test(d)) return d;
  const digits = d.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const base = (process.env.TWILIO_BASE_URL || "https://api.twilio.com").replace(/\/$/, "");
  const res = await fetch(`${base}/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }).toString(),
    signal: AbortSignal.timeout(10000),
  });
  const j = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(j.message || `SMS provider error ${res.status}`);
  return j.sid ?? null;
}

async function sendEmail(to: string, subject: string, body: string, fromName: string) {
  const base = (process.env.SENDGRID_BASE_URL || "https://api.sendgrid.com").replace(/\/$/, "");
  const res = await fetch(`${base}/v3/mail/send`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: process.env.CHARTSIDE_EMAIL_FROM, name: fromName }, subject, content: [{ type: "text/plain", value: body }] }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Email provider error ${res.status}`);
  return res.headers.get("x-message-id");
}

const TEMPLATES = {
  summary: { subject: "Your visit summary", sms: (org: string, url: string) => `${org}: your visit summary is ready. View it securely: ${url} Reply STOP to opt out.`, email: (org: string, url: string, first: string) => `Hi ${first},\n\nYour visit summary from ${org} is ready. You can read it, see your instructions, and message your care team here:\n\n${url}\n\nThis link is private to you.\n\n${org}` },
  intake: { subject: "Before your visit", sms: (org: string, url: string) => `${org}: please answer a few questions before your visit (about 3 minutes): ${url}`, email: (org: string, url: string, first: string) => `Hi ${first},\n\nBefore your visit with ${org}, please answer a few short questions. It takes about 3 minutes:\n\n${url}\n\n${org}` },
  checkin: { subject: "How are you feeling?", sms: (org: string, url: string) => `${org}: a quick check-in after your visit (1 minute): ${url}`, email: (org: string, url: string, first: string) => `Hi ${first},\n\nYour care team at ${org} would like to know how you're doing since your visit. It takes about a minute:\n\n${url}\n\nIf you feel much worse or it's an emergency, call 911.\n\n${org}` },
  reply: { subject: "New message from your care team", sms: (org: string, url: string) => `${org}: you have a new message from your care team. Read it securely: ${url}`, email: (org: string, url: string, first: string) => `Hi ${first},\n\nYour care team at ${org} replied to your message. Read it securely here:\n\n${url}\n\n${org}` },
} as const;

export type NoticeKind = keyof typeof TEMPLATES;

export async function notifyPatient(u: User | null, input: { orgId: string; patientId: string; encounterId?: string | null; kind: NoticeKind; url: string; channel?: Channel }) {
  if (u && !["owner", "admin", "clinician", "scribe"].includes(u.role)) throw new Forbidden("Your role can't contact patients");
  const p = await patients.byIdUnscoped(input.patientId);
  if (!p) throw new Error("Patient not found");
  const channel: Channel | null = input.channel ?? (p.contactPref === "sms" && p.phone ? "sms" : p.contactPref === "email" && p.email ? "email" : p.phone ? "sms" : p.email ? "email" : null);
  if (!channel || p.contactPref === "none") throw new Invalid(`${p.name} has no ${channel ?? "phone or email"} on file, or opted out of messages. Copy the link instead.`);
  const to = channel === "sms" ? normalizePhone(p.phone ?? "") : p.email;
  if (!to) throw new Invalid(`${p.name}'s ${channel === "sms" ? "phone number" : "email"} isn't valid`);
  const org = (await orgs.get(input.orgId))?.name ?? "Your care team";
  const t = TEMPLATES[input.kind];
  const body = channel === "sms" ? t.sms(org, input.url) : t.email(org, input.url, p.name.split(" ")[0]);
  const provider = providers()[channel];
  let status: "sent" | "failed" | "unconfigured" = "unconfigured";
  let providerId: string | null = null;
  let error: string | null = null;
  if (provider) {
    try {
      providerId = channel === "sms" ? await sendSms(to, body) : await sendEmail(to, t.subject, body, org);
      status = "sent";
    } catch (err) {
      status = "failed";
      error = err instanceof Error ? err.message : "Delivery failed";
    }
  } else error = `No ${channel === "sms" ? "SMS" : "email"} provider is configured`;
  const id = uid("out_");
  await run("INSERT INTO outbox (id, org_id, patient_id, encounter_id, kind, channel, recipient, subject, body, status, provider, provider_id, error, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, input.orgId, p.id, input.encounterId ?? null, input.kind, channel, to, t.subject, body, status, provider, providerId, error, u?.id ?? null, now());
  await audit.log(u ?? { id: null, orgId: input.orgId }, input.encounterId ?? null, `notify.${status}`, { kind: input.kind, channel, provider });
  return { id, status, channel, to: channel === "sms" ? to.replace(/\d(?=\d{4})/g, "•") : to.replace(/^(.).*(@.*)$/, "$1•••$2"), error };
}

export async function sendOrgEmail(input: { orgId: string; to: string; subject: string; body: string; kind: string; encounterId?: string | null; actorId?: string | null }) {
  const org = (await orgs.get(input.orgId))?.name ?? "Chartside";
  const provider = providers().email;
  let status: "sent" | "failed" | "unconfigured" = "unconfigured";
  let providerId: string | null = null;
  let error: string | null = null;
  if (provider) {
    try {
      providerId = await sendEmail(input.to, input.subject, input.body, org);
      status = "sent";
    } catch (err) {
      status = "failed";
      error = err instanceof Error ? err.message : "Delivery failed";
    }
  } else error = "No email provider is configured";
  await run("INSERT INTO outbox (id, org_id, patient_id, encounter_id, kind, channel, recipient, subject, body, status, provider, provider_id, error, created_by, created_at) VALUES (?, ?, NULL, ?, ?, 'email', ?, ?, ?, ?, ?, ?, ?, ?, ?)", uid("out_"), input.orgId, input.encounterId ?? null, input.kind, input.to, input.subject, input.kind === "share_code" ? input.body.replace(/\b\d{6}\b/g, "••••••") : input.body, status, provider, providerId, error, input.actorId ?? null, now());
  return { status, error };
}

export async function outboxFor(u: User, patientId?: string) {
  return all<{ id: string; kind: string; channel: string; recipient: string; status: string; error: string | null; created_at: string; encounter_id: string | null }>(`SELECT id, kind, channel, recipient, status, error, created_at, encounter_id FROM outbox WHERE org_id = ? ${patientId ? "AND patient_id = ?" : ""} ORDER BY created_at DESC LIMIT 100`, ...(patientId ? [u.orgId, patientId] : [u.orgId]));
}

export async function notifyForEncounter(u: User, encId: string, kind: NoticeKind, url: string, channel?: Channel) {
  const e = await encounters.get(u, encId);
  if (!e?.patientId) throw new Error("Encounter not found");
  return notifyPatient(u, { orgId: u.orgId, patientId: e.patientId, encounterId: e.id, kind, url, channel });
}

export async function sendFax(u: User, input: { encounterId: string; to: string; pdf: Buffer; name: string; kind: string }) {
  const to = normalizePhone(input.to);
  if (!to) throw new Invalid("Enter a 10-digit US fax number");
  const provider = providers().fax;
  let status: "sent" | "failed" | "unconfigured" = "unconfigured";
  let providerId: string | null = null;
  let error: string | null = null;
  if (provider) {
    try {
      const form = new FormData();
      form.append("to", to);
      form.append("file", new Blob([new Uint8Array(input.pdf)], { type: "application/pdf" }), `${input.name.replace(/[^\w.-]+/g, "-").slice(0, 60) || "document"}.pdf`);
      const base = (process.env.PHAXIO_BASE_URL || "https://api.phaxio.com").replace(/\/$/, "");
      const res = await fetch(`${base}/v2.1/faxes`, { method: "POST", headers: { authorization: `Basic ${Buffer.from(`${process.env.PHAXIO_KEY}:${process.env.PHAXIO_SECRET}`).toString("base64")}` }, body: form, signal: AbortSignal.timeout(15000) });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: { id?: number | string } };
      if (!res.ok || j.success === false) throw new Error(j.message || `Fax provider error ${res.status}`);
      providerId = j.data?.id !== undefined ? String(j.data.id) : null;
      status = "sent";
    } catch (err) {
      status = "failed";
      error = err instanceof Error ? err.message : "Fax failed";
    }
  } else error = "No fax provider is configured";
  const enc = await encounters.get(u, input.encounterId);
  await run("INSERT INTO outbox (id, org_id, patient_id, encounter_id, kind, channel, recipient, subject, body, status, provider, provider_id, error, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'fax', ?, ?, ?, ?, ?, ?, ?, ?, ?)", uid("out_"), u.orgId, enc?.patientId ?? null, input.encounterId, input.kind, to, input.name.slice(0, 120), `${input.pdf.length} byte PDF`, status, provider, providerId, error, u.id, now());
  await audit.log(u, input.encounterId, `fax.${status}`, { to: to.replace(/\d(?=\d{4})/g, "•"), provider });
  return { status, error, to: to.replace(/\d(?=\d{4})/g, "•") };
}

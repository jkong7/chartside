import { body, fail, json } from "@/lib/server/http";
import { messages, receiveMessage } from "@/lib/server/inbox";
import { encounterByShareToken, patients } from "@/lib/server/repo";

async function context(token: string) {
  const enc = await encounterByShareToken(token);
  if (!enc?.patientId || !enc.orgId) return null;
  const patient = await patients.byIdUnscoped(enc.patientId);
  return patient ? { enc, patient } : null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const c = await context((await ctx.params).token);
  if (!c) return fail("This link is no longer valid", 404);
  const thread = await messages.forEncounterThread(c.enc.id, c.patient.id);
  return json({ messages: thread.map((m) => ({ id: m.id, body: m.body, receivedAt: m.receivedAt, reply: m.reply, repliedAt: m.repliedAt, urgency: m.triage.urgency })) });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const c = await context((await ctx.params).token);
  if (!c) return fail("This link is no longer valid", 404);
  const b = await body<{ body?: string }>(req);
  const text = (b.body ?? "").trim();
  if (text.length < 2) return fail("Write a message");
  if (text.length > 4000) return fail("Messages are limited to 4,000 characters");
  const recent = (await messages.forEncounterThread(c.enc.id, c.patient.id)).filter((m) => Date.now() - new Date(m.receivedAt).getTime() < 3600000);
  if (recent.length >= 5) return fail("You've sent several messages in the last hour. If this is urgent, call the clinic or 911.", 429);
  const id = await receiveMessage({ orgId: c.enc.orgId!, patient: c.patient, assigneeId: c.enc.userId, body: text, channel: "visit_link", encounterId: c.enc.id });
  const m = (await messages.forEncounterThread(c.enc.id, c.patient.id)).find((x) => x.id === id)!;
  return json({ message: { id: m.id, body: m.body, receivedAt: m.receivedAt, reply: null, repliedAt: null, urgency: m.triage.urgency } }, 201);
}

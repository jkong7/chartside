import { scheduleCheckin, type CheckinRecord } from "@/lib/server/checkin";
import { authed, body, json } from "@/lib/server/http";
import { artifacts, encounters } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) throw new Error("Encounter not found");
  const rec = await artifacts.get<CheckinRecord>(id, "checkin");
  return json({ checkin: rec ? { sendAt: rec.sendAt, sentAt: rec.sentAt ?? null, sendStatus: rec.sendStatus ?? null, submittedAt: rec.submittedAt ?? null, flags: rec.flags ?? [], questions: rec.questions, answers: rec.answers ?? null, url: `${new URL(req.url).origin}/c/${rec.token}` } : null });
});

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ days?: number }>(req);
  const rec = await scheduleCheckin(user, id, Number(b.days ?? 3), new URL(req.url).origin);
  return json({ checkin: { sendAt: rec.sendAt, sentAt: rec.sentAt ?? null, sendStatus: rec.sendStatus ?? null, url: `${new URL(req.url).origin}/c/${rec.token}` } }, 201);
});

import { authed, body, json } from "@/lib/server/http";
import { draftAssessment, nursingView } from "@/lib/server/nursing";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => json(await nursingView(user, id)));

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ text?: string }>(req);
  return json({ note: await draftAssessment(user, id, b.text ?? "") }, 201);
});

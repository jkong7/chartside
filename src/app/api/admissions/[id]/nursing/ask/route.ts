import { authed, body, json } from "@/lib/server/http";
import { askShift } from "@/lib/server/nursing";

export const POST = authed<{ id: string }>(async (req, user, { id }) => json({ answer: await askShift(user, id, (await body<{ question?: string }>(req)).question ?? "") }));

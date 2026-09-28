import { authed, json } from "@/lib/server/http";
import { createIntake } from "@/lib/server/intake";

export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  const r = await createIntake(user, id);
  return json({ ...r, url: `/intake/${r.token}` }, 201);
});

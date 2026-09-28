import { authed, body, json } from "@/lib/server/http";
import { saveHandoff, type Handoff } from "@/lib/server/inpatient";

export const PUT = authed<{ id: string }>(async (req, user, { id }) => json({ admission: await saveHandoff(user, id, await body<Partial<Handoff>>(req)) }));

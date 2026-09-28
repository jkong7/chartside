import { authed, body, fail, json } from "@/lib/server/http";
import { admissionDetail, updateAdmission } from "@/lib/server/inpatient";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const d = await admissionDetail(user, id);
  return d ? json(d) : fail("Admission not found", 404);
});

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => json({ admission: await updateAdmission(user, id, await body(req)) }));

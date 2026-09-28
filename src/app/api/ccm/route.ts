import { ccmWorklist, enroll } from "@/lib/server/ccm";
import { authed, body, json } from "@/lib/server/http";

export const GET = authed(async (req, user) => json(await ccmWorklist(user, new URL(req.url).searchParams.get("month") ?? undefined)));

export const POST = authed(async (req, user) => {
  const b = await body<{ patientId?: string; consentMethod?: string; billingClinicianId?: string }>(req);
  return json({ id: await enroll(user, b) }, 201);
});

import { authed, body, json } from "@/lib/server/http";
import { normalizePhone, outboxFor } from "@/lib/server/notify";
import { assertCan, Invalid } from "@/lib/server/policy";
import { audit, patients } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => json({ outbox: await outboxFor(user, id) }));

export const PUT = authed<{ id: string }>(async (req, user, { id }) => {
  assertCan(user, "patients.write");
  const p = await patients.get(user, id);
  if (!p) throw new Error("Patient not found");
  const b = await body<{ phone?: string; email?: string; pref?: string }>(req);
  const phone = b.phone?.trim() ? normalizePhone(b.phone) : null;
  if (b.phone?.trim() && !phone) throw new Invalid("Enter a valid phone number");
  const email = b.email?.trim() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Invalid("Enter a valid email");
  const pref = ["sms", "email", "none"].includes(b.pref ?? "") ? b.pref! : null;
  await patients.setContact(user, id, { phone, email, pref });
  await audit.log(user, null, "patient.contact_updated", { patientId: id });
  return json({ patient: await patients.get(user, id) });
});

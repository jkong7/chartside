import { authed, body, fail, json } from "@/lib/server/http";
import { fileNote, type EhrLink } from "@/lib/server/ehr";
import { signEncounter } from "@/lib/server/pipeline";
import { artifacts, encounters } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  const b = await body<{ force?: boolean }>(req);
  const out = signEncounter(user, enc.id, { force: !!b.force });
  if (!out.signed) return json(out, 409);
  const link = artifacts.get<EhrLink>(enc.id, "ehr_link");
  const filing = link && user.prefs.autoFileEhr !== false ? await fileNote(user, enc.id).catch((err) => ({ status: "error" as const, at: new Date().toISOString(), message: err instanceof Error ? err.message : "Filing failed" })) : null;
  return json({ ...out, filing });
});

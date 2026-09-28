import { apiHandler } from "@/lib/server/platform";
import { encounterOut } from "@/lib/server/apiv1";
import { processEncounter } from "@/lib/server/pipeline";
import { Invalid } from "@/lib/server/policy";
import { encounters, utterances } from "@/lib/server/repo";

export const POST = apiHandler<{ id: string }>("notes:generate", async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) throw new Error("Encounter not found");
  if (enc.status === "signed") throw new Invalid("This encounter is signed");
  if (!(await utterances.list(enc.id)).length) throw new Invalid("Add a transcript before generating a note");
  const b = (await req.json().catch(() => ({}))) as { templateId?: string; detail?: "concise" | "standard" | "detailed" };
  await encounters.update(user, enc.id, { status: "processing", endedAt: enc.endedAt ?? new Date().toISOString() });
  const r = await processEncounter(user, enc.id, { templateId: b.templateId, detail: b.detail });
  return { data: await encounterOut(user, enc.id), warnings: r.warnings };
});

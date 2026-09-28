import { diffNotes, provenance } from "@/lib/engine/diff";
import { authed, body, fail, json } from "@/lib/server/http";
import { saveNoteEdits } from "@/lib/server/pipeline";
import { assertCan, Invalid } from "@/lib/server/policy";
import { audit, encounters, revisions } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  const list = await revisions.list(enc.id);
  return json({
    revisions: list.map((r, i) => {
      const prev = [...list.slice(0, i)].reverse().find((x) => x.noteVersion === r.noteVersion) ?? null;
      return { id: r.id, noteVersion: r.noteVersion, author: r.author, source: r.source, reason: r.reason, createdAt: r.createdAt, diff: diffNotes(prev?.content ?? null, r.content), provenance: provenance(r.content) };
    }).reverse(),
  });
});

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  assertCan(user, "clinical.edit");
  if (enc.status === "signed") throw new Invalid("Signed notes can't be restored. Add an addendum instead.");
  const b = await body<{ revisionId?: string }>(req);
  const r = (await revisions.list(enc.id)).find((x) => x.id === b.revisionId);
  if (!r) return fail("Revision not found", 404);
  const out = await saveNoteEdits(user, enc.id, r.content, "restore");
  await audit.log(user, enc.id, "note.restored", { revisionId: r.id, from: r.createdAt });
  return json(out);
});

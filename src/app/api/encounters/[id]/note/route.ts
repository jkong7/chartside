import { authed, body, fail, json } from "@/lib/server/http";
import { saveNoteEdits } from "@/lib/server/pipeline";
import { audit, encounters } from "@/lib/server/repo";
import type { Note } from "@/lib/types";

export const PUT = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  const b = await body<{ note?: Note; reason?: string }>(req);
  if (!b.note?.sections) return fail("Note is required");
  const out = saveNoteEdits(user, enc.id, b.note);
  audit.log(user.id, enc.id, "note.edited", { reason: b.reason ?? "edit" });
  return json(out);
});

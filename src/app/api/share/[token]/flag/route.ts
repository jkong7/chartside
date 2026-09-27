import { body, fail, json } from "@/lib/server/http";
import { audit, encounterByShareToken, patientFlags } from "@/lib/server/repo";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const enc = await encounterByShareToken(token);
  if (!enc) return fail("This link is no longer valid", 404);
  const b = await body<{ item?: string; comment?: string }>(req);
  if (!b.item?.trim() || !b.comment?.trim()) return fail("Tell us what looks wrong");
  await patientFlags.add(enc.id, b.item.trim().slice(0, 500), b.comment.trim().slice(0, 1000));
  await audit.log(null, enc.id, "patient.flagged", { item: b.item.slice(0, 120) });
  return json({ ok: true }, 201);
}

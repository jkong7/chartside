import { fail, json } from "@/lib/server/http";
import { familyView } from "@/lib/server/patientVisit";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const d = await familyView((await ctx.params).token);
  return d ? json(d, { headers: { "cache-control": "no-store" } }) : fail("This link has expired or was turned off", 404);
}

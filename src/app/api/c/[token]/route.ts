import { publicCheckin, submitCheckin } from "@/lib/server/checkin";
import { fail, json } from "@/lib/server/http";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const d = await publicCheckin((await ctx.params).token);
  return d ? json(d) : fail("This link is no longer valid", 404);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    return json(await submitCheckin((await ctx.params).token, (await req.json().catch(() => ({}))) as Record<string, unknown>));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not save", 422);
  }
}

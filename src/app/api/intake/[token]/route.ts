import { body, fail, json } from "@/lib/server/http";
import { publicIntake, submitIntake } from "@/lib/server/intake";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const d = await publicIntake((await ctx.params).token);
  return d ? json(d) : fail("This link is no longer valid", 404);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    return json({ summary: await submitIntake((await ctx.params).token, await body(req)) }, 201);
  } catch (err) {
    const m = err instanceof Error ? err.message : "Could not save";
    return fail(m, /no longer valid/.test(m) ? 404 : 422);
  }
}

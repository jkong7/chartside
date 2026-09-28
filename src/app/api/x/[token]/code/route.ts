import { fail, json } from "@/lib/server/http";
import { sendCode } from "@/lib/server/sharing";

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    return json(await sendCode(token));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not send a code", 422);
  }
}

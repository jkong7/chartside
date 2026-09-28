import { fail, json } from "@/lib/server/http";
import { receiveFax } from "@/lib/server/faxin";

export async function POST(req: Request, ctx: { params: Promise<{ org: string }> }) {
  const { org } = await ctx.params;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return fail("Attach the fax as a PDF in the file field", 422);
    const id = await receiveFax(org, req.headers.get("x-chartside-fax-secret") ?? "", { from: String(form.get("from") ?? ""), pages: Number(form.get("num_pages") ?? 0), pdf: Buffer.from(await file.arrayBuffer()) });
    return json({ id }, 201);
  } catch (e) {
    const m = e instanceof Error ? e.message : "Could not receive";
    return fail(m, m === "Unauthorized" ? 401 : 422);
  }
}

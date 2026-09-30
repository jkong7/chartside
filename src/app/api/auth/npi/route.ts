import { fail, json } from "@/lib/server/http";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";
import { npiPreview } from "@/lib/server/signup";

export async function GET(req: Request) {
  if (limited(`npi:${clientIp(req)}`, Number(process.env.CHARTSIDE_AUTH_RATE ?? 30) * 2, 3600000)) return tooMany();
  try {
    const rec = await npiPreview(new URL(req.url).searchParams.get("npi") ?? "");
    if (!rec) return fail("No individual clinician has that NPI", 404);
    return json({ name: rec.name, credential: rec.credential, specialty: rec.profile.specialty, taxonomy: rec.specialty, state: rec.state, template: rec.profile.noteStyle });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Lookup failed", 422);
  }
}

import { NextResponse } from "next/server";
import { openWithClaim } from "@/lib/server/practice";
import { practiceActor } from "@/lib/server/practiceHttp";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export async function GET(req: Request) {
  if (limited(`practice-open:${clientIp(req)}`, 60, 3600_000)) return tooMany();
  const u = new URL(req.url);
  const id = u.searchParams.get("s") ?? "";
  const actor = await practiceActor(true);
  const r = actor.device ? await openWithClaim(id, u.searchParams.get("k") ?? "", actor.device) : null;
  const base = (process.env.CHARTSIDE_PUBLIC_URL || u.origin).replace(/\/$/, "");
  return NextResponse.redirect(`${base}${r?.status === "opened" ? `/practice/s/${r.session.id}` : `/practice/link?why=${r?.status ?? "invalid"}`}`, 303);
}

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendClinicNudges } from "@/lib/server/telephony/texting";

function authorized(req: Request) {
  const want = process.env.CHARTSIDE_CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!want || want.length !== got.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await sendClinicNudges());
}

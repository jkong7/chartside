import { NextResponse } from "next/server";
import { unseal } from "@/lib/fhir/crypto";
import { simMessages } from "@/lib/server/telephony/sms";

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  try {
    const { phone, exp } = JSON.parse(unseal(key ?? "")) as { phone: string; exp: number };
    if (exp < Date.now()) throw new Error("expired");
    return NextResponse.json({ phone, messages: simMessages(phone) });
  } catch {
    return NextResponse.json({ error: "Unknown inbox" }, { status: 404 });
  }
}

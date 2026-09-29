import { NextResponse } from "next/server";
import { MAX_CAPTURE_BYTES, normalizeMime } from "@/lib/server/capture";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";
import { holdShared, reserveShare, SHARE_COOKIE, SHARE_TTL_MS } from "@/lib/server/sharedAudio";

export async function POST(req: Request) {
  if (limited(`share:${clientIp(req)}`, Number(process.env.CHARTSIDE_SHARE_RATE || 30), 3600_000)) return tooMany();
  const back = (msg: string) => NextResponse.redirect(new URL(`/go?shared=${encodeURIComponent(msg)}`, req.url), 303);
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(declared) || declared <= 0) return back("Share the recording again from your recorder app.");
  if (declared > MAX_CAPTURE_BYTES + 64 * 1024) return back("That recording is over 100 MB.");
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "none" && site !== "same-origin") return back("Share recordings from your recorder app or from Chartside itself.");
  const release = reserveShare(declared);
  if (!release) return back("Chartside is busy. Share the recording again in a few minutes.");
  try {
    return await accept(req, back);
  } finally {
    release();
  }
}

async function accept(req: Request, back: (msg: string) => NextResponse) {
  const form = await req.formData().catch(() => null);
  if (!form) return back("Nothing was shared.");
  const file = [...form.values()].find((v): v is File => typeof v !== "string");
  if (!file || !file.size) return back("Share an audio recording to Chartside.");
  const mime = normalizeMime(file.type, file.name);
  if (!mime) return back("Chartside takes m4a, mp3, wav, webm, ogg or aac recordings.");
  let token: { id: string; secret: string };
  try {
    token = holdShared(Buffer.from(await file.arrayBuffer()), mime, file.name || "Recording");
  } catch {
    return back("Chartside is busy. Share the recording again in a few minutes.");
  }
  const { id, secret } = token;
  const res = NextResponse.redirect(new URL(`/go/share/confirm?t=${id}`, req.url), 303);
  res.cookies.set(SHARE_COOKIE, secret, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.CHARTSIDE_INSECURE_COOKIES !== "1", path: "/", maxAge: Math.round(SHARE_TTL_MS / 1000) });
  return res;
}

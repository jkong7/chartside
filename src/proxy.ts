import { NextResponse, type NextRequest } from "next/server";
import { hiddenInCore, isCore } from "@/lib/edition";

export function proxy(req: NextRequest) {
  if (!isCore()) return NextResponse.next();
  const path = req.nextUrl.pathname;
  if (!hiddenInCore(path)) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Not available in this edition" }, { status: 404 });
  return NextResponse.redirect(new URL("/today", req.url));
}

export const config = {
  matcher: ["/((?!_next/|favicon|icon|sw\\.js|manifest).*)"],
};

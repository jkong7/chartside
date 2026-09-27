import { icdReleaseFor, latestIcdRelease } from "@/lib/codesets";
import { authed, json } from "@/lib/server/http";

export const GET = authed(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const dos = url.searchParams.get("dos");
  const release = (dos && icdReleaseFor(dos)) || latestIcdRelease();
  return json({ release: release.meta.version, results: release.search(q, Math.min(50, Number(url.searchParams.get("limit") ?? 20))) });
});

import { authed, body, json } from "@/lib/server/http";
import { goldenCases, runGolden, saveGolden } from "@/lib/server/qa";

export const GET = authed(async (_req, user) => json({ cases: await goldenCases(user) }));

export const POST = authed(async (req, user) => {
  const b = await body<{ encounterId?: string; name?: string; run?: boolean }>(req);
  if (b.run) return json({ ...(await runGolden(user)), cases: await goldenCases(user) });
  await saveGolden(user, b.encounterId ?? "", b.name ?? "");
  return json({ cases: await goldenCases(user) }, 201);
});

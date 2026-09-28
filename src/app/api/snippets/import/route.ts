import { authed, body, json } from "@/lib/server/http";
import { Invalid } from "@/lib/server/policy";
import { snippets } from "@/lib/server/snippets";

export const POST = authed(async (req, user) => {
  const b = await body<{ csv?: string }>(req);
  if (!b.csv?.trim()) throw new Invalid("Paste or upload a CSV");
  if (b.csv.length > 500000) throw new Invalid("That file is too large");
  const result = await snippets.importCsv(user, b.csv);
  return json({ ...result, snippets: await snippets.list(user) });
});

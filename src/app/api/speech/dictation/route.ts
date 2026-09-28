import { dictationUrl, speechConfig } from "@/lib/server/audio";
import { authed, json } from "@/lib/server/http";
import { snippets, vocabulary } from "@/lib/server/snippets";

export const GET = authed(async (_req, user) => {
  const terms = await vocabulary.keyterms(user);
  const cfg = speechConfig();
  return json({
    provider: cfg.provider,
    url: dictationUrl(terms),
    keyterms: terms,
    replacements: await vocabulary.replacements(user.id, user.orgId),
    snippets: await snippets.list(user),
  });
});

import { runAgent, ToolError, type AgentTurn } from "@/lib/server/agent";
import { listDecisions } from "@/lib/server/decisions";
import { authed, body, fail, json } from "@/lib/server/http";

export const POST = authed(async (req, user) => {
  const b = await body<{ messages?: AgentTurn[]; encounterId?: string }>(req);
  try {
    const r = await runAgent(user, Array.isArray(b.messages) ? b.messages : [], { channel: "text", phiScope: "full", encounterId: b.encounterId || null });
    const cards = r.proposals.length ? (await listDecisions(user, { kinds: ["proposal"], includeSnoozed: true })).filter((d) => r.proposals.includes(d.id)) : [];
    return json({ ...r, cards: cards.map((d) => ({ id: d.id, title: d.title, summary: d.summary, proposalKind: d.proposalKind, url: `/go/stack?focus=${encodeURIComponent(d.id)}` })) });
  } catch (err) {
    if (err instanceof ToolError) return fail(err.message, 422);
    throw err;
  }
});

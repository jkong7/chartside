import { decisionCounts, listDecisions, proposeDecision, type DecisionKind, type ProposalKind } from "@/lib/server/decisions";
import { authed, body, json } from "@/lib/server/http";

export const GET = authed(async (req, user) => {
  const kinds = new URL(req.url).searchParams.get("kinds")?.split(",").filter(Boolean) as DecisionKind[] | undefined;
  const [decisions, counts] = await Promise.all([listDecisions(user, { kinds }), decisionCounts(user)]);
  return json({ decisions, counts });
});

export const POST = authed(async (req, user) => {
  const b = await body<{ kind?: ProposalKind; payload?: Record<string, unknown>; summary?: string }>(req);
  return json({ id: await proposeDecision(user, b.kind as ProposalKind, b.payload ?? {}, { source: "user", summary: b.summary }) }, 201);
});

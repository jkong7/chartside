import Anthropic from "@anthropic-ai/sdk";
import { llmEnabled } from "../../llm";
import { audit, encounters, type User } from "../repo";
import { routeLocally } from "./local";
import { runTool, TOOL_DEFS, ToolError, type PhiScope, type ToolContext } from "./tools";

export const DEFAULT_AGENT_MODEL = "claude-sonnet-5-5";
const MAX_STEPS = 8;

export function agentModel() {
  return process.env.CHARTSIDE_AGENT_MODEL || DEFAULT_AGENT_MODEL;
}

export interface AgentTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentOptions {
  channel: "text" | "voice";
  encounterId?: string | null;
  phiScope: PhiScope;
}

export interface AgentResult {
  reply: string;
  proposals: string[];
  citations: string[];
  engine: "claude" | "local";
}

const SYSTEM = `You are Chartside's assistant for a clinician. You answer questions about their patients, visits, notes and codes using the tools, and you prepare changes for them to approve.

Rules:
- Use tools for every fact about a patient or visit. Never guess a value, dose, result or code. If a tool doesn't have it, say you don't have it.
- You cannot change anything yourself. The propose_* and draft_message_reply tools create a card the clinician approves on screen. After proposing, say it is ready to review, never that it is done.
- You cannot sign notes, place orders or submit claims. If asked, say those happen on screen in the stack.
- If a tool says something is not available on this call, tell the clinician they can enter their PIN or open the app.
- Be brief and clinical. Lead with the answer.`;

const VOICE = `This conversation is spoken on a phone call. Reply in one to three short sentences of plain speech: no markdown, no lists, no headings, no symbols, no IDs or codes read digit by digit unless asked. Say numbers the way a clinician would say them aloud.`;

const SCOPE_CALL = `This caller has not entered a PIN. Only the visit just recorded on this call is available. Do not mention other patients or visits.`;

let client: Anthropic | null = null;
function anthropic() {
  client ??= new Anthropic();
  return client;
}

export function plainSpeech(text: string, maxSentences = 3) {
  const flat = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_~>|#]/g, "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  const sentences = flat.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [flat];
  return sentences.slice(0, maxSentences).map((s) => s.trim()).join(" ");
}

function finish(opts: AgentOptions, reply: string, ctx: ToolContext, citations: string[], engine: AgentResult["engine"]): AgentResult {
  return { reply: opts.channel === "voice" ? plainSpeech(reply) : reply.trim(), proposals: [...new Set(ctx.proposals)], citations: [...new Set(citations)], engine };
}

async function withClaude(ctx: ToolContext, history: AgentTurn[], opts: AgentOptions) {
  const system = [SYSTEM, opts.channel === "voice" ? VOICE : "", opts.phiScope === "call" ? SCOPE_CALL : "", ctx.encounterId ? `The current visit is encounterId ${ctx.encounterId}.` : ""].filter(Boolean).join("\n\n");
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));
  const citations: string[] = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await anthropic().beta.messages.create({
      model: agentModel(),
      max_tokens: opts.channel === "voice" ? 2048 : 8192,
      system,
      tools: TOOL_DEFS,
      messages,
      output_config: { effort: opts.channel === "voice" ? "low" : "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (res.stop_reason === "refusal") return { reply: "I can't help with that one. Open the app to handle it directly.", citations };
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) return { reply: text || "Done.", citations };
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      try {
        const out = await runTool(ctx, u.name, (u.input ?? {}) as Record<string, unknown>);
        citations.push(u.name);
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out).slice(0, 20000) });
      } catch (err) {
        results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: err instanceof ToolError || err instanceof Error ? err.message : "Tool failed" });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: "That took too many steps. Try asking one thing at a time.", citations };
}

export async function runAgent(user: User, history: AgentTurn[], opts: AgentOptions): Promise<AgentResult> {
  const turns = history.filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim()).slice(-20).map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
  if (!turns.length || turns.at(-1)!.role !== "user") throw new ToolError("Ask a question");
  if (opts.phiScope === "call" && !opts.encounterId) throw new ToolError("A call-scoped conversation needs the visit it belongs to");
  if (opts.encounterId && !(await encounters.get(user, opts.encounterId))) throw new ToolError("Visit not found");
  while (turns[0].role !== "user") turns.shift();
  const ctx: ToolContext = { user, phiScope: opts.phiScope, encounterId: opts.encounterId ?? null, proposals: [] };
  let out: { reply: string; citations: string[] };
  let engine: AgentResult["engine"] = "local";
  if (llmEnabled()) {
    try {
      out = await withClaude(ctx, turns, opts);
      engine = "claude";
    } catch (err) {
      if (!(err instanceof Anthropic.APIError || err instanceof Anthropic.APIConnectionError)) throw err;
      out = await routeLocally(ctx, turns.at(-1)!.content);
    }
  } else {
    out = await routeLocally(ctx, turns.at(-1)!.content);
  }
  await audit.log(user, ctx.encounterId, "agent.turn", { channel: opts.channel, phiScope: opts.phiScope, engine, tools: out.citations, proposals: ctx.proposals.length });
  return finish(opts, out.reply, ctx, out.citations, engine);
}

export { ToolError } from "./tools";
export type { PhiScope } from "./tools";

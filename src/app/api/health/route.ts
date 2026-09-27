import { db } from "@/lib/db";
import { llmEnabled, llmModel } from "@/lib/llm";
import { json } from "@/lib/server/http";

export function GET() {
  db().prepare("SELECT 1").get();
  return json({ ok: true, engine: llmEnabled() ? { mode: "claude", model: llmModel() } : { mode: "local" } });
}

import { dbKind, get } from "@/lib/db";
import { llmEnabled, llmModel } from "@/lib/llm";
import { json } from "@/lib/server/http";

export async function GET() {
  await get("SELECT 1 AS ok");
  return json({ ok: true, db: dbKind(), engine: llmEnabled() ? { mode: "claude", model: llmModel() } : { mode: "local" } });
}

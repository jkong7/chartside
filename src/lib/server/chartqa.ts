import { all } from "../db";
import { answerChart, buildCorpus, type ChartAnswer } from "../engine/chartqa";
import { answerChartWithClaude, llmEnabled } from "../llm";
import { needsBreakGlass } from "./access";
import { Invalid } from "./policy";
import { audit, encounters, notes, patients, type User } from "./repo";

export async function askChart(u: User, patientId: string, question: string): Promise<ChartAnswer & { engine: "local" | "claude" }> {
  const q = question.trim().slice(0, 300);
  if (q.length < 3) throw new Invalid("Ask a question");
  const p = await patients.get(u, patientId);
  if (!p) throw new Error("Patient not found");
  const encs = (await encounters.list(u, { patientId })).filter((e) => e.status === "signed" || e.status === "review");
  const noteDocs = [];
  for (const e of encs) {
    if (await needsBreakGlass(u, e)) continue;
    const n = await notes.latest(e.id);
    if (!n) continue;
    noteDocs.push({ encounterId: e.id, date: e.scheduledAt, title: `${e.reason || "Visit"} (${new Date(e.scheduledAt).toLocaleDateString("en-US")})`, lines: n.content.sections.flatMap((s) => s.sentences.filter((x) => !x.pending && !x.text.includes("***")).map((x) => x.text)) });
  }
  const records = await all<{ id: string; name: string; created_at: string; text: string }>("SELECT id, name, created_at, text FROM outside_records WHERE org_id = ? AND patient_id = ?", u.orgId, patientId);
  const docs = buildCorpus({ chart: p.chart, notes: noteDocs, records: records.map((r) => ({ id: r.id, name: r.name, date: r.created_at, text: r.text })) });
  const local = answerChart(q, docs);
  await audit.log(u, null, "chart.asked", { patientId, mode: local.mode });
  if (llmEnabled() && local.citations.length && local.mode === "search") {
    try {
      const passages = local.citations.map((c) => docs.find((d) => d.id === c.id)!).filter(Boolean);
      return { ...local, answer: await answerChartWithClaude(q, passages), engine: "claude" };
    } catch {
      return { ...local, engine: "local" };
    }
  }
  return { ...local, engine: "local" };
}

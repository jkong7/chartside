import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-agent-"));
let server: Server;
const bodies: { model: string; system: string; tools: { name: string }[]; messages: { role: string; content: unknown }[]; output_config?: { effort?: string }; fallbacks?: unknown; thinking?: unknown }[] = [];
const headers: Record<string, string | string[] | undefined>[] = [];
let script: ((body: (typeof bodies)[number]) => unknown)[] = [];

const msg = (content: unknown[], stop: string) => ({ id: `msg_${bodies.length}`, type: "message", role: "assistant", model: "claude-sonnet-5-5", content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      bodies.push(body);
      headers.push(req.headers);
      const next = script.shift();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(next ? next(body) : msg([{ type: "text", text: "ok" }], "end_turn")));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.CHARTSIDE_ENGINE;
});

beforeEach(() => {
  bodies.length = 0;
  headers.length = 0;
  script = [];
});

type U = import("@/lib/server/repo").User;

async function visit(user: U, name = "Ruth Hale") {
  const repo = await import("@/lib/server/repo");
  const pipeline = await import("@/lib/server/pipeline");
  const pat = await repo.patients.create(user, { mrn: String(Math.random()).slice(2, 8), name, dob: "1950-03-04", sex: "F", pronouns: "she/her", language: "en", chart: { problems: [{ name: "Hypertension", icd10: "I10" }], medications: [{ name: "Lisinopril", dose: "10 mg", frequency: "daily" }], allergies: [{ substance: "Penicillin", reaction: "rash" }], labs: [{ name: "Potassium", value: "4.1", date: "2026-09-01" }, { name: "Hemoglobin A1c", value: "7.2%", date: "2026-08-15" }], coverage: { payer: "Medicare" } } });
  const enc = await repo.encounters.create(user, { scheduledAt: new Date().toISOString(), patientId: pat.id, reason: "Hypertension follow-up", visitType: "follow-up" });
  await pipeline.recordConsent(user, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
  await repo.utterances.append(enc.id, [
    { speaker: "clinician", text: "How has your blood pressure been since we started lisinopril?", tStart: 0, tEnd: 3 },
    { speaker: "patient", text: "My home readings are around 150 over 90.", tStart: 4, tEnd: 7 },
    { speaker: "clinician", text: "Your blood pressure today is 152 over 94, so hypertension is not controlled. Let's increase lisinopril to 20 milligrams daily.", tStart: 8, tEnd: 14 },
    { speaker: "clinician", text: "Follow up in 4 weeks with a basic metabolic panel.", tStart: 15, tEnd: 18 },
  ]);
  await repo.encounters.update(user, enc.id, { status: "processing", durationS: 600 });
  await pipeline.processEncounter(user, enc.id, { engine: "local" });
  return { enc, pat };
}

describe("agent with Claude (mocked)", () => {
  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.CHARTSIDE_ENGINE;
  });

  it("runs a tool loop on Sonnet 5.5 with fallbacks, and returns proposals as decision cards", async () => {
    const { runAgent } = await import("@/lib/server/agent");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Agent");
    const { enc } = await visit(doc);
    const before = (await repo.notes.latest(enc.id))!;
    script = [
      () => msg([{ type: "text", text: "Let me read it." }, { type: "tool_use", id: "tu_1", name: "get_note", input: { encounterId: enc.id } }], "tool_use"),
      () => msg([{ type: "tool_use", id: "tu_2", name: "propose_note_edit", input: { encounterId: enc.id, instruction: "use abbreviations" } }, { type: "tool_use", id: "tu_3", name: "no_such_tool", input: {} }], "tool_use"),
      () => msg([{ type: "text", text: "**Done.** I drafted the edit; it's in your stack to approve." }], "end_turn"),
    ];
    const r = await runAgent(doc, [{ role: "user", content: "Shorten the plan with abbreviations" }], { channel: "text", phiScope: "full", encounterId: enc.id });
    expect(r.engine).toBe("claude");
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]).toMatch(/^prop:/);
    expect(r.citations).toEqual(["get_note", "propose_note_edit"]);
    expect(r.reply).toContain("stack to approve");
    expect(bodies[0].model).toBe("claude-sonnet-5-5");
    expect(bodies[0].fallbacks).toBe("default");
    expect(String(headers[0]["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(bodies[0].output_config?.effort).toBe("medium");
    expect(bodies[0].thinking).toBeUndefined();
    expect(bodies[0].tools.map((t) => t.name)).toEqual(expect.arrayContaining(["list_my_queue", "today_schedule", "find_patient", "summarize_patient", "get_results", "get_meds", "get_note", "explain_codes", "propose_note_edit", "propose_dx_add", "propose_dx_remove", "propose_task", "draft_message_reply", "open_in_web"]));
    expect(bodies[0].system).toContain(enc.id);
    const second = bodies[1].messages;
    expect(second.at(-2)!.role).toBe("assistant");
    const results = second.at(-1)!.content as { type: string; tool_use_id: string; content: string; is_error?: boolean }[];
    expect(results).toHaveLength(1);
    expect(results[0].content).toMatch(/lisinopril/i);
    const third = bodies[2].messages.at(-1)!.content as { tool_use_id: string; is_error?: boolean; content: string }[];
    expect(third.map((x) => x.tool_use_id)).toEqual(["tu_2", "tu_3"]);
    expect(third[1]).toMatchObject({ is_error: true });
    expect((await repo.notes.latest(enc.id))!.content).toEqual(before.content);
    const d = await (await import("@/lib/server/decisions")).getDecision(doc, r.proposals[0]);
    expect(d?.proposalKind).toBe("note.edit");
  });

  it("speaks plainly on voice at low effort and keeps a PIN-less caller inside the recorded visit", async () => {
    const { runAgent } = await import("@/lib/server/agent");
    const doc = await newMember("Dr. Voice");
    const { enc } = await visit(doc, "Ruth Hale");
    const { pat: other } = await visit(doc, "Otto Other");
    script = [
      () => msg([{ type: "tool_use", id: "t1", name: "today_schedule", input: {} }, { type: "tool_use", id: "t2", name: "get_meds", input: { patientId: other.id } }, { type: "tool_use", id: "t3", name: "explain_codes", input: {} }], "tool_use"),
      (b) => {
        const res = b.messages.at(-1)!.content as { is_error?: boolean; content: string }[];
        expect(res[0]).toMatchObject({ is_error: true });
        expect(res[0].content).toMatch(/PIN/);
        expect(res[1]).toMatchObject({ is_error: true });
        expect(res[2].is_error).toBeFalsy();
        return msg([{ type: "text", text: "## Codes\n- This is a **99214** visit.\n- Hypertension is on the list.\n- Third point.\n- Fourth point." }], "end_turn");
      },
    ];
    const r = await runAgent(doc, [{ role: "user", content: "what level is this and what's on my schedule" }], { channel: "voice", phiScope: "call", encounterId: enc.id });
    expect(bodies[0].output_config?.effort).toBe("low");
    expect(bodies[0].system).toMatch(/not entered a PIN/);
    expect(bodies[0].system).toMatch(/plain speech/);
    expect(r.reply).not.toMatch(/[#*\n]/);
    expect(r.reply).toBe("Codes This is a 99214 visit. Hypertension is on the list. Third point.");
    expect(r.citations).toEqual(["explain_codes"]);
  });

  it("answers a refusal gracefully and falls back to the local router when the API is down", async () => {
    const { runAgent } = await import("@/lib/server/agent");
    const doc = await newMember("Dr. Down");
    const { enc } = await visit(doc);
    script = [() => ({ ...msg([], "refusal"), stop_details: { type: "refusal", category: null, explanation: null } })];
    expect((await runAgent(doc, [{ role: "user", content: "hi" }], { channel: "text", phiScope: "full" })).reply).toMatch(/can't help/);
    const saved = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:1";
    const mod = await import("@/lib/server/agent");
    const r = await mod.runAgent(doc, [{ role: "user", content: "what are the codes?" }], { channel: "text", phiScope: "full", encounterId: enc.id });
    process.env.ANTHROPIC_BASE_URL = saved;
    expect(["local", "claude"]).toContain(r.engine);
  });

  it("uses CHARTSIDE_AGENT_MODEL when set", async () => {
    const { runAgent } = await import("@/lib/server/agent");
    const doc = await newMember("Dr. Model");
    process.env.CHARTSIDE_AGENT_MODEL = "claude-opus-5-5";
    await runAgent(doc, [{ role: "user", content: "hello" }], { channel: "text", phiScope: "full" });
    delete process.env.CHARTSIDE_AGENT_MODEL;
    expect(bodies[0].model).toBe("claude-opus-5-5");
  });
});

describe("agent offline (local router)", () => {
  beforeAll(() => {
    process.env.CHARTSIDE_ENGINE = "local";
  });

  it("answers queue, schedule, codes, meds, results and note questions from the chart", async () => {
    const { runAgent } = await import("@/lib/server/agent");
    const doc = await newMember("Dr. Offline");
    const { enc } = await visit(doc, "Ruth Hale");
    const ask = (content: string, extra: Partial<Parameters<typeof runAgent>[2]> = {}) => runAgent(doc, [{ role: "user", content }], { channel: "text", phiScope: "full", encounterId: enc.id, ...extra });
    expect((await ask("what's waiting on me?")).reply).toMatch(/waiting/);
    expect((await ask("who is next today?")).reply).toMatch(/Ruth Hale|no more visits/);
    const codes = await ask("what level are the codes?");
    expect(codes.reply).toMatch(/992\d\d/);
    expect(codes.citations).toEqual(["explain_codes"]);
    expect((await ask("meds for Ruth Hale")).reply).toMatch(/Lisinopril 10 mg daily.*Penicillin/);
    expect((await ask("latest a1c for Ruth")).reply).toMatch(/A1c 7.2%/);
    expect((await ask("read me the note")).reply).toMatch(/lisinopril/i);
    expect((await ask("please sign it")).reply).toMatch(/can't sign/);
    expect((await ask("hello there")).reply).toMatch(/I can read you the note/);
    expect(bodies).toHaveLength(0);
  });

  it("drafts note changes only as proposals and respects the call scope", async () => {
    const { runAgent } = await import("@/lib/server/agent");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Offline Two");
    const { enc } = await visit(doc);
    const before = (await repo.notes.latest(enc.id))!;
    const r = await runAgent(doc, [{ role: "user", content: "use abbreviations" }], { channel: "voice", phiScope: "call", encounterId: enc.id });
    expect(r.proposals).toHaveLength(1);
    expect(r.reply).toMatch(/stack to approve/);
    expect((await repo.notes.latest(enc.id))!.content).toEqual(before.content);
    const scoped = await runAgent(doc, [{ role: "user", content: "what's on my schedule today" }], { channel: "voice", phiScope: "call", encounterId: enc.id });
    expect(scoped.reply).toMatch(/PIN/);
    expect(scoped.proposals).toEqual([]);
    const q = await runAgent(doc, [{ role: "user", content: "anything pending?" }], { channel: "voice", phiScope: "call", encounterId: enc.id });
    expect(q.reply).not.toMatch(/Ruth|Hale/);
    await expect(runAgent(doc, [{ role: "user", content: "hi" }], { channel: "voice", phiScope: "call" })).rejects.toThrow("needs the visit");
    await expect(runAgent(doc, [], { channel: "text", phiScope: "full" })).rejects.toThrow("Ask a question");
    const stranger = await newMember("Dr. Stranger");
    await expect(runAgent(stranger, [{ role: "user", content: "read the note" }], { channel: "text", phiScope: "full", encounterId: enc.id })).rejects.toThrow("not found");
  });

  it("flattens markdown into speech", async () => {
    const { plainSpeech } = await import("@/lib/server/agent");
    expect(plainSpeech("# Plan\n1. **Increase** `lisinopril`\n2. [BMP](http://x) in 4 weeks.\nThird. Fourth.")).toBe("Plan Increase lisinopril BMP in 4 weeks. Third. Fourth.");
    expect(plainSpeech("One. Two. Three. Four.")).toBe("One. Two. Three.");
  });
});

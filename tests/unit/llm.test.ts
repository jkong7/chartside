import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemTemplate } from "@/lib/engine/templates";
import { scoreSupport } from "@/lib/engine/verify";
import { demo } from "./helpers";

let server: Server;
let lastBody: { model: string; system: string; messages: { content: string }[]; output_config?: unknown } | null = null;
let reply: unknown = null;
let status = 200;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastBody = JSON.parse(raw);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(status === 200 ? { id: "msg_test", type: "message", role: "assistant", model: lastBody!.model, content: [{ type: "text", text: JSON.stringify(reply) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } } : { type: "error", error: { type: "api_error", message: "boom" } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
});

describe("Claude note generation", () => {
  it("sends the transcript with IDs and maps structured output into a verifiable note", async () => {
    const { generateNoteWithClaude, llmEnabled } = await import("@/lib/llm");
    expect(llmEnabled()).toBe(true);
    const { d, patient, utterances } = demo("carter");
    reply = {
      sections: [
        { key: "subjective", sentences: [{ text: "Reports a dry cough for 6 days, worse at night.", evidence: ["u1", "u3"], heading: false, indent: 0 }, { text: "Reports a fever of 104.", evidence: ["u5"], heading: false, indent: 0 }] },
        { key: "objective", sentences: [{ text: "Lungs clear to auscultation, no wheezing or crackles.", evidence: ["u17"], heading: false, indent: 0 }] },
        { key: "assessment_plan", sentences: [{ text: "1. Acute upper respiratory infection (J06.9).", evidence: ["u18"], heading: true, indent: 0 }, { text: "Start benzonatate 100 mg three times daily as needed.", evidence: ["u19"], heading: false, indent: 1 }] },
      ],
    };
    const note = await generateNoteWithClaude({ utterances, patient, template: systemTemplate("soap")!, reason: d.visit.reason, visitType: d.visit.type, rules: [] });
    expect(lastBody!.model).toBe("claude-opus-5");
    expect(lastBody!.messages[0].content).toContain("[u1] PATIENT: I've had this cough for about six days now");
    expect(lastBody!.system).toContain("Never write consent or attestation statements");
    expect(lastBody!.output_config).toBeTruthy();
    expect(note.meta.engine).toBe("claude");
    const scored = scoreSupport(note, utterances, patient.chart);
    const s = scored.sections[0].sentences;
    expect(s[0].support).toBe("strong");
    expect(s[1].support).toBe("none");
    expect(scored.sections[2].sentences[1].indent).toBe(1);
  });

  it("surfaces API failures so the pipeline can fall back", async () => {
    const { generateNoteWithClaude } = await import("@/lib/llm");
    status = 500;
    const { d, patient, utterances } = demo("carter");
    await expect(generateNoteWithClaude({ utterances, patient, template: systemTemplate("soap")!, reason: d.visit.reason, visitType: d.visit.type, rules: [] })).rejects.toThrow();
    status = 200;
  });
});

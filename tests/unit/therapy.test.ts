import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractTherapy, unitsFor, type ServiceLine } from "@/lib/engine/therapy";
import type { Utterance } from "@/lib/types";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-pt-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const svc = (cpt: string, minutes: number, timed = true): ServiceLine => ({ cpt, label: cpt, minutes, timed, bundled: false, evidence: [] });
const units = (xs: ServiceLine[], m: "cms" | "per_code") => Object.fromEntries(unitsFor(xs, m));

const SCRIPT: [Utterance["speaker"], string][] = [
  ["clinician", "How's the knee been since Thursday?"],
  ["patient", "Better. Stairs are easier but it still gets stiff in the morning."],
  ["clinician", "Your knee flexion is 105 degrees today, up from 95, and quad strength is 4 out of 5."],
  ["clinician", "Pain is 3 out of 10 after the session."],
  ["clinician", "We did 23 minutes of therapeutic exercise, then 12 minutes of manual therapy with joint mobilizations."],
  ["clinician", "Then 8 minutes of gait training on the stairs, and a cold pack at the end."],
  ["clinician", "Keep doing the home program twice a day, and I'll see you Thursday."],
];

describe("therapy pack", () => {
  it("follows the CMS 8-minute rule across timed services", () => {
    expect(units([svc("97110", 33), svc("97140", 7)], "cms")).toEqual({ "97110": 2, "97140": 1 });
    expect(units([svc("97112", 24), svc("97110", 23)], "cms")).toEqual({ "97112": 2, "97110": 1 });
    expect(units([svc("97110", 7), svc("97140", 7)], "cms")).toEqual({ "97110": 1, "97140": 0 });
    expect(units([svc("97110", 5)], "cms")).toEqual({ "97110": 0 });
    expect(units([svc("97110", 7), svc("97140", 7)], "per_code")).toEqual({ "97110": 0, "97140": 0 });
    expect(units([svc("97110", 23), svc("97014", 0, false)], "cms")).toEqual({ "97110": 2, "97014": 1 });
  });

  it("extracts interventions with minutes and objective measures", () => {
    const u = SCRIPT.map(([speaker, text], i) => ({ id: `u${i}`, seq: i, speaker, text, tStart: i, tEnd: i + 1 }));
    const f = extractTherapy(u);
    expect(f.services.map((s) => [s.cpt, s.minutes])).toEqual([["97110", 23], ["97140", 12], ["97116", 8], ["97010", null]]);
    expect(f.measures.map((m) => m.text)).toEqual(["Knee flexion is 105 degrees", "Quad strength is 4 out of 5", "Pain is 3 out of 10"]);
    expect(extractTherapy(u, { comorbidities: 3, evaluation: "initial" }).evaluation).toMatchObject({ complexity: "high" });
  });

  it("bills a PT daily visit with GP units by payer method and no E/M", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const pt = await newMember("Sam Rivera PT");
    for (const [payer, expected] of [["Medicare", { "97110": 2, "97140": 1, "97116": 0 }], ["Commercial", { "97110": 2, "97140": 1, "97116": 1 }]] as const) {
      const p = await repo.patients.create(pt, { mrn: String(Math.random()).slice(2, 8), name: "Walter Price", dob: "1952-04-04", sex: "M", pronouns: "", language: "en", chart: { problems: [{ name: "Unilateral primary osteoarthritis, right knee", icd10: "M17.11" }], medications: [], allergies: [], coverage: { payer } } });
      const enc = await repo.encounters.create(pt, { patientId: p.id, scheduledAt: new Date().toISOString(), visitType: "follow-up", reason: "Knee rehab", templateId: "pt_daily" });
      await pipeline.recordConsent(pt, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
      await repo.utterances.append(enc.id, SCRIPT.map(([speaker, text], i) => ({ speaker, text, tStart: i * 60, tEnd: i * 60 + 30 })));
      await repo.encounters.update(pt, enc.id, { status: "processing", durationS: 2700 });
      await pipeline.processEncounter(pt, enc.id, { engine: "local" });
      const note = (await repo.notes.latest(enc.id))!.content;
      const iv = note.sections.find((s) => s.key === "interventions")!.sentences.map((s) => s.text);
      expect(iv).toContain("Therapeutic exercise (97110): 23 minutes.");
      expect(iv).toContain("Hot or cold packs (97010): provided (bundled, not separately billable).");
      expect(iv.at(-1)).toBe("Total timed treatment: 43 minutes, 3 timed units under the 8-minute rule (97110 x2, 97140 x1).");
      const claim = (await repo.artifacts.get<import("@/lib/engine/billing").Claim>(enc.id, "claim"))!;
      const got = Object.fromEntries(["97110", "97140", "97116"].map((c) => [c, claim.lines.find((l) => l.cpt === c)?.units ?? 0]));
      expect(got).toEqual(expected);
      expect(claim.lines.every((l) => l.modifiers.includes("GP"))).toBe(true);
      expect(claim.lines.some((l) => /^992/.test(l.cpt) || l.cpt === "97010")).toBe(false);
    }
  });
});

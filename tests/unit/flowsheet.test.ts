import { describe, expect, it } from "vitest";
import { extractFlowsheet, shiftSummary, updateCareList } from "@/lib/engine/flowsheet";

const ASSESS = "0800 assessment. Blood pressure 142 over 86, heart rate 88, resp rate 18, temp 98.6, sats 93 percent on 2 liters nasal cannula. Alert and oriented times four. Lungs diminished at the bases. Pain is 6 out of 10 in the lower back. Skin intact, Braden 16. 20 gauge IV in the left forearm, site clean dry and intact. Drank 480 mL, ate 50 percent of breakfast, voided 350 mL. Fingerstick 212. Morse 55, bed alarm on. Ambulated 100 feet with a walker. 2 gram sodium diet. Educated on daily weights and fluid restriction, and he verbalized understanding. Needs dressing change on the sacrum at 1400. Reassess pain in one hour. Call the hospitalist if systolic over 160.";

describe("nursing flowsheet", () => {
  it("turns a spoken assessment into flowsheet rows with abnormal flags", () => {
    const rows = extractFlowsheet(ASSESS);
    const v = Object.fromEntries(rows.map((r) => [r.row, r]));
    expect(v["Blood pressure"].value).toBe("142/86 mmHg");
    expect(v["Heart rate"].value).toBe("88 bpm");
    expect(v["Respiratory rate"].value).toBe("18 /min");
    expect(v.Temperature.value).toBe("98.6 °F");
    expect(v.SpO2).toMatchObject({ value: "93%", abnormal: false });
    expect(v["O2 device"]).toMatchObject({ value: "2 L/min nasal cannula", abnormal: true });
    expect(v.Orientation.value).toBe("A&O x4");
    expect(v["Lung sounds"]).toMatchObject({ value: "diminished at the bases", abnormal: true });
    expect(v["Pain score"]).toMatchObject({ value: "6/10", abnormal: false });
    expect(v["Pain location"].value).toBe("lower back");
    expect(v["Braden score"]).toMatchObject({ value: "16", abnormal: true });
    expect(v["Peripheral IV"].value).toBe("20g left forearm");
    expect(v["IV site"].value).toMatch(/clean dry and intact/);
    expect(v["Oral intake"].value).toBe("480 mL");
    expect(v["Meal intake"].value).toBe("50% of breakfast");
    expect(v["Urine output"].value).toBe("350 mL");
    expect(v["Point-of-care glucose"]).toMatchObject({ value: "212 mg/dL", abnormal: false });
    expect(v["Fall risk (Morse)"]).toMatchObject({ value: "55", abnormal: true });
    expect(v.Activity.value).toBe("Ambulated 100 ft with walker");
    expect(v.Diet.value).toBe("2 gram sodium");
    expect(v["Education provided"].value).toBe("daily weights and fluid restriction");
    expect(v.Understanding.value).toBe("verbalized understanding");
    expect(rows.find((r) => r.row === "Blood pressure")!.evidence).toContain("142 over 86");
  });

  it("keeps a rolling list of pending care that closes items when they are done", () => {
    const first = updateCareList([], ASSESS);
    expect(first.added.map((a) => a.text)).toEqual(["Needs dressing change on the sacrum at 1400", "Reassess pain in one hour", "Call the hospitalist if systolic over 160"]);
    expect(first.added[0].due).toBe("1400");
    const second = updateCareList(first.items, "1400 update. Dressing on the sacrum changed, wound bed pink. Pain is 3 out of 10 after oxycodone given. Recheck the fingerstick before dinner.");
    expect(second.closed.map((c) => c.text)).toEqual(["Needs dressing change on the sacrum at 1400", "Reassess pain in one hour"]);
    expect(second.items.map((c) => c.text)).toContain("Recheck the fingerstick before dinner");
    expect(second.items.map((c) => c.text)).toContain("Call the hospitalist if systolic over 160");
    const sum = shiftSummary(extractFlowsheet(ASSESS).map((r) => ({ ...r, recordedAt: "2026-09-28T08:00:00Z" })), second.items);
    expect(sum.join(" ")).toContain("Latest vitals: BP 142/86 mmHg, HR 88 bpm, SpO2 93%, Temperature 98.6 °F.");
    expect(sum.join(" ")).toContain("Needs attention:");
    expect(sum.join(" ")).toContain("Pending care:");
  });
});

describe("nursing documentation flow", () => {
  it("drafts, reviews, files entries, updates the care list, and answers shift questions; nurses cannot sign physician notes", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    process.env.CHARTSIDE_DB = path.join(mkdtempSync(path.join(tmpdir(), "chartside-rn-")), "t.db");
    const { newMember } = await import("./org-helpers");
    const repo = await import("@/lib/server/repo");
    const ip = await import("@/lib/server/inpatient");
    const rn = await import("@/lib/server/nursing");
    const { can } = await import("@/lib/server/policy");
    const doc = await newMember("Dr. Avery Chen");
    const nurse = await newMember("Nina Nurse", { orgId: doc.orgId, role: "nurse" });
    const viewer = await newMember("Val Viewer", { orgId: doc.orgId, role: "viewer" });
    expect([can(nurse, "nursing.document"), can(nurse, "clinical.capture"), can(viewer, "nursing.document")]).toEqual([true, false, false]);
    const p = await repo.patients.create(doc, { mrn: "9", name: "Harold Jensen", dob: "1952-04-18", sex: "M", pronouns: "he/him", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    const { admission, encounterId } = await ip.admit(doc, { patientId: p.id, reason: "CHF exacerbation", unit: "4 West", room: "412" });
    expect((await repo.encounters.get(nurse, encounterId))?.id).toBe(encounterId);
    await expect(ip.startNote(nurse, admission.id, "progress")).rejects.toThrow();
    await expect(rn.draftAssessment(viewer, admission.id, ASSESS)).rejects.toThrow();
    const draft = await rn.draftAssessment(nurse, admission.id, ASSESS, "2026-09-28T08:00:00.000Z");
    expect(draft.rows.length).toBeGreaterThan(15);
    const keep = draft.rows.filter((r) => r.row !== "Pain location").map((r) => ({ key: r.key, value: r.row === "Heart rate" ? "90 bpm" : r.value }));
    await rn.fileAssessment(nurse, admission.id, draft.id, { rows: keep });
    await expect(rn.fileAssessment(nurse, admission.id, draft.id, {})).rejects.toThrow("already filed");
    let v = await rn.nursingView(nurse, admission.id);
    expect(v.flowsheet.find((e) => e.row === "Heart rate")!.value).toBe("90 bpm");
    expect(v.flowsheet.some((e) => e.row === "Pain location")).toBe(false);
    expect(v.care.map((c) => c.text)).toContain("Needs dressing change on the sacrum at 1400");
    const d2 = await rn.draftAssessment(nurse, admission.id, "Dressing on the sacrum changed. Blood pressure 150 over 90.", "2026-09-28T14:00:00.000Z");
    await rn.fileAssessment(nurse, admission.id, d2.id, {});
    v = await rn.nursingView(nurse, admission.id);
    expect(v.care.map((c) => c.text)).not.toContain("Needs dressing change on the sacrum at 1400");
    expect(await rn.askShift(nurse, admission.id, "What has his blood pressure been?")).toMatch(/Blood pressure: 142\/86 mmHg at .*, 150\/90 mmHg at /);
    expect(await rn.askShift(nurse, admission.id, "anything pending?")).toContain("Call the hospitalist if systolic over 160");
    const key = v.care[0].key;
    await rn.completeCare(nurse, admission.id, key);
    expect((await rn.nursingView(nurse, admission.id)).care.some((c) => c.key === key)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { summarizeIntake } from "@/lib/engine/intake";

describe("pre-visit intake", () => {
  it("scores screens and flags discrepancies, urgent symptoms, and social needs", () => {
    const s = summarizeIntake({ reason: "Tired and thirsty", symptoms: ["Fatigue", "Chest pain"], meds: [{ name: "metformin 500 mg twice daily", status: "stopped" }, { name: "lisinopril 10 mg daily", status: "taking" }], newMeds: "fish oil", phq: [2, 2], gad: [1, 0], tobacco: "current", auditc: [2, 1, 1], falls: "one", food: true, transport: true, allergiesConfirmed: false, newAllergies: "shellfish" }, { sex: "F", age: 70 });
    expect(s).toMatchObject({ phq2: 4, gad2: 1, auditc: 4, needs: ["food insecurity", "transportation barriers"], medChanges: ["metformin 500 mg twice daily: stopped taking"] });
    expect(s.flags.map((f) => f.level)).toEqual(["urgent", "warn", "warn", "info", "warn", "warn", "info", "warn", "warn"]);
    expect(s.flags[0].text).toBe("Reports chest pain");
    const quiet = summarizeIntake({ reason: "Checkup", phq: [0, 1], gad: [0, 0], auditc: [1, 0, 0], tobacco: "never" }, { sex: "M" });
    expect(quiet.flags).toEqual([]);
  });
});

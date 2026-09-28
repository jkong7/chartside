import { describe, expect, it } from "vitest";
import { parseSchedule } from "@/lib/engine/schedule";

describe("schedule import", () => {
  it("reads a CSV export with headers", () => {
    const rows = parseSchedule(`Appt Time,Patient Name,DOB,MRN,Sex,Visit Type,Reason\n8:30 AM,"Gonzalez, Maria",03/14/1968,100482,F,Follow Up,Diabetes and BP\n1:15 PM,Samir Patel,1979-11-02,200999,M,New Patient,Establish care`);
    expect(rows).toEqual([
      expect.objectContaining({ time: "08:30", name: "Maria Gonzalez", dob: "1968-03-14", mrn: "100482", sex: "F", visitType: "follow-up", reason: "Diabetes and BP" }),
      expect.objectContaining({ time: "13:15", name: "Samir Patel", dob: "1979-11-02", mrn: "200999", sex: "M", visitType: "new", reason: "Establish care" }),
    ]);
  });

  it("reads a schedule pasted from an EHR screen", () => {
    const rows = parseSchedule(`8:30 AM   Maria Gonzalez   03/14/1968   MRN 100482   Follow-up: diabetes and blood pressure\n9:15a  Lee, Dana  2/3/1990  Telehealth - back pain\n10:00  Oscar Diaz  Annual physical\n\nlunch`);
    expect(rows.map((r) => [r.time, r.name, r.dob, r.mrn, r.visitType])).toEqual([
      ["08:30", "Maria Gonzalez", "1968-03-14", "100482", "follow-up"],
      ["09:15", "Dana Lee", "1990-02-03", null, "telehealth"],
      ["10:00", "Oscar Diaz", null, null, "annual"],
    ]);
    expect(rows[0].reason).toBe("diabetes and blood pressure");
  });
});

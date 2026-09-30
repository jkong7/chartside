import { describe, expect, it } from "vitest";
import { extractFacts } from "@/lib/engine/extract";
import { noteToText } from "@/lib/engine/note";
import { systemTemplate } from "@/lib/engine/templates";
import { animalMarker, buildVetNote, lamenessGrade, normalizeVetTerms, ownerInstructions, ownerText, pickVetTemplate, plainLanguage, profileFrom, speciesOf, splitAnimals, vetTerms } from "@/lib/engine/vet";
import type { Utterance } from "@/lib/types";

const utts = (lines: string[]): Utterance[] => lines.map((t, i) => ({ id: `u${i}`, seq: i, speaker: "clinician", text: t, tStart: i * 5, tEnd: i * 5 + 4, source: "typed" }));

const FARM = [
  "Farm call at Miller's barn, owner is Jane Miller, owner's number is 312-555-0142.",
  "First horse is Biscuit, a 12 year old Quarter Horse gelding.",
  "Owner reports he has been off on the left front since Tuesday.",
  "Grade 2 of 5 lameness left fore, positive hoof testers at the toe.",
  "Likely a sole abscess.",
  "Gave 2 grams bute PO and pared out the abscess.",
  "Stall rest for 3 days and soak the foot twice a day.",
  "Next horse, Duchess, a 7 year old Thoroughbred mare.",
  "Temperature 100.1, heart rate 36, gut sounds normal all four quadrants.",
  "Vaccinated for rabies and West Nile, dewormed with ivermectin.",
  "Moving on to cow 214, a Holstein heifer.",
  "Palpated 90 days pregnant.",
  "Recheck at 150 days.",
];

describe("veterinary vocabulary", () => {
  it("knows vet drugs and fixes common mishearings", () => {
    expect(normalizeVetTerms("gave 10 cc of banana mean and some zylazine, then butte")).toBe("gave 10 cc of Banamine and some xylazine, then bute");
    expect(vetTerms("Sedated with xylazine and gave Banamine and bute")).toEqual(expect.arrayContaining(["xylazine", "banamine", "bute"]));
  });

  it("maps animal words to species and sex", () => {
    expect(speciesOf("a 12 year old gelding")).toEqual({ species: "Equine", sex: "M", word: "gelding" });
    expect(speciesOf("the heifer")).toMatchObject({ species: "Bovine", sex: "F" });
    expect(speciesOf("a ewe")).toMatchObject({ species: "Ovine", sex: "F" });
    expect(speciesOf("golden retriever dog")?.species).toBe("Canine");
    expect(speciesOf("the patient")).toBeNull();
  });

  it("reads the AAEP lameness grade and limb", () => {
    expect(lamenessGrade("Grade 2 of 5 lameness left fore")).toEqual({ grade: 2, limb: "left fore" });
    expect(lamenessGrade("3 out of 5 RH")).toEqual({ grade: 3, limb: "right hind" });
    expect(lamenessGrade("grade 7")).toBeNull();
  });

  it("keeps animal terms out of the human engine's diagnoses by writing vet notes with the vet builder", () => {
    const u = utts(FARM);
    const human = extractFacts(u, undefined, {});
    const seg = splitAnimals(u).animals[0];
    const note = buildVetNote(systemTemplate("vet_lameness")!, seg);
    const text = noteToText(note);
    expect(text).toContain("AAEP lameness grade 2/5, left fore.");
    expect(text).not.toMatch(/\b[A-Z]\d{2}\.\d/);
    expect(human).toBeTruthy();
  });

  it("puts owner instructions in plain words", () => {
    expect(plainLanguage("Give 1 gram bute PO BID")).toBe("Give 1 gram bute by mouth twice a day");
    expect(plainLanguage("tell the owner to cold hose the LF")).toBe("Cold hose the left front leg");
  });
});

describe("one farm call, many animals", () => {
  it("detects the next animal from spoken markers", () => {
    expect(animalMarker("Next horse, Duchess, a 7 year old mare.")).toEqual({ name: "Duchess", kind: "horse" });
    expect(animalMarker("Moving on to cow 214, a Holstein heifer.")).toEqual({ name: "Cow 214", kind: "cow" });
    expect(animalMarker("First horse is Biscuit.")).toEqual({ name: "Biscuit", kind: "horse" });
    expect(animalMarker("The next thing is the feed.")).toBeNull();
    expect(animalMarker("Heart rate 36.")).toBeNull();
  });

  it("splits one recording into one record per animal with shared farm context", () => {
    const split = splitAnimals(utts(FARM));
    expect(split.animals.map((a) => a.name)).toEqual(["Biscuit", "Duchess", "Cow 214"]);
    const [biscuit, duchess, cow] = split.animals;
    expect(biscuit.profile).toMatchObject({ species: "Equine", breed: "Quarter Horse", sex: "Male", ageYears: 12, owner: "Jane Miller", ownerPhone: "3125550142" });
    expect(biscuit.profile.herd).toMatch(/Miller's/);
    expect(duchess.profile).toMatchObject({ species: "Equine", breed: "Thoroughbred", sex: "Female", ageYears: 7 });
    expect(cow.profile).toMatchObject({ species: "Bovine", breed: "Holstein", tag: null });
    expect(duchess.utterances.map((u) => u.text).join(" ")).not.toContain("abscess");
    expect(cow.utterances.map((u) => u.text).join(" ")).toContain("90 days pregnant");
  });

  it("picks a template per animal from what was said", () => {
    const [biscuit, duchess, cow] = splitAnimals(utts(FARM)).animals;
    expect(pickVetTemplate(biscuit.utterances.map((u) => u.text).join(" "), "vet_equine")).toBe("vet_lameness");
    expect(pickVetTemplate(duchess.utterances.slice(1).map((u) => u.text).join(" "), "vet_equine")).toBe("vet_equine");
    expect(pickVetTemplate(cow.utterances.slice(1).map((u) => u.text).join(" "), "vet_equine")).toBe("vet_repro");
    expect(pickVetTemplate("vomiting dog, 3 days", "vet_equine")).toBe("vet_small_soap");
  });

  it("keeps a single-animal visit as one record", () => {
    const split = splitAnimals(utts(["Biscuit, a 12 year old gelding, is off on the left front.", "Grade 2 of 5 lameness.", "Gave bute."]));
    expect(split.animals).toHaveLength(1);
    expect(split.animals[0].name).toBe("Biscuit");
  });

  it("writes an owner text with instructions and a small Chartside line", () => {
    const seg = splitAnimals(utts(FARM)).animals[0];
    const note = buildVetNote(systemTemplate("vet_lameness")!, seg);
    const lines = ownerInstructions(note);
    expect(lines.join(" ")).toMatch(/Stall rest for 3 days/);
    const body = ownerText({ animal: "Biscuit", vet: "Dr. Lee", lines })!;
    expect(body).toMatch(/^Care instructions for Biscuit from Dr\. Lee:/);
    expect(body).toContain("Prepared with Chartside. Reply STOP to opt out.");
    expect(ownerText({ animal: "Biscuit", vet: "Dr. Lee", lines: [] })).toBeNull();
    expect(profileFrom("text the owner at (312) 555-0199").ownerPhone).toBe("3125550199");
  });
});

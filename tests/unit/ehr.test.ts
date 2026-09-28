import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pkcePair, seal, unseal } from "@/lib/fhir/crypto";
import { buildDocumentReference, mapAllergies, mapLabs, mapMedications, mapPatient, mapProblems, mapVitals, type FhirBundle } from "@/lib/fhir/mapping";
import { authorizeUrl } from "@/lib/fhir/smart";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-ehr-"));
const PORT = 3396;
const BASE = `http://localhost:${PORT}/fhir`;
let mock: ChildProcess;

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.SMART_CLIENT_ID = "chartside-test";
  process.env.SMART_ISS = BASE;
  mock = spawn(process.execPath, ["tests/e2e/mock-fhir.mjs"], { env: { ...process.env, MOCK_FHIR_PORT: String(PORT), MOCK_FHIR_TTL: "1" }, stdio: "pipe" });
  await new Promise<void>((r) => mock.stdout!.on("data", (d) => String(d).includes("mock fhir") && r()));
});

afterAll(() => {
  mock.kill();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.SMART_CLIENT_ID;
  delete process.env.SMART_ISS;
});

const b = (resources: object[]): FhirBundle => ({ resourceType: "Bundle", entry: resources.map((r) => ({ resource: r as never })) });

describe("FHIR mapping", () => {
  it("maps demographics, preferred language, and MRN", () => {
    const p = mapPatient({ resourceType: "Patient", id: "x", name: [{ use: "official", given: ["Ana", "L"], family: "Ruiz" }], gender: "female", birthDate: "1970-01-02", identifier: [{ value: "zzz" }, { type: { coding: [{ code: "MR" }] }, value: "12345" }], communication: [{ language: { coding: [{ code: "es-MX" }] }, preferred: true }] });
    expect(p).toEqual({ name: "Ana L Ruiz", dob: "1970-01-02", sex: "F", mrn: "12345", language: "es" });
  });

  it("keeps active problems with ICD-10 and active medications with sig", () => {
    const probs = mapProblems(b([
      { resourceType: "Condition", code: { text: "Asthma", coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code: "J45.909" }] }, clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] }, onsetDateTime: "2010-05-01" },
      { resourceType: "Condition", code: { text: "Old fracture" }, clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "resolved" }] } },
    ]));
    expect(probs).toEqual([{ name: "Asthma", icd10: "J45.909", since: "2010", status: "active" }]);
    expect(mapMedications(b([{ resourceType: "MedicationRequest", status: "active", medicationReference: { display: "albuterol HFA" }, dosageInstruction: [{ text: "2 puffs q4h prn" }] }, { resourceType: "MedicationRequest", status: "completed", medicationCodeableConcept: { text: "amoxicillin" } }]))).toEqual([{ name: "albuterol HFA", frequency: "2 puffs q4h prn" }]);
  });

  it("keeps the latest lab per test with flags, and converts vitals", () => {
    const labs = mapLabs(b([
      { resourceType: "Observation", code: { coding: [{ system: "http://loinc.org", code: "4548-4" }] }, effectiveDateTime: "2026-01-01", valueQuantity: { value: 7.1, unit: "%" } },
      { resourceType: "Observation", code: { coding: [{ system: "http://loinc.org", code: "4548-4" }] }, effectiveDateTime: "2026-08-01", valueQuantity: { value: 8.2, unit: "%" }, interpretation: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: "H" }] }] },
    ]));
    expect(labs).toEqual([{ name: "Hemoglobin A1c", value: "8.2 %", date: "2026-08-01", flag: "high" }]);
    const v = mapVitals(b([
      { resourceType: "Observation", code: { coding: [{ system: "http://loinc.org", code: "85354-9" }] }, effectiveDateTime: "2026-09-01", component: [{ code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] }, valueQuantity: { value: 131 } }, { code: { coding: [{ system: "http://loinc.org", code: "8462-4" }] }, valueQuantity: { value: 84 } }] },
      { resourceType: "Observation", code: { coding: [{ system: "http://loinc.org", code: "29463-7" }] }, effectiveDateTime: "2026-09-01", valueQuantity: { value: 70, unit: "kg" } },
    ]));
    expect(v).toEqual({ BP: "131/84", Weight: "154 lb" });
    expect(mapAllergies(b([{ resourceType: "AllergyIntolerance", code: { text: "Sulfa Drugs" }, reaction: [{ manifestation: [{ text: "Rash" }] }] }]))).toEqual([{ substance: "sulfa drugs", reaction: "rash" }]);
  });

  it("builds an Epic-compatible clinical note DocumentReference", () => {
    const d = buildDocumentReference({ patientId: "p1", encounterId: "e1", text: "SUBJECTIVE\nHello", title: "Progress note", date: "2026-09-27T10:00:00Z", authorRef: "Practitioner/9" });
    expect(d).toMatchObject({ resourceType: "DocumentReference", status: "current", docStatus: "final", subject: { reference: "Patient/p1" }, context: { encounter: [{ reference: "Encounter/e1" }] }, author: [{ reference: "Practitioner/9" }] });
    expect(d.type.coding[0]).toEqual({ system: "http://loinc.org", code: "11506-3", display: "Progress note" });
    expect(Buffer.from(d.content[0].attachment.data, "base64").toString()).toBe("SUBJECTIVE\nHello");
  });
});

describe("SMART security primitives", () => {
  it("seals tokens with authenticated encryption", () => {
    const s = seal("secret-token");
    expect(s).not.toContain("secret-token");
    expect(unseal(s)).toBe("secret-token");
    const parts = s.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => unseal(parts.join("."))).toThrow();
  });

  it("reads fhirUser from the ID token when the token response omits it", async () => {
    const { fhirUserOf } = await import("@/lib/fhir/smart");
    const idt = ["e30", Buffer.from(JSON.stringify({ fhirUser: "https://ehr/fhir/Practitioner/42" })).toString("base64url"), "sig"].join(".");
    expect(fhirUserOf({ access_token: "a", token_type: "Bearer", id_token: idt })).toBe("https://ehr/fhir/Practitioner/42");
    expect(fhirUserOf({ access_token: "a", token_type: "Bearer", fhirUser: "Practitioner/1" })).toBe("Practitioner/1");
  });

  it("strips SNOMED semantic tags and rounds lab values", () => {
    expect(mapProblems(b([{ resourceType: "Condition", code: { text: "Diabetic renal disease (disorder)" } }]))[0].name).toBe("Diabetic renal disease");
    expect(mapLabs(b([{ resourceType: "Observation", code: { text: "Glucose" }, effectiveDateTime: "2026-01-01", valueQuantity: { value: 108.66444632698297, unit: "mg/dL" } }]))[0].value).toBe("109 mg/dL");
  });

  it("builds a PKCE S256 authorize URL with aud and launch", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    const u = new URL(authorizeUrl({ authorization_endpoint: "https://ehr/auth", token_endpoint: "https://ehr/token" }, { clientId: "c", redirectUri: "http://app/cb", scope: "launch openid", state: "s", aud: "https://ehr/fhir", challenge, launch: "L1" }));
    expect(Object.fromEntries(u.searchParams)).toEqual({ response_type: "code", client_id: "c", redirect_uri: "http://app/cb", scope: "launch openid", state: "s", aud: "https://ehr/fhir", code_challenge: challenge, code_challenge_method: "S256", launch: "L1" });
  });
});

describe("EHR launch, import, and write-back against a SMART server", () => {
  it("runs the full EHR launch, imports the chart, refreshes tokens, and files the signed note", async () => {
    const repo = await import("@/lib/server/repo");
    const ehr = await import("@/lib/server/ehr");
    const pipeline = await import("@/lib/server/pipeline");
    const user = await newMember("Dr. Avery Chen");

    await expect(ehr.startLaunch(user, { iss: "https://evil.example/fhir", launch: "x", redirectUri: "http://localhost/smart/callback" })).rejects.toThrow("not on the allowed list");
    const authUrl = await ehr.startLaunch(user, { iss: BASE, launch: "epic-launch-123", redirectUri: "http://localhost:3100/smart/callback" });
    const res = await fetch(authUrl, { redirect: "manual" });
    expect(res.status).toBe(302);
    const back = new URL(res.headers.get("location")!);
    const out = await ehr.completeLaunch(user, back.searchParams.get("state")!, back.searchParams.get("code")!);
    await expect(ehr.completeLaunch(user, back.searchParams.get("state")!, back.searchParams.get("code")!)).rejects.toThrow("expired");

    const enc = (await repo.encounters.get(user, out.encounterId!))!;
    expect(enc.reason).toBe("Diabetes follow-up");
    expect(enc.externalId).toBe("enc-5501");
    const p = (await repo.patients.get(user, enc.patientId!))!;
    expect(p).toMatchObject({ name: "Elena Vasquez", mrn: "203713", sex: "F", language: "es", externalId: "eX7tQ2pVh9Lw" });
    expect(p.chart.problems.map((x) => x.icd10)).toEqual(["E11.9", "I10"]);
    expect(p.chart.medications.map((m) => m.name)).toEqual(["metformin 1,000 mg tablet", "lisinopril 20 mg tablet"]);
    expect(p.chart.allergies).toEqual([{ substance: "penicillin", reaction: "hives" }]);
    expect(p.chart.labs?.find((l) => l.name === "Hemoglobin A1c")?.value).toBe("8.1 %");
    expect(p.chart.vitals).toMatchObject({ BP: "148/92", Weight: "180 lb", BMI: "30.4" });
    expect(p.chart.egfr).toBe(61);

    await pipeline.recordConsent(user, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.encounters.update(user, enc.id, { status: "recording" });
    await repo.utterances.append(enc.id, [
      { speaker: "clinician", text: "Your A1c is 8.1, so your diabetes is not at goal.", tStart: 0, tEnd: 3 },
      { speaker: "clinician", text: "Let's increase metformin to 1000 milligrams twice a day. Follow up in 3 months.", tStart: 3, tEnd: 7 },
    ]);
    await pipeline.processEncounter(user, enc.id, { engine: "local" });
    expect((await pipeline.signEncounter(user, enc.id, { force: true })).signed).toBe(true);

    const filing = await ehr.fileNote(user, enc.id);
    expect(filing).toMatchObject({ status: "filed", reference: "DocumentReference/doc-1" });
    const stats = (await (await fetch(`http://localhost:${PORT}/stats`)).json()) as { refresh: number; docs: { text: string; author: string; type: string }[] };
    expect(stats.refresh).toBeGreaterThan(0);
    expect(stats.docs[0].type).toBe("11506-3");
    expect(stats.docs[0].author).toBe("Practitioner/prac-77");
    expect(stats.docs[0].text).toContain("Type 2 diabetes");
    expect(stats.docs[0].text).toContain("Verbal consent for AI-assisted documentation");
    expect(stats.docs[0].text).toContain("Signed electronically by Dr. Avery Chen");
    expect((await repo.audit.forEncounter(enc.id)).map((a) => a.action)).toEqual(expect.arrayContaining(["ehr.context", "ehr.filed"]));

    const signoff = await import("@/lib/server/signoff");
    const add = await signoff.addAddendum(user, enc.id, { kind: "addendum", text: "Repeat A1c resulted at 7.9%; plan unchanged." });
    expect(add.filing).toMatchObject({ status: "filed", reference: "DocumentReference/doc-2" });
    const after = (await (await fetch(`http://localhost:${PORT}/stats`)).json()) as { docs: { text: string; appends: string | null }[] };
    expect(after.docs[1]).toMatchObject({ appends: "DocumentReference/doc-1" });
    expect(after.docs[1].text).toContain("ADDENDUM · Dr. Avery Chen");

    const again = await ehr.resyncPatient(user, p.id);
    expect(again.id).toBe(p.id);
    expect((await repo.patients.list(user)).filter((x) => x.externalId === "eX7tQ2pVh9Lw")).toHaveLength(1);
  });
});

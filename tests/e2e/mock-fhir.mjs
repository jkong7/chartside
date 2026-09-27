import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_FHIR_PORT || 3297);
const BASE = `http://localhost:${PORT}/fhir`;
const CLIENT = "chartside-test";
const PATIENT = "eX7tQ2pVh9Lw";
const ENCOUNTER = "enc-5501";
const PRACTITIONER = "prac-77";

const codes = new Map();
const tokens = new Map();
const refresh = new Map();
const docs = [];
const stats = { authorize: 0, token: 0, refresh: 0, reads: 0, docs };

const patient = {
  resourceType: "Patient",
  id: PATIENT,
  identifier: [{ type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "MR" }], text: "EPI" }, value: "203713" }],
  name: [{ use: "official", given: ["Elena"], family: "Vasquez" }],
  gender: "female",
  birthDate: "1962-04-19",
  communication: [{ language: { coding: [{ system: "urn:ietf:bcp:47", code: "es" }], text: "Spanish" }, preferred: true }],
};
const bundle = (rs) => ({ resourceType: "Bundle", type: "searchset", total: rs.length, entry: rs.map((r) => ({ fullUrl: `${BASE}/${r.resourceType}/${r.id}`, resource: r })) });
const conditions = [
  { resourceType: "Condition", id: "c1", clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] }, category: [{ coding: [{ code: "problem-list-item" }] }], code: { text: "Type 2 diabetes mellitus", coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code: "E11.9", display: "Type 2 diabetes mellitus without complications" }, { system: "http://snomed.info/sct", code: "44054006" }] }, onsetDateTime: "2017-03-02" },
  { resourceType: "Condition", id: "c2", clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] }, code: { text: "Essential hypertension", coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code: "I10" }] }, onsetDateTime: "2014-06-11" },
  { resourceType: "Condition", id: "c3", clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "resolved" }] }, code: { text: "Acute bronchitis" } },
];
const meds = [
  { resourceType: "MedicationRequest", id: "m1", status: "active", medicationCodeableConcept: { text: "metformin 1,000 mg tablet" }, dosageInstruction: [{ text: "Take 1 tablet by mouth twice daily with meals" }] },
  { resourceType: "MedicationRequest", id: "m2", status: "active", medicationReference: { display: "lisinopril 20 mg tablet" }, dosageInstruction: [{ text: "Take 1 tablet by mouth daily" }] },
  { resourceType: "MedicationRequest", id: "m3", status: "stopped", medicationCodeableConcept: { text: "glipizide 5 mg tablet" } },
];
const allergies = [
  { resourceType: "AllergyIntolerance", id: "a1", clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active" }] }, code: { text: "Penicillin" }, reaction: [{ manifestation: [{ text: "Hives" }] }] },
];
const obs = (id, loinc, text, value, unit, date, interp) => ({ resourceType: "Observation", id, status: "final", code: { text, coding: [{ system: "http://loinc.org", code: loinc }] }, effectiveDateTime: date, valueQuantity: { value, unit }, ...(interp ? { interpretation: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: interp }] }] } : {}) });
const labs = [obs("l1", "4548-4", "Hemoglobin A1c", 8.1, "%", "2026-09-01", "H"), obs("l2", "4548-4", "Hemoglobin A1c", 7.6, "%", "2026-03-01", "H"), obs("l3", "13457-7", "LDL Cholesterol", 128, "mg/dL", "2026-09-01", "H"), obs("l4", "33914-3", "eGFR", 61, "mL/min/1.73m2", "2026-09-01", "L")];
const vitals = [
  { resourceType: "Observation", id: "v1", status: "final", code: { coding: [{ system: "http://loinc.org", code: "85354-9" }] }, effectiveDateTime: "2026-09-27T09:02:00Z", component: [{ code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] }, valueQuantity: { value: 148 } }, { code: { coding: [{ system: "http://loinc.org", code: "8462-4" }] }, valueQuantity: { value: 92 } }] },
  obs("v2", "29463-7", "Weight", 81.6, "kg", "2026-09-27T09:02:00Z"),
  obs("v3", "39156-5", "BMI", 30.4, "kg/m2", "2026-09-27T09:02:00Z"),
];
const encounter = { resourceType: "Encounter", id: ENCOUNTER, status: "in-progress", class: { code: "AMB" }, type: [{ text: "Office Visit" }], reasonCode: [{ text: "Diabetes follow-up" }], subject: { reference: `Patient/${PATIENT}` }, period: { start: new Date().toISOString() } };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function outcome(res, status, msg) {
  send(res, status, { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "invalid", diagnostics: msg }] });
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const p = url.pathname;
    if (p === "/stats") return send(res, 200, stats);
    if (p === "/fhir/.well-known/smart-configuration") {
      return send(res, 200, { issuer: BASE, authorization_endpoint: `http://localhost:${PORT}/oauth2/authorize`, token_endpoint: `http://localhost:${PORT}/oauth2/token`, code_challenge_methods_supported: ["S256"], capabilities: ["launch-ehr", "launch-standalone", "client-public", "context-ehr-patient", "context-ehr-encounter", "sso-openid-connect"] });
    }
    if (p === "/oauth2/authorize") {
      stats.authorize++;
      const q = url.searchParams;
      const bad = (m) => send(res, 400, { error: "invalid_request", error_description: m });
      if (q.get("response_type") !== "code") return bad("response_type");
      if (q.get("client_id") !== CLIENT) return bad("client_id");
      if (q.get("aud") !== BASE) return bad("aud must equal the FHIR base URL");
      if (q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) return bad("PKCE S256 required");
      const launch = q.get("launch");
      if (launch && launch !== "epic-launch-123") return bad("unknown launch");
      if (!launch && !/launch\/patient/.test(q.get("scope") ?? "")) return bad("standalone launch needs launch/patient");
      const code = randomBytes(12).toString("hex");
      codes.set(code, { challenge: q.get("code_challenge"), redirect: q.get("redirect_uri"), launch, scope: q.get("scope") });
      const back = new URL(q.get("redirect_uri"));
      back.searchParams.set("code", code);
      back.searchParams.set("state", q.get("state"));
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (p === "/oauth2/token" && req.method === "POST") {
      const f = new URLSearchParams(raw);
      if (f.get("grant_type") === "refresh_token") {
        const r = refresh.get(f.get("refresh_token"));
        if (!r) return send(res, 400, { error: "invalid_grant" });
        stats.refresh++;
        const access = randomBytes(16).toString("hex");
        tokens.set(access, r);
        return send(res, 200, { access_token: access, token_type: "Bearer", expires_in: 3600, scope: r.scope });
      }
      const c = codes.get(f.get("code"));
      codes.delete(f.get("code"));
      if (!c) return send(res, 400, { error: "invalid_grant" });
      if (f.get("client_id") !== CLIENT) return send(res, 401, { error: "invalid_client" });
      if (f.get("redirect_uri") !== c.redirect) return send(res, 400, { error: "invalid_grant", error_description: "redirect_uri mismatch" });
      const expect = createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url");
      if (expect !== c.challenge) return send(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
      stats.token++;
      const access = randomBytes(16).toString("hex");
      const ctx = { scope: c.scope, encounter: c.launch ? ENCOUNTER : undefined };
      tokens.set(access, ctx);
      const rt = randomBytes(16).toString("hex");
      refresh.set(rt, ctx);
      return send(res, 200, { access_token: access, token_type: "Bearer", expires_in: Number(process.env.MOCK_FHIR_TTL || 3600), scope: c.scope, patient: PATIENT, ...(c.launch ? { encounter: ENCOUNTER } : {}), refresh_token: rt, id_token: "mock.id.token", fhirUser: `${BASE}/Practitioner/${PRACTITIONER}`, need_patient_banner: false });
    }
    if (p.startsWith("/fhir/")) {
      const auth = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      if (!tokens.has(auth)) return outcome(res, 401, "invalid token");
      stats.reads++;
      const path = p.slice("/fhir/".length);
      const pid = url.searchParams.get("patient");
      if (req.method === "POST" && path === "DocumentReference") {
        let doc;
        try {
          doc = JSON.parse(raw);
        } catch {
          return outcome(res, 400, "invalid JSON");
        }
        if (!/application\/fhir\+json/.test(req.headers["content-type"] ?? "")) return outcome(res, 415, "content-type must be application/fhir+json");
        if (doc.resourceType !== "DocumentReference" || doc.status !== "current" || doc.docStatus !== "final") return outcome(res, 400, "status/docStatus");
        if (doc.subject?.reference !== `Patient/${PATIENT}`) return outcome(res, 400, "subject");
        if (doc.context?.encounter?.[0]?.reference !== `Encounter/${ENCOUNTER}`) return outcome(res, 400, "encounter context required");
        if (!doc.type?.coding?.some((c) => c.system === "http://loinc.org")) return outcome(res, 400, "LOINC note type required");
        const att = doc.content?.[0]?.attachment;
        if (att?.contentType !== "text/plain" || !att.data) return outcome(res, 400, "attachment");
        const id = `doc-${docs.length + 1}`;
        docs.push({ id, text: Buffer.from(att.data, "base64").toString("utf8"), author: doc.author?.[0]?.reference ?? null, type: doc.type.coding[0].code });
        res.writeHead(201, { location: `${BASE}/DocumentReference/${id}`, "content-type": "application/fhir+json" });
        return res.end("");
      }
      if (path === `Patient/${PATIENT}`) return send(res, 200, patient);
      if (path === `Encounter/${ENCOUNTER}`) return send(res, 200, encounter);
      if (pid && pid !== PATIENT) return send(res, 200, bundle([]));
      if (path === "Condition") return url.searchParams.get("category") === "problem-list-item" ? send(res, 200, bundle(conditions)) : outcome(res, 400, "category required");
      if (path === "MedicationRequest") return send(res, 200, bundle(meds));
      if (path === "AllergyIntolerance") return send(res, 200, bundle(allergies));
      if (path === "Observation") {
        const cat = url.searchParams.get("category");
        if (!cat) return outcome(res, 400, "category required");
        return send(res, 200, bundle(cat === "laboratory" ? labs : cat === "vital-signs" ? vitals : []));
      }
      return outcome(res, 404, "not found");
    }
    send(res, 404, { error: "not found" });
  });
});

server.listen(PORT, () => console.log(`mock fhir on ${PORT}`));

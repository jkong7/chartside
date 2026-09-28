import { EVENTS, SCOPES } from "./platform";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ "application/json": { schema } });
const ok = (schema: unknown, description = "OK") => ({ description, content: json({ type: "object", properties: { data: schema } }) });
const errors = { "401": { description: "Missing or invalid API key", content: json(ref("Error")) }, "403": { description: "Key lacks the required scope", content: json(ref("Error")) }, "422": { description: "Invalid request", content: json(ref("Error")) }, "429": { description: "Rate limited", content: json(ref("Error")) } };
const idParam = (name: string) => ({ name, in: "path", required: true, schema: { type: "string" } });

export function openapi() {
  return {
    openapi: "3.1.0",
    info: { title: "Chartside API", version: "1.0.0", description: `Create patients and encounters, send a transcript, generate a note with codes and orders, and read results as JSON or FHIR. Authenticate with an organization API key: Authorization: Bearer cs_live_…. Webhooks are signed with HMAC-SHA256 in the Chartside-Signature header as t=<unix seconds>,v1=<hex HMAC of "t.body">. Events: ${EVENTS.join(", ")}.` },
    servers: [{ url: "/api/v1" }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: `Organization API key. Scopes: ${SCOPES.join(", ")}` } },
      schemas: {
        Error: { type: "object", properties: { error: { type: "object", properties: { status: { type: "integer" }, message: { type: "string" } } } } },
        Patient: { type: "object", required: ["id", "mrn", "name", "dob", "sex"], properties: { id: { type: "string" }, mrn: { type: "string" }, name: { type: "string" }, dob: { type: "string", format: "date" }, sex: { type: "string", enum: ["F", "M", "X"] }, language: { type: "string" }, problems: { type: "array", items: { type: "object" } }, medications: { type: "array", items: { type: "object" } }, allergies: { type: "array", items: { type: "object" } } } },
        Utterance: { type: "object", required: ["speaker", "text"], properties: { speaker: { type: "string", enum: ["clinician", "patient", "other"] }, text: { type: "string" }, start: { type: "number" }, end: { type: "number" } } },
        Encounter: {
          type: "object",
          properties: {
            id: { type: "string" },
            patientId: { type: "string" },
            status: { type: "string", enum: ["scheduled", "recording", "paused", "processing", "review", "signed"] },
            visitType: { type: "string" },
            reason: { type: "string" },
            note: { type: ["object", "null"], properties: { text: { type: "string" }, sections: { type: "array", items: { type: "object", properties: { key: { type: "string" }, title: { type: "string" }, sentences: { type: "array", items: { type: "object", properties: { text: { type: "string" }, evidence: { type: "array", items: { type: "string" } }, support: { type: "string" } } } } } } } } },
            codes: { type: ["object", "null"], properties: { em: { type: "string" }, diagnoses: { type: "array", items: { type: "object", properties: { code: { type: "string" }, label: { type: "string" } } } } } },
            orders: { type: "array", items: { type: "object" } },
            claim: { type: ["object", "null"] },
          },
        },
      },
    },
    paths: {
      "/patients": {
        get: { summary: "List patients", parameters: [{ name: "mrn", in: "query", schema: { type: "string" } }], responses: { "200": ok({ type: "array", items: ref("Patient") }), ...errors }, "x-scope": "patients:read" },
        post: { summary: "Create a patient", requestBody: { required: true, content: json({ type: "object", required: ["mrn", "name", "dob", "sex"], properties: { mrn: { type: "string" }, name: { type: "string" }, dob: { type: "string", format: "date" }, sex: { type: "string", enum: ["F", "M", "X"] }, language: { type: "string" }, chart: { type: "object" } } }) }, responses: { "201": ok(ref("Patient"), "Created"), ...errors }, "x-scope": "patients:write" },
      },
      "/patients/{id}": { get: { summary: "Get a patient", parameters: [idParam("id")], responses: { "200": ok(ref("Patient")), ...errors }, "x-scope": "patients:read" } },
      "/encounters": {
        get: { summary: "List encounters", parameters: [{ name: "from", in: "query", schema: { type: "string", format: "date-time" } }, { name: "to", in: "query", schema: { type: "string", format: "date-time" } }, { name: "patientId", in: "query", schema: { type: "string" } }], responses: { "200": ok({ type: "array", items: ref("Encounter") }), ...errors }, "x-scope": "encounters:read" },
        post: { summary: "Create an encounter", requestBody: { required: true, content: json({ type: "object", required: ["patientId"], properties: { patientId: { type: "string" }, reason: { type: "string" }, visitType: { type: "string", enum: ["new", "follow-up", "acute", "annual", "telehealth"] }, templateId: { type: "string" }, scheduledAt: { type: "string", format: "date-time" } } }) }, responses: { "201": ok(ref("Encounter"), "Created"), ...errors }, "x-scope": "encounters:write" },
      },
      "/encounters/{id}": { get: { summary: "Get an encounter with its note, codes, orders, and claim", parameters: [idParam("id")], responses: { "200": ok(ref("Encounter")), ...errors }, "x-scope": "encounters:read" } },
      "/encounters/{id}/transcript": { post: { summary: "Append transcript lines (records consent on first call)", parameters: [idParam("id")], requestBody: { required: true, content: json({ type: "object", required: ["utterances"], properties: { consent: { type: "object", properties: { obtained: { type: "boolean" }, method: { type: "string", enum: ["verbal", "written", "patient-device"] }, state: { type: "string", pattern: "^[A-Z]{2}$" }, othersPresent: { type: "boolean" } } }, utterances: { type: "array", items: ref("Utterance") } } }) }, responses: { "201": ok({ type: "object", properties: { appended: { type: "integer" } } }, "Appended"), ...errors }, "x-scope": "encounters:write" } },
      "/encounters/{id}/generate": { post: { summary: "Generate the note, codes, orders, and draft claim", parameters: [idParam("id")], requestBody: { content: json({ type: "object", properties: { templateId: { type: "string" }, detail: { type: "string", enum: ["concise", "standard", "detailed"] } } }) }, responses: { "201": ok(ref("Encounter"), "Generated"), ...errors }, "x-scope": "notes:generate" } },
      "/encounters/{id}/fhir": { get: { summary: "FHIR R4 document Bundle (Composition, DocumentReference, Conditions, ServiceRequests, MedicationRequests)", parameters: [idParam("id")], responses: { "200": { description: "FHIR Bundle", content: { "application/fhir+json": { schema: { type: "object" } } } }, ...errors }, "x-scope": "encounters:read" } },
      "/claims/{encounterId}": { get: { summary: "Get the professional claim for an encounter", parameters: [idParam("encounterId")], responses: { "200": ok({ type: "object" }), ...errors }, "x-scope": "claims:read" } },
    },
  };
}

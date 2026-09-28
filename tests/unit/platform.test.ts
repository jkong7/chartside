import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-api-"));
const PORT = 3392;
const received: { body: string; sig: string }[] = [];
let failNext = 0;
let server: Server;

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  server = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      if (failNext > 0) {
        failNext--;
        return res.writeHead(500).end();
      }
      received.push({ body: b, sig: String(req.headers["chartside-signature"] ?? "") });
      res.writeHead(200).end("ok");
    });
  });
  await new Promise<void>((r) => server.listen(PORT, r));
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const call = async (mod: { GET?: unknown; POST?: unknown }, method: "GET" | "POST", token: string | null, url: string, params: Record<string, string> = {}, body?: unknown) => {
  const h = (mod as Record<string, (r: Request, c: { params: Promise<unknown> }) => Promise<Response>>)[method];
  const res = await h(new Request(`http://localhost${url}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), { params: Promise.resolve(params) });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
};

describe("public API and webhooks", () => {
  it("runs the documented flow with scoped keys, signs webhooks, retries failures, and enforces limits", async () => {
    const platform = await import("@/lib/server/platform");
    const owner = await newMember("Dr. Avery Chen");
    const clinician = await newMember("Dr. Ben Brooks", { orgId: owner.orgId, role: "clinician" });
    await expect(platform.apiKeys.create(clinician, { name: "x", scopes: ["patients:read"] })).rejects.toThrow("Only owners and admins");
    const { token } = await platform.apiKeys.create(owner, { name: "Telehealth", scopes: ["patients:read", "patients:write", "encounters:read", "encounters:write", "notes:generate"] });
    const { token: readOnly } = await platform.apiKeys.create(owner, { name: "Analytics", scopes: ["patients:read"] });
    expect(token).toMatch(/^cs_live_[a-f0-9]{8}_/);
    await expect(platform.webhooks.create(owner, { url: "http://example.com/hook", events: ["note.signed"] })).rejects.toThrow("HTTPS");
    const { secret } = await platform.webhooks.create(owner, { url: `http://localhost:${PORT}/hook`, events: ["note.generated", "note.signed", "task.created"] });

    const patientsRoute = await import("@/app/api/v1/patients/route");
    const encRoute = await import("@/app/api/v1/encounters/route");
    const txRoute = await import("@/app/api/v1/encounters/[id]/transcript/route");
    const genRoute = await import("@/app/api/v1/encounters/[id]/generate/route");
    const getRoute = await import("@/app/api/v1/encounters/[id]/route");
    const fhirRoute = await import("@/app/api/v1/encounters/[id]/fhir/route");

    expect((await call(patientsRoute, "GET", null, "/api/v1/patients")).status).toBe(401);
    expect((await call(patientsRoute, "GET", "cs_live_deadbeef_xxxxxxxxxxxxxxxxxxxxxxxxxxxx", "/api/v1/patients")).status).toBe(401);
    expect((await call(patientsRoute, "POST", readOnly, "/api/v1/patients", {}, { mrn: "1" })).status).toBe(403);
    expect((await call(patientsRoute, "POST", token, "/api/v1/patients", {}, { mrn: "1" })).status).toBe(422);
    const pat = await call(patientsRoute, "POST", token, "/api/v1/patients", {}, { mrn: "API-1", name: "Dana Lee", dob: "1980-05-01", sex: "F", chart: { medications: [{ name: "lisinopril", dose: "10 mg", frequency: "daily" }] } });
    expect(pat.status).toBe(201);
    const enc = await call(encRoute, "POST", token, "/api/v1/encounters", {}, { patientId: pat.json.data.id, reason: "Blood pressure follow-up" });
    const encId = enc.json.data.id;
    expect((await call(txRoute, "POST", token, "/x", { id: encId }, { utterances: [{ speaker: "clinician", text: "Hi" }] })).json.error.message).toContain("Record consent");
    const tx = await call(txRoute, "POST", token, "/x", { id: encId }, { consent: { obtained: true, method: "verbal", state: "IL" }, utterances: [
      { speaker: "clinician", text: "Your blood pressure today is 152 over 94, so your hypertension is not controlled." },
      { speaker: "clinician", text: "Let's increase lisinopril to 20 milligrams daily and check a basic metabolic panel. Follow up in 4 weeks." },
    ] });
    expect(tx.json.data.appended).toBe(2);
    const gen = await call(genRoute, "POST", token, "/x", { id: encId }, {});
    expect(gen.status).toBe(201);
    expect(gen.json.data.note.text).toContain("lisinopril");
    expect(gen.json.data.codes.diagnoses.map((d: { code: string }) => d.code)).toContain("I10");
    expect(gen.json.data.orders.map((o: { name: string }) => o.name)).toContain("Basic metabolic panel");
    const got = await call(getRoute, "GET", token, "/x", { id: encId });
    expect(got.json.data.status).toBe("review");
    const fhir = await call(fhirRoute, "GET", token, "/x", { id: encId });
    expect(fhir.json.resourceType).toBe("Bundle");

    await platform.flushWebhooks();
    const types = received.map((r) => JSON.parse(r.body).type);
    expect(types).toContain("note.generated");
    expect(types).toContain("task.created");
    for (const r of received) expect(platform.verifySignature(secret, r.body, r.sig)).toBe(true);
    expect(platform.verifySignature("whsec_wrong", received[0].body, received[0].sig)).toBe(false);

    const { run } = await import("@/lib/db");
    failNext = 1;
    const before = received.length;
    await platform.emit(owner.orgId, "note.signed", { encounterId: encId });
    await platform.flushWebhooks();
    let d = (await platform.webhooks.deliveries(owner)).find((x) => x.event === "note.signed")!;
    expect(d).toMatchObject({ status: "retrying", attempts: 1, responseCode: 500 });
    await run("UPDATE webhook_deliveries SET next_attempt_at = ? WHERE id = ?", new Date(0).toISOString(), d.id);
    await platform.flushWebhooks();
    d = (await platform.webhooks.deliveries(owner)).find((x) => x.event === "note.signed")!;
    expect(d).toMatchObject({ status: "delivered", attempts: 2 });
    expect(received.length).toBe(before + 1);

    platform.RATE.perMinute = 3;
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await call(patientsRoute, "GET", readOnly, "/api/v1/patients")).status);
    expect(statuses).toContain(429);
    platform.RATE.perMinute = 120;
    const keys = await platform.apiKeys.list(owner);
    await platform.apiKeys.revoke(owner, keys.find((k) => k.name === "Telehealth")!.id);
    expect((await call(getRoute, "GET", token, "/x", { id: encId })).status).toBe(401);
    expect(keys.find((k) => k.name === "Telehealth")!.lastUsedAt).not.toBeNull();
  });

  it("publishes an OpenAPI 3.1 document covering every endpoint", async () => {
    const { openapi } = await import("@/lib/server/openapi");
    const doc = openapi();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths)).toEqual(["/patients", "/patients/{id}", "/encounters", "/encounters/{id}", "/encounters/{id}/transcript", "/encounters/{id}/generate", "/encounters/{id}/fhir", "/claims/{encounterId}"]);
  });
});

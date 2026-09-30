import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { demo } from "./helpers";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-pv-"));

beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
  process.env.CHARTSIDE_PUBLIC_URL = "https://chartside.test";
});

afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

const phone = () => `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

async function recorded(state = "IL", consent: Record<string, unknown> = {}) {
  const pv = await import("@/lib/server/patientVisit");
  const { pipeline, repo } = { pipeline: await import("@/lib/server/pipeline"), repo: await import("@/lib/server/repo") };
  const { token } = await pv.createVisit({ patientName: "Maria", state });
  let v = (await pv.visitByToken(token))!;
  await pv.recordVisitConsent(v, { decision: "granted", clinicianName: "Dr. Avery Chen", ...consent });
  v = (await pv.visitByToken(token))!;
  const holder = (await repo.actorFor(v.holder_id))!;
  await repo.utterances.append(v.encounter_id!, demo("gonzalez").utterances.map(({ id: _i, seq: _s, ...u }) => ({ ...u, source: "final" as const })));
  await pipeline.processEncounter(holder, v.encounter_id!, { engine: "local" });
  const { run } = await import("@/lib/db");
  await run("UPDATE patient_visits SET status = 'processing' WHERE id = ?", v.id);
  return { pv, token, v: await pv.refreshVisit((await pv.visitByToken(token))!) };
}

describe("patient visit holder", () => {
  it("creates an isolated holder that can't be signed in to and is purged on a schedule", async () => {
    const pv = await import("@/lib/server/patientVisit");
    const { get } = await import("@/lib/db");
    const { token } = await pv.createVisit({ patientName: "  Maria <b>  ", state: "tx" });
    const v = (await pv.visitByToken(token))!;
    expect(v.status).toBe("consent");
    expect(v.patient_name).toBe("Maria b");
    const u = await get<{ email: string; password_hash: string; guest_expires_at: string }>("SELECT email, password_hash, guest_expires_at FROM users WHERE id = ?", v.holder_id);
    expect(u!.email.endsWith(`@${pv.HOLDER_EMAIL_DOMAIN}`)).toBe(true);
    expect(u!.password_hash).toBe("");
    expect(await pv.visitByToken("nope")).toBeNull();
    const { purgeGuests } = await import("@/lib/server/guest");
    await purgeGuests(new Date(Date.now() + (pv.visitDays() + 1) * 86400000).toISOString());
    expect(await get("SELECT id FROM patient_visits WHERE id = ?", v.id)).toBeUndefined();
    await expect(pv.createVisit({ state: "ZZ" })).rejects.toThrow(/state/);
  });

  it("records the clinician's tap in the consent ledger with the new method", async () => {
    const pv = await import("@/lib/server/patientVisit");
    const { consents } = await import("@/lib/server/repo");
    const { token } = await pv.createVisit({ state: "IL" });
    await pv.recordVisitConsent((await pv.visitByToken(token))!, { decision: "granted", clinicianName: "Dr. Lee" });
    const v = (await pv.visitByToken(token))!;
    expect(v.status).toBe("recording");
    const c = (await consents.latest(v.encounter_id!))!;
    expect(c.method).toBe("clinician_tap_patient_device");
    expect(c.statement).toMatch(/Dr\. Lee.*patient's own phone/);
    await expect(pv.recordVisitConsent(v, { decision: "granted" })).rejects.toThrow(/already/);
  });

  it("needs everyone in the room to agree in an all-party state", async () => {
    const pv = await import("@/lib/server/patientVisit");
    const { token } = await pv.createVisit({ state: "CA" });
    const v = (await pv.visitByToken(token))!;
    await expect(pv.recordVisitConsent(v, { decision: "granted", othersPresent: true })).rejects.toThrow(/California needs everyone/);
    expect((await pv.visitByToken(token))!.status).toBe("consent");
    await pv.recordVisitConsent(v, { decision: "granted", othersPresent: true, allPartiesConfirmed: true });
    const { consents } = await import("@/lib/server/repo");
    const c = (await consents.latest((await pv.visitByToken(token))!.encounter_id!))!;
    expect(c.allParty).toBe(true);
    expect(c.statement).toMatch(/everyone else in the room agreed/);
  });

  it("keeps no audio when the clinician says not today", async () => {
    const pv = await import("@/lib/server/patientVisit");
    const { token } = await pv.createVisit({ state: "IL" });
    await pv.recordVisitConsent((await pv.visitByToken(token))!, { decision: "declined", clinicianContact: "+15551234567" });
    const v = (await pv.visitByToken(token))!;
    expect(v.status).toBe("declined");
    expect(v.clinician_phone).toBeNull();
    await expect(pv.appendVisitAudio(v, { audio: Buffer.alloc(100, 1), mime: "audio/webm", opts: {} })).rejects.toThrow(/declined/);
    expect((await pv.saveNotes(v, "ask about knee")).notes).toBe("ask about knee");
  });

  it("rejects a bad clinician contact", async () => {
    const pv = await import("@/lib/server/patientVisit");
    expect(pv.parseContact("(312) 555-0142")).toEqual({ phone: "+13125550142", email: null });
    expect(pv.parseContact("Dr@Clinic.org")).toEqual({ phone: null, email: "dr@clinic.org" });
    expect(() => pv.parseContact("12")).toThrow(/mobile number/);
    expect(() => pv.parseContact("a@b")).toThrow(/email/);
  });
});

describe("recap, family link and delete", () => {
  it("builds the recap once the draft is ready", async () => {
    const { v, pv } = await recorded();
    expect(v.status).toBe("ready");
    const view = await pv.visitView(v);
    expect(view.recap!.meds.some((m) => m.name === "empagliflozin")).toBe(true);
    expect(view.transcript.length).toBeGreaterThan(10);
    expect((await pv.visitPdf(v)).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("shares a read-only family link that can be revoked", async () => {
    const { v, pv } = await recorded();
    const { url, expiresAt } = await pv.shareWithFamily(v);
    expect(Date.parse(expiresAt)).toBeLessThanOrEqual(Date.parse(v.expires_at));
    const tok = url.split("/visit/f/")[1];
    const fam = (await pv.familyView(tok))!;
    expect(fam.recap!.headline).toMatch(/Dr\. Avery Chen/);
    expect(fam).not.toHaveProperty("transcript");
    await pv.stopFamilyShare(v);
    expect(await pv.familyView(tok)).toBeNull();
  });

  it("deletes audio, transcript and recap, and the offer dies with it", async () => {
    const { v, pv, token } = await recorded("IL", { clinicianContact: phone() });
    const { get } = await import("@/lib/db");
    const res = await pv.deleteVisit((await pv.visitByToken(token))!);
    expect(res.deleted).toBe(true);
    expect(await pv.visitByToken(token)).toBeNull();
    expect(await get("SELECT id FROM encounters WHERE id = ?", v.encounter_id)).toBeUndefined();
    expect(await get("SELECT id FROM utterances WHERE encounter_id = ?", v.encounter_id)).toBeUndefined();
    expect(await get("SELECT id FROM users WHERE id = ?", v.holder_id)).toBeUndefined();
  });

  it("saves the recap longer and texts a link with no health details", async () => {
    const { v, pv, token } = await recorded();
    const to = phone();
    const r = await pv.saveVisit(v, to, token);
    expect(Date.parse(r.expiresAt)).toBeGreaterThan(Date.parse(v.expires_at));
    const { simMessages, looksLikePhi } = await import("@/lib/server/telephony/sms");
    const body = simMessages(to).at(-1)!.body;
    expect(body).toContain(`/visit/r/${token}`);
    expect(looksLikePhi(body)).toBe(false);
    expect(body).not.toMatch(/diabetes|lisinopril|Maria|Chen/i);
  });
});

describe("clinician offer and claim", () => {
  it("texts the clinician once, with no PHI, when the recap is ready", async () => {
    const to = phone();
    const { v, pv } = await recorded("IL", { clinicianContact: to });
    const { simMessages } = await import("@/lib/server/telephony/sms");
    const msgs = simMessages(to);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toMatch(/^A patient recorded your \d{1,2}:\d{2} [AP]M visit with Chartside and offered you a draft note\. Review it free: https:\/\/chartside\.test\/visit\/c\//);
    expect(msgs[0].body).not.toMatch(/Maria|diabetes|Chen/i);
    expect(v.offer_status).toBe("sent");
    expect(v.clinician_phone).toBeNull();
    await pv.refreshVisit({ ...v, status: "processing" });
    expect(simMessages(to)).toHaveLength(1);
  });

  it("makes the clinician verify, copies the draft into their stack, and the offer is single use", async () => {
    const to = phone();
    const { v, pv } = await recorded("IL", { clinicianContact: to });
    const { simMessages } = await import("@/lib/server/telephony/sms");
    const tok = simMessages(to)[0].body.split("/visit/c/")[1];
    const info = await pv.offerInfo(tok);
    expect(info).toMatchObject({ state: "open", clinicianName: "Dr. Avery Chen", npiAllowed: true });
    expect(JSON.stringify(info)).not.toMatch(/Maria|diabetes/i);
    const { createGuest } = await import("@/lib/server/guest");
    await expect(pv.claimOffer(await createGuest(), tok)).rejects.toThrow(/Confirm who you are/);
    const doc = await newMember("Dr. Avery Chen");
    const r = await pv.claimOffer(doc, tok);
    const { listDecisions } = await import("@/lib/server/decisions");
    const card = (await listDecisions(doc)).find((d) => d.encounterId === r.encounterId && d.kind === "note.sign")!;
    expect(card.title).toMatch(/from a patient's recording/);
    expect((card.detail.fromPatient as { label: string }).label).toBe("From a patient's recording");
    expect((card.detail.fromPatient as { transcript: unknown[] }).transcript.length).toBeGreaterThan(10);
    const { consents, utterances } = await import("@/lib/server/repo");
    expect((await consents.latest(r.encounterId))!.method).toBe("clinician_tap_patient_device");
    expect((await utterances.list(r.encounterId)).length).toBe((await utterances.list(v.encounter_id!)).length);
    expect((await pv.offerInfo(tok)).state).toBe("missing");
    await expect(pv.claimOffer(await newMember("Dr. Other"), tok)).rejects.toThrow(/offer has ended/);
    const { get } = await import("@/lib/db");
    expect(await get("SELECT id FROM encounters WHERE id = ?", v.encounter_id)).toBeTruthy();
  });

  it("expires offers after the window", async () => {
    const { v, pv } = await recorded();
    const { url } = await pv.offerLink(v);
    const tok = url.split("/visit/c/")[1];
    const { run } = await import("@/lib/db");
    await run("UPDATE patient_visits SET offer_expires_at = ? WHERE id = ?", new Date(Date.now() - 1000).toISOString(), v.id);
    expect((await pv.offerInfo(tok)).state).toBe("expired");
    await expect(pv.claimOffer(await newMember("Dr. Late"), tok)).rejects.toThrow(/ended/);
  });

  it("lets the patient withdraw an offer", async () => {
    const { v, pv } = await recorded();
    const tok = (await pv.offerLink(v)).url.split("/visit/c/")[1];
    await pv.withdrawOffer(v);
    expect((await pv.offerInfo(tok)).state).toBe("missing");
  });

  it("verifies by NPI only when the registry name matches the name the patient gave", async () => {
    vi.stubGlobal("fetch", async (u: string) => {
      const n = new URL(u).searchParams.get("number");
      const people: Record<string, { first: string; last: string; state: string }> = { "1234567893": { first: "AVERY", last: "CHEN", state: "IL" }, "1245319599": { first: "DANA", last: "RUIZ", state: "CA" } };
      const p = people[n ?? ""];
      return new Response(JSON.stringify(p ? { result_count: 1, results: [{ number: n, enumeration_type: "NPI-1", basic: { first_name: p.first, last_name: p.last, credential: "MD" }, taxonomies: [{ desc: "Family Medicine", primary: true, state: p.state }], addresses: [{ address_purpose: "LOCATION", state: p.state }] }] } : { result_count: 0, results: [] }), { status: 200 });
    });
    const { v, pv } = await recorded();
    const tok = (await pv.offerLink(v)).url.split("/visit/c/")[1];
    await expect(pv.claimWithNpi(tok, { npi: "1245319599", state: "CA" })).rejects.toThrow(/doesn't match the name/);
    await expect(pv.claimWithNpi(tok, { npi: "1234567893", state: "TX" })).rejects.toThrow(/state doesn't match/);
    const r = await pv.claimWithNpi(tok, { npi: "1234567893", state: "IL" });
    expect(r.user.guestUntil).toBeTruthy();
    expect(r.user.name).toBe("Avery Chen");
    const { get } = await import("@/lib/db");
    expect((await get<{ acq_loop: string }>("SELECT acq_loop FROM users WHERE id = ?", r.user.id))!.acq_loop).toBe("patient_visit");
    vi.unstubAllGlobals();
  });

  it("needs a clinician name for the NPI path", async () => {
    const pv = await import("@/lib/server/patientVisit");
    expect(pv.nameMatches("Dr. Avery Chen, MD", "Chen")).toBe(true);
    expect(pv.nameMatches("Dr. Cheng", "Chen")).toBe(false);
    expect(pv.nameMatches(null, "Chen")).toBe(false);
  });
});

describe("abuse limits", () => {
  it("caps visits per IP per day, with a much higher cap for everyone", async () => {
    const pv = await import("@/lib/server/patientVisit");
    process.env.CHARTSIDE_VISIT_IP_DAILY_CAP = "2";
    try {
      const a = pv.ipKey("203.0.113.9");
      expect(a).toMatch(/^[0-9a-f]{32}$/);
      expect(pv.ipKey("local")).toBeNull();
      await pv.createVisit({ state: "IL", ipKey: a });
      await pv.createVisit({ state: "IL", ipKey: a });
      await expect(pv.createVisit({ state: "IL", ipKey: a })).rejects.toThrow(/a lot of visits today/);
      await pv.createVisit({ state: "IL", ipKey: pv.ipKey("198.51.100.4") });
      process.env.CHARTSIDE_VISIT_DAILY_CAP = "1";
      await expect(pv.createVisit({ state: "IL", ipKey: pv.ipKey("198.51.100.5") })).rejects.toThrow(/busy/);
    } finally {
      delete process.env.CHARTSIDE_VISIT_IP_DAILY_CAP;
      delete process.env.CHARTSIDE_VISIT_DAILY_CAP;
    }
  });

  it("caps the audio one patient visit can hold, and stops a chunked upload early", async () => {
    const pv = await import("@/lib/server/patientVisit");
    const { token } = await pv.createVisit({ state: "IL" });
    await pv.recordVisitConsent((await pv.visitByToken(token))!, { decision: "granted" });
    process.env.CHARTSIDE_VISIT_MAX_MB = String(3000 / 1024 / 1024);
    try {
      const v = (await pv.visitByToken(token))!;
      expect((await pv.appendVisitAudio(v, { audio: Buffer.alloc(2000, 1), mime: "audio/webm", opts: { seq: "0" } })).audioBytes).toBe(2000);
      await expect(pv.appendVisitAudio(v, { audio: Buffer.alloc(2000, 1), mime: "audio/webm", opts: { seq: "1" } })).rejects.toMatchObject({ status: 413 });
      const { POST } = await import("@/app/api/visit/[token]/audio/route");
      let pulls = 0;
      const body = new ReadableStream<Uint8Array>({ pull(c) { pulls++; if (pulls > 500) return c.close(); c.enqueue(new Uint8Array(1024).fill(1)); } });
      const res = await POST(new Request(`http://localhost/api/visit/${token}/audio?seq=1`, { method: "POST", headers: { "content-type": "audio/webm" }, body, duplex: "half" } as RequestInit), { params: Promise.resolve({ token }) });
      expect(res.status).toBe(413);
      expect(pulls).toBeLessThan(10);
      expect(await pv.visitAudioBytes(v)).toBe(2000);
    } finally {
      delete process.env.CHARTSIDE_VISIT_MAX_MB;
    }
  });
});

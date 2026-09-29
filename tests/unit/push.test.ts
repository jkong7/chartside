import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-push-"));
const pushed: { endpoint: string; payload: { title: string; body: string; url: string } }[] = [];
let fail410 = new Set<string>();

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
  delete process.env.DEEPGRAM_API_KEY;
  const { setPushSender } = await import("@/lib/server/push");
  setPushSender(async (sub, payload) => {
    if (fail410.has(sub.endpoint)) throw Object.assign(new Error("gone"), { statusCode: 410 });
    pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    return { statusCode: 201 };
  });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } });

describe("note-ready push", () => {
  it("validates subscriptions and refuses guests", async () => {
    const { subscribePush, pushCount } = await import("@/lib/server/push");
    const { createGuest } = await import("@/lib/server/guest");
    const doc = await newMember("Dr. Push Ready");
    await expect(subscribePush(doc, { endpoint: "http://insecure.example", keys: sub(0).keys }, null)).rejects.toThrow("isn't valid");
    await expect(subscribePush(doc, { endpoint: "https://10.0.0.5/admin", keys: sub(0).keys }, null)).rejects.toThrow("browser push service");
    for (let i = 100; i < 112; i++) await subscribePush(doc, sub(i), null);
    await subscribePush(doc, sub(1), "test");
    await subscribePush(doc, sub(1), "test");
    expect(await pushCount(doc.id)).toBe(10);
    const guest = await createGuest();
    await expect(subscribePush(guest, sub(2), null)).rejects.toThrow("Save your notes");
  });

  it("pushes a PHI-free note-ready alert when a capture is drafted, and drops dead subscriptions", async () => {
    const { subscribePush, pushCount, pushToUser } = await import("@/lib/server/push");
    const { captureAudio, settleCaptures } = await import("@/lib/server/capture");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Push Drafted");
    await subscribePush(doc, sub(3), null);
    await subscribePush(doc, sub(4), null);
    fail410 = new Set([sub(4).endpoint]);
    const r = await captureAudio(doc, { bytes: readFileSync("tests/e2e/fixtures/visit.wav"), mime: "audio/wav", options: { consent: "granted", finish: false } });
    await repo.utterances.append(r.encounterId, [{ speaker: "clinician", text: "Your blood pressure is 150 over 90, hypertension not controlled.", tStart: 0, tEnd: 3 }]);
    const { finishCaptureFor } = await import("@/lib/server/capture");
    await finishCaptureFor(doc, r.encounterId);
    await settleCaptures();
    const mine = pushed.filter((p) => p.endpoint === sub(3).endpoint);
    expect(mine).toHaveLength(1);
    expect(mine[0].payload.title).toBe("Note ready");
    expect(mine[0].payload.body).toMatch(/^Your \d{1,2}:\d{2} [AP]M visit is written\. Tap to review and sign\.$/);
    expect(mine[0].payload.url).toBe(`/go/stack?focus=${r.encounterId}`);
    expect(await pushCount(doc.id)).toBe(1);
    await expect(pushToUser(doc.id, { title: "Note ready", body: "Hypertension follow-up", url: "/" })).rejects.toThrow("patient information");
  });
});

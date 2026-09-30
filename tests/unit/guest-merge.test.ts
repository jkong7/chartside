import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-guest-merge-"));

beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function addRule(userId: string, label: string) {
  const { run, now, uid } = await import("@/lib/db");
  await run("INSERT INTO style_rules (id, user_id, kind, section, value, label, source, created_at) VALUES (?, ?, 'section_order', '*', 'ap,s,o', ?, 'pasted', ?)", uid("sty_"), userId, label, now());
}

async function rulesOf(userId: string) {
  const { all } = await import("@/lib/db");
  return (await all<{ label: string }>("SELECT label FROM style_rules WHERE user_id = ?", userId)).map((r) => r.label);
}

describe("merging a guest into an existing account", () => {
  it("brings the guest's pasted style along when the account has none", async () => {
    const { createGuest, mergeGuest } = await import("@/lib/server/guest");
    const guest = await createGuest();
    await addRule(guest.id, "Put sections in your order");
    const me = await newMember("Dr. Style");
    await mergeGuest(guest.id, me.id);
    expect(await rulesOf(me.id)).toEqual(["Put sections in your order"]);
  });

  it("keeps an account's own style instead of the guest's", async () => {
    const { createGuest, mergeGuest } = await import("@/lib/server/guest");
    const guest = await createGuest();
    await addRule(guest.id, "Guest rule");
    const me = await newMember("Dr. Keeps");
    await addRule(me.id, "My rule");
    await mergeGuest(guest.id, me.id);
    expect(await rulesOf(me.id)).toEqual(["My rule"]);
    expect(await rulesOf(guest.id)).toEqual([]);
  });
});

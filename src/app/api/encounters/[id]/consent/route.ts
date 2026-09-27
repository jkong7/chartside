import { ALL_PARTY_STATES, STATE_NAMES } from "@/lib/engine/lexicon";
import { authed, body, fail, json } from "@/lib/server/http";
import { recordConsent } from "@/lib/server/pipeline";
import { encounters } from "@/lib/server/repo";
import type { ConsentRecord } from "@/lib/types";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  const b = await body<{ decision?: ConsentRecord["decision"]; method?: ConsentRecord["method"]; state?: string; othersPresent?: boolean; allPartiesConfirmed?: boolean }>(req);
  const state = (b.state ?? user.prefs.state ?? "IL").toUpperCase();
  if (!STATE_NAMES[state]) return fail("Unknown state");
  if (b.decision !== "granted" && b.decision !== "declined") return fail("Consent decision is required");
  if (b.decision === "granted" && ALL_PARTY_STATES.has(state) && b.othersPresent && !b.allPartiesConfirmed) {
    return fail(`${STATE_NAMES[state]} requires every person in the room to consent. Confirm all parties agreed.`, 422);
  }
  const rec = recordConsent(user, enc, { decision: b.decision, method: b.method ?? "verbal", state, othersPresent: !!b.othersPresent });
  return json({ consent: rec }, 201);
});

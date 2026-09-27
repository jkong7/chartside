import { mintDeepgramToken } from "@/lib/server/audio";
import { authed, fail, json } from "@/lib/server/http";

export const POST = authed(async () => {
  try {
    return json(await mintDeepgramToken(60));
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not create a speech token", 503);
  }
});

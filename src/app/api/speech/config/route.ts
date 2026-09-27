import { speechConfig } from "@/lib/server/audio";
import { authed, json } from "@/lib/server/http";

export const GET = authed(async () => json(speechConfig()));

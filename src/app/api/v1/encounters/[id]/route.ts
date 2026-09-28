import { apiHandler } from "@/lib/server/platform";
import { encounterOut } from "@/lib/server/apiv1";

export const GET = apiHandler<{ id: string }>("encounters:read", async (_req, user, { id }) => ({ data: await encounterOut(user, id) }));

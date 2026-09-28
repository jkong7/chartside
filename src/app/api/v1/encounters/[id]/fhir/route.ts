import { apiHandler } from "@/lib/server/platform";
import { exportFhir } from "@/lib/server/pipeline";

export const GET = apiHandler<{ id: string }>("encounters:read", async (_req, user, { id }) => exportFhir(user, id));

import { apiHandler } from "@/lib/server/platform";
import { patientOut, patients } from "@/lib/server/apiv1";

export const GET = apiHandler<{ id: string }>("patients:read", async (_req, user, { id }) => {
  const p = await patients.get(user, id);
  if (!p) throw new Error("Patient not found");
  return { data: patientOut(p) };
});

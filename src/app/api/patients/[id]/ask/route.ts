import { askChart } from "@/lib/server/chartqa";
import { authed, body, json } from "@/lib/server/http";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ question?: string }>(req);
  return json(await askChart(user, id, b.question ?? ""));
});

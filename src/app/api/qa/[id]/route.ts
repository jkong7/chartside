import { authed, body, json } from "@/lib/server/http";
import { reviewDetail, submitReview } from "@/lib/server/qa";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => json(await reviewDetail(user, id)));

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  await submitReview(user, id, await body(req));
  return json(await reviewDetail(user, id));
});

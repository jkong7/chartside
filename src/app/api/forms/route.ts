import { forms, uploadForm } from "@/lib/server/forms";
import { authed, body, json } from "@/lib/server/http";

export const GET = authed(async (_req, user) => json({ forms: await forms.list(user) }));

export const POST = authed(async (req, user) => {
  const b = await body<{ name?: string; base64?: string }>(req);
  return json({ form: await uploadForm(user, b) }, 201);
});

import { openapi } from "@/lib/server/openapi";

export const GET = () => Response.json(openapi());

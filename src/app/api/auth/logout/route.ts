import { clearedSessionCookie } from "@/lib/session";

export async function POST() {
  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: { "Set-Cookie": clearedSessionCookie() },
    },
  );
}

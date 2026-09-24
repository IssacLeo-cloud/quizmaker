import { getSessionUserIdFromCookieHeader } from "@/lib/session";

export async function requireSessionUserId(
  request: Request,
): Promise<{ userId: string } | { response: Response }> {
  const userId = await getSessionUserIdFromCookieHeader(
    request.headers.get("cookie"),
  );
  if (!userId) {
    return {
      response: Response.json({ error: "Not signed in" }, { status: 401 }),
    };
  }
  return { userId };
}

export function isSessionResponse(
  result: { userId: string } | { response: Response },
): result is { response: Response } {
  return "response" in result;
}

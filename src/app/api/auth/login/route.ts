import { verifyPassword } from "@/lib/services/users";
import { firstIssueMessage, loginSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: firstIssueMessage(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const user = await verifyPassword(parsed.data.email, parsed.data.password);
    if (!user) {
      return Response.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    return Response.json({ user }, { status: 200 });
  } catch {
    return Response.json({ error: "Unable to log in" }, { status: 500 });
  }
}

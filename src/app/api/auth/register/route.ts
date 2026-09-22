import { DuplicateEmailError, createUser } from "@/lib/services/users";
import { firstIssueMessage, registerSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: firstIssueMessage(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const user = await createUser(parsed.data);
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      return Response.json(
        { error: "An account with this email already exists" },
        { status: 409 },
      );
    }

    return Response.json({ error: "Unable to register" }, { status: 500 });
  }
}

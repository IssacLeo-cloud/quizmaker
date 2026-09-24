import { isSessionResponse, requireSessionUserId } from "@/lib/require-session";
import {
  ChoiceMismatchError,
  getMcq,
  listAttempts,
  recordAttempt,
} from "@/lib/services/mcqs";
import { firstIssueMessage } from "@/lib/validators/auth";
import { attemptSchema } from "@/lib/validators/mcq";

type RouteContext = { params: Promise<{ id: string }> };

function notFound() {
  return Response.json({ error: "Question not found" }, { status: 404 });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await requireSessionUserId(request);
  if (isSessionResponse(session)) {
    return session.response;
  }

  const { id } = await context.params;

  try {
    const attempts = await listAttempts(session.userId, id);
    if (!attempts) {
      return notFound();
    }
    return Response.json({ attempts }, { status: 200 });
  } catch {
    return Response.json({ error: "Unable to load attempts" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await requireSessionUserId(request);
  if (isSessionResponse(session)) {
    return session.response;
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = attemptSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: firstIssueMessage(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const existing = await getMcq(session.userId, id);
    if (!existing) {
      return notFound();
    }

    const result = await recordAttempt(
      session.userId,
      id,
      parsed.data.choiceId,
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ChoiceMismatchError) {
      return Response.json(
        { error: "That choice does not belong to this question" },
        { status: 400 },
      );
    }
    return Response.json({ error: "Unable to record attempt" }, { status: 500 });
  }
}

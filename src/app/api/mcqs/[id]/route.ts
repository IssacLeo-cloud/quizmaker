import { isSessionResponse, requireSessionUserId } from "@/lib/require-session";
import { deleteMcq, getMcq, updateMcq } from "@/lib/services/mcqs";
import { firstIssueMessage } from "@/lib/validators/auth";
import { mcqInputSchema } from "@/lib/validators/mcq";

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
    const mcq = await getMcq(session.userId, id);
    if (!mcq) {
      return notFound();
    }
    return Response.json({ mcq }, { status: 200 });
  } catch {
    return Response.json({ error: "Unable to load question" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
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

  const parsed = mcqInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: firstIssueMessage(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const mcq = await updateMcq(session.userId, id, parsed.data);
    if (!mcq) {
      return notFound();
    }
    return Response.json({ mcq }, { status: 200 });
  } catch {
    return Response.json({ error: "Unable to update question" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await requireSessionUserId(request);
  if (isSessionResponse(session)) {
    return session.response;
  }

  const { id } = await context.params;

  try {
    const deleted = await deleteMcq(session.userId, id);
    if (!deleted) {
      return notFound();
    }
    return Response.json({ ok: true }, { status: 200 });
  } catch {
    return Response.json({ error: "Unable to delete question" }, { status: 500 });
  }
}

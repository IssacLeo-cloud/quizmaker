import { isSessionResponse, requireSessionUserId } from "@/lib/require-session";
import { createMcq, listMcqs } from "@/lib/services/mcqs";
import { firstIssueMessage } from "@/lib/validators/auth";
import { mcqInputSchema } from "@/lib/validators/mcq";

export async function GET(request: Request) {
  const session = await requireSessionUserId(request);
  if (isSessionResponse(session)) {
    return session.response;
  }

  try {
    const mcqs = await listMcqs(session.userId);
    return Response.json({ mcqs }, { status: 200 });
  } catch {
    return Response.json({ error: "Unable to load questions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireSessionUserId(request);
  if (isSessionResponse(session)) {
    return session.response;
  }

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
    const mcq = await createMcq(session.userId, parsed.data);
    return Response.json({ mcq }, { status: 201 });
  } catch {
    return Response.json({ error: "Unable to create question" }, { status: 500 });
  }
}

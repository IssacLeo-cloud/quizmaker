const {
  ChoiceMismatchError,
  getMcq,
  listAttempts,
  recordAttempt,
  getSessionUserIdFromCookieHeader,
} = vi.hoisted(() => ({
  ChoiceMismatchError: class ChoiceMismatchError extends Error {
    constructor(message = "That choice does not belong to this question") {
      super(message);
      this.name = "ChoiceMismatchError";
    }
  },
  getMcq: vi.fn(),
  listAttempts: vi.fn(),
  recordAttempt: vi.fn(),
  getSessionUserIdFromCookieHeader: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSessionUserIdFromCookieHeader,
}));

vi.mock("@/lib/services/mcqs", () => ({
  ChoiceMismatchError,
  getMcq,
  listAttempts,
  recordAttempt,
}));

import { GET, POST } from "@/app/api/mcqs/[id]/attempts/route";

const userId = "user-1";
const mcqId = "mcq-1";
const attempt = {
  id: "attempt-1",
  mcqId,
  choiceId: "c2",
  isCorrect: false,
  createdAt: "2026-09-24 12:00:00",
};

function context(id = mcqId) {
  return { params: Promise.resolve({ id }) };
}

function request(method: string, body?: unknown, cookie = true) {
  return new Request(`http://localhost/api/mcqs/${mcqId}/attempts`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: "quizmaker_session=signed" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/mcqs/:id/attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUserIdFromCookieHeader.mockResolvedValue(userId);
    getMcq.mockResolvedValue({ id: mcqId });
  });

  it("POST 201 returns the attempt with server-computed isCorrect and correctChoiceId", async () => {
    recordAttempt.mockResolvedValue({
      attempt,
      correctChoiceId: "c1",
    });

    const response = await POST(
      request("POST", { choiceId: "c2", isCorrect: true }),
      context(),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({ attempt, correctChoiceId: "c1" });
    expect(recordAttempt).toHaveBeenCalledWith(userId, mcqId, "c2");
    expect(payload.attempt.isCorrect).toBe(false);
  });

  it("POST 400 for a choice from another question", async () => {
    recordAttempt.mockRejectedValue(new ChoiceMismatchError());

    const response = await POST(request("POST", { choiceId: "other" }), context());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "That choice does not belong to this question",
    });
  });

  it("POST 404 for an unowned question", async () => {
    getMcq.mockResolvedValue(null);

    const response = await POST(request("POST", { choiceId: "c2" }), context());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Question not found" });
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it("POST 401 without a cookie", async () => {
    getSessionUserIdFromCookieHeader.mockResolvedValue(null);

    const response = await POST(
      request("POST", { choiceId: "c2" }, false),
      context(),
    );

    expect(response.status).toBe(401);
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it("GET 200 lists attempts newest first", async () => {
    const newer = { ...attempt, id: "attempt-2", createdAt: "2026-09-24 13:00:00" };
    listAttempts.mockResolvedValue([newer, attempt]);

    const response = await GET(request("GET"), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ attempts: [newer, attempt] });
    expect(listAttempts).toHaveBeenCalledWith(userId, mcqId);
  });

  it("GET 404 for an unowned question", async () => {
    listAttempts.mockResolvedValue(null);

    const response = await GET(request("GET"), context());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Question not found" });
  });

  it("GET 401 without a cookie", async () => {
    getSessionUserIdFromCookieHeader.mockResolvedValue(null);

    const response = await GET(request("GET", undefined, false), context());

    expect(response.status).toBe(401);
    expect(listAttempts).not.toHaveBeenCalled();
  });
});

const {
  deleteMcq,
  getMcq,
  updateMcq,
  getSessionUserIdFromCookieHeader,
} = vi.hoisted(() => ({
  deleteMcq: vi.fn(),
  getMcq: vi.fn(),
  updateMcq: vi.fn(),
  getSessionUserIdFromCookieHeader: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSessionUserIdFromCookieHeader,
}));

vi.mock("@/lib/services/mcqs", () => ({
  deleteMcq,
  getMcq,
  updateMcq,
}));

import { DELETE, GET, PUT } from "@/app/api/mcqs/[id]/route";

const userId = "user-1";
const mcqId = "mcq-1";
const mcq = {
  id: mcqId,
  name: "Photosynthesis basics",
  question: "Which gas do plants absorb during photosynthesis?",
  createdBy: userId,
  createdAt: "2026-09-24 12:00:00",
  updatedAt: "2026-09-24 12:00:00",
  choices: [
    { id: "c1", text: "Carbon dioxide", isCorrect: true, position: 0 },
    { id: "c2", text: "Oxygen", isCorrect: false, position: 1 },
  ],
};
const validBody = {
  name: "Photosynthesis basics",
  question: "Which gas do plants absorb during photosynthesis?",
  choices: [
    { text: "Carbon dioxide", isCorrect: true },
    { text: "Oxygen", isCorrect: false },
  ],
};

function context(id = mcqId) {
  return { params: Promise.resolve({ id }) };
}

function request(method: string, body?: unknown, cookie = true) {
  return new Request(`http://localhost/api/mcqs/${mcqId}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: "quizmaker_session=signed" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/mcqs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUserIdFromCookieHeader.mockResolvedValue(userId);
  });

  it("GET 200 returns the question", async () => {
    getMcq.mockResolvedValue(mcq);

    const response = await GET(request("GET"), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ mcq });
    expect(getMcq).toHaveBeenCalledWith(userId, mcqId);
  });

  it("GET 404 when missing or owned by someone else", async () => {
    getMcq.mockResolvedValue(null);

    const missing = await GET(request("GET"), context("missing"));
    const otherOwner = await GET(request("GET"), context("other-owner"));

    expect(missing.status).toBe(404);
    expect(otherOwner.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Question not found" });
    expect(await otherOwner.json()).toEqual({ error: "Question not found" });
  });

  it("GET 401 without a cookie", async () => {
    getSessionUserIdFromCookieHeader.mockResolvedValue(null);

    const response = await GET(request("GET", undefined, false), context());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not signed in" });
    expect(getMcq).not.toHaveBeenCalled();
  });

  it("PUT 200 updates the question", async () => {
    updateMcq.mockResolvedValue(mcq);

    const response = await PUT(request("PUT", validBody), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ mcq });
    expect(updateMcq).toHaveBeenCalledWith(userId, mcqId, validBody);
  });

  it("PUT 400 on validation failure", async () => {
    const response = await PUT(
      request("PUT", { ...validBody, name: "" }),
      context(),
    );

    expect(response.status).toBe(400);
    expect(updateMcq).not.toHaveBeenCalled();
  });

  it("PUT 404 when missing or not owned", async () => {
    updateMcq.mockResolvedValue(null);

    const response = await PUT(request("PUT", validBody), context());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Question not found" });
  });

  it("PUT 401 without a cookie", async () => {
    getSessionUserIdFromCookieHeader.mockResolvedValue(null);

    const response = await PUT(request("PUT", validBody, false), context());

    expect(response.status).toBe(401);
    expect(updateMcq).not.toHaveBeenCalled();
  });

  it("DELETE 200 { ok: true }", async () => {
    deleteMcq.mockResolvedValue(true);

    const response = await DELETE(request("DELETE"), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(deleteMcq).toHaveBeenCalledWith(userId, mcqId);
  });

  it("DELETE 404 when missing or not owned", async () => {
    deleteMcq.mockResolvedValue(false);

    const response = await DELETE(request("DELETE"), context());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Question not found" });
  });

  it("DELETE 401 without a cookie", async () => {
    getSessionUserIdFromCookieHeader.mockResolvedValue(null);

    const response = await DELETE(request("DELETE", undefined, false), context());

    expect(response.status).toBe(401);
    expect(deleteMcq).not.toHaveBeenCalled();
  });
});

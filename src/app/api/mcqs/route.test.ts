const {
  createMcq,
  listMcqs,
  getSessionUserIdFromCookieHeader,
} = vi.hoisted(() => ({
  createMcq: vi.fn(),
  listMcqs: vi.fn(),
  getSessionUserIdFromCookieHeader: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSessionUserIdFromCookieHeader,
}));

vi.mock("@/lib/services/mcqs", () => ({
  createMcq,
  listMcqs,
}));

import { GET, POST } from "@/app/api/mcqs/route";

const userId = "user-1";
const listRow = {
  id: "mcq-1",
  name: "Photosynthesis basics",
  question: "Which gas do plants absorb during photosynthesis?",
  choiceCount: 2,
  createdAt: "2026-09-24 12:00:00",
  updatedAt: "2026-09-24 12:00:00",
};
const createdMcq = {
  id: "mcq-1",
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

function request(method: string, body?: unknown, cookie = true) {
  return new Request("http://localhost/api/mcqs", {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: "quizmaker_session=signed" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/mcqs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUserIdFromCookieHeader.mockResolvedValue(userId);
  });

  it("GET 200 lists the session user's questions", async () => {
    listMcqs.mockResolvedValue([listRow]);

    const response = await GET(request("GET"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ mcqs: [listRow] });
    expect(listMcqs).toHaveBeenCalledWith(userId);
  });

  it("GET 401 without a cookie", async () => {
    getSessionUserIdFromCookieHeader.mockResolvedValue(null);

    const response = await GET(request("GET", undefined, false));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Not signed in" });
    expect(listMcqs).not.toHaveBeenCalled();
  });

  it("POST 201 returns the question with choices", async () => {
    createMcq.mockResolvedValue(createdMcq);

    const response = await POST(request("POST", validBody));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({ mcq: createdMcq });
    expect(createMcq).toHaveBeenCalledWith(userId, validBody);
  });

  it("POST 400 on validation failure", async () => {
    const response = await POST(
      request("POST", { ...validBody, choices: [{ text: "Only", isCorrect: true }] }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(typeof payload.error).toBe("string");
    expect(createMcq).not.toHaveBeenCalled();
  });

  it("POST 401 without a cookie", async () => {
    getSessionUserIdFromCookieHeader.mockResolvedValue(null);

    const response = await POST(request("POST", validBody, false));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Not signed in" });
    expect(createMcq).not.toHaveBeenCalled();
  });

  it("POST ignores a client-sent createdBy", async () => {
    createMcq.mockResolvedValue(createdMcq);

    await POST(request("POST", { ...validBody, createdBy: "attacker" }));

    expect(createMcq).toHaveBeenCalledWith(userId, validBody);
    expect(createMcq.mock.calls[0]?.[1]).not.toHaveProperty("createdBy");
  });
});

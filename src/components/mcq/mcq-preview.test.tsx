import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McqPreview } from "@/components/mcq/mcq-preview";

const question = {
  id: "q1",
  name: "Photosynthesis",
  question: "What do plants need?",
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  choices: [
    { id: "c2", text: "Rocks", isCorrect: false, position: 1 },
    { id: "c1", text: "Sunlight", isCorrect: true, position: 0 },
  ],
};

describe("McqPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the question and choices in position order without revealing the answer", () => {
    render(<McqPreview question={question} />);

    expect(screen.getByText("Photosynthesis")).toBeTruthy();
    expect(screen.getByText("What do plants need?")).toBeTruthy();

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBe(screen.getByLabelText(/sunlight/i));
    expect(radios[1]).toBe(screen.getByLabelText(/rocks/i));
    expect(screen.queryByText(/incorrect/i)).toBeNull();
    expect(screen.queryByText(/^correct$/i)).toBeNull();
  });

  it("shows a message and sends no request when nothing is selected", async () => {
    const user = userEvent.setup();
    render(<McqPreview question={question} />);

    await user.click(screen.getByRole("button", { name: /submit answer/i }));

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/select/i);
  });

  it("POSTs the chosen choiceId and shows an incorrect result with the correct choice marked", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          attempt: {
            id: "a1",
            mcqId: "q1",
            choiceId: "c2",
            isCorrect: false,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          correctChoiceId: "c1",
        }),
        { status: 201 },
      ),
    );
    render(<McqPreview question={question} />);

    await user.click(screen.getByLabelText(/rocks/i));
    await user.click(screen.getByRole("button", { name: /submit answer/i }));

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/mcqs/q1/attempts");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ choiceId: "c2" });
    expect(screen.getByText(/incorrect/i)).toBeTruthy();
    expect(screen.getByText(/^correct$/i)).toBeTruthy();
    expect(screen.getByLabelText(/sunlight/i).closest("[data-correct='true']")).toBeTruthy();
  });

  it("shows a correct result when the answer is right", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          attempt: {
            id: "a2",
            mcqId: "q1",
            choiceId: "c1",
            isCorrect: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          correctChoiceId: "c1",
        }),
        { status: 201 },
      ),
    );
    render(<McqPreview question={question} />);

    await user.click(screen.getByLabelText(/sunlight/i));
    await user.click(screen.getByRole("button", { name: /submit answer/i }));

    expect(screen.getByText(/^correct$/i)).toBeTruthy();
    expect(screen.queryByText(/incorrect/i)).toBeNull();
  });

  it("clears the result on Try again so another answer can be submitted", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          attempt: {
            id: "a2",
            mcqId: "q1",
            choiceId: "c1",
            isCorrect: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          correctChoiceId: "c1",
        }),
        { status: 201 },
      ),
    );
    render(<McqPreview question={question} />);

    await user.click(screen.getByLabelText(/sunlight/i));
    await user.click(screen.getByRole("button", { name: /submit answer/i }));
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.queryByText(/^correct$/i)).toBeNull();
    expect(screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(
      true,
    );

    vi.mocked(fetch).mockClear();
    await user.click(screen.getByLabelText(/rocks/i));
    await user.click(screen.getByRole("button", { name: /submit answer/i }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

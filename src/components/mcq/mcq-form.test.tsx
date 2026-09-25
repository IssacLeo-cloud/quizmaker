const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McqForm } from "@/components/mcq/mcq-form";

const loadedQuestion = {
  id: "q1",
  name: "Photosynthesis",
  question: "What do plants need?",
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  choices: [
    { id: "c1", text: "Sunlight", isCorrect: true, position: 0 },
    { id: "c2", text: "Rocks", isCorrect: false, position: 1 },
  ],
};

function inputValue(label: RegExp) {
  return (screen.getByLabelText(label) as HTMLInputElement).value;
}

describe("McqForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders name, question, and two empty choices by default", () => {
    render(<McqForm />);

    expect(screen.getByLabelText(/^name$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^question$/i)).toBeTruthy();
    expect(screen.getAllByLabelText(/^choice \d$/i)).toHaveLength(2);
    expect(inputValue(/^choice 1$/i)).toBe("");
    expect(inputValue(/^choice 2$/i)).toBe("");
  });

  it("adds choices up to 6 then disables Add, and disables Remove at 2", async () => {
    const user = userEvent.setup();
    render(<McqForm />);

    expect((screen.getAllByRole("button", { name: /remove/i })[0] as HTMLButtonElement).disabled).toBe(
      true,
    );

    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: /add choice/i }));
    }

    expect(screen.getAllByLabelText(/^choice \d$/i)).toHaveLength(6);
    expect((screen.getByRole("button", { name: /add choice/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getAllByRole("button", { name: /remove/i })[0] as HTMLButtonElement).disabled).toBe(
      false,
    );
  }, 15_000);

  it("clears the correct-answer selection when that choice is removed", async () => {
    const user = userEvent.setup();
    render(<McqForm />);

    await user.click(screen.getByRole("button", { name: /add choice/i }));
    await user.click(screen.getByLabelText(/mark choice 1 as correct/i));
    expect((screen.getByLabelText(/mark choice 1 as correct/i) as HTMLInputElement).checked).toBe(
      true,
    );

    await user.click(screen.getAllByRole("button", { name: /remove/i })[0]);

    expect(
      screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked),
    ).toBe(true);
  });

  it("blocks submit with a message when a field is empty or no correct answer is chosen", async () => {
    const user = userEvent.setup();
    render(<McqForm />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/required|empty|correct/i);

    await user.type(screen.getByLabelText(/^name$/i), "Cell parts");
    await user.type(screen.getByLabelText(/^question$/i), "Which organelle makes energy?");
    await user.type(screen.getByLabelText(/^choice 1$/i), "Mitochondria");
    await user.type(screen.getByLabelText(/^choice 2$/i), "Nucleus");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/correct/i);
  }, 15_000);

  it("POSTs a valid new question to /api/mcqs and navigates to /home", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ mcq: { id: "q-new" } }), { status: 201 }),
    );
    render(<McqForm />);

    await user.type(screen.getByLabelText(/^name$/i), "Cell parts");
    await user.type(screen.getByLabelText(/^question$/i), "Which organelle makes energy?");
    await user.type(screen.getByLabelText(/^choice 1$/i), "Mitochondria");
    await user.type(screen.getByLabelText(/^choice 2$/i), "Nucleus");
    await user.click(screen.getByLabelText(/mark choice 1 as correct/i));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/mcqs");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Cell parts",
      question: "Which organelle makes energy?",
      choices: [
        { text: "Mitochondria", isCorrect: true },
        { text: "Nucleus", isCorrect: false },
      ],
    });
    expect(push).toHaveBeenCalledWith("/home");
  });

  it("prefills an existing question and PUTs /api/mcqs/:id", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ mcq: loadedQuestion }), { status: 200 }),
    );
    render(<McqForm question={loadedQuestion} />);

    expect(inputValue(/^name$/i)).toBe("Photosynthesis");
    expect(inputValue(/^question$/i)).toBe("What do plants need?");
    expect(inputValue(/^choice 1$/i)).toBe("Sunlight");
    expect(inputValue(/^choice 2$/i)).toBe("Rocks");
    expect((screen.getByLabelText(/mark choice 1 as correct/i) as HTMLInputElement).checked).toBe(
      true,
    );

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/mcqs/q1");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Photosynthesis",
      question: "What do plants need?",
      choices: [
        { text: "Sunlight", isCorrect: true },
        { text: "Rocks", isCorrect: false },
      ],
    });
    expect(push).toHaveBeenCalledWith("/home");
  });

  it("renders an API error and keeps the typed values", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Unable to create question" }), {
        status: 500,
      }),
    );
    render(<McqForm />);

    await user.type(screen.getByLabelText(/^name$/i), "Cell parts");
    await user.type(screen.getByLabelText(/^question$/i), "Which organelle makes energy?");
    await user.type(screen.getByLabelText(/^choice 1$/i), "Mitochondria");
    await user.type(screen.getByLabelText(/^choice 2$/i), "Nucleus");
    await user.click(screen.getByLabelText(/mark choice 1 as correct/i));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Unable to create question");
    expect(inputValue(/^name$/i)).toBe("Cell parts");
    expect(inputValue(/^choice 1$/i)).toBe("Mitochondria");
  });
});

const { refresh } = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McqList } from "@/components/mcq/mcq-list";

const questions = [
  {
    id: "q1",
    name: "Photosynthesis",
    question: "What do plants need for photosynthesis?",
    choiceCount: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("McqList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a table with Name, Question, and Actions headers and one row per question", () => {
    render(<McqList questions={questions} />);

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /name/i })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: /question/i })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: /actions/i })).toBeTruthy();
    expect(within(table).getByText("Photosynthesis")).toBeTruthy();
    expect(within(table).getByText("What do plants need for photosynthesis?")).toBeTruthy();
  });

  it("opens a three-dots menu with Edit, Preview, and Delete pointing at the question routes", async () => {
    const user = userEvent.setup();
    render(<McqList questions={questions} />);

    const trigger = screen.getByRole("button", { name: /actions/i });
    await user.click(trigger);

    expect(screen.getByRole("menuitem", { name: /^edit$/i }).getAttribute("href")).toBe(
      "/home/mcqs/q1/edit",
    );
    expect(screen.getByRole("menuitem", { name: /^preview$/i }).getAttribute("href")).toBe(
      "/home/mcqs/q1/preview",
    );
    expect(screen.getByRole("menuitem", { name: /^delete$/i })).toBeTruthy();
  });

  it("asks for confirmation and only then sends DELETE /api/mcqs/:id", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<McqList questions={questions} />);

    await user.click(screen.getByRole("button", { name: /actions/i }));
    await user.click(await screen.findByRole("menuitem", { name: /^delete$/i }));

    expect(fetch).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/mcqs/q1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("points Create question at /home/mcqs/new", () => {
    render(<McqList questions={questions} />);

    expect(screen.getByRole("link", { name: /create question/i }).getAttribute("href")).toBe(
      "/home/mcqs/new",
    );
  });

  it("shows the no-questions message and Create instead of an empty table", () => {
    render(<McqList questions={[]} />);

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/no questions/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /create question/i }).getAttribute("href")).toBe(
      "/home/mcqs/new",
    );
  });
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { render, screen, within } from "@testing-library/react";
import { InstructorHome } from "@/components/home/instructor-home";

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

describe("InstructorHome", () => {
  it("renders the MCQ list and Create button, keeps Log out top-right, and drops the stub copy", () => {
    render(<InstructorHome questions={questions} />);

    expect(screen.getByRole("heading", { name: /instructor home/i })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Photosynthesis")).toBeTruthy();
    expect(screen.getByRole("link", { name: /create question/i }).getAttribute("href")).toBe(
      "/home/mcqs/new",
    );
    expect(screen.queryByText(/quiz making is next/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /log in/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /register/i })).toBeNull();

    const header = screen.getByRole("banner");
    expect(header.className).toMatch(/justify-end/);
    expect(within(header).getByRole("link", { name: /log out/i }).getAttribute("href")).toBe(
      "/logout",
    );
  });
});

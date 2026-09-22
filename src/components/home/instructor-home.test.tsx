import { render, screen } from "@testing-library/react";
import { InstructorHome } from "@/components/home/instructor-home";

describe("InstructorHome", () => {
  it("is an instructor home stub that quiz-making is next, with a logout link", () => {
    render(<InstructorHome />);

    expect(screen.getByRole("heading", { name: /instructor home/i })).toBeTruthy();
    expect(screen.getByText(/quiz/i).textContent).toMatch(/next/i);
    expect(screen.queryByRole("heading", { name: /quiz editor/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /log in/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /register/i })).toBeNull();
    expect(screen.getByRole("link", { name: /log out/i }).getAttribute("href")).toBe(
      "/logout",
    );
  });
});

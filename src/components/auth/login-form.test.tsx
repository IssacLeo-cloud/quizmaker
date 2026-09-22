const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/auth/login-form";

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders email and password and links to register, without Google or reset", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /google/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /forgot/i })).toBeNull();
    expect(screen.getByRole("link", { name: /sign up/i }).getAttribute("href")).toBe(
      "/register",
    );
  });

  it("submits email and password to /api/auth/login and navigates to /home on 200", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1" } }), { status: 200 }),
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ada@school.edu");
    await user.type(screen.getByLabelText(/password/i), "at-least-8-chars");
    await user.click(screen.getByRole("button", { name: /^login$/i }));

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "ada@school.edu",
      password: "at-least-8-chars",
    });
    expect(push).toHaveBeenCalledWith("/home");
  });

  it("shows the generic invalid-credentials message on 401", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid email or password" }), {
        status: 401,
      }),
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ada@school.edu");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /^login$/i }));

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(
      "Invalid email or password",
    );
  });
});

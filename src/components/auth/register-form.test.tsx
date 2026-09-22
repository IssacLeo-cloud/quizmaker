const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegisterForm } from "@/components/auth/register-form";

const valid = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@school.edu",
  password: "at-least-8-chars",
};

async function fillRegisterForm(
  user: ReturnType<typeof userEvent.setup>,
  values: {
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  },
) {
  if (values.firstName !== undefined) {
    await user.type(screen.getByLabelText(/first name/i), values.firstName);
  }
  if (values.lastName !== undefined) {
    await user.type(screen.getByLabelText(/last name/i), values.lastName);
  }
  if (values.email !== undefined) {
    await user.type(screen.getByLabelText(/email/i), values.email);
  }
  if (values.password !== undefined) {
    await user.type(screen.getByLabelText(/^password$/i), values.password);
  }
  if (values.confirmPassword !== undefined) {
    await user.type(
      screen.getByLabelText(/confirm password/i),
      values.confirmPassword,
    );
  }
}

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders first name, last name, email, password, and confirm password", () => {
    render(<RegisterForm />);

    expect(screen.getByLabelText(/first name/i)).toBeTruthy();
    expect(screen.getByLabelText(/last name/i)).toBeTruthy();
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
    expect(screen.getByLabelText(/confirm password/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /google/i })).toBeNull();
    expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href")).toBe(
      "/login",
    );
  });

  it("does not submit when the password is shorter than 8 characters", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await fillRegisterForm(user, {
      ...valid,
      password: "short",
      confirmPassword: "short",
    });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetch).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/8/i);
  });

  it("does not submit when the passwords do not match", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await fillRegisterForm(user, {
      ...valid,
      confirmPassword: "different-password",
    });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/match/i);
  });

  it("POSTs JSON without confirm password and navigates toward /login on 201", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1" } }), { status: 201 }),
    );
    render(<RegisterForm />);

    await fillRegisterForm(user, {
      ...valid,
      confirmPassword: valid.password,
    });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/auth/register");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      firstName: valid.firstName,
      lastName: valid.lastName,
      email: valid.email,
      password: valid.password,
    });
    expect(body).not.toHaveProperty("confirmPassword");
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/login/));
  });
});

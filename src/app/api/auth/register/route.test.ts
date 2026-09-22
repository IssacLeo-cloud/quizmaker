const { createUser } = vi.hoisted(() => ({
  createUser: vi.fn(),
}));

vi.mock("@/lib/services/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/users")>();
  return {
    ...actual,
    createUser,
  };
});

import { DuplicateEmailError } from "@/lib/services/users";
import { POST } from "@/app/api/auth/register/route";

const publicUser = {
  id: "11111111-1111-1111-1111-111111111111",
  username: "instructor@school.edu",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "instructor@school.edu",
  createdAt: "2026-09-17 12:00:00",
  updatedAt: "2026-09-17 12:00:00",
};

const validBody = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "instructor@school.edu",
  password: "at-least-8-chars",
};

function registerRequest(body: unknown) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with the public user and no password_hash", async () => {
    createUser.mockResolvedValue(publicUser);

    const response = await POST(registerRequest(validBody));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({ user: publicUser });
    expect(payload.user).not.toHaveProperty("password_hash");
    expect(payload.user).not.toHaveProperty("passwordHash");
    expect(createUser).toHaveBeenCalledWith(validBody);
  });

  it("returns 400 on validation failure", async () => {
    const response = await POST(
      registerRequest({ ...validBody, password: "short" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(typeof payload.error).toBe("string");
    expect(payload.error.length).toBeGreaterThan(0);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("returns 409 when the service reports a duplicate email", async () => {
    createUser.mockRejectedValue(new DuplicateEmailError());

    const response = await POST(registerRequest(validBody));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      error: "An account with this email already exists",
    });
  });

  it("returns 500 on an unexpected throw", async () => {
    createUser.mockRejectedValue(new Error("d1 unavailable"));

    const response = await POST(registerRequest(validBody));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Unable to register" });
  });
});

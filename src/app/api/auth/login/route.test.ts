const { verifyPassword } = vi.hoisted(() => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/services/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/users")>();
  return {
    ...actual,
    verifyPassword,
  };
});

import { POST } from "@/app/api/auth/login/route";

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
  email: "instructor@school.edu",
  password: "at-least-8-chars",
};

function loginRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the public user and no password_hash", async () => {
    verifyPassword.mockResolvedValue(publicUser);

    const response = await POST(loginRequest(validBody));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ user: publicUser });
    expect(payload.user).not.toHaveProperty("password_hash");
    expect(verifyPassword).toHaveBeenCalledWith(
      validBody.email,
      validBody.password,
    );
  });

  it("returns 401 with the same generic message for unknown email and wrong password", async () => {
    verifyPassword.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const unknownEmail = await POST(
      loginRequest({ email: "nobody@school.edu", password: validBody.password }),
    );
    const wrongPassword = await POST(
      loginRequest({ email: validBody.email, password: "wrong-password" }),
    );

    const unknownPayload = await unknownEmail.json();
    const wrongPayload = await wrongPassword.json();

    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknownPayload.error).toBe("Invalid email or password");
    expect(wrongPayload.error).toBe(unknownPayload.error);
  });

  it("returns 400 on an invalid body", async () => {
    const response = await POST(loginRequest({ email: validBody.email }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(typeof payload.error).toBe("string");
    expect(verifyPassword).not.toHaveBeenCalled();
  });
});

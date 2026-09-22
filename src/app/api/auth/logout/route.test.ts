const { createUser, verifyPassword } = vi.hoisted(() => ({
  createUser: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/services/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/users")>();
  return {
    ...actual,
    createUser,
    verifyPassword,
  };
});

import { POST } from "@/app/api/auth/logout/route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 { ok: true } without calling the user service", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(createUser).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });
});

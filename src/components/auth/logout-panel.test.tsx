import { render, screen, waitFor } from "@testing-library/react";
import { LogoutPanel } from "@/components/auth/logout-panel";

describe("LogoutPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls POST /api/auth/logout and exposes a path back to /login", async () => {
    render(<LogoutPanel />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/logout",
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(
      screen.getByRole("link", { name: /log in/i }).getAttribute("href"),
    ).toBe("/login");
  });
});

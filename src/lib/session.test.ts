vi.mock("server-only", () => ({}));

const SESSION_SECRET = "test-session-secret-at-least-32-chars!!";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { SESSION_SECRET },
  })),
}));

import {
  clearedSessionCookie,
  createSessionCookie,
  getSessionUserIdFromCookieHeader,
} from "@/lib/session";

function cookieValue(setCookie: string): string {
  const match = /quizmaker_session=([^;]*)/.exec(setCookie);
  expect(match).not.toBeNull();
  return decodeURIComponent(match![1]);
}

describe("session cookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates an HttpOnly signed cookie, not a bare user id", async () => {
    const setCookie = await createSessionCookie("user-1");

    expect(setCookie).toMatch(/quizmaker_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/Max-Age=604800/);

    const value = cookieValue(setCookie);
    expect(value).not.toBe("user-1");
    expect(value.split(".")).toHaveLength(3);
    expect(value.startsWith("user-1.")).toBe(true);
  });

  it("round-trips the user id from a valid Cookie header", async () => {
    const setCookie = await createSessionCookie("user-1");
    const value = cookieValue(setCookie);

    await expect(
      getSessionUserIdFromCookieHeader(`other=1; quizmaker_session=${value}`),
    ).resolves.toBe("user-1");
  });

  it("returns null for a tampered user id", async () => {
    const setCookie = await createSessionCookie("user-1");
    const [userId, expiresAt, signature] = cookieValue(setCookie).split(".");
    expect(userId).toBe("user-1");

    const tampered = `user-2.${expiresAt}.${signature}`;

    await expect(
      getSessionUserIdFromCookieHeader(`quizmaker_session=${tampered}`),
    ).resolves.toBeNull();
  });

  it("returns null for a tampered signature", async () => {
    const setCookie = await createSessionCookie("user-1");
    const [userId, expiresAt, signature] = cookieValue(setCookie).split(".");
    const flipped = signature.endsWith("A")
      ? `${signature.slice(0, -1)}B`
      : `${signature.slice(0, -1)}A`;
    const tampered = `${userId}.${expiresAt}.${flipped}`;

    await expect(
      getSessionUserIdFromCookieHeader(`quizmaker_session=${tampered}`),
    ).resolves.toBeNull();
  });

  it("returns null when the cookie is missing, empty, or malformed", async () => {
    await expect(getSessionUserIdFromCookieHeader(null)).resolves.toBeNull();
    await expect(getSessionUserIdFromCookieHeader(undefined)).resolves.toBeNull();
    await expect(getSessionUserIdFromCookieHeader("")).resolves.toBeNull();
    await expect(
      getSessionUserIdFromCookieHeader("theme=dark"),
    ).resolves.toBeNull();
    await expect(
      getSessionUserIdFromCookieHeader("quizmaker_session="),
    ).resolves.toBeNull();
    await expect(
      getSessionUserIdFromCookieHeader("quizmaker_session=user-1"),
    ).resolves.toBeNull();
    await expect(
      getSessionUserIdFromCookieHeader("quizmaker_session=user-1.123"),
    ).resolves.toBeNull();
  });

  it("returns null when expiresAt is in the past", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T12:00:00.000Z"));

    const setCookie = await createSessionCookie("user-1");
    const value = cookieValue(setCookie);

    await expect(
      getSessionUserIdFromCookieHeader(`quizmaker_session=${value}`),
    ).resolves.toBe("user-1");

    vi.setSystemTime(new Date("2026-10-02T12:00:01.000Z"));

    await expect(
      getSessionUserIdFromCookieHeader(`quizmaker_session=${value}`),
    ).resolves.toBeNull();
  });

  it("clears the same cookie name with Max-Age=0", async () => {
    const setCookie = await clearedSessionCookie();

    expect(setCookie).toMatch(/quizmaker_session=/);
    expect(setCookie).toMatch(/Max-Age=0/);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/HttpOnly/i);
  });
});

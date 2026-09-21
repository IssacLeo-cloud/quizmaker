vi.mock("server-only", () => ({}));

import { hashPassword, verifyPassword } from "@/lib/password";

describe("password hashing", () => {
  it("stores a PBKDF2 payload, not the plaintext password", async () => {
    const password = "correct-horse-battery";
    const payload = await hashPassword(password);

    expect(payload).not.toBe(password);
    expect(payload).toMatch(
      /^pbkdf2\$sha256\$\d+\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/,
    );
  });

  it("verifies the same password against its hash", async () => {
    const password = "at-least-8-chars";
    const payload = await hashPassword(password);

    await expect(verifyPassword(password, payload)).resolves.toBe(true);
  });

  it("does not verify a wrong password", async () => {
    const payload = await hashPassword("at-least-8-chars");

    await expect(verifyPassword("wrong-password", payload)).resolves.toBe(
      false,
    );
  });

  it("produces different hashes for the same password because of salt", async () => {
    const password = "same-password-twice";
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).not.toBe(second);
    await expect(verifyPassword(password, first)).resolves.toBe(true);
    await expect(verifyPassword(password, second)).resolves.toBe(true);
  });

  it("fails closed on a malformed payload instead of throwing", async () => {
    await expect(verifyPassword("any-password", "")).resolves.toBe(false);
    await expect(verifyPassword("any-password", "not-a-hash")).resolves.toBe(
      false,
    );
    await expect(
      verifyPassword("any-password", "pbkdf2$sha256$not-a-number$aa$bb"),
    ).resolves.toBe(false);
    await expect(
      verifyPassword("any-password", "pbkdf2$sha256$100000$only-four-parts"),
    ).resolves.toBe(false);
  });
});

import { loginSchema, registerSchema } from "@/lib/validators/auth";

const validRegister = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "instructor@school.edu",
  password: "at-least-8-chars",
};

describe("registerSchema", () => {
  it("accepts a valid register body", () => {
    const result = registerSchema.safeParse(validRegister);

    expect(result.success).toBe(true);
  });

  it("rejects empty names", () => {
    expect(
      registerSchema.safeParse({ ...validRegister, firstName: "" }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...validRegister, lastName: "" }).success,
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      registerSchema.safeParse({ ...validRegister, email: "not-an-email" })
        .success,
    ).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(
      registerSchema.safeParse({ ...validRegister, password: "short" }).success,
    ).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid login body", () => {
    const result = loginSchema.safeParse({
      email: "instructor@school.edu",
      password: "at-least-8-chars",
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing fields", () => {
    expect(loginSchema.safeParse({ email: "instructor@school.edu" }).success).toBe(
      false,
    );
    expect(loginSchema.safeParse({ password: "at-least-8-chars" }).success).toBe(
      false,
    );
    expect(loginSchema.safeParse({}).success).toBe(false);
  });
});

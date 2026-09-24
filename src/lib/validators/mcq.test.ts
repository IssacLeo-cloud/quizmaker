import { attemptSchema, mcqInputSchema } from "@/lib/validators/mcq";

const validMcq = {
  name: "Photosynthesis basics",
  question: "Which gas do plants absorb during photosynthesis?",
  choices: [
    { text: "Carbon dioxide", isCorrect: true },
    { text: "Oxygen", isCorrect: false },
  ],
};

describe("mcqInputSchema", () => {
  it("accepts a valid body", () => {
    const result = mcqInputSchema.safeParse(validMcq);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validMcq);
    }
  });

  it("rejects an empty name or question", () => {
    expect(
      mcqInputSchema.safeParse({ ...validMcq, name: "   " }).success,
    ).toBe(false);
    expect(
      mcqInputSchema.safeParse({ ...validMcq, question: "" }).success,
    ).toBe(false);
  });

  it("rejects over-length fields", () => {
    expect(
      mcqInputSchema.safeParse({ ...validMcq, name: "n".repeat(201) }).success,
    ).toBe(false);
    expect(
      mcqInputSchema.safeParse({
        ...validMcq,
        question: "q".repeat(2001),
      }).success,
    ).toBe(false);
    expect(
      mcqInputSchema.safeParse({
        ...validMcq,
        choices: [
          { text: "c".repeat(501), isCorrect: true },
          { text: "Oxygen", isCorrect: false },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects fewer than 2 or more than 6 choices", () => {
    expect(
      mcqInputSchema.safeParse({
        ...validMcq,
        choices: [{ text: "Only", isCorrect: true }],
      }).success,
    ).toBe(false);
    expect(
      mcqInputSchema.safeParse({
        ...validMcq,
        choices: Array.from({ length: 7 }, (_, index) => ({
          text: `Choice ${index}`,
          isCorrect: index === 0,
        })),
      }).success,
    ).toBe(false);
  });

  it("rejects an empty choice text", () => {
    expect(
      mcqInputSchema.safeParse({
        ...validMcq,
        choices: [
          { text: "   ", isCorrect: true },
          { text: "Oxygen", isCorrect: false },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects zero or two correct answers", () => {
    expect(
      mcqInputSchema.safeParse({
        ...validMcq,
        choices: [
          { text: "A", isCorrect: false },
          { text: "B", isCorrect: false },
        ],
      }).success,
    ).toBe(false);
    expect(
      mcqInputSchema.safeParse({
        ...validMcq,
        choices: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: true },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("attemptSchema", () => {
  it("requires a non-empty choiceId", () => {
    expect(attemptSchema.safeParse({ choiceId: "choice-1" }).success).toBe(
      true,
    );
    expect(attemptSchema.safeParse({ choiceId: "" }).success).toBe(false);
    expect(attemptSchema.safeParse({}).success).toBe(false);
  });
});

import { z } from "zod";

export const mcqInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    question: z.string().trim().min(1).max(2000),
    choices: z
      .array(
        z.object({
          text: z.string().trim().min(1).max(500),
          isCorrect: z.boolean(),
        }),
      )
      .min(2)
      .max(6),
  })
  .superRefine((value, ctx) => {
    const correct = value.choices.filter((choice) => choice.isCorrect).length;
    if (correct !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Select exactly one correct answer",
        path: ["choices"],
      });
    }
  });

export const attemptSchema = z.object({
  choiceId: z.string().min(1),
});

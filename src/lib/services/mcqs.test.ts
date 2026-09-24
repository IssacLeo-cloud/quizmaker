vi.mock("server-only", () => ({}));

type McqRow = {
  id: string;
  name: string;
  question: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type ChoiceRow = {
  id: string;
  mcq_id: string;
  choice_text: string;
  is_correct: number;
  position: number;
  created_at: string;
};

type AttemptRow = {
  id: string;
  mcq_id: string;
  choice_id: string;
  attempted_by: string;
  is_correct: number;
  created_at: string;
};

const { mcqs, choices, attempts, resetRows, getCloudflareContext } = vi.hoisted(
  () => {
    const mcqs = new Map<string, McqRow>();
    const choices = new Map<string, ChoiceRow>();
    const attempts = new Map<string, AttemptRow>();
    let clock = 0;

    function nextTimestamp() {
      clock += 1;
      return `2026-01-01 00:00:${String(clock).padStart(2, "0")}`;
    }

    function runQuery(sql: string, params: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

      if (normalized.startsWith("insert into mcqs")) {
        const [id, name, question, created_by] = params as string[];
        const timestamp = nextTimestamp();
        mcqs.set(id, {
          id,
          name,
          question,
          created_by,
          created_at: timestamp,
          updated_at: timestamp,
        });
        return { results: [] as unknown[], changes: 1 };
      }

      if (normalized.startsWith("insert into mcq_choices")) {
        const [id, mcq_id, choice_text, is_correct, position] = params as [
          string,
          string,
          string,
          number,
          number,
        ];
        choices.set(id, {
          id,
          mcq_id,
          choice_text,
          is_correct: Number(is_correct),
          position: Number(position),
          created_at: nextTimestamp(),
        });
        return { results: [] as unknown[], changes: 1 };
      }

      if (normalized.startsWith("insert into mcq_attempts")) {
        const [id, mcq_id, choice_id, attempted_by, is_correct] = params as [
          string,
          string,
          string,
          string,
          number,
        ];
        attempts.set(id, {
          id,
          mcq_id,
          choice_id,
          attempted_by,
          is_correct: Number(is_correct),
          created_at: nextTimestamp(),
        });
        return { results: [] as unknown[], changes: 1 };
      }

      if (
        normalized.startsWith("select") &&
        normalized.includes("from mcqs") &&
        normalized.includes("where id") &&
        normalized.includes("created_by")
      ) {
        const id = String(params[0]);
        const createdBy = String(params[1]);
        const row = mcqs.get(id);
        const match = row && row.created_by === createdBy ? [row] : [];
        return { results: match, changes: 0 };
      }

      if (
        normalized.startsWith("select") &&
        normalized.includes("from mcqs") &&
        normalized.includes("created_by")
      ) {
        const createdBy = String(params[0]);
        const results = [...mcqs.values()]
          .filter((row) => row.created_by === createdBy)
          .sort((left, right) =>
            right.updated_at.localeCompare(left.updated_at),
          )
          .map((row) => ({
            ...row,
            choice_count: [...choices.values()].filter(
              (choice) => choice.mcq_id === row.id,
            ).length,
          }));
        return { results, changes: 0 };
      }

      if (
        normalized.startsWith("select") &&
        normalized.includes("from mcq_choices") &&
        normalized.includes("mcq_id")
      ) {
        const mcqId = String(params[0]);
        const results = [...choices.values()]
          .filter((row) => row.mcq_id === mcqId)
          .sort((left, right) => left.position - right.position);
        return { results, changes: 0 };
      }

      if (
        normalized.startsWith("select") &&
        normalized.includes("from mcq_attempts") &&
        normalized.includes("mcq_id")
      ) {
        const mcqId = String(params[0]);
        const results = [...attempts.values()]
          .filter((row) => row.mcq_id === mcqId)
          .sort((left, right) => right.created_at.localeCompare(left.created_at));
        return { results, changes: 0 };
      }

      if (normalized.startsWith("update mcqs")) {
        const id = String(params[params.length - 2]);
        const createdBy = String(params[params.length - 1]);
        const row = mcqs.get(id);
        if (!row || row.created_by !== createdBy) {
          return { results: [] as unknown[], changes: 0 };
        }
        row.name = String(params[0]);
        row.question = String(params[1]);
        row.updated_at = nextTimestamp();
        return { results: [], changes: 1 };
      }

      if (normalized.startsWith("delete from mcq_attempts")) {
        const mcqId = String(params[0]);
        let changes = 0;
        for (const [id, row] of attempts) {
          if (row.mcq_id === mcqId) {
            attempts.delete(id);
            changes += 1;
          }
        }
        return { results: [] as unknown[], changes };
      }

      if (normalized.startsWith("delete from mcq_choices")) {
        const mcqId = String(params[0]);
        let changes = 0;
        for (const [id, row] of choices) {
          if (row.mcq_id === mcqId) {
            choices.delete(id);
            changes += 1;
          }
        }
        return { results: [] as unknown[], changes };
      }

      if (normalized.startsWith("delete from mcqs")) {
        const id = String(params[0]);
        const createdBy = String(params[1]);
        const row = mcqs.get(id);
        if (!row || row.created_by !== createdBy) {
          return { results: [] as unknown[], changes: 0 };
        }
        mcqs.delete(id);
        return { results: [] as unknown[], changes: 1 };
      }

      throw new Error(`Unsupported SQL in fake D1: ${sql}`);
    }

    function prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            all: async () => {
              const { results } = runQuery(sql, params);
              return { results };
            },
            run: async () => {
              const { changes } = runQuery(sql, params);
              return { success: true, meta: { changes } };
            },
          };
        },
      };
    }

    const quizmaker = {
      prepare,
      async batch(
        statements: Array<{ run: () => Promise<{ success: boolean }> }>,
      ) {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        return results;
      },
    };

    return {
      mcqs,
      choices,
      attempts,
      resetRows() {
        mcqs.clear();
        choices.clear();
        attempts.clear();
        clock = 0;
      },
      getCloudflareContext: vi.fn(async () => ({
        env: { quizmaker },
      })),
    };
  },
);

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext,
}));

import {
  ChoiceMismatchError,
  InvalidChoiceSetError,
  createMcq,
  deleteMcq,
  getMcq,
  listAttempts,
  listMcqs,
  recordAttempt,
  updateMcq,
} from "@/lib/services/mcqs";

const owner = "owner-1";
const other = "owner-2";

const twoChoices = [
  { text: " Carbon dioxide ", isCorrect: true },
  { text: " Oxygen ", isCorrect: false },
];

async function createSample(userId = owner) {
  return createMcq(userId, {
    name: " Photosynthesis ",
    question: " Which gas do plants absorb? ",
    choices: twoChoices,
  });
}

describe("mcq service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRows();
  });

  it("createMcq stores trimmed fields, created_by, positions, and one correct choice", async () => {
    const mcq = await createSample();

    expect(mcq.name).toBe("Photosynthesis");
    expect(mcq.question).toBe("Which gas do plants absorb?");
    expect(mcq.createdBy).toBe(owner);
    expect(mcq.choices).toHaveLength(2);
    expect(mcq.choices[0]).toMatchObject({
      text: "Carbon dioxide",
      isCorrect: true,
      position: 0,
    });
    expect(mcq.choices[1]).toMatchObject({
      text: "Oxygen",
      isCorrect: false,
      position: 1,
    });

    const stored = [...mcqs.values()][0];
    expect(stored.created_by).toBe(owner);
    expect(stored.name).toBe("Photosynthesis");
    expect([...choices.values()].map((row) => row.position).sort()).toEqual([
      0, 1,
    ]);
    expect(
      [...choices.values()].filter((row) => row.is_correct === 1),
    ).toHaveLength(1);
  });

  it("getMcq returns choices ordered by position", async () => {
    const created = await createMcq(owner, {
      name: "Order",
      question: "Pick one",
      choices: [
        { text: "First", isCorrect: false },
        { text: "Second", isCorrect: true },
        { text: "Third", isCorrect: false },
      ],
    });

    const loaded = await getMcq(owner, created.id);
    expect(loaded?.choices.map((choice) => choice.text)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(loaded?.choices.map((choice) => choice.position)).toEqual([0, 1, 2]);
  });

  it("listMcqs returns only that instructor's rows, newest updated_at first, with choiceCount", async () => {
    const first = await createSample(owner);
    await createMcq(other, {
      name: "Other",
      question: "Not yours",
      choices: twoChoices,
    });
    const second = await createMcq(owner, {
      name: "Later",
      question: "Second question",
      choices: [
        { text: "A", isCorrect: true },
        { text: "B", isCorrect: false },
        { text: "C", isCorrect: false },
      ],
    });
    await updateMcq(owner, first.id, {
      name: "Photosynthesis",
      question: "Which gas do plants absorb?",
      choices: twoChoices,
    });

    const listed = await listMcqs(owner);
    expect(listed.map((row) => row.id)).toEqual([first.id, second.id]);
    expect(listed.every((row) => !("choices" in row))).toBe(true);
    expect(listed[0]?.choiceCount).toBe(2);
    expect(listed[1]?.choiceCount).toBe(3);
  });

  it("getMcq, updateMcq, deleteMcq, and listAttempts hide another instructor's question", async () => {
    const mcq = await createSample(owner);

    await expect(getMcq(other, mcq.id)).resolves.toBeNull();
    await expect(
      updateMcq(other, mcq.id, {
        name: "Hijack",
        question: "Stolen",
        choices: twoChoices,
      }),
    ).resolves.toBeNull();
    await expect(deleteMcq(other, mcq.id)).resolves.toBe(false);
    await expect(listAttempts(other, mcq.id)).resolves.toBeNull();
    await expect(getMcq(owner, mcq.id)).resolves.not.toBeNull();
  });

  it("updateMcq replaces choices, bumps updated_at, and discards attempts", async () => {
    const created = await createSample();
    const wrong = created.choices.find((choice) => !choice.isCorrect);
    expect(wrong).toBeDefined();
    await recordAttempt(owner, created.id, wrong!.id);

    const updated = await updateMcq(owner, created.id, {
      name: " Updated name ",
      question: " Updated question ",
      choices: [
        { text: "New A", isCorrect: false },
        { text: "New B", isCorrect: true },
        { text: "New C", isCorrect: false },
      ],
    });

    expect(updated?.name).toBe("Updated name");
    expect(updated?.question).toBe("Updated question");
    expect(updated?.updatedAt).not.toBe(created.updatedAt);
    expect(updated?.choices.map((choice) => choice.text)).toEqual([
      "New A",
      "New B",
      "New C",
    ]);
    expect(updated?.choices.some((choice) => choice.id === created.choices[0]?.id)).toBe(
      false,
    );
    await expect(listAttempts(owner, created.id)).resolves.toEqual([]);
    expect(attempts.size).toBe(0);
  });

  it("deleteMcq removes attempts, choices, and the question", async () => {
    const created = await createSample();
    await recordAttempt(owner, created.id, created.choices[0]!.id);

    await expect(deleteMcq(owner, created.id)).resolves.toBe(true);
    await expect(getMcq(owner, created.id)).resolves.toBeNull();
    expect(mcqs.size).toBe(0);
    expect(choices.size).toBe(0);
    expect(attempts.size).toBe(0);
  });

  it("recordAttempt computes is_correct from the stored choice", async () => {
    const created = await createSample();
    const correct = created.choices.find((choice) => choice.isCorrect)!;
    const wrong = created.choices.find((choice) => !choice.isCorrect)!;

    const missed = await recordAttempt(owner, created.id, wrong.id);
    const hit = await recordAttempt(owner, created.id, correct.id);

    expect(missed.attempt.isCorrect).toBe(false);
    expect(missed.correctChoiceId).toBe(correct.id);
    expect(hit.attempt.isCorrect).toBe(true);
    expect(hit.correctChoiceId).toBe(correct.id);
    expect(hit.attempt.choiceId).toBe(correct.id);
    expect([...attempts.values()].map((row) => row.is_correct)).toEqual([0, 1]);
  });

  it("recordAttempt throws ChoiceMismatchError for a choice from another question", async () => {
    const first = await createSample();
    const second = await createMcq(owner, {
      name: "Other",
      question: "Different",
      choices: twoChoices,
    });

    await expect(
      recordAttempt(owner, first.id, second.choices[0]!.id),
    ).rejects.toBeInstanceOf(ChoiceMismatchError);
    expect(attempts.size).toBe(0);
  });

  it("throws InvalidChoiceSetError for fewer than 2, more than 6, or not exactly one correct choice", async () => {
    const oneChoice = [{ text: "Only", isCorrect: true }];
    const seven = Array.from({ length: 7 }, (_, index) => ({
      text: `Choice ${index}`,
      isCorrect: index === 0,
    }));
    const noneCorrect = [
      { text: "A", isCorrect: false },
      { text: "B", isCorrect: false },
    ];
    const twoCorrect = [
      { text: "A", isCorrect: true },
      { text: "B", isCorrect: true },
    ];

    await expect(
      createMcq(owner, { name: "Bad", question: "Q", choices: oneChoice }),
    ).rejects.toBeInstanceOf(InvalidChoiceSetError);
    await expect(
      createMcq(owner, { name: "Bad", question: "Q", choices: seven }),
    ).rejects.toBeInstanceOf(InvalidChoiceSetError);
    await expect(
      createMcq(owner, { name: "Bad", question: "Q", choices: noneCorrect }),
    ).rejects.toBeInstanceOf(InvalidChoiceSetError);
    await expect(
      createMcq(owner, { name: "Bad", question: "Q", choices: twoCorrect }),
    ).rejects.toBeInstanceOf(InvalidChoiceSetError);
    expect(mcqs.size).toBe(0);
  });
});

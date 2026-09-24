import { getDb } from "@/lib/db";

export class ChoiceMismatchError extends Error {
  constructor(message = "That choice does not belong to this question") {
    super(message);
    this.name = "ChoiceMismatchError";
  }
}

export class InvalidChoiceSetError extends Error {
  constructor(message = "Select exactly one correct answer and between 2 and 6 choices") {
    super(message);
    this.name = "InvalidChoiceSetError";
  }
}

export type McqChoiceInput = {
  text: string;
  isCorrect: boolean;
};

export type McqInput = {
  name: string;
  question: string;
  choices: McqChoiceInput[];
};

export type PublicChoice = {
  id: string;
  text: string;
  isCorrect: boolean;
  position: number;
};

export type PublicMcq = {
  id: string;
  name: string;
  question: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  choices: PublicChoice[];
};

export type McqListItem = {
  id: string;
  name: string;
  question: string;
  choiceCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PublicAttempt = {
  id: string;
  mcqId: string;
  choiceId: string;
  isCorrect: boolean;
  createdAt: string;
};

export type RecordAttemptResult = {
  attempt: PublicAttempt;
  correctChoiceId: string;
};

type McqRow = {
  id: string;
  name: string;
  question: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  choice_count?: number;
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

function trimText(value: string): string {
  return value.trim();
}

function assertValidChoiceSet(choices: McqChoiceInput[]): void {
  if (choices.length < 2 || choices.length > 6) {
    throw new InvalidChoiceSetError();
  }
  const correct = choices.filter((choice) => choice.isCorrect).length;
  if (correct !== 1) {
    throw new InvalidChoiceSetError();
  }
}

function toPublicChoice(row: ChoiceRow): PublicChoice {
  return {
    id: row.id,
    text: row.choice_text,
    isCorrect: row.is_correct === 1,
    position: row.position,
  };
}

function toPublicMcq(row: McqRow, choiceRows: ChoiceRow[]): PublicMcq {
  return {
    id: row.id,
    name: row.name,
    question: row.question,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    choices: choiceRows
      .slice()
      .sort((left, right) => left.position - right.position)
      .map(toPublicChoice),
  };
}

function toPublicAttempt(row: AttemptRow): PublicAttempt {
  return {
    id: row.id,
    mcqId: row.mcq_id,
    choiceId: row.choice_id,
    isCorrect: row.is_correct === 1,
    createdAt: row.created_at,
  };
}

function toListItem(row: McqRow): McqListItem {
  return {
    id: row.id,
    name: row.name,
    question: row.question,
    choiceCount: Number(row.choice_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getMcqRow(userId: string, id: string): Promise<McqRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT id, name, question, created_by, created_at, updated_at
       FROM mcqs WHERE id = ?1 AND created_by = ?2`,
    )
    .bind(id, userId)
    .all<McqRow>();

  return results[0] ?? null;
}

async function getChoiceRows(mcqId: string): Promise<ChoiceRow[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT id, mcq_id, choice_text, is_correct, position, created_at
       FROM mcq_choices WHERE mcq_id = ?1 ORDER BY position ASC`,
    )
    .bind(mcqId)
    .all<ChoiceRow>();

  return results;
}

function choiceInserts(
  db: Awaited<ReturnType<typeof getDb>>,
  mcqId: string,
  choices: McqChoiceInput[],
) {
  return choices.map((choice, position) =>
    db
      .prepare(
        `INSERT INTO mcq_choices (id, mcq_id, choice_text, is_correct, position)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
      .bind(
        crypto.randomUUID(),
        mcqId,
        trimText(choice.text),
        choice.isCorrect ? 1 : 0,
        position,
      ),
  );
}

export async function createMcq(
  userId: string,
  input: McqInput,
): Promise<PublicMcq> {
  assertValidChoiceSet(input.choices);

  const id = crypto.randomUUID();
  const name = trimText(input.name);
  const question = trimText(input.question);
  const db = await getDb();

  await db.batch([
    db
      .prepare(
        `INSERT INTO mcqs (id, name, question, created_by)
         VALUES (?1, ?2, ?3, ?4)`,
      )
      .bind(id, name, question, userId),
    ...choiceInserts(db, id, input.choices),
  ]);

  const created = await getMcq(userId, id);
  if (!created) {
    throw new Error("Failed to load question after insert");
  }
  return created;
}

export async function getMcq(
  userId: string,
  id: string,
): Promise<PublicMcq | null> {
  const row = await getMcqRow(userId, id);
  if (!row) {
    return null;
  }
  return toPublicMcq(row, await getChoiceRows(id));
}

export async function listMcqs(userId: string): Promise<McqListItem[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT id, name, question, created_by, created_at, updated_at,
              (SELECT COUNT(*) FROM mcq_choices WHERE mcq_id = mcqs.id) AS choice_count
       FROM mcqs WHERE created_by = ?1 ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<McqRow>();

  return results.map(toListItem);
}

export async function updateMcq(
  userId: string,
  id: string,
  input: McqInput,
): Promise<PublicMcq | null> {
  assertValidChoiceSet(input.choices);

  const existing = await getMcqRow(userId, id);
  if (!existing) {
    return null;
  }

  const name = trimText(input.name);
  const question = trimText(input.question);
  const db = await getDb();

  await db.batch([
    db.prepare(`DELETE FROM mcq_attempts WHERE mcq_id = ?1`).bind(id),
    db.prepare(`DELETE FROM mcq_choices WHERE mcq_id = ?1`).bind(id),
    db
      .prepare(
        `UPDATE mcqs SET name = ?1, question = ?2, updated_at = datetime('now')
         WHERE id = ?3 AND created_by = ?4`,
      )
      .bind(name, question, id, userId),
    ...choiceInserts(db, id, input.choices),
  ]);

  return getMcq(userId, id);
}

export async function deleteMcq(userId: string, id: string): Promise<boolean> {
  const existing = await getMcqRow(userId, id);
  if (!existing) {
    return false;
  }

  const db = await getDb();
  await db.batch([
    db.prepare(`DELETE FROM mcq_attempts WHERE mcq_id = ?1`).bind(id),
    db.prepare(`DELETE FROM mcq_choices WHERE mcq_id = ?1`).bind(id),
    db
      .prepare(`DELETE FROM mcqs WHERE id = ?1 AND created_by = ?2`)
      .bind(id, userId),
  ]);

  return true;
}

export async function recordAttempt(
  userId: string,
  id: string,
  choiceId: string,
): Promise<RecordAttemptResult> {
  const mcq = await getMcq(userId, id);
  if (!mcq) {
    throw new ChoiceMismatchError();
  }

  const selected = mcq.choices.find((choice) => choice.id === choiceId);
  if (!selected) {
    throw new ChoiceMismatchError();
  }

  const correctChoiceId = mcq.choices.find((choice) => choice.isCorrect)?.id;
  if (!correctChoiceId) {
    throw new InvalidChoiceSetError();
  }

  const attemptId = crypto.randomUUID();
  const isCorrect = selected.isCorrect ? 1 : 0;
  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO mcq_attempts (id, mcq_id, choice_id, attempted_by, is_correct)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    )
    .bind(attemptId, id, choiceId, userId, isCorrect)
    .run();

  const { results } = await db
    .prepare(
      `SELECT id, mcq_id, choice_id, attempted_by, is_correct, created_at
       FROM mcq_attempts WHERE mcq_id = ?1`,
    )
    .bind(id)
    .all<AttemptRow>();

  const row = results.find((attempt) => attempt.id === attemptId);
  if (!row) {
    throw new Error("Failed to load attempt after insert");
  }

  return {
    attempt: toPublicAttempt(row),
    correctChoiceId,
  };
}

export async function listAttempts(
  userId: string,
  id: string,
): Promise<PublicAttempt[] | null> {
  const existing = await getMcqRow(userId, id);
  if (!existing) {
    return null;
  }

  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT id, mcq_id, choice_id, attempted_by, is_correct, created_at
       FROM mcq_attempts WHERE mcq_id = ?1 ORDER BY created_at DESC`,
    )
    .bind(id)
    .all<AttemptRow>();

  return results.map(toPublicAttempt);
}

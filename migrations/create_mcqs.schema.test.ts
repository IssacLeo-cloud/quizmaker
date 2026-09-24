import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

function mcqsMigrationSql(): string {
  expect(existsSync(MIGRATIONS_DIR)).toBe(true);

  const files = readdirSync(MIGRATIONS_DIR).filter(
    (name) => name.endsWith(".sql") && name.includes("create_mcqs"),
  );
  expect(files.length).toBeGreaterThan(0);

  return files
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"))
    .join("\n");
}

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

describe("mcqs migration", () => {
  it("creates mcqs, mcq_choices, and mcq_attempts with columns, foreign keys, and indexes", () => {
    const sql = compactSql(mcqsMigrationSql());

    expect(sql).toContain("create table mcqs");
    expect(sql).toContain("create table mcq_choices");
    expect(sql).toContain("create table mcq_attempts");

    for (const column of [
      "id",
      "name",
      "question",
      "created_by",
      "created_at",
      "updated_at",
    ]) {
      expect(sql).toContain(column);
    }

    expect(sql).toContain("name text not null");
    expect(sql).toContain("question text not null");
    expect(sql).toContain(
      "created_by text not null references users (id) on delete cascade",
    );

    expect(sql).toContain("mcq_id text not null references mcqs (id) on delete cascade");
    expect(sql).toContain("choice_text text not null");
    expect(sql).toContain("is_correct integer not null");
    expect(sql).toContain("check (is_correct in (0, 1))");
    expect(sql).toContain("position integer not null");
    expect(sql).toContain(
      "choice_id text not null references mcq_choices (id) on delete cascade",
    );
    expect(sql).toContain(
      "attempted_by text not null references users (id) on delete cascade",
    );

    expect(sql).toContain("create index idx_mcqs_created_by on mcqs (created_by)");
    expect(sql).toContain(
      "create index idx_mcq_choices_mcq_id on mcq_choices (mcq_id)",
    );
    expect(sql).toContain(
      "create unique index idx_mcq_choices_mcq_id_position on mcq_choices (mcq_id, position)",
    );
    expect(sql).toContain(
      "create index idx_mcq_attempts_mcq_id on mcq_attempts (mcq_id)",
    );
    expect(sql).toContain(
      "create index idx_mcq_attempts_attempted_by on mcq_attempts (attempted_by)",
    );
  });
});

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

function usersMigrationSql(): string {
  expect(existsSync(MIGRATIONS_DIR)).toBe(true);

  const files = readdirSync(MIGRATIONS_DIR).filter(
    (name) => name.endsWith(".sql") && name.includes("create_users"),
  );
  expect(files.length).toBeGreaterThan(0);

  return files
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"))
    .join("\n");
}

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

describe("users migration", () => {
  it("creates the users table with required columns, uniqueness, and indexes", () => {
    const sql = compactSql(usersMigrationSql());

    expect(sql).toContain("create table users");

    for (const column of [
      "id",
      "username",
      "first_name",
      "last_name",
      "email",
      "password_hash",
      "created_at",
      "updated_at",
    ]) {
      expect(sql).toContain(column);
    }

    expect(sql).toContain("username text not null unique");
    expect(sql).toContain("email text not null unique");
    expect(sql).toContain("password_hash text not null");
    expect(sql).toContain("create index idx_users_email on users (email)");
    expect(sql).toContain("create index idx_users_username on users (username)");
  });
});

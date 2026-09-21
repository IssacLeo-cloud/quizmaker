import { getDb } from "@/lib/db";
import {
  hashPassword,
  verifyPassword as verifyPasswordHash,
} from "@/lib/password";

export class DuplicateEmailError extends Error {
  constructor(message = "An account with this email already exists") {
    super(message);
    this.name = "DuplicateEmailError";
  }
}

export type PublicUser = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export type UpdateUserInput = {
  firstName: string;
  lastName: string;
};

type UserRow = {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

const DUMMY_PASSWORD_HASH =
  "pbkdf2$sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function trimName(value: string): string {
  return value.trim();
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && /unique constraint failed/i.test(error.message)
  );
}

async function getUserRowByEmail(email: string): Promise<UserRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT id, username, first_name, last_name, email, password_hash, created_at, updated_at
       FROM users WHERE email = ?1`,
    )
    .bind(email)
    .all<UserRow>();

  return results[0] ?? null;
}

async function getUserRowById(id: string): Promise<UserRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT id, username, first_name, last_name, email, password_hash, created_at, updated_at
       FROM users WHERE id = ?1`,
    )
    .bind(id)
    .all<UserRow>();

  return results[0] ?? null;
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const email = normalizeEmail(input.email);
  const username = email;
  const firstName = trimName(input.firstName);
  const lastName = trimName(input.lastName);
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);

  const db = await getDb();
  try {
    await db
      .prepare(
        `INSERT INTO users (id, username, first_name, last_name, email, password_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
      .bind(id, username, firstName, lastName, email, passwordHash)
      .run();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateEmailError();
    }
    throw error;
  }

  const row = await getUserRowById(id);
  if (!row) {
    throw new Error("Failed to load user after insert");
  }

  return toPublicUser(row);
}

export async function getUserByEmail(
  email: string,
): Promise<PublicUser | null> {
  const row = await getUserRowByEmail(normalizeEmail(email));
  return row ? toPublicUser(row) : null;
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const row = await getUserRowById(id);
  return row ? toPublicUser(row) : null;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<PublicUser | null> {
  const db = await getDb();
  await db
    .prepare(
      `UPDATE users SET first_name = ?1, last_name = ?2, updated_at = datetime('now')
       WHERE id = ?3`,
    )
    .bind(trimName(input.firstName), trimName(input.lastName), id)
    .run();

  return getUserById(id);
}

export async function deleteUser(id: string): Promise<void> {
  const db = await getDb();
  await db.prepare(`DELETE FROM users WHERE id = ?1`).bind(id).run();
}

export async function verifyPassword(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const row = await getUserRowByEmail(normalizeEmail(email));
  const matches = await verifyPasswordHash(
    password,
    row?.password_hash ?? DUMMY_PASSWORD_HASH,
  );

  if (!row || !matches) {
    return null;
  }

  return toPublicUser(row);
}

vi.mock("server-only", () => ({}));

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

const { rows, resetRows, getCloudflareContext } = vi.hoisted(() => {
  const rows = new Map<string, UserRow>();
  let clock = 0;

  function nextTimestamp() {
    clock += 1;
    return `2026-01-01 00:00:${String(clock).padStart(2, "0")}`;
  }

  function runQuery(sql: string, params: unknown[]) {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("insert into users")) {
      const [id, username, first_name, last_name, email, password_hash] =
        params as string[];

      for (const row of rows.values()) {
        if (row.email === email || row.username === username) {
          throw new Error("UNIQUE constraint failed: users.email");
        }
      }

      const timestamp = nextTimestamp();
      rows.set(id, {
        id,
        username,
        first_name,
        last_name,
        email,
        password_hash,
        created_at: timestamp,
        updated_at: timestamp,
      });
      return { results: [] as UserRow[], changes: 1 };
    }

    if (normalized.startsWith("select") && normalized.includes("from users where email")) {
      const email = String(params[0]);
      const row = [...rows.values()].find((entry) => entry.email === email);
      return { results: row ? [row] : [], changes: 0 };
    }

    if (normalized.startsWith("select") && normalized.includes("from users where id")) {
      const row = rows.get(String(params[0]));
      return { results: row ? [row] : [], changes: 0 };
    }

    if (normalized.startsWith("update users")) {
      const id = String(params[params.length - 1]);
      const row = rows.get(id);
      if (!row) {
        return { results: [] as UserRow[], changes: 0 };
      }
      row.first_name = String(params[0]);
      row.last_name = String(params[1]);
      row.updated_at = nextTimestamp();
      return { results: [], changes: 1 };
    }

    if (normalized.startsWith("delete from users")) {
      const existed = rows.delete(String(params[0]));
      return { results: [] as UserRow[], changes: existed ? 1 : 0 };
    }

    throw new Error(`Unsupported SQL in fake D1: ${sql}`);
  }

  const quizmaker = {
    prepare(sql: string) {
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
    },
  };

  return {
    rows,
    resetRows() {
      rows.clear();
      clock = 0;
    },
    getCloudflareContext: vi.fn(async () => ({
      env: { quizmaker },
    })),
  };
});

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext,
}));

import {
  DuplicateEmailError,
  createUser,
  deleteUser,
  getUserByEmail,
  getUserById,
  updateUser,
  verifyPassword,
} from "@/lib/services/users";

const ada = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "  Ada@School.EDU  ",
  password: "at-least-8-chars",
};

describe("user service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRows();
  });

  it("createUser stores a normalized email, matching username, and a hash not the password", async () => {
    const user = await createUser(ada);

    expect(user.email).toBe("ada@school.edu");
    expect(user.username).toBe("ada@school.edu");
    expect(user.firstName).toBe("Ada");
    expect(user.lastName).toBe("Lovelace");
    expect(user).not.toHaveProperty("password_hash");
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("password");

    const stored = [...rows.values()][0];
    expect(stored).toBeDefined();
    expect(stored.email).toBe("ada@school.edu");
    expect(stored.username).toBe("ada@school.edu");
    expect(stored.password_hash).not.toBe(ada.password);
    expect(stored.password_hash).toMatch(/^pbkdf2\$/);
  });

  it("public reads omit password_hash", async () => {
    const created = await createUser(ada);

    const byEmail = await getUserByEmail(ada.email);
    const byId = await getUserById(created.id);

    expect(byEmail).toEqual(created);
    expect(byId).toEqual(created);
    expect(byEmail).not.toHaveProperty("password_hash");
    expect(byId).not.toHaveProperty("password_hash");
  });

  it("createUser throws a duplicate-email conflict the API can map to 409", async () => {
    await createUser(ada);

    await expect(
      createUser({
        ...ada,
        firstName: "Other",
        email: "ADA@school.edu",
      }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
  });

  it("getUserByEmail and getUserById return null when the user is missing", async () => {
    await expect(getUserByEmail("nobody@school.edu")).resolves.toBeNull();
    await expect(
      getUserById("00000000-0000-0000-0000-000000000000"),
    ).resolves.toBeNull();
  });

  it("updateUser changes name fields and bumps updated_at", async () => {
    const created = await createUser(ada);

    const updated = await updateUser(created.id, {
      firstName: " Ada ",
      lastName: " Byron ",
    });

    expect(updated).not.toBeNull();
    expect(updated?.firstName).toBe("Ada");
    expect(updated?.lastName).toBe("Byron");
    expect(updated?.updatedAt).not.toBe(created.updatedAt);
    expect(updated?.createdAt).toBe(created.createdAt);
  });

  it("deleteUser removes the row", async () => {
    const created = await createUser(ada);

    await deleteUser(created.id);

    await expect(getUserById(created.id)).resolves.toBeNull();
    expect(rows.size).toBe(0);
  });

  it("verifyPassword succeeds only for the correct password", async () => {
    await createUser(ada);

    const matched = await verifyPassword(ada.email, ada.password);
    const wrongPassword = await verifyPassword(ada.email, "wrong-password");
    const unknownEmail = await verifyPassword(
      "nobody@school.edu",
      ada.password,
    );

    expect(matched?.email).toBe("ada@school.edu");
    expect(matched).not.toHaveProperty("password_hash");
    expect(wrongPassword).toBeNull();
    expect(unknownEmail).toBeNull();
  });
});

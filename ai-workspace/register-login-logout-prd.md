Date created: 2026-09-17
Date last modified: 2026-09-17

# Register, Login, and Logout - Technical PRD

This is the first slice of Greenfield QuizMaker. Teachers will later collaborate on a bank of multiple-choice questions. This sprint only gives those teachers an account they can register, sign in, and sign out with. Quiz authoring is the next sprint.

---

## Overview/Problem

QuizMaker is a greenfield app. Multiple teachers need to be distinct users so later work can attach a question bank to a real instructor. Today there is no database, no user table, and no way to register, log in, or log out.

Without a stored instructor identity (name, email, hashed password), the MCQ collaboration work has nobody to belong to. This feature adds a `users` table, a small user service, and HTTP APIs plus pages for register, login, and logout. After a successful login the instructor lands on a stub home page. That stub is a placeholder for MCQ tools, which are not built here.

---

## Hypothesis

We believe that a D1-backed teacher account with hashed passwords, a tiny user service, and register / login / logout HTTP endpoints will give QuizMaker a usable identity baseline so the next sprint can build MCQ authoring on top of real users.

---

## Scope

### In Scope

- Cloudflare D1 database, bound as `DB`, with a `users` migration
- User row fields: personal name (`first_name`, `last_name`), `email`, and `password_hash`
- Email as the login identifier. Store `username` equal to the normalized email so later features have a stable handle without a second form field
- Hash the password on the server before insert. Never persist plaintext. Compare using the stored hash at login
- Tiny user service in `src/lib/services/` with create, read, update, delete, and password verify
- HTTP APIs: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- Pages: `/register`, `/login`, `/logout`, and a stub instructor home at `/`
- Zod validation on all API input (propose `zod` before installing; it is not in the repo yet)
- Apply the migration locally only (`--local`)
- Vitest as the test harness (already installed). Every implementation phase is **red then green**: write that phase's tests first (they must fail), implement until `npm run test` is green, then check the acceptance criteria. A phase is not COMPLETED on inspection alone.

### Out of Scope

- MCQ create / edit / take UI, quiz tables, and question-bank collaboration
- Social login (Google, Microsoft, etc.)
- Tokens (JWT or otherwise)
- Session management, cookies, middleware route guards, "remember me"
- Frontend password hashing (explicitly deferred; server-side hash is this sprint)
- Email verification, password reset, MFA
- Student or admin roles
- Public HTTP for update / delete user (unsafe without sessions)
- Remote D1 migration apply
- Deploy to Cloudflare

### Cut

- **Auto-login after register** — there is no session to establish; redirect to `/login` instead
- **Separate username field on the form** — login is by email; the service copies normalized email into `username`
- **Exposing GET / PUT / DELETE `/api/users` this sprint** — those cannot be authorized without sessions; keep them as service methods only
- **bcrypt or extra hashing library** — use Web Crypto PBKDF2 so we do not add a dependency unless asked later
- **Session cookies "while we are here"** — product explicitly deferred cookies, tokens, and session management
- **`@cloudflare/vitest-pool-workers`** — unit tests mock D1 via `src/lib/`; a Workers test pool changes how the whole suite runs and is not needed for this slice

---

## Technical Requirements

### Database Schema

Database: Cloudflare D1 (SQLite). Binding name: `DB`. Suggested database name when created: `quizmaker`.

Add the `d1_databases` block to `wrangler.jsonc` after `npx wrangler d1 create quizmaker`, then run `npm run cf-typegen`.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_username ON users (username);
```

| Column | Type | Rules |
|--------|------|--------|
| `id` | TEXT PK | Generate in application code (`crypto.randomUUID()`) |
| `username` | TEXT UNIQUE NOT NULL | Must equal `email` after `trim` + lowercase |
| `first_name` | TEXT NOT NULL | Trimmed |
| `last_name` | TEXT NOT NULL | Trimmed |
| `email` | TEXT UNIQUE NOT NULL | Valid email, stored lowercase |
| `password_hash` | TEXT NOT NULL | PBKDF2 payload (algorithm, iterations, salt, hash) — not the raw password |
| `created_at` / `updated_at` | TEXT | SQLite `datetime('now')` |

**Invariants (enforced in the user service, not only in SQL):**

- `username === email` after normalization (`trim` + lowercase)
- Password is hashed before any insert or password update
- API responses never include `password_hash`

Migration workflow (from `.cursor/rules/d1.mdc`):

1. `npx wrangler d1 migrations create quizmaker create_users`
2. Put the `CREATE TABLE` SQL in the generated file under `migrations/`
3. `npx wrangler d1 migrations apply quizmaker --local`
4. Never apply with `--remote` unless the user explicitly asks

### API Endpoints

All routes are Next.js App Router handlers under `src/app/api/`. They call the user service; they do not run SQL themselves.

The product asked for HTTP endpoints rather than Server Actions for this slice, so register / login / logout are route handlers. Forms POST to these APIs.

Public JSON user shape (never includes `password_hash`):

```json
{
  "id": "uuid",
  "username": "instructor@school.edu",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "instructor@school.edu",
  "createdAt": "2026-09-17 12:00:00",
  "updatedAt": "2026-09-17 12:00:00"
}
```

---

#### POST /api/auth/register

Creates a teacher account.

**Request body:**

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "instructor@school.edu",
  "password": "at-least-8-chars"
}
```

**Validation:**

- `firstName`, `lastName`: non-empty strings, max 100 chars
- `email`: valid email; normalized to lowercase
- `password`: string, minimum 8 characters
- Service sets `username` to the normalized email
- Hash the password, then insert. Never write the plaintext password

**Response:**

- Success (201): `{ "user": { ...public user } }`
- Error (400): validation failure `{ "error": "..." }`
- Error (409): email already registered `{ "error": "An account with this email already exists" }`
- Error (500): unexpected server error `{ "error": "Unable to register" }`

---

#### POST /api/auth/login

Looks up the user by email, hashes the submitted password with the stored salt, and compares against `password_hash`. Does **not** create a session, cookie, or token.

**Request body:**

```json
{
  "email": "instructor@school.edu",
  "password": "at-least-8-chars"
}
```

**Response:**

- Success (200): `{ "user": { ...public user } }`
- Error (400): validation failure
- Error (401): `{ "error": "Invalid email or password" }` (same message whether the email is unknown or the password is wrong)
- Error (500): `{ "error": "Unable to log in" }`

---

#### POST /api/auth/logout

No session to destroy. Exists so the client has a stable contract for "sign out" and so the next sprint can add real session invalidation behind the same URL.

**Request body:** none (empty JSON object allowed)

**Response:**

- Success (200): `{ "ok": true }`

---

#### User service methods (not public HTTP this sprint)

The user service is the only module that talks to D1 for users. Route handlers and later features call these methods.

| Method | Behavior |
|--------|----------|
| `createUser` | Hash password, insert row; used by register |
| `getUserById` / `getUserByEmail` | Read; omit hash from the returned public type |
| `updateUser` | Update name fields (and later password); no HTTP this sprint |
| `deleteUser` | Delete by id; no HTTP this sprint |
| `verifyPassword` | Compare submitted password to stored hash; used by login |

Do not add `GET` / `PUT` / `DELETE` `/api/users/:id` until sessions can authorize the caller.

### User Interface Requirements

Use existing shadcn/ui: `button`, `card`, `field`, `input`, `label`. Add components with `npx shadcn@latest add @shadcn/<name>` if something is missing. Ask before adding npm packages. Do not introduce `react-hook-form`.

#### Register (`/register`)

- Fields: first name, last name, email, password, confirm password
- Confirm password is UI-only; not sent to the API
- Client validation: required fields, email format, password min 8, passwords match
- Submit `POST /api/auth/register`
- Success: redirect to `/login` with a simple success hint (query or message)
- Errors: show API / validation message on the form
- Link to `/login`

#### Login (`/login`)

- Fields: email, password
- Submit `POST /api/auth/login`
- Success: navigate to `/` (the MCQ stub / instructor home placeholder)
- Failure: generic invalid-credentials message
- Link to `/register`

#### Logout (`/logout`)

- Short confirmation that the instructor is signed out
- Call `POST /api/auth/logout`
- Clear any client-only display of the last user
- Link / redirect to `/login`

#### Instructor home placeholder (`/`)

- After a successful login, this is the landing page
- Copy should make clear this is the instructor home and that quiz / MCQ making is next
- No quiz editor, no quiz list backed by a table
- Links to login / register if the visitor did not just sign in
- Because there is no session, a refresh cannot prove who is signed in; do not fake a protected dashboard

**Client vs server:** forms need `'use client'` only at the form component. Database and hashing stay in `src/lib/` and must never be imported into client components. Frontend hashing of the password before submit is out of scope.

---

## Testing Strategy

Preferred framework: **Vitest** with jsdom (`.cursor/skills/testing/SKILL.md`). The harness is installed. There are no product tests yet (`passWithNoTests` is on until Phase 1 writes the first real test).

Each phase is **test-first**. Tests at the beginning of a phase are supposed to be **red**. Implementation turns them **green**. That color change, plus the acceptance criteria, is the signal the phase is done.

### Red → green cycle (every phase except the Phase 5 gate)

Do this in order. Do not skip Red.

1. **Red — write tests first.** Add the files listed on that phase. Import the modules, routes, or components the phase will create. Assert the behaviors in the table. Run `npm run test`.
2. **Confirm red.** The new tests must fail for a real reason: missing file, missing export, missing SQL, wrong status, wrong payload. If they pass before the feature exists, they cannot fail — rewrite them.
3. **Implement** only enough to make those tests pass (plus the phase's D1 / Wrangler steps where Vitest cannot reach).
4. **Green — re-run `npm run test`.** Prior phases must stay green. The new tests must now pass.
5. **Acceptance.** Mark the acceptance-criteria checkboxes that this phase covers. A green suite with unmet acceptance criteria is not done; passing checkboxes with a red suite is not done.

If a test is still red after the intended implementation, the phase is not complete. If you change behavior later, update the tests in the same change so they go red for the old contract and green for the new one.

**Phase 5** does not invent a new product surface. The suite should already be green. A preview bug starts a mini-cycle: write a regression test (red) → fix (green).

### Harness (installed before Phase 1)

Installed as devDependencies: `vitest`, `@vitejs/plugin-react@5` (v5, not v6 — v6 needs Babel 8 and conflicts with shadcn's Babel 7), `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `vite-tsconfig-paths`.

Config: `vitest.config.ts` (jsdom, globals, `@/` via `vite-tsconfig-paths`, `passWithNoTests: true` until the first real test exists). Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`. TypeScript: `vitest/globals` is listed in `tsconfig.json` `compilerOptions.types`. Turn `passWithNoTests` off as soon as Phase 1's schema test exists so an empty suite cannot look green.

### Rules

- Colocate: `src/lib/password.ts` → `src/lib/password.test.ts`; client forms → `*.test.tsx`
- Prove observable behavior. Never `expect(true).toBe(true)` or assertions that cannot fail
- Cover failure paths, not only the happy path
- Each test must pass alone. `vi.clearAllMocks()` in `beforeEach`
- Unit tests never reach a real network, real D1, or a real model provider
- Mock `getCloudflareContext()` (it does not work under jsdom) and keep D1 behind `src/lib/` so tests mock that module rather than the prepared-statement chain
- Stub `server-only` when importing server modules: `vi.mock("server-only", () => ({}))`
- Server Components cannot be rendered by Testing Library. Test their data logic as functions; reserve `render` for client forms
- Query by role and accessible name. Prefer `userEvent` over `fireEvent`

### What we do not test this sprint

- Real Workers runtime / live D1 (that is `npm run preview` plus manual checks in Phase 5)
- Visual layout, theming, and shadcn internals
- Session cookies and route guards (out of scope)

### Phase-exit gate

A phase is COMPLETED only when:

1. That phase's tests were written first and observed **red**
2. Implementation made those tests **green** (`npm run test` passes, including earlier phases)
3. The acceptance criteria this phase owns are checked off

| Phase | Tests start | Expected first `npm run test` | Done when |
|-------|-------------|-------------------------------|-----------|
| 1 | Schema contract test | Red: no migration SQL, or SQL missing required columns / uniqueness | Green schema test + local D1 apply |
| 2 | Password + user service tests | Red: modules missing or hash/CRUD behavior wrong | Green service tests |
| 3 | Zod + register / login / logout route tests | Red: handlers missing or wrong status / body | Green API tests |
| 4 | Client form tests | Red: forms missing or validation / navigation wrong | Green UI tests |
| 5 | Full suite + any new regression test | Suite green; a new bug's test starts red | Green suite + lint + build + preview notes |

---

## Implementation Phases

### Phase 1: D1 and users migration - COMPLETED

**Objective**: Database exists locally with a `users` table. Schema contract tests go red, then green.

**Red (write first, confirm fail):**

Turn off `passWithNoTests` in `vitest.config.ts`. Add the contract test before the migration SQL exists (or before it is complete). `npm run test` must be red.

| File | What it proves | Why it is red first |
|------|----------------|---------------------|
| `migrations/create_users.schema.test.ts` (name may follow the wrangler-generated SQL file) | The migration SQL creates `users` with `id`, `username`, `first_name`, `last_name`, `email`, `password_hash`, timestamps, and unique constraints / indexes on email and username | File missing, or SQL missing a required column / `UNIQUE` |

Do not mock a database. This asserts the SQL file we will apply. Applying `--local` is a Wrangler step, not a Vitest step.

**Implement:**

1. Propose and add D1: `npx wrangler d1 create quizmaker` (user must be able to run Wrangler locally)
2. Add `d1_databases` binding `DB` to `wrangler.jsonc`
3. Run `npm run cf-typegen`
4. Create migration `create_users`, put the PRD `CREATE TABLE` in the generated file, apply with `--local` only

**Green / acceptance:**

- `npm run test` green (schema test passes; empty suite can no longer pass)
- Acceptance: local D1 has a `users` table from a migration

**Deliverables**:

- D1 binding in `wrangler.jsonc`
- `migrations/` SQL for `users`
- Typed `env.DB`
- Schema contract test observed red, then green

### Phase 2: Tiny user service and password hashing - PLANNED

**Objective**: Server-only module can create, read, update, and delete users, and verify passwords against hashes.

**Red (write first, confirm fail):**

Write colocated tests that import the modules this phase will create. Mock D1 / `getCloudflareContext()`, never a real database. `npm run test` must be red (missing modules or failing assertions). Phase 1 tests stay green.

| File | What it proves | Why it is red first |
|------|----------------|---------------------|
| `src/lib/password.test.ts` | Hash payload is not the plaintext password; same password verifies; wrong password does not; two hashes of the same password are not identical (salt); malformed payload fails closed | `password.ts` missing or hash/verify wrong |
| `src/lib/services/users.test.ts` | `createUser` stores normalized lowercase email, sets `username` equal to that email, and persists a hash not the password; public reads omit `password_hash`; duplicate email is a conflict the API can map to 409; `getUserByEmail` / `getUserById` return the user or null; `updateUser` changes name fields and bumps `updated_at`; `deleteUser` removes the row; `verifyPassword` succeeds only for the correct password | `users.ts` missing or CRUD/verify wrong |

Use an in-memory fake for the D1 module in `src/lib/` (or a mock `env.DB`) so create → read → update → delete can be asserted without Wrangler.

**Implement:**

1. Password helper using Web Crypto PBKDF2 (salt + hash encoded in `password_hash`)
2. `src/lib/services/users.ts` (or similar) with create / read / update / delete / verify
3. Prepared statements with numbered placeholders (`?1`, `?2`)
4. Access D1 via `getCloudflareContext()` then `env.DB`, centralized in `src/lib/`

**Green / acceptance:**

- `npm run test` green (Phase 1 + Phase 2)
- Acceptance owned here: username equals normalized email; stored value is a hash not plaintext; public type omits `password_hash`

**Deliverables**:

- Hashing module
- User service module
- Public user type that excludes `password_hash`
- Password and user-service tests observed red, then green

### Phase 3: Register, login, logout APIs - PLANNED

**Objective**: HTTP surface for the three auth operations.

**Red (write first, confirm fail):**

Write tests that call `POST` handlers with `Request` objects. Mock the user service, not D1. Propose `zod` before installing it; tests can import the validator path that will exist. `npm run test` must be red. Earlier phases stay green.

| File | What it proves | Why it is red first |
|------|----------------|---------------------|
| `src/lib/validators/auth.test.ts` | Register schema rejects empty names, invalid email, and password shorter than 8; accepts a valid body; login schema rejects missing fields | Validator missing or too permissive |
| `src/app/api/auth/register/route.test.ts` | 201 returns public user and no `password_hash`; 400 on validation failure; 409 when the service reports a duplicate email; 500 on unexpected throw | Route missing or wrong status / body |
| `src/app/api/auth/login/route.test.ts` | 200 on verify success with public user; 401 with the **same** generic message for unknown email and wrong password; 400 on invalid body; response never includes `password_hash` | Route missing, or 401 messages differ |
| `src/app/api/auth/logout/route.test.ts` | 200 `{ "ok": true }` with no user service call required | Route missing or wrong payload |

These tests are the automated signal for the API acceptance criteria. If status codes or error payloads change, update the tests in the same change (they go red, then green again).

**Implement:**

1. Propose adding `zod`, then add Zod schemas for register and login bodies
2. `POST /api/auth/register`
3. `POST /api/auth/login`
4. `POST /api/auth/logout`
5. Map unique-constraint failures to 409

**Green / acceptance:**

- `npm run test` green (Phases 1–3)
- Acceptance owned here: 201 / 400 / 409 register; 200 / 401 login (same generic message); logout `200 { "ok": true }`; responses never include `password_hash`

**Deliverables**:

- Route handlers under `src/app/api/auth/`
- Validator and route tests observed red, then green

### Phase 4: Auth pages and home placeholder - PLANNED

**Objective**: Teachers can complete the flows in the browser and land on the MCQ stub.

**Red (write first, confirm fail):**

Write Testing Library tests for the client forms. Mock `fetch` / navigation, not D1. Query by role and accessible name. `npm run test` must be red. Earlier phases stay green.

| File | What it proves | Why it is red first |
|------|----------------|---------------------|
| `src/components/auth/register-form.test.tsx` | Renders first name, last name, email, password, confirm password; client validation blocks submit when passwords do not match or password is too short; successful submit POSTs JSON **without** confirm password; on 201, navigates toward `/login` | Form missing or validation / POST shape wrong |
| `src/components/auth/login-form.test.tsx` | Submits email and password to `/api/auth/login`; on 200, navigates to `/`; on 401, shows the generic invalid-credentials message | Form missing or navigation / error copy wrong |
| `src/components/auth/logout-panel.test.tsx` (or equivalent) | Calls `POST /api/auth/logout` and exposes a path back to `/login` | Panel missing or does not call logout |
| Home placeholder (small exported copy or presentational child — do not `render` a Server Component) | Instructor home stub: quiz-making is next, not a quiz editor | Stub copy missing or still the starter home |

If a page file is a thin Server Component wrapper, test the client child; do not force-render the page module.

**Implement:**

1. `/register` page and form
2. `/login` page and form
3. `/logout` page
4. Replace starter home content at `/` with the instructor / MCQ placeholder
5. Links between the three auth pages and home

**Green / acceptance:**

- `npm run test` green (Phases 1–4)
- Acceptance owned here: `/register`, `/login`, `/logout` complete the flows; successful login lands on `/` placeholder; client components do not import D1 or hashing

**Deliverables**:

- App Router pages
- Forms using shadcn/ui `field` primitives
- Client-form tests observed red, then green

### Phase 5: Verify - PLANNED

**Objective**: Prove the slice works before calling it done. The suite should already be **green**. Preview covers real D1 / Workers. A new bug starts a red → green mini-cycle.

**Red (only if preview finds a bug):**

Write or tighten a Vitest case in the matching phase's file first. `npm run test` must go red for that bug. Then fix.

**Gate (suite already green):**

1. `npm run test` — full suite green (schema + password + user service + APIs + forms)
2. `npm run lint`
3. `npm run build`
4. Manual flow against `npm run preview`: register → row in local D1 with hash → login success → home stub → logout → login failure with bad password
5. Confirm duplicate email returns 409 (API test already covers this; confirm once on preview)

**Green / acceptance:**

- `npm run test`, `npm run lint`, and `npm run build` succeed (report actual results)
- Remaining acceptance criteria checked off
- Any preview bug has a regression test that went red, then green

**Deliverables**:

- Reported `npm run test` / `lint` / `build` results
- Manual preview notes
- Regression tests for any preview bugs

**Status Markers**:

- PLANNED - Not started yet
- IN PROGRESS / RED - Phase tests written; `npm run test` failing as expected
- IN PROGRESS / GREEN - Implementation made this phase's tests pass; still confirming acceptance
- COMPLETED - Tests green, earlier phases still green, this phase's acceptance criteria checked

---

## Technical Implementation Details

### Key Files (planned)

- `wrangler.jsonc` - D1 `DB` binding
- `migrations/0001_create_users.sql` - (name will match wrangler output) schema
- `src/lib/password.ts` - PBKDF2 hash and verify
- `src/lib/db.ts` - obtain `env.DB` from `getCloudflareContext()`
- `src/lib/services/users.ts` - tiny user service
- `src/lib/validators/auth.ts` - Zod schemas
- `src/app/api/auth/register/route.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/register/page.tsx`
- `src/app/login/page.tsx`
- `src/app/logout/page.tsx`
- `src/app/page.tsx` - home / MCQ stub placeholder
- `src/components/auth/` - client forms
- `vitest.config.ts` - Vitest + jsdom + `@/` paths
- `migrations/*.schema.test.ts` - users-table SQL contract
- `src/lib/password.test.ts`
- `src/lib/services/users.test.ts`
- `src/lib/validators/auth.test.ts`
- `src/app/api/auth/*/route.test.ts`
- `src/components/auth/*.test.tsx`

Exact filenames may shift slightly; keep domain logic under `src/lib/services/` and routes under `src/app/`. Colocate `*.test.ts` / `*.test.tsx` with the subject.

### Implementation Patterns

**D1 access** (server only):

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb() {
  const { env } = await getCloudflareContext();
  return env.DB;
}
```

**Queries:** prepared statements, numbered placeholders, read `results` from `all()` rather than relying on `first()`.

**Password hash format (suggested):** a single string such as `pbkdf2$sha256$100000$<salt-b64>$<hash-b64>` so algorithm and iterations are explicit. Use `crypto.subtle` (Workers-safe). Do not use Node `fs` or native bcrypt addons.

**Normalization:** `email` and `username` stored as `email.trim().toLowerCase()`.

**Errors:** unique constraint on `email` / `username` → HTTP 409. Timing: use the same 401 message for unknown email and bad password; still verify against a dummy hash path if needed so absence of a user is not an obvious shortcut.

**Vitest + D1** (jsdom cannot call `getCloudflareContext()`):

```typescript
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { DB: mockDb },
  })),
}));
```

Keep D1 behind `src/lib/` so tests mock that module. Reset with `vi.clearAllMocks()` in `beforeEach`.

### Important Notes

- `npm run dev` runs on Node and may not expose D1 the same way as Workers. Prefer `npm run preview` for anything that touches `env.DB`.
- Cloud agents cannot run authenticated Wrangler or `d1 create`. Creating the database may need to happen on the user's machine.
- Ask before adding remaining dependencies. Zod is required by project Next.js rules for input validation — propose it before install. Vitest is already installed.
- Do not edit `cloudflare-env.d.ts` by hand; regenerate with `npm run cf-typegen`.
- Do not commit secrets. No auth secrets are required for PBKDF2 beyond the per-user salt stored in `password_hash`.
- Do not implement session cookies, JWTs, or social login in this sprint.
- Do not build MCQ authoring. The home page is a stub only.

### Installed test dependencies

| Package | Why |
|---------|-----|
| `vitest` | Preferred test runner |
| `@vitejs/plugin-react` (v5) | JSX in `*.test.tsx`; v6 was not used because it conflicts with Babel 7 from shadcn |
| `@testing-library/react` | Render client forms |
| `@testing-library/user-event` | Real keyboard / click interaction |
| `jsdom` | DOM environment for component tests |
| `vite-tsconfig-paths` | Resolve the `@/` alias in tests |

### Proposed dependencies (ask before install)

| Package | Why |
|---------|-----|
| `zod` | Validate register / login bodies in route handlers, per project Next.js rules |

No auth framework (Better Auth, NextAuth, Clerk) in this sprint. Do not add `@cloudflare/vitest-pool-workers` unless asked.

---

## Acceptance Criteria

- [x] Local D1 has a `users` table from a migration (not ad-hoc SQL)
- [ ] Register stores `username` equal to normalized `email`
- [ ] Register stores `password_hash` that is not the plaintext password
- [ ] Register with a duplicate email returns 409 and does not insert a second row
- [ ] Register with a short password or invalid email returns 400
- [ ] Login with correct password returns 200 and the public user object (no `password_hash`)
- [ ] Login with wrong password or unknown email returns 401 with the same generic message
- [ ] Logout returns 200 `{ "ok": true }`
- [ ] `/register`, `/login`, and `/logout` render and complete the flows above
- [ ] After successful login the instructor is taken to `/` (placeholder, no quiz editor)
- [ ] Client components do not import D1 or hashing modules
- [ ] No cookies, JWTs, or social-login providers are introduced
- [x] Vitest is configured; `npm run test` and `npm run test:watch` scripts exist
- [ ] Each implementation phase writes its tests first (observed red), then implementation turns them green; those tests fail if the behavior is removed
- [ ] Unit tests do not call real D1 or the network
- [ ] `npm run test`, `npm run lint`, and `npm run build` succeed

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Register completes | A user row exists after one successful form submit | Inspect local D1 / API 201 |
| Password not recoverable | Column is a hash payload, not the typed password | Direct DB read after register |
| Login distinguishes success vs failure | 200 vs 401 | API + UI |
| Duplicate accounts blocked | Second register with same email fails | API 409 |
| Scope held | No quiz tables, session cookies, tokens, or social login in this slice | Diff review |
| Automated phase signal | Tests written first (red), then `npm run test` green at the end of every phase | Vitest run output at start and end of phase |
| Failure paths covered | Duplicate email, bad password, short password, mismatched confirm password each have a failing-path test | Suite contents |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — user persistence
- Wrangler — create DB, migrations, typegen
- Web Crypto (`crypto.subtle`) — PBKDF2 hash / verify

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` — `env.DB`
- shadcn/ui form primitives already in the repo (`button`, `card`, `field`, `input`, `label`)
- Zod — to be added after user agreement (Phase 3)
- Vitest harness — installed (`npm run test`, `npm run test:watch`)

### Environment / config

- `wrangler.jsonc` `d1_databases` binding `DB`
- No new `.dev.vars` secrets required for this slice
- `.dev.vars.example` unchanged unless a secret is introduced later (sessions)

---

## Risks and Mitigation

### Technical Risks

- **Risk**: `npm run dev` (Node) cannot use D1 bindings the same way as Workers.
- **Mitigation**: Implement DB access only through `getCloudflareContext()`; verify with `npm run preview`.

- **Risk**: Creating D1 requires Cloudflare login; cloud agents cannot do it.
- **Mitigation**: Document the wrangler commands; run them locally when credentials exist.

- **Risk**: Unique constraint errors look like 500s if unmapped.
- **Mitigation**: Catch D1 constraint failures in the service and return 409.

- **Risk**: Update / delete HTTP without sessions becomes an open user-tampering API.
- **Mitigation**: No public write / delete user routes until sessions exist. CRUD lives on the service only.

- **Risk**: Tests mock D1 and miss a Workers-only binding failure.
- **Mitigation**: Phase 5 still runs `npm run preview` against local D1. Do not treat mocks as a substitute for that pass.

- **Risk**: Hollow tests (`expect(true).toBe(true)`) give a green suite with no signal.
- **Mitigation**: Follow Testing Strategy; each listed case must be able to fail if the product behavior is removed.

- **Risk**: Tests are written after the code and never observed red, so they do not signal.
- **Mitigation**: Each phase starts with Red. If a new test is green before implementation, rewrite it until it fails for a real reason.

### User Experience Risks

- **Risk**: Teachers expect to stay logged in after refresh.
- **Mitigation**: Home page is a stub; this PRD states no sessions. A later sprint adds sessions before MCQ work that must be attributed.

- **Risk**: Username vs email confusion.
- **Mitigation**: One email field; service copies it to `username`.

- **Risk**: Teachers look for quiz tools immediately after login.
- **Mitigation**: Stub copy on `/` states that MCQ authoring is the next sprint.

---

## Troubleshooting Guide

Populate during implementation. Starters:

### D1 binding missing on preview

**Problem**: `env.DB` is undefined.
**Cause**: Binding not in `wrangler.jsonc`, or types not regenerated.
**Solution**: Add `d1_databases` with binding `DB`; run `npm run cf-typegen`; restart preview.

### Unique email insert fails as 500

**Problem**: Duplicate register does not return 409.
**Cause**: Constraint error not translated.
**Solution**: Map D1 unique failures in the user service.

### Hash verify always fails

**Problem**: Correct password returns 401.
**Cause**: Encoding mismatch (salt / hash parse) or email not normalized the same way on login vs register.
**Solution**: Normalize email identically; parse the `pbkdf2$...` string with the same helpers used to write it. Confirm with `src/lib/password.test.ts` and `users.test.ts` before debugging the route.

### `@/` imports fail in Vitest

**Problem**: Tests cannot resolve `@/lib/...`.
**Cause**: Missing `vite-tsconfig-paths` in `vitest.config.ts`.
**Solution**: Add the plugin as in `.cursor/skills/testing/SKILL.md`.

### `getCloudflareContext` throws in tests

**Problem**: User-service tests fail before any assertion.
**Cause**: jsdom has no Cloudflare context.
**Solution**: `vi.mock("@opennextjs/cloudflare")` and inject a fake `env.DB`; keep all D1 access behind `src/lib/`.

---

## Notes for AI Agents

1. Start with Overview, Hypothesis, and Scope in this file. Do not build quiz authoring, social login, tokens, cookies, or sessions.
2. Use Scope (In / Out / Cut) as the boundary. Frontend password hashing is later, not now.
3. Do not add HTTP update / delete user routes in this sprint. CRUD on the user service is enough.
4. Ask before adding `zod` or any other new package. Vitest is already installed; do not add `@cloudflare/vitest-pool-workers` unless asked.
5. Apply D1 migrations locally only. Never `--remote` unless the user asks.
6. Never run `npm run deploy` unless the user asks.
7. Update phase status, acceptance checkboxes, test file lists, and this troubleshooting section as work happens.
8. Centralize SQL in `src/lib/`; numbered placeholders only.
9. Username is not a separate input; set it from normalized email.
10. Cite code as `filepath:line-number` when the implementation exists.
11. Each phase is red then green. Write the tests listed on that phase **first**. Run `npm run test` and confirm they fail. Implement until they pass. Do not mark COMPLETED until the suite is green **and** that phase's acceptance criteria are checked. Earlier phases must stay green.
12. Never write tests that cannot fail. Never hit real D1 from Vitest. If preview finds a bug, add a regression test (red) first, then fix (green).

---

## Current Status

**Last Updated**: 2026-09-17
**Current Phase**: Phase 1 complete — waiting for review before Phase 2
**Status**: Phase 1 COMPLETED (red then green). Local D1 `users` table applied with `--local`. Remote `npx wrangler d1 create quizmaker` was not run; `database_id` is the local placeholder `local-quizmaker-dev`.
**Next Steps**: Review Phase 1. On approval, start Phase 2 red-first (password + user service tests). Propose adding `zod` before Phase 3. To use a real Cloudflare D1 later, run `npx wrangler d1 create quizmaker` and replace `database_id` in `wrangler.jsonc`.

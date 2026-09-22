Date created: 2026-09-17
Date last modified: 2026-09-22

# Register, Login, and Logout - Technical PRD

This is the first slice of Greenfield QuizMaker. Teachers will later collaborate on a bank of multiple-choice questions. This sprint only gives those teachers an account they can register, sign in, and sign out with. Quiz authoring is the next sprint.

---

## Overview/Problem

QuizMaker is a greenfield app. Multiple teachers need to be distinct users so later work can attach a question bank to a real instructor. Before this slice there was no database, no user table, and no way to register, log in, or log out.

Without a stored instructor identity (name, email, hashed password), the MCQ collaboration work has nobody to belong to. This feature adds a `users` table, a small user service, and HTTP APIs plus pages for register, login, and logout. After a successful login the instructor lands on a stub home page at `/home`. That stub is a placeholder for MCQ tools, which are not built here. Visiting `/` shows login.

**Shipped through Phase 4** (2026-09-22): D1 `users`, Web Crypto PBKDF2, user service, `POST /api/auth/register|login|logout`, and shadcn pages. Phase 5 (lint, build, Workers preview) is not done yet. Code references below use `filepath:line-number`.

---

## Hypothesis

We believe that a D1-backed teacher account with hashed passwords, a tiny user service, and register / login / logout HTTP endpoints will give QuizMaker a usable identity baseline so the next sprint can build MCQ authoring on top of real users.

---

## Scope

### In Scope

- Cloudflare D1 database, bound as `quizmaker` (`env.quizmaker`), with a `users` migration
- User row fields: personal name (`first_name`, `last_name`), `email`, and `password_hash`
- Email as the login identifier. Store `username` equal to the normalized email so later features have a stable handle without a second form field
- Hash the password on the server before insert. Never persist plaintext. Compare using the stored hash at login
- Tiny user service in `src/lib/services/` with create, read, update, delete, and password verify
- HTTP APIs: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- Pages: `/` redirects to login; `/register`, `/login`, `/logout`, and a stub instructor home at `/home`
- Zod validation on all API input (`zod` is installed)
- Apply the migration locally only (`--local`)
- Vitest as the test harness (already installed). Every implementation phase is **red then green**, and the **user watches both gates**: write that phase's tests first, stop so the user can run `npm run test` and see red, implement only after they confirm, then stop again so they can run `npm run test` and see green. Quote both runs in that phase's Watch log. A phase is not COMPLETED on inspection alone.

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

Database: Cloudflare D1 (SQLite). Binding name: `quizmaker` (`env.quizmaker`). Database name: `quizmaker`.

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

All routes are Next.js App Router handlers under `src/app/api/`. They call the user service; they do not run SQL themselves. As built: `src/app/api/auth/register/route.ts:4`, `src/app/api/auth/login/route.ts:4`, `src/app/api/auth/logout/route.ts:1`.

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

The user service (`src/lib/services/users.ts`) is the only module that talks to D1 for users. Route handlers and later features call these methods.

| Method | File | Behavior |
|--------|------|----------|
| `createUser` | `src/lib/services/users.ts:102` | Hash password, insert row; used by register |
| `getUserByEmail` | `src/lib/services/users.ts:134` | Read by email; omit hash from the returned public type |
| `getUserById` | `src/lib/services/users.ts:141` | Read by id; omit hash from the returned public type |
| `updateUser` | `src/lib/services/users.ts:146` | Update name fields (and later password); no HTTP this sprint |
| `deleteUser` | `src/lib/services/users.ts:162` | Delete by id; no HTTP this sprint |
| `verifyPassword` | `src/lib/services/users.ts:167` | Compare submitted password to stored hash; used by login |
| `DuplicateEmailError` | `src/lib/services/users.ts:7` | Thrown on unique constraint; register route maps to 409 |

Do not add `GET` / `PUT` / `DELETE` `/api/users/:id` until sessions can authorize the caller.

### User Interface Requirements

Use existing shadcn/ui: `button`, `card`, `field`, `input`, `label`. Styling is Tailwind CSS v4, applied through those components (`cn()` from `@/lib/utils`, theme tokens in `src/app/globals.css`). Do not hand-edit generated files in `src/components/ui/`. Add components with `npx shadcn@latest add @shadcn/<name>` if something is missing. Ask before adding npm packages. Do not introduce `react-hook-form`.

**Visual starting point (Phase 4):** the shadcn **Login** and **Signup** blocks the user pasted. Copy their Card / Field / Input layout. Do **not** copy them verbatim. Adapt as follows so the UI matches this PRD (not the generic shadcn demo):

| shadcn block | Our file | Keep | Change |
|--------------|----------|------|--------|
| `LoginForm` | `src/components/auth/login-form.tsx` (`'use client'`) | Card, email + password fields, primary Login button, layout padding used by the page | Import `cn` from `@/lib/utils` (not `"cn"`). Drop **Forgot your password?** and **Login with Google** (out of scope). Link "Sign up" to `/register`. POST `/api/auth/login`; on 200 go to `/home`; on 401 show `"Invalid email or password"`. |
| Login page wrapper | `src/app/login/page.tsx` | Centered `min-h-svh` / `max-w-sm` shell | Import from `@/components/auth/login-form`, not `@/components/login-form`. `/` redirects here so login is the default page. |
| `SignupForm` | `src/components/auth/register-form.tsx` (`'use client'`) | Card, email, password, confirm password, Create Account button | Split **Full Name** into **First name** and **Last name** (API needs both). Drop **Sign up with Google**. Link "Sign in" to `/login`. Confirm password is UI-only. POST `/api/auth/register` **without** confirm password. On 201 go to `/login` with a success hint. |
| Register page wrapper | `src/app/register/page.tsx` | Same centered shell as login | Import `RegisterForm` from `@/components/auth/register-form`, not `@/components/signup-form`. |

Logout is not in those blocks. Add `src/components/auth/logout-panel.tsx` plus `src/app/logout/page.tsx`. The site default is login: `src/app/page.tsx` redirects `/` to `/login`. Instructor home lives at `/home`.

#### Register (`/register`)

- Fields: first name, last name, email, password, confirm password (`src/components/auth/register-form.tsx:77-127`)
- Confirm password is UI-only; not sent to the API (`src/components/auth/register-form.tsx:49-53`)
- Client validation: required fields, email format, password min 8, passwords match (`src/components/auth/register-form.tsx:39-47`)
- Submit `POST /api/auth/register`
- Success: redirect to `/login` with a simple success hint (`src/components/auth/register-form.tsx:55-57`; hint rendered at `src/app/login/page.tsx:13-17`)
- Errors: show API / validation message on the form
- Link to `/login`

#### Login (`/login`)

- This is the **default page**. `/` redirects to `/login` (`src/app/page.tsx:3-4`).
- Fields: email, password (`src/components/auth/login-form.tsx:66-78`)
- Submit `POST /api/auth/login` (`src/components/auth/login-form.tsx:40-44`)
- Success: navigate to `/home` (`src/components/auth/login-form.tsx:46-48`)
- Failure: generic invalid-credentials message (`src/components/auth/login-form.tsx:51`)
- Link to `/register`

#### Logout (`/logout`)

- Short confirmation that the instructor is signed out (`src/components/auth/logout-panel.tsx:20-26`)
- Call `POST /api/auth/logout` on mount (`src/components/auth/logout-panel.tsx:15-17`)
- Clear any client-only display of the last user (none yet — no session)
- Link / redirect to `/login` (`src/components/auth/logout-panel.tsx:28`)

#### Instructor home placeholder (`/home`)

- After a successful login, this is the landing page (`src/app/home/page.tsx:3-4`)
- Copy should make clear this is the instructor home and that quiz / MCQ making is next (`src/components/home/instructor-home.tsx:6-10`)
- No quiz editor, no quiz list backed by a table
- Link to **logout** (`/logout`) only (`src/components/home/instructor-home.tsx:12`). Do **not** show Login or Register on this page
- Because there is no session, a refresh cannot prove who is signed in; do not fake a protected dashboard

**Client vs server:** forms need `'use client'` only at the form component. Database and hashing stay in `src/lib/` and must never be imported into client components. Frontend hashing of the password before submit is out of scope.

---

## Testing Strategy

Preferred framework: **Vitest** (`.cursor/skills/testing/SKILL.md`). This is how **every** implementation phase is done. Phase 1 already followed it. Phases 2–5 must copy the same loop. A phase is not COMPLETED until the checklist on that phase is fully checked.

### The TDD loop (copy this for every phase)

This is the pattern already used for Phase 1 (`create_users.schema.test.ts` went red, then `0001_create_users.sql` made it green).

Do these steps **in order**. Do not skip Red. Do not skip the user Watch gates. Do not mark COMPLETED mid-loop.

Red and green are **terminal output from `npm run test`**, not a change in the QuizMaker UI. The user must be able to run that command themselves at each gate. Paste the quoted result into that phase's **Watch log** so the PRD shows the same red-to-green the user saw.

| Step | Name | What you do | Done when |
|------|------|-------------|-----------|
| 1 | **Red** | Write the tests listed on that phase **before** the product code. Import the module/route/component that does not exist yet (or does not behave yet). Run `npm run test`. | New tests fail for a **real** reason (missing file, missing export, wrong SQL, wrong status). If they pass already, they cannot fail — rewrite them. Quote the failure in the Watch log. |
| 2 | **Watch red** | **Stop.** Do not implement yet. Tell the user to run `npm run test` and look at the failure. Update this PRD (phase status = IN PROGRESS / RED, Watch log red row filled). | User confirms they saw red. |
| 3 | **Implement** | Write only enough code (or SQL / Wrangler steps Vitest cannot reach) to satisfy those tests. | Code exists; do not claim done yet. |
| 4 | **Green** | Run `npm run test` again. | This phase's tests pass. **All earlier phases stay green.** Empty suite cannot pass (`passWithNoTests` is off). Quote the passing count in the Watch log. |
| 5 | **Watch green** | **Stop.** Tell the user to run `npm run test` and look at the passing suite. Update this PRD (phase status = IN PROGRESS / GREEN, Watch log green row filled). | User confirms they saw green. |
| 6 | **Acceptance** | Tick the acceptance-criteria boxes this phase owns. | Green suite **and** those boxes. Neither alone is enough. |
| 7 | **Stop** | Update this PRD (phase status, TDD checklist, TDD status table, Watch log). Commit and push the feature branch if the user asked. **Do not start the next phase.** | User has reviewed. Next phase starts only after they confirm. |

**Phase 5** does not add a new product surface. The suite should already be green — the user still runs `npm run test` and watches that green. A preview bug is a mini-loop: regression test first (red + user watches red) → fix (green + user watches green).

If behavior changes later, update the tests in the same change so they go red for the old contract and green for the new one. Pause at both Watch gates again.

### Phase TDD completion checklist (required on every phase)

Paste and fill this on the phase. **COMPLETED is forbidden until every box is checked**, including both Watch gates.

```
TDD completion:
- [ ] Red: listed tests written first
- [ ] Red: `npm run test` observed failing (quote the failure in the Watch log)
- [ ] Watch red: user ran `npm run test` and confirmed the failure; no implementation until then
- [ ] Implement: only enough to satisfy those tests
- [ ] Green: `npm run test` passing (this phase + all earlier phases; quote in the Watch log)
- [ ] Watch green: user ran `npm run test` and confirmed the passing suite
- [ ] Acceptance: this phase's criteria checked
- [ ] Stop: PRD status updated; waiting for user confirmation before the next phase

Watch log:
| Gate | `npm run test` result (quote) | User watched? |
|------|-------------------------------|---------------|
| Red (before implement) | | No — do not implement until Yes |
| Green (after implement) | | No — not COMPLETED until Yes |
```

### Test-driven approach status

| Phase | TDD used? | Tests | Last observed | User watched red→green? | Status |
|-------|-----------|-------|---------------|-------------------------|--------|
| 0 Harness | n/a | `vitest.config.ts`, `npm run test` | Suite runnable; `passWithNoTests` off | n/a | Installed |
| 1 D1 / `users` migration | **Yes** | `migrations/create_users.schema.test.ts` | Red: `expected 0 to be greater than 0`. Green: 1 file / 1 test | No (agent-only; live pause starts Phase 3) | COMPLETED |
| 2 Password + user service | **Yes** | `src/lib/password.test.ts`, `src/lib/services/users.test.ts` | Red: `Failed to resolve import "@/lib/password"` / `"@/lib/services/users"`. Green: 3 files / 13 tests | No (agent-only; live pause starts Phase 3) | COMPLETED |
| 3 Register / login / logout APIs | **Yes** | `src/lib/validators/auth.test.ts`, `src/app/api/auth/*/route.test.ts` | Red: missing validator and `route` modules. Green: 7 files / 27 tests | Yes (user confirmed Phase 3 looks good) | COMPLETED |
| 4 Auth pages | **Yes** | `src/components/auth/*.test.tsx`, `src/components/home/instructor-home.test.tsx` | Red: missing form/home modules. Green: 11 files / 36 tests | Yes (user verified Phase 4 in the browser: login, register, login, logout) | COMPLETED |
| 5 Verify | Mini-loop only if a bug appears | Full suite must stay green | — | User watches green; red only if a bug | PLANNED |

**App code:** password helper, user service, auth APIs, and shadcn login/register/logout/home pages exist. Phase 4 is COMPLETED. Do not start Phase 5 until the user asks.

### Harness (installed before Phase 1)

Installed as devDependencies: `vitest`, `@vitejs/plugin-react@5` (v5, not v6 — v6 needs Babel 8 and conflicts with shadcn's Babel 7), `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `vite-tsconfig-paths`.

Config: `vitest.config.ts` (jsdom, globals, `@/` via `vite-tsconfig-paths`, `passWithNoTests` **off**). Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`. TypeScript: `vitest/globals` is listed in `tsconfig.json` `compilerOptions.types`.

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
2. The **user watched red** (`npm run test`) before implementation
3. Implementation made those tests **green** (`npm run test` passes, including earlier phases)
4. The **user watched green** (`npm run test`)
5. The acceptance criteria this phase owns are checked off
6. Both rows of that phase's **Watch log** are filled with quoted output

| Phase | Tests start | Expected first `npm run test` | Done when |
|-------|-------------|-------------------------------|-----------|
| 1 | Schema contract test | Red: no migration SQL, or SQL missing required columns / uniqueness | Green schema test + local D1 apply + Watch log |
| 2 | Password + user service tests | Red: modules missing or hash/CRUD behavior wrong | Green service tests + Watch log |
| 3 | Zod + register / login / logout route tests | Red: handlers missing or wrong status / body | Green API tests + Watch log (user watched both gates) |
| 4 | Client form tests | Red: forms missing or validation / navigation wrong | Green UI tests + Watch log (user watched both gates) |
| 5 | Full suite + any new regression test | Suite green; a new bug's test starts red | Green suite + lint + build + preview notes + user watched green |

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
2. Add `d1_databases` binding `quizmaker` to `wrangler.jsonc`
3. Run `npm run cf-typegen`
4. Create migration `create_users`, put the PRD `CREATE TABLE` in the generated file, apply with `--local` only

**Green / acceptance:**

- `npm run test` green (schema test passes; empty suite can no longer pass)
- Acceptance: local D1 has a `users` table from a migration

**TDD completion:**

- [x] Red: listed tests written first (`migrations/create_users.schema.test.ts`)
- [x] Red: `npm run test` observed failing (`expected 0 to be greater than 0`)
- [x] Watch red: **not paused** — agent ran red and implemented in the same session (live user watch starts Phase 3)
- [x] Implement: `0001_create_users.sql`, D1 binding, local apply, typegen
- [x] Green: `npm run test` passing (1 file / 1 test)
- [x] Watch green: **not paused** — same session (live user watch starts Phase 3)
- [x] Acceptance: users table from a migration
- [x] Stop: waiting for confirmation before Phase 2

**Watch log:**

| Gate | `npm run test` result (quote) | User watched? |
|------|-------------------------------|---------------|
| Red (before implement) | `expected 0 to be greater than 0` (schema test: no `create_users` SQL yet) | No — agent-only |
| Green (after implement) | 1 file / 1 test passed | No — agent-only |

**Deliverables**:

- D1 binding in `wrangler.jsonc:25-32` (`quizmaker` / `env.quizmaker`)
- `migrations/0001_create_users.sql:1-13` SQL for `users`
- Typed `env.quizmaker` (generated `cloudflare-env.d.ts`; do not hand-edit)
- Schema contract test observed red, then green (`migrations/create_users.schema.test.ts:23-47`)

### Phase 2: Tiny user service and password hashing - COMPLETED

**Objective**: Server-only module can create, read, update, and delete users, and verify passwords against hashes.

**Red (write first, confirm fail):**

Write colocated tests that import the modules this phase will create. Mock D1 / `getCloudflareContext()`, never a real database. `npm run test` must be red (missing modules or failing assertions). Phase 1 tests stay green.

| File | What it proves | Why it is red first |
|------|----------------|---------------------|
| `src/lib/password.test.ts` | Hash payload is not the plaintext password; same password verifies; wrong password does not; two hashes of the same password are not identical (salt); malformed payload fails closed | `password.ts` missing or hash/verify wrong |
| `src/lib/services/users.test.ts` | `createUser` stores normalized lowercase email, sets `username` equal to that email, and persists a hash not the password; public reads omit `password_hash`; duplicate email is a conflict the API can map to 409; `getUserByEmail` / `getUserById` return the user or null; `updateUser` changes name fields and bumps `updated_at`; `deleteUser` removes the row; `verifyPassword` succeeds only for the correct password | `users.ts` missing or CRUD/verify wrong |

Use an in-memory fake for the D1 module in `src/lib/` (or a mock `env.quizmaker`) so create → read → update → delete can be asserted without Wrangler.

**Implement:**

1. Password helper using Web Crypto PBKDF2 (salt + hash encoded in `password_hash`)
2. `src/lib/services/users.ts` (or similar) with create / read / update / delete / verify
3. Prepared statements with numbered placeholders (`?1`, `?2`)
4. Access D1 via `getCloudflareContext()` then `env.quizmaker`, centralized in `src/lib/`

**Green / acceptance:**

- `npm run test` green (Phase 1 + Phase 2)
- Acceptance owned here: username equals normalized email; stored value is a hash not plaintext; public type omits `password_hash`

**TDD completion:**

- [x] Red: listed tests written first (`src/lib/password.test.ts`, `src/lib/services/users.test.ts`)
- [x] Red: `npm run test` observed failing (`Failed to resolve import "@/lib/password"` and `Failed to resolve import "@/lib/services/users"`; Phase 1 schema test still passed)
- [x] Watch red: **not paused** — agent ran red and implemented in the same session (live user watch starts Phase 3)
- [x] Implement: `src/lib/password.ts` (Web Crypto PBKDF2), `src/lib/db.ts` (`env.quizmaker`), `src/lib/services/users.ts`
- [x] Green: `npm run test` passing (3 files / 13 tests; Phase 1 + Phase 2)
- [x] Watch green: **not paused** — same session (live user watch starts Phase 3). Current tree is green; user can still run `npm run test` now.
- [x] Acceptance: username equals normalized email; stored value is a hash not plaintext; public type omits `password_hash`
- [x] Stop: PRD status updated; waiting for user confirmation before the next phase

**Watch log:**

| Gate | `npm run test` result (quote) | User watched? |
|------|-------------------------------|---------------|
| Red (before implement) | `Failed to resolve import "@/lib/password"` from `src/lib/password.test.ts`; `Failed to resolve import "@/lib/services/users"` from `src/lib/services/users.test.ts`. Phase 1 still passed (`Test Files  2 failed | 1 passed`) | No — agent-only |
| Green (after implement) | `Test Files  3 passed (3)` / `Tests  13 passed (13)` | No — agent-only |

**Deliverables**:

- Hashing module (`src/lib/password.ts:64` `hashPassword`, `:70` `verifyPassword`)
- User service module (`src/lib/services/users.ts`) and D1 access (`src/lib/db.ts:3-6`)
- Public user type that excludes `password_hash` (`src/lib/services/users.ts:14-22`)
- Password and user-service tests observed red, then green

### Phase 3: Register, login, logout APIs - COMPLETED

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

**Watch red (required):** After the tests exist and `npm run test` is red, **stop**. Do not install `zod` or write route handlers until the user has run `npm run test` and confirmed the failure.

**Implement:**

1. Propose adding `zod`, then add Zod schemas for register and login bodies
2. `POST /api/auth/register`
3. `POST /api/auth/login`
4. `POST /api/auth/logout`
5. Map unique-constraint failures to 409

**Green / acceptance:**

- `npm run test` green (Phases 1–3)
- Acceptance owned here: 201 / 400 / 409 register; 200 / 401 login (same generic message); logout `200 { "ok": true }`; responses never include `password_hash`

**Watch green (required):** After the suite is green, **stop**. Do not start Phase 4 until the user has run `npm run test` and confirmed the passing suite.

**TDD completion:**

- [x] Red: listed tests written first (`src/lib/validators/auth.test.ts`, `src/app/api/auth/register/route.test.ts`, `src/app/api/auth/login/route.test.ts`, `src/app/api/auth/logout/route.test.ts`)
- [x] Red: `npm run test` observed failing (quote in the Watch log)
- [x] Watch red: user confirmed and said proceed
- [x] Implement: `zod`, `src/lib/validators/auth.ts`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- [x] Green: `npm run test` passing (7 files / 27 tests; quote in the Watch log)
- [x] Watch green: user confirmed Phase 3 looks good
- [x] Acceptance: 201 / 400 / 409 register; 200 / 401 login (same generic message); logout `200 { "ok": true }`; responses never include `password_hash`
- [x] Stop: PRD status updated; waiting for user confirmation before Phase 4

**Watch log:**

| Gate | `npm run test` result (quote) | User watched? |
|------|-------------------------------|---------------|
| Red (before implement) | `Failed to resolve import "@/lib/validators/auth"`; `Failed to resolve import "@/app/api/auth/register/route"`; same for `login/route` and `logout/route`. `Test Files  4 failed | 3 passed (7)` / `Tests  13 passed (13)` (Phase 1–2 still green) | Yes — user said proceed |
| Green (after implement) | `Test Files  7 passed (7)` / `Tests  27 passed (27)` | Yes — user confirmed Phase 3 looks good |

**Deliverables**:

- Route handlers: `src/app/api/auth/register/route.ts:4`, `src/app/api/auth/login/route.ts:4`, `src/app/api/auth/logout/route.ts:1`
- Zod schemas: `src/lib/validators/auth.ts:3-13`
- Validator and route tests observed red, then green

### Phase 4: Auth pages and home placeholder - COMPLETED

**Objective**: Teachers can complete the flows in the browser and land on the MCQ stub.

**Red (write first, confirm fail):**

Write Testing Library tests for the client forms. Mock `fetch` / navigation, not D1. Query by role and accessible name. `npm run test` must be red. Earlier phases stay green.

| File | What it proves | Why it is red first |
|------|----------------|---------------------|
| `src/components/auth/register-form.test.tsx` | Renders first name, last name, email, password, confirm password; client validation blocks submit when passwords do not match or password is too short; successful submit POSTs JSON **without** confirm password; on 201, navigates toward `/login` | Form missing or validation / POST shape wrong |
| `src/components/auth/login-form.test.tsx` | Submits email and password to `/api/auth/login`; on 200, navigates to `/home`; on 401, shows the generic invalid-credentials message | Form missing or navigation / error copy wrong |
| `src/components/auth/logout-panel.test.tsx` (or equivalent) | Calls `POST /api/auth/logout` and exposes a path back to `/login` | Panel missing or does not call logout |
| Home placeholder (`src/components/home/instructor-home.test.tsx`) | Instructor home stub at `/home`: quiz-making is next; **Log out** link; no Login or Register | Stub copy missing or still the starter home |

If a page file is a thin Server Component wrapper, test the client child; do not force-render the page module.

**Watch red (required):** After the form tests exist and `npm run test` is red, **stop**. Do not build pages or forms until the user has run `npm run test` and confirmed the failure.

**Implement:**

1. Login and register **pages + forms** starting from the shadcn Login / Signup blocks above, with the listed adaptations
2. `/` redirects to `/login` (login is the default page)
3. `/home` instructor / MCQ placeholder with a **Log out** link only (no Login / Register)
4. `/logout` page and logout panel
5. `'use client'` only on the form / panel components; never import D1 or hashing into them

**Green / acceptance:**

- `npm run test` green (Phases 1–4)
- Acceptance owned here: `/register`, `/login`, `/logout` complete the flows; `/` redirects to login; successful login lands on `/home` placeholder with a logout link; client components do not import D1 or hashing

**Watch green (required):** After the suite is green, **stop**. Do not start Phase 5 until the user has run `npm run test` and confirmed the passing suite.

**TDD completion:**

- [x] Red: listed tests written first (`src/components/auth/register-form.test.tsx`, `login-form.test.tsx`, `logout-panel.test.tsx`, `src/components/home/instructor-home.test.tsx`)
- [x] Red: `npm run test` observed failing (quote in the Watch log)
- [x] Watch red: user ran `npm run test` and confirmed 4 failed / 7 passed
- [x] Implement: shadcn-based login/register forms (adapted), logout panel, instructor home at `/home` with Log out only, `/login` `/register` `/logout`, `/` redirects to `/login`
- [x] Green: `npm run test` passing (11 files / 36 tests; quote in the Watch log)
- [x] Watch green: user confirmed Phase 4 looks good (local login, register, login, logout); suite `11 files / 36 tests`
- [x] Acceptance: this phase's criteria checked
- [x] Stop: PRD status updated; waiting for user confirmation before Phase 5

**Watch log:**

| Gate | `npm run test` result (quote) | User watched? |
|------|-------------------------------|---------------|
| Red (before implement) | `Failed to resolve import "@/components/auth/login-form"`; same for `register-form`, `logout-panel`, and `@/components/home/instructor-home`. `Test Files  4 failed | 7 passed (11)` / `Tests  27 passed (27)` (Phases 1–3 still green) | Yes — user saw 4 failed / 7 passed |
| Green (after implement) | `Test Files  11 passed (11)` / `Tests  36 passed (36)` | Yes — user confirmed Phase 4 looks good (local login, register, login, logout) |

**Deliverables**:

- App Router pages: `/` → `/login`, `/register`, `/login`, `/logout`, `/home`
- Forms using shadcn/ui `field` primitives (`src/components/auth/login-form.tsx`, `register-form.tsx`, `logout-panel.tsx`)
- Instructor home logout-only stub (`src/components/home/instructor-home.tsx:12`)
- Client-form tests observed red, then green

### Phase 5: Verify - PLANNED

**Objective**: Prove the slice works before calling it done. The suite should already be **green**. Preview covers real D1 / Workers. A new bug starts a red → green mini-cycle.

**Red (only if preview finds a bug):**

Write or tighten a Vitest case in the matching phase's file first. `npm run test` must go red for that bug. **Stop** so the user can watch that red before the fix.

**Gate (suite already green):**

1. `npm run test` — full suite green (schema + password + user service + APIs + forms). **Stop** so the user can watch this green even when there is no bug.
2. `npm run lint`
3. `npm run build`
4. Manual flow against `npm run preview`: `/` redirects to login → register → row in local D1 with hash → login success → `/home` stub → logout → login failure with bad password
5. Confirm duplicate email returns 409 (API test already covers this; confirm once on preview)

**Green / acceptance:**

- `npm run test`, `npm run lint`, and `npm run build` succeed (report actual results)
- Remaining acceptance criteria checked off
- Any preview bug has a regression test that went red, then green

**TDD completion:**

- [ ] Red: only if a preview bug — regression test written first, observed failing, and user watched red
- [ ] Watch red: user confirmed red **only if** a bug test was added; otherwise n/a
- [ ] Implement: fix if needed
- [ ] Green: full `npm run test` passing (Phases 1–4 still green; quote in the Watch log)
- [ ] Watch green: user ran `npm run test` and confirmed the passing suite
- [ ] Acceptance: remaining criteria checked; lint and build reported
- [ ] Stop: slice ready; user deploys — do not run `npm run deploy`

**Watch log:**

| Gate | `npm run test` result (quote) | User watched? |
|------|-------------------------------|---------------|
| Red (only if a preview bug) | n/a unless a bug appears | |
| Green (verify suite) | | No |

**Deliverables**:

- Reported `npm run test` / `lint` / `build` results
- Manual preview notes
- Regression tests for any preview bugs

**Status Markers**:

- PLANNED - Not started yet
- IN PROGRESS / RED - Phase tests written; `npm run test` failing; **stopped so the user can watch red**
- IN PROGRESS / GREEN - Implementation made this phase's tests pass; **stopped so the user can watch green**
- COMPLETED - Watch log filled, user watched both gates (from Phase 3), tests green, earlier phases still green, this phase's acceptance criteria checked

---

## Technical Implementation Details

### Implementation record (as built)

Line numbers are from the tree at Phase 4 completion (2026-09-22). Phase 5 (lint, build, Workers preview) is still planned.

#### Routing

| Path | File | Behavior |
|------|------|----------|
| `/` | `src/app/page.tsx:3-4` | `redirect("/login")` — login is the default page |
| `/login` | `src/app/login/page.tsx:3-21` | Renders `LoginForm`; shows “Account created. You can log in now.” when `?registered=1` (`src/app/login/page.tsx:13-17`) |
| `/register` | `src/app/register/page.tsx:3-10` | Renders `RegisterForm` |
| `/logout` | `src/app/logout/page.tsx:3-10` | Renders `LogoutPanel` |
| `/home` | `src/app/home/page.tsx:3-4` | Renders `InstructorHome` (MCQ stub) |

Late Phase 4 product change: instructor home moved off `/` so login could be the default. Instructor home no longer links to Login or Register; it only links to Log out (`src/components/home/instructor-home.tsx:12`).

#### Phase 1 — D1 `users`

- Binding: `wrangler.jsonc:25-32` — `d1_databases` binding `quizmaker`, database name `quizmaker`, `migrations_dir: "migrations"`
- Schema: `migrations/0001_create_users.sql:1-13`
- Contract test: `migrations/create_users.schema.test.ts:23-47`

#### Phase 2 — Password helper and user service

- `getDb()`: `src/lib/db.ts:3-6` — `getCloudflareContext({ async: true })` then `env.quizmaker`
- Hash format: `src/lib/password.ts:64-68` — `pbkdf2$sha256$100000$<salt-b64>$<hash-b64>` via Web Crypto PBKDF2 (`src/lib/password.ts:38-62`)
- Verify: `src/lib/password.ts:70-98` — parse payload, re-derive, `timingSafeEqual` (`src/lib/password.ts:28-35`)
- `PublicUser` omits hash: `src/lib/services/users.ts:14-22`, mapped in `toPublicUser` (`src/lib/services/users.ts:58-68`)
- Normalize email: `src/lib/services/users.ts:50-52`; `createUser` sets `username = email` (`src/lib/services/users.ts:102-104`)
- Duplicate email: `DuplicateEmailError` (`src/lib/services/users.ts:7-12`), thrown from unique constraint (`src/lib/services/users.ts:119-122`)
- Login dummy-hash path so unknown email still hashes: `src/lib/services/users.ts:47-48` and `src/lib/services/users.ts:167-175`
- CRUD SQL uses numbered placeholders (`?1` … `?6`), e.g. insert (`src/lib/services/users.ts:112-118`)
- Tests: in-memory fake D1 in `src/lib/services/users.test.ts:23-78`. SELECT matchers use `startsWith("select")` so `DELETE FROM users WHERE id` is not treated as a read (`src/lib/services/users.test.ts:56`)

#### Phase 3 — HTTP APIs

- Zod `^4.6.5` (`package.json:28`). Schemas: `src/lib/validators/auth.ts:3-13` (`z.email()`, register password min 8)
- `POST /api/auth/register`: `src/app/api/auth/register/route.ts:4-32` — 400 invalid JSON/Zod, 201 `{ user }`, 409 duplicate (`src/app/api/auth/register/route.ts:24-28`), 500 `"Unable to register"`
- `POST /api/auth/login`: `src/app/api/auth/login/route.ts:4-32` — 200 `{ user }`, 401 `"Invalid email or password"` (`src/app/api/auth/login/route.ts:22-26`), 500 `"Unable to log in"`
- `POST /api/auth/logout`: `src/app/api/auth/logout/route.ts:1-2` — `POST()` with no request argument (avoids unused-param lint); 200 `{ ok: true }`
- Route tests mock the user service, not D1

#### Phase 4 — Pages (shadcn Card / Field)

- `LoginForm` (`'use client'`, `src/components/auth/login-form.tsx:1`): POST `/api/auth/login` (`src/components/auth/login-form.tsx:40-44`); on 200 `router.push("/home")` (`src/components/auth/login-form.tsx:46-48`); on failure `"Invalid email or password"` (`src/components/auth/login-form.tsx:51`). Sign up → `/register`. No Google, no forgot-password
- `RegisterForm` (`'use client'`, `src/components/auth/register-form.tsx:1`): client checks min 8 and match (`src/components/auth/register-form.tsx:39-47`); POST body omits confirm password (`src/components/auth/register-form.tsx:49-53`); on 201 `router.push("/login?registered=1")` (`src/components/auth/register-form.tsx:55-57`). First + last name, no Google
- `LogoutPanel` (`'use client'`, `src/components/auth/logout-panel.tsx:1`): `POST /api/auth/logout` on mount (`src/components/auth/logout-panel.tsx:15-17`); link to `/login` (`src/components/auth/logout-panel.tsx:28`)
- `InstructorHome` (`src/components/home/instructor-home.tsx:3-15`): stub copy; **Log out** only (`src/components/home/instructor-home.tsx:12`). No Login / Register
- Client forms do not import `@/lib/db`, `@/lib/password`, or `@/lib/services/users`

#### Test harness

- `vitest.config.ts:5-17` — jsdom, globals, `@vitejs/plugin-react` v5, `vite-tsconfig-paths`. Excludes `.next`, `.open-next`, `.wrangler` so Vitest does not hang scanning the Next build cache. `passWithNoTests` is off (Vitest default)
- Scripts: `package.json:14-15` `"test": "vitest run"`, `"test:watch": "vitest"`
- Last green at Phase 4: 11 files / 36 tests

### Key files (as built)

- `wrangler.jsonc:25-32` — D1 `quizmaker` binding (`env.quizmaker`)
- `migrations/0001_create_users.sql:1-13` — schema
- `migrations/create_users.schema.test.ts` — users-table SQL contract
- `src/lib/password.ts` — PBKDF2 hash and verify
- `src/lib/password.test.ts`
- `src/lib/db.ts:3-6` — `env.quizmaker` from `getCloudflareContext({ async: true })`
- `src/lib/services/users.ts` — tiny user service
- `src/lib/services/users.test.ts`
- `src/lib/validators/auth.ts:3-13` — Zod schemas
- `src/lib/validators/auth.test.ts`
- `src/app/api/auth/register/route.ts` (+ `route.test.ts`)
- `src/app/api/auth/login/route.ts` (+ `route.test.ts`)
- `src/app/api/auth/logout/route.ts` (+ `route.test.ts`)
- `src/app/page.tsx:3-4` — redirects `/` to `/login`
- `src/app/login/page.tsx` — login page + registered hint
- `src/app/register/page.tsx`
- `src/app/logout/page.tsx`
- `src/app/home/page.tsx` — instructor / MCQ stub wrapper
- `src/components/home/instructor-home.tsx:12` — Log out only
- `src/components/home/instructor-home.test.tsx`
- `src/components/auth/login-form.tsx`, `register-form.tsx`, `logout-panel.tsx` (+ colocated `*.test.tsx`)
- `vitest.config.ts:5-17` — Vitest + jsdom + `@/` paths + build-dir excludes

Keep domain logic under `src/lib/services/` and routes under `src/app/`. Colocate `*.test.ts` / `*.test.tsx` with the subject.

### Implementation Patterns

**D1 access** (server only):

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return env.quizmaker;
}
```

As built at `src/lib/db.ts:3-6`. `{ async: true }` is required for this OpenNext helper.

**Queries:** prepared statements, numbered placeholders, read `results` from `all()` rather than relying on `first()`.

**Password hash format (as built):** `pbkdf2$sha256$100000$<salt-b64>$<hash-b64>` (`src/lib/password.ts:67`). Use `crypto.subtle` (Workers-safe). Do not use Node `fs` or native bcrypt addons.

**Normalization:** `email` and `username` stored as `email.trim().toLowerCase()`.

**Errors:** unique constraint on `email` / `username` → HTTP 409. Timing: use the same 401 message for unknown email and bad password; still verify against a dummy hash path if needed so absence of a user is not an obvious shortcut.

**Vitest + D1** (jsdom cannot call `getCloudflareContext()`):

```typescript
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { quizmaker: mockDb },
  })),
}));
```

Keep D1 behind `src/lib/` so tests mock that module. Reset with `vi.clearAllMocks()` in `beforeEach`.

### Important Notes

- `npm run dev` runs on Node and may not expose D1 the same way as Workers. Prefer `npm run preview` for anything that touches `env.quizmaker`.
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

### Installed runtime dependencies (this slice)

| Package | Why |
|---------|-----|
| `zod` | Validate register / login bodies in route handlers, per project Next.js rules |

### Proposed dependencies (ask before install)

| Package | Why |
|---------|-----|
| — | None remaining for this slice |

No auth framework (Better Auth, NextAuth, Clerk) in this sprint. Do not add `@cloudflare/vitest-pool-workers` unless asked.

---

## Acceptance Criteria

- [x] Local D1 has a `users` table from a migration (not ad-hoc SQL)
- [x] Register stores `username` equal to normalized `email`
- [x] Register stores `password_hash` that is not the plaintext password
- [x] Register with a duplicate email returns 409 and does not insert a second row
- [x] Register with a short password or invalid email returns 400
- [x] Login with correct password returns 200 and the public user object (no `password_hash`)
- [x] Login with wrong password or unknown email returns 401 with the same generic message
- [x] Logout returns 200 `{ "ok": true }`
- [x] `/register`, `/login`, and `/logout` render and complete the flows above
- [x] `/` redirects to `/login` (login is the default page)
- [x] After successful login the instructor is taken to `/home` (placeholder, no quiz editor)
- [x] Instructor home has a logout link and does not show Login or Register
- [x] Client components do not import D1 or hashing modules
- [x] No cookies, JWTs, or social-login providers are introduced
- [x] Vitest is configured; `npm run test` and `npm run test:watch` scripts exist
- [ ] Each implementation phase writes its tests first (observed red), the user watches red then green via `npm run test`, and those tests fail if the behavior is removed (Phases 1–2 were agent-only; Phases 3–4 were watched. Revisit at Phase 5)
- [x] Unit tests do not call real D1 or the network
- [ ] `npm run test`, `npm run lint`, and `npm run build` succeed (Phase 5: lint and build not reported yet)

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Register completes | A user row exists after one successful form submit | Inspect local D1 / API 201 |
| Password not recoverable | Column is a hash payload, not the typed password | Direct DB read after register |
| Login distinguishes success vs failure | 200 vs 401 | API + UI |
| Duplicate accounts blocked | Second register with same email fails | API 409 |
| Scope held | No quiz tables, session cookies, tokens, or social login in this slice | Diff review |
| Automated phase signal | Tests written first (red), user watches red, then `npm run test` green, user watches green; both quoted in that phase's Watch log | Vitest run output + PRD Watch log at each phase |
| Failure paths covered | Duplicate email, bad password, short password, mismatched confirm password each have a failing-path test | Suite contents |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — user persistence
- Wrangler — create DB, migrations, typegen
- Web Crypto (`crypto.subtle`) — PBKDF2 hash / verify

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` — `env.quizmaker`
- shadcn/ui form primitives already in the repo (`button`, `card`, `field`, `input`, `label`)
- Zod — installed in Phase 3 for register / login body validation
- Vitest harness — installed (`npm run test`, `npm run test:watch`)

### Environment / config

- `wrangler.jsonc` `d1_databases` binding `quizmaker`
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

- **Risk**: Tests are written after the code and never observed red, so they do not signal. The user also cannot see red-to-green if implementation happens in the same turn.
- **Mitigation**: Each phase starts with Red, then **Watch red** (user runs `npm run test` before any product code). If a new test is green before implementation, rewrite it until it fails for a real reason. Quote both gates in the phase Watch log.

### User Experience Risks

- **Risk**: Teachers expect to stay logged in after refresh.
- **Mitigation**: Home page is a stub; this PRD states no sessions. A later sprint adds sessions before MCQ work that must be attributed.

- **Risk**: Username vs email confusion.
- **Mitigation**: One email field; service copies it to `username`.

- **Risk**: Teachers look for quiz tools immediately after login.
- **Mitigation**: Stub copy on `/home` states that MCQ authoring is the next sprint.

---

## Troubleshooting Guide

Issues found while implementing this slice:

### Vitest hangs after adding tests

**Problem**: `npm run test` never finishes.
**Cause**: Vitest was scanning `.next` (and similar build dirs).
**Solution**: Exclude them in `vitest.config.ts:10-16` (`.next`, `.open-next`, `.wrangler`).

### `@vitejs/plugin-react` v6 fails to load

**Problem**: Vitest / JSX transform error about Babel 8.
**Cause**: plugin-react v6 wants Babel 8; shadcn still pulls Babel 7.
**Solution**: Pin `@vitejs/plugin-react@5` (`package.json:37`).

### Fake D1 treats `DELETE` as `SELECT`

**Problem**: `deleteUser` tests fail; the in-memory fake returns a row instead of deleting.
**Cause**: Matcher used `includes("from users where id")`, which also matches `DELETE FROM users WHERE id`.
**Solution**: Require `normalized.startsWith("select")` for reads (`src/lib/services/users.test.ts:50` and `:56`).

### Logout route unused-parameter lint

**Problem**: ESLint warns on `_request` in `POST(_request)`.
**Cause**: Logout has no body and does not read the request.
**Solution**: `export async function POST()` with no args (`src/app/api/auth/logout/route.ts:1`).

### Register/login 500 under `npm run dev`

**Problem**: Form or `Invoke-RestMethod` hits 500 (`Unable to register`).
**Cause**: `npm run dev` is Node and may not expose D1 the same way as Workers.
**Solution**: Prefer `npm run preview` for anything that touches `env.quizmaker`. PowerShell `curl` is an alias; use `curl.exe` if you need raw HTTP.

### D1 binding missing on preview

**Problem**: `env.quizmaker` is undefined.
**Cause**: Binding not in `wrangler.jsonc`, or types not regenerated.
**Solution**: Add `d1_databases` with binding `quizmaker` (`wrangler.jsonc:25-32`); run `npm run cf-typegen`; restart preview.

### Unique email insert fails as 500

**Problem**: Duplicate register does not return 409.
**Cause**: Constraint error not translated.
**Solution**: Map D1 unique failures in the user service (`src/lib/services/users.ts:119-122` → `DuplicateEmailError`; register route `src/app/api/auth/register/route.ts:24-28`).

### Hash verify always fails

**Problem**: Correct password returns 401.
**Cause**: Encoding mismatch (salt / hash parse) or email not normalized the same way on login vs register.
**Solution**: Normalize email identically (`src/lib/services/users.ts:50-52`); parse the `pbkdf2$...` string with the same helpers used to write it (`src/lib/password.ts:70-98`). Confirm with `src/lib/password.test.ts` and `users.test.ts` before debugging the route.

### `@/` imports fail in Vitest

**Problem**: Tests cannot resolve `@/lib/...`.
**Cause**: Missing `vite-tsconfig-paths` in `vitest.config.ts`.
**Solution**: Plugin is already in `vitest.config.ts:3` / `:6`.

### `getCloudflareContext` throws in tests

**Problem**: User-service tests fail before any assertion.
**Cause**: jsdom has no Cloudflare context.
**Solution**: `vi.mock("@opennextjs/cloudflare")` and inject a fake `env.quizmaker` (see `src/lib/services/users.test.ts`); keep all D1 access behind `src/lib/`.

---

## Notes for AI Agents

1. Start with Overview, Hypothesis, and Scope in this file. Do not build quiz authoring, social login, tokens, cookies, or sessions.
2. Use Scope (In / Out / Cut) as the boundary. Frontend password hashing is later, not now.
3. Do not add HTTP update / delete user routes in this sprint. CRUD on the user service is enough.
4. `zod` is installed. Ask before adding any other new package. Do not add `@cloudflare/vitest-pool-workers` unless asked.
5. Apply D1 migrations locally only. Never `--remote` unless the user asks.
6. Never run `npm run deploy` unless the user asks.
7. Update phase status, acceptance checkboxes, test file lists, and this troubleshooting section as work happens.
8. Centralize SQL in `src/lib/`; numbered placeholders only.
9. Username is not a separate input; set it from normalized email.
10. Cite code as `filepath:line-number` when the implementation exists.
11. Each phase uses the same TDD loop (Red → **Watch red** → Implement → Green → **Watch green** → Acceptance → Stop). Fill that phase's **TDD completion** checklist and **Watch log**. After writing failing tests, stop and wait for the user to run `npm run test` and confirm red — do not implement yet. After tests pass, stop and wait for the user to run `npm run test` and confirm green. Do not mark COMPLETED until every box is checked. Do not start the next phase until the user confirms.
12. Never write tests that cannot fail. Never hit real D1 from Vitest. Mock `env.quizmaker`. If preview finds a bug, add a regression test (red) first, then fix (green).
13. User deploys to production. Never run `npm run deploy` unless they ask.

---

## Current Status

**Last Updated**: 2026-09-22
**Current Phase**: Phase 4 COMPLETED. Phase 5 Verify is PLANNED.
**Status**: Phases 1–4 are implemented. `/` redirects to `/login`. Successful login goes to `/home`. Instructor home has Log out only (no Login / Register). User verified the local flows (login, register, login, logout). `npm run test` is green: 11 files / 36 tests.
**Next Steps**: Start Phase 5 only after the user asks: full suite watch, `npm run lint`, `npm run build`, and `npm run preview`. Do not deploy.

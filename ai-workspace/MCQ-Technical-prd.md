Date created: 2026-09-24
Date last modified: 2026-09-24

# Multiple Choice Questions (MCQ) - Technical PRD

This is Sprint 2 of Greenfield QuizMaker. Sprint 1 (`ai-workspace/register-login-logout-prd.md`) shipped teacher identity: a D1 `users` table, PBKDF2 hashing, register / login / logout APIs and pages, and a stub instructor home at `/home`. This sprint replaces that stub with real MCQ authoring: list, create, edit, preview, and delete multiple-choice questions, plus a record of attempts made against them.

---

## Overview/Problem

Teachers can now sign in, but `/home` is a placeholder that says quiz making is next. There is nowhere to write a question, nowhere to store one, and no way to see whether a question actually reads well to a student. Every teacher's question bank still lives in a document or a spreadsheet.

This feature gives each instructor a working question bank. `/home` becomes a table of that instructor's questions with a Create button and a per-row actions menu (Edit, Preview, Delete). A create/edit page captures the question name, question text, and between two and six choices with exactly one marked correct. A preview page renders the question the way a student would see it, accepts an answer, and records that answer as an attempt so later sprints can report on question quality.

Sprint 1 deliberately shipped no sessions, which means there is currently no server-side answer to "who is logged in". `mcqs.created_by` needs that answer, so this sprint also adds a minimal signed session cookie. That is a deliberate, scoped expansion of Sprint 1's "no cookies" boundary and is recorded in Scope below.

---

## Hypothesis

We believe that giving each signed-in instructor a D1-backed MCQ bank — list, create, edit, preview, delete, plus recorded preview attempts — will let teachers build and sanity-check real questions in QuizMaker instead of in documents, and will give the next sprint the question data it needs to support collaboration and reporting.

---

## Scope

### In Scope

- Three D1 tables via migrations: `mcqs`, `mcq_choices`, `mcq_attempts` (the PRD request called these MCQTable, MCQChoicesTable, and MCQAttempts; see the naming note under Database Schema)
- A **minimal signed session cookie** so the server knows the current instructor. Login sets it, logout clears it, MCQ APIs and pages require it
- `SESSION_SECRET` in `.dev.vars` locally (placeholder in `.dev.vars.example`), `wrangler secret put` for production
- MCQ service layer in `src/lib/services/mcqs.ts`, the only module that runs SQL for these tables — same shape as `src/lib/services/users.ts`
- A question has a `name`, a `question` body, and **2 to 6 choices** with **exactly one** marked correct. Two empty choices are the default when creating
- HTTP APIs: `GET`/`POST /api/mcqs`, `GET`/`PUT`/`DELETE /api/mcqs/:id`, `GET`/`POST /api/mcqs/:id/attempts`
- Zod validation on every API body and on choice-count / single-correct-answer rules
- Pages: `/home` (list), `/home/mcqs/new` (create), `/home/mcqs/[id]/edit` (edit), `/home/mcqs/[id]/preview` (preview + record attempt)
- shadcn/ui only: `table`, `button`, `card`, `field`, `input`, `label`, `badge`, plus a three-dots actions menu and a textarea / radio primitive added with `npx shadcn@latest add`
- Ownership: an instructor sees and edits **only their own** questions. Another instructor's id in the URL is a 404, not someone else's question
- Preview writes an attempt row: the question, the chosen choice, and whether it was correct
- Write migration SQL in `migrations/` when the schema changes. **Do not apply migrations** (`--local` or `--remote`). The user applies them locally and in production.
- Every implementation phase is **red then green** and the **user watches both gates** via `npm run test`, exactly as in Sprint 1. Quote both runs in that phase's Watch log

### Out of Scope

- Student-facing quiz taking, assignment, or scoring UI. Preview is the instructor checking their own question
- Attempt analytics, dashboards, or per-question statistics screens. This sprint only stores attempt rows
- Sharing, collaboration, or a shared question bank across instructors (the list is per-instructor here)
- Question types other than single-answer multiple choice (true/false, multi-select, short answer, ordering)
- Images, rich text, LaTeX, or file attachments in questions or choices
- AI-generated questions or distractors. No AI SDK is installed and none is added here
- Tags, categories, difficulty, standards alignment, search, or pagination
- Bulk import / export (CSV, QTI)
- Password reset, email verification, MFA, social login, roles (still Sprint 1's out-of-scope list)
- Remote D1 migration apply
- Deploy to Cloudflare — the user deploys

### Cut

- **`middleware.ts` route guard** — the page-level `redirect("/login")` in each server component is fewer moving parts and easier to test; middleware on Workers adds a second runtime surface for no gain this sprint
- **JWT sessions or an auth library (Better Auth, NextAuth, Clerk)** — an HMAC-SHA256 signed cookie over Web Crypto needs no dependency and is enough for one user id
- **Sending the user id from the browser** — considered because Sprint 1 had no sessions, but any client could then claim any instructor's id. Rejected in favour of the signed cookie
- **Multiple correct answers** — the schema could hold several `is_correct` rows, but the UI, the validator, and attempt correctness all get simpler with exactly one. `is_correct` stays a per-row flag so a later sprint can relax this
- **Drag-to-reorder choices** — `position` is stored and choices render in that order, but reordering is Add / Remove only. Drag-and-drop needs a dependency we have not justified
- **Soft delete / undo** — Delete removes the row (and cascades to choices and attempts) after a confirmation dialog
- **A separate attempts list page** — `GET /api/mcqs/:id/attempts` exists because the product asked for attempt retrieval, but nothing in the UI renders it yet
- **Per-choice `updated_at`** — choices are replaced wholesale on save, so a row-level timestamp would be noise
- **`@cloudflare/vitest-pool-workers`** — unchanged from Sprint 1; unit tests mock D1 behind `src/lib/`

---

## Technical Requirements

### Database Schema

Database: Cloudflare D1 (SQLite). Binding `quizmaker` (`env.quizmaker`), already configured at `wrangler.jsonc:25-32`. No new binding is needed.

**Naming note.** The request named the tables MCQTable, MCQChoicesTable, and MCQAttempts. SQL here stays snake_case and plural to match the existing `users` table, so they are created as `mcqs`, `mcq_choices`, and `mcq_attempts`:

| Requested name | Table created | Holds |
|---|---|---|
| MCQTable | `mcqs` | One row per question |
| MCQChoicesTable | `mcq_choices` | 2–6 choices per question, one flagged correct |
| MCQAttempts | `mcq_attempts` | One row per answer submitted from Preview |

```sql
CREATE TABLE mcqs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_mcqs_created_by ON mcqs (created_by);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY,
  mcq_id TEXT NOT NULL REFERENCES mcqs (id) ON DELETE CASCADE,
  choice_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_mcq_choices_mcq_id ON mcq_choices (mcq_id);
CREATE UNIQUE INDEX idx_mcq_choices_mcq_id_position ON mcq_choices (mcq_id, position);

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY,
  mcq_id TEXT NOT NULL REFERENCES mcqs (id) ON DELETE CASCADE,
  choice_id TEXT NOT NULL REFERENCES mcq_choices (id) ON DELETE CASCADE,
  attempted_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_mcq_attempts_mcq_id ON mcq_attempts (mcq_id);
CREATE INDEX idx_mcq_attempts_attempted_by ON mcq_attempts (attempted_by);
```

| Table | Column | Type | Rules |
|---|---|---|---|
| `mcqs` | `id` | TEXT PK | `crypto.randomUUID()` in application code, same as `users` |
| | `name` | TEXT NOT NULL | Trimmed, 1–200 chars. The short label shown in the list |
| | `question` | TEXT NOT NULL | Trimmed, 1–2000 chars. The question text a student reads |
| | `created_by` | TEXT NOT NULL FK → `users.id` | Taken from the session cookie, never from the request body |
| | `created_at` / `updated_at` | TEXT | `datetime('now')`; `updated_at` reset on every save |
| `mcq_choices` | `mcq_id` | TEXT NOT NULL FK → `mcqs.id` | `ON DELETE CASCADE` |
| | `choice_text` | TEXT NOT NULL | Trimmed, 1–500 chars |
| | `is_correct` | INTEGER 0/1 | Exactly one `1` per `mcq_id` (enforced in the service and validator) |
| | `position` | INTEGER NOT NULL | 0-based display order, unique within a question |
| `mcq_attempts` | `mcq_id` | TEXT NOT NULL FK → `mcqs.id` | The question answered |
| | `choice_id` | TEXT NOT NULL FK → `mcq_choices.id` | Must belong to `mcq_id`; the service rejects a mismatch |
| | `attempted_by` | TEXT NOT NULL FK → `users.id` | Session user |
| | `is_correct` | INTEGER 0/1 | Derived server-side from the chosen choice, never trusted from the client |

**Invariants (enforced in the MCQ service, not only in SQL):**

- A question has at least 2 and at most 6 choices
- Exactly one choice per question has `is_correct = 1`
- `positions` are `0..n-1` with no gaps
- `created_by` comes from the session; a body field named `createdBy` is ignored if present
- Every read and write is scoped by `created_by = <session user>`; a question owned by someone else behaves as "not found"
- `mcq_attempts.is_correct` is computed from the stored choice, not supplied by the caller

SQLite cannot cheaply express "exactly one correct choice" without a trigger, and D1 does not enforce foreign keys inside a `batch()` the way a long-lived SQLite connection does. So the service deletes children explicitly rather than relying only on `ON DELETE CASCADE`, and the cascade stays as a safety net.

Migration workflow (from `.cursor/rules/d1.mdc`):

1. `npx wrangler d1 migrations create quizmaker create_mcqs`
2. Put the SQL above in the generated file under `migrations/`
3. **Do not apply** the migration. The user applies it locally and in production.

All three tables go in one migration: they are one unit of schema and the foreign keys reference each other.

### Sessions

New this sprint, and the reason MCQ ownership can be trusted.

- Cookie name: `quizmaker_session`
- Value: `<userId>.<expiresAtEpochSeconds>.<base64url HMAC-SHA256 of "<userId>.<expiresAt>">`
- Signed with `SESSION_SECRET` using Web Crypto (`crypto.subtle.importKey` + `sign`), so no dependency is added
- Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure`, `Max-Age=604800` (7 days)
- `POST /api/auth/login` returns `Set-Cookie` with a fresh session on 200. Failed login sets nothing
- `POST /api/auth/logout` returns `Set-Cookie` with the same cookie name, empty value and `Max-Age=0`
- Verification fails closed: bad signature, missing parts, or a past `expiresAt` all yield `null`. Signature comparison is timing-safe
- A valid signature is **not** proof the user still exists; the MCQ service joins on `users` via the foreign key, and a deleted user's questions cascade away

`src/lib/session.ts` exposes:

| Function | Used by |
|---|---|
| `createSessionCookie(userId)` | Login route — returns the `Set-Cookie` string |
| `clearedSessionCookie()` | Logout route — returns the expiring `Set-Cookie` string |
| `getSessionUserIdFromCookieHeader(header)` | Route handlers, which already have `request.headers` |
| `getSessionUserId()` | Server Components, via `cookies()` from `next/headers` |

Route handlers read the header they already have rather than `next/headers`, which keeps route tests free of a `next/headers` mock.

### API Endpoints

Next.js App Router handlers under `src/app/api/mcqs/`. They validate with Zod, resolve the session user, then call the MCQ service. They never run SQL themselves.

Every route in this section returns **401 `{ "error": "Not signed in" }`** when the session cookie is missing or invalid, and **404 `{ "error": "Question not found" }`** when the id does not exist *or* belongs to another instructor. The two cases are deliberately indistinguishable so the API does not leak which ids exist.

Public JSON shapes:

```json
{
  "id": "uuid",
  "name": "Photosynthesis basics",
  "question": "Which gas do plants absorb during photosynthesis?",
  "createdBy": "user-uuid",
  "createdAt": "2026-09-24 12:00:00",
  "updatedAt": "2026-09-24 12:00:00",
  "choices": [
    { "id": "uuid", "text": "Carbon dioxide", "isCorrect": true, "position": 0 },
    { "id": "uuid", "text": "Oxygen", "isCorrect": false, "position": 1 }
  ]
}
```

List rows omit `choices` (the table only shows name and question text):

```json
{
  "id": "uuid",
  "name": "Photosynthesis basics",
  "question": "Which gas do plants absorb during photosynthesis?",
  "choiceCount": 4,
  "createdAt": "2026-09-24 12:00:00",
  "updatedAt": "2026-09-24 12:00:00"
}
```

---

#### GET /api/mcqs

Lists the signed-in instructor's questions, newest `updated_at` first.

**Response:**

- Success (200): `{ "mcqs": [ ...list rows ] }` (empty array when the instructor has none)
- Error (401): not signed in
- Error (500): `{ "error": "Unable to load questions" }`

---

#### POST /api/mcqs

Creates a question and its choices in one call.

**Request body:**

```json
{
  "name": "Photosynthesis basics",
  "question": "Which gas do plants absorb during photosynthesis?",
  "choices": [
    { "text": "Carbon dioxide", "isCorrect": true },
    { "text": "Oxygen", "isCorrect": false }
  ]
}
```

**Validation:**

- `name`: non-empty after trim, max 200
- `question`: non-empty after trim, max 2000
- `choices`: array of 2–6 items; each `text` non-empty after trim, max 500
- Exactly one choice has `isCorrect: true` — zero or two or more is a 400
- `position` is assigned from array order; a client-sent `position` or `createdBy` is ignored

**Response:**

- Success (201): `{ "mcq": { ...full question with choices } }`
- Error (400): `{ "error": "..." }` — first validation message
- Error (401): not signed in
- Error (500): `{ "error": "Unable to create question" }`

---

#### GET /api/mcqs/:id

Loads one question with its choices, for the edit and preview pages.

**Response:**

- Success (200): `{ "mcq": { ...full question with choices } }`
- Error (401): not signed in
- Error (404): not found or not owned by the caller
- Error (500): `{ "error": "Unable to load question" }`

---

#### PUT /api/mcqs/:id

Updates name, question, and choices. Choices are **replaced**: the old rows are deleted and the submitted ones inserted with fresh positions. Body shape and validation are identical to `POST /api/mcqs`.

Replacing choices deletes their rows, and `mcq_attempts.choice_id` cascades — so **editing a question discards its previous attempts**. That is the intended behaviour here: an attempt against wording that no longer exists is not meaningful data. It is called out in Risks.

**Response:**

- Success (200): `{ "mcq": { ...full question with choices } }`
- Error (400): validation failure
- Error (401): not signed in
- Error (404): not found or not owned by the caller
- Error (500): `{ "error": "Unable to update question" }`

---

#### DELETE /api/mcqs/:id

Deletes the question, its choices, and its attempts.

**Response:**

- Success (200): `{ "ok": true }`
- Error (401): not signed in
- Error (404): not found or not owned by the caller
- Error (500): `{ "error": "Unable to delete question" }`

---

#### POST /api/mcqs/:id/attempts

Records one answer from the preview page and tells the caller whether it was right.

**Request body:**

```json
{ "choiceId": "choice-uuid" }
```

**Validation:**

- `choiceId`: non-empty string that belongs to this `:id`. A choice from another question is a **400**, not a 404, because the question itself was found
- `isCorrect` is computed from the stored choice. A client-sent `isCorrect` is ignored

**Response:**

- Success (201): `{ "attempt": { "id": "uuid", "mcqId": "uuid", "choiceId": "uuid", "isCorrect": false, "createdAt": "..." }, "correctChoiceId": "uuid" }`
- Error (400): `{ "error": "That choice does not belong to this question" }` or a validation message
- Error (401): not signed in
- Error (404): question not found or not owned by the caller
- Error (500): `{ "error": "Unable to record attempt" }`

`correctChoiceId` is returned so preview can highlight the right answer after submitting.

---

#### GET /api/mcqs/:id/attempts

Returns attempts for one question, newest first. Built because the product asked for attempt retrieval; no UI consumes it this sprint.

**Response:**

- Success (200): `{ "attempts": [ { "id", "mcqId", "choiceId", "isCorrect", "createdAt" } ] }`
- Error (401): not signed in
- Error (404): not found or not owned by the caller
- Error (500): `{ "error": "Unable to load attempts" }`

---

#### MCQ service methods

`src/lib/services/mcqs.ts` is the only module that talks to D1 for these tables. Every function takes the owning user id as its first argument so ownership cannot be forgotten at a call site.

| Method | Behavior |
|---|---|
| `listMcqs(userId)` | List rows for that instructor, newest `updated_at` first, with `choiceCount` |
| `createMcq(userId, input)` | Insert question + choices; assign ids and positions; return the full question |
| `getMcq(userId, id)` | Full question with choices ordered by `position`, or `null` if missing / not owned |
| `updateMcq(userId, id, input)` | Update fields, replace choices, bump `updated_at`; `null` if missing / not owned |
| `deleteMcq(userId, id)` | Delete attempts, choices, then the question; `false` if missing / not owned |
| `recordAttempt(userId, id, choiceId)` | Verify the choice belongs to the question, compute correctness, insert; throws `ChoiceMismatchError` |
| `listAttempts(userId, id)` | Attempts for an owned question, newest first |
| `ChoiceMismatchError` | Thrown for a choice from another question; routes map it to 400 |
| `InvalidChoiceSetError` | Thrown when choice count or correct-answer count is wrong; defence in depth behind Zod |

Multi-statement writes use `db.batch([...])` so a half-saved question is not left behind.

### User Interface Requirements

shadcn/ui only. Already installed: `badge`, `button`, `card`, `dialog`, `field`, `input`, `label`, `separator`, `table`. Still needed, added with `npx shadcn@latest add @shadcn/<name>` at the start of the UI phase:

| Need | Component to add | Note |
|---|---|---|
| Three-dots row actions | `dropdown-menu` | Base UI may expose this as `menu` instead. Try `@shadcn/dropdown-menu` first, then `@shadcn/menu`. If neither exists, build the trigger from `button` + `dialog` and say so rather than inventing a primitive |
| Question text input | `textarea` | Multi-line question body |
| Correct-answer selection | `radio-group` | One correct choice per question; falls back to native `input type="radio"` styled with `cn()` if unavailable |

These are source files copied into the repo, not npm packages, so they need no dependency approval. Anything that *is* an npm package gets proposed first. Do not add `react-hook-form`. Icons come from `lucide-react`, already installed (`MoreVertical`, `Plus`, `Trash2`, `Pencil`, `Eye`).

#### Instructor home / MCQ list (`/home`)

- Server Component. Reads the session; no session means `redirect("/login")`
- Loads the instructor's questions through the MCQ service directly (server-side, no `fetch` to our own API)
- Header keeps **Log out** at the top right, as Sprint 1 built it. Still no Login or Register link
- Page title plus a **Create question** button that navigates to `/home/mcqs/new`
- shadcn `Table` with columns: **Name**, **Question**, **Actions**
  - Question text is truncated to one line; the full text lives on the edit and preview pages
  - **Actions** is a three-dots (`MoreVertical`) icon button with an accessible name, opening a menu with **Edit**, **Preview**, and **Delete**
  - Edit → `/home/mcqs/[id]/edit`, Preview → `/home/mcqs/[id]/preview`
  - Delete opens a confirmation `Dialog`; confirming sends `DELETE /api/mcqs/:id` and refreshes the list
- Empty state: a short line explaining there are no questions yet and the same Create button. No empty table shell

#### Create / edit question (`/home/mcqs/new` and `/home/mcqs/[id]/edit`)

One client component, `McqForm`, serves both. `new` renders it empty with two blank choices; `edit` renders it with the loaded question. The edit page 404s (`notFound()`) for an id the instructor does not own.

- Fields: **Name** (`input`), **Question** (`textarea`)
- **Choices**: 2 rows by default, up to **6**
  - Each row: a text `input`, a radio marking it the correct answer, and a Remove button
  - Remove is disabled while only 2 choices remain
  - **Add choice** is disabled at 6
  - Removing the choice currently marked correct clears the selection, so Save reports the missing correct answer rather than silently picking one
- Client validation before submit: name required, question required, every choice non-empty, 2–6 choices, exactly one correct. Errors surface through `FieldError`
- **Save** → `POST /api/mcqs` (new) or `PUT /api/mcqs/:id` (edit). On success, navigate to `/home`
- **Cancel** → back to `/home` without saving
- API errors render on the form; the form stays filled in so nothing is retyped
- Save is disabled while a request is in flight so a double click cannot create two questions

#### Preview question (`/home/mcqs/[id]/preview`)

- Shows the question as a student would see it: name, question text, and the choices as radios in `position` order
- The correct answer is **not** revealed before submitting
- **Submit answer** sends `POST /api/mcqs/:id/attempts` with the selected `choiceId`
- After the response: a clear correct / incorrect result, and the correct choice marked using `correctChoiceId`
- **Try again** resets the selection and allows another attempt (each submit is another row in `mcq_attempts`)
- Links back to `/home` and to this question's Edit page
- Submitting with nothing selected shows a validation message and sends no request

**Client vs server:** D1, the MCQ service, and the session secret stay in `src/lib/` and are never imported by a `'use client'` component. Pages are Server Components that read the session and pass plain data down; only the form, the actions menu, the delete dialog, and the preview answer panel are client components.

---

## Testing Strategy

Preferred framework: **Vitest** (`.cursor/skills/testing/SKILL.md`). Identical loop to Sprint 1. A phase is not COMPLETED until its checklist **and Watch log** are fully filled.

### The TDD loop (copy this for every phase)

Do these steps **in order**. Do not skip Red. Do not skip the user Watch gates. Do not mark COMPLETED mid-loop.

Red and green are **terminal output from `npm run test`**, not a change in the QuizMaker UI. The user must be able to run that command themselves at each gate. Paste the quoted result into that phase's **Watch log**.

| Step | Name | What you do | Done when |
|------|------|-------------|-----------|
| 1 | **Red** | Write the tests listed on that phase **before** the product code. Import the module / route / component that does not exist yet (or does not behave yet). Run `npm run test`. | New tests fail for a **real** reason (missing file, missing export, wrong SQL, wrong status). If they pass already, they cannot fail — rewrite them. Quote the failure in the Watch log. |
| 2 | **Watch red** | **Stop.** Do not implement yet. Tell the user to run `npm run test` and look at the failure. Update this PRD (phase status = IN PROGRESS / RED, Watch log red row filled). | User confirms they saw red. |
| 3 | **Implement** | Write only enough code (or SQL / Wrangler steps Vitest cannot reach) to satisfy those tests. | Code exists; do not claim done yet. |
| 4 | **Green** | Run `npm run test` again. | This phase's tests pass. **All earlier phases and all 36 Sprint 1 tests stay green.** Quote the passing count in the Watch log. |
| 5 | **Watch green** | **Stop.** Tell the user to run `npm run test` and look at the passing suite. Update this PRD (phase status = IN PROGRESS / GREEN, Watch log green row filled). | User confirms they saw green. |
| 6 | **Acceptance** | Tick the acceptance-criteria boxes this phase owns. | Green suite **and** those boxes. Neither alone is enough. |
| 7 | **Stop** | Update this PRD (phase status, TDD checklist, status table, Watch log). **Do not start the next phase.** | User has reviewed and confirmed. |

**Phase 6** adds no new product surface. The suite should already be green — the user still runs `npm run test` and watches that green. A preview bug is a mini-loop: regression test first (red + user watches red) → fix (green + user watches green).

### Sprint 1 regression rule

Sprint 1 ended at **11 files / 36 tests**, all green. Phase 2 changes login and logout to set and clear cookies, so `src/app/api/auth/login/route.test.ts` and `logout/route.test.ts` gain assertions; Phase 5 replaces the `/home` stub, so `src/components/home/instructor-home.test.tsx` is rewritten for the list. Those edits happen **in the same phase as the behaviour change**, going red for the old contract and green for the new one. Every other Sprint 1 test must stay untouched and green. If a Sprint 1 test starts failing for a reason this PRD does not name, that is a bug in the new code — not a test to loosen.

### Phase TDD completion checklist (required on every phase)

```
TDD completion:
- [ ] Red: listed tests written first
- [ ] Red: `npm run test` observed failing (quote the failure in the Watch log)
- [ ] Watch red: user ran `npm run test` and confirmed the failure; no implementation until then
- [ ] Implement: only enough to satisfy those tests
- [ ] Green: `npm run test` passing (this phase + all earlier phases + Sprint 1; quote in the Watch log)
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
| Sprint 1 baseline | Yes | 11 files / 36 tests | Green | Yes | COMPLETED |
| 1 MCQ migrations | **Yes** | `migrations/create_mcqs.schema.test.ts` | Green: 12 files / 37 tests | Yes | COMPLETED |
| 2 Session cookie | **Yes** | `src/lib/session.test.ts`, updated auth route tests | Green: 13 files / 44 tests | Yes | COMPLETED |
| 3 MCQ service | Planned | `src/lib/services/mcqs.test.ts` | — | No | PLANNED |
| 4 MCQ APIs | Planned | `src/lib/validators/mcq.test.ts`, `src/app/api/mcqs/**/route.test.ts` | — | No | PLANNED |
| 5 MCQ UI | Planned | `src/components/mcq/*.test.tsx`, updated `instructor-home.test.tsx` | — | No | PLANNED |
| 6 Verify | Mini-loop only if a bug appears | Full suite stays green | — | No | PLANNED |

### Rules

Unchanged from Sprint 1, and they carry forward:

- Colocate: `src/lib/services/mcqs.ts` → `src/lib/services/mcqs.test.ts`; client components → `*.test.tsx`
- Prove observable behavior. Never `expect(true).toBe(true)` or assertions that cannot fail
- Cover failure paths: 401 without a session, 404 for another instructor's question, 400 for one correct answer missing, 400 for a choice from another question
- Each test must pass alone. `vi.clearAllMocks()` in `beforeEach`
- Unit tests never reach real D1 or the network
- Mock `getCloudflareContext()`; keep D1 behind `src/lib/` and mock that module
- Query by role and accessible name. Prefer `userEvent` over `fireEvent`
- Server Components cannot be rendered by Testing Library. Test their data logic as functions; `render` is for client components
- Reuse the in-memory fake D1 pattern from `src/lib/services/users.test.ts:23-78`, including the `startsWith("select")` matcher fix so `DELETE FROM` is not treated as a read

### Ownership tests are not optional

Every service read and write has a test proving another instructor's id cannot reach the row, and every route has a test proving a missing cookie is a 401. Ownership is the one thing in this sprint that is a security boundary rather than a convenience, so it gets the same test attention as the happy path.

### What we do not test this sprint

- Real Workers runtime / live D1 (that is `npm run preview` plus manual checks in Phase 6)
- Visual layout, theming, and shadcn internals
- Cookie behaviour in a real browser (`HttpOnly`, `Secure`) — asserted on the `Set-Cookie` string, confirmed by hand on preview

### Phase-exit gate

| Phase | Tests start | Expected first `npm run test` | Done when |
|-------|-------------|-------------------------------|-----------|
| 1 | Schema contract test | Red: no `create_mcqs` SQL, or SQL missing tables / columns / FKs | Green schema test + local D1 apply + Watch log |
| 2 | Session + updated auth route tests | Red: `@/lib/session` missing; login sets no cookie | Green session tests + Watch log |
| 3 | MCQ service tests | Red: `@/lib/services/mcqs` missing or ownership/CRUD wrong | Green service tests + Watch log |
| 4 | Validator + route tests | Red: handlers missing or wrong status / body | Green API tests + Watch log |
| 5 | Client component tests | Red: list / form / preview components missing | Green UI tests + Watch log |
| 6 | Full suite + any regression test | Suite green; a new bug's test starts red | Green suite + lint + build + preview notes + user watched green |

---

## Implementation Phases

### Phase 1: MCQ migrations - COMPLETED

**Objective**: Local D1 has `mcqs`, `mcq_choices`, and `mcq_attempts` from a migration. Schema contract test goes red, then green.

**Red (write first, confirm fail):**

| File | What it proves | Why it is red first |
|------|----------------|---------------------|
| `migrations/create_mcqs.schema.test.ts` | The migration SQL creates all three tables with the required columns; `mcqs.created_by` references `users (id)`; `mcq_choices.mcq_id` and `mcq_attempts.mcq_id` / `choice_id` cascade on delete; `is_correct` is constrained to 0/1; the `(mcq_id, position)` unique index and the `created_by` / `mcq_id` indexes exist | The migration file does not exist |

Same shape as `migrations/create_users.schema.test.ts:23-47`: read the `.sql` file, compact the whitespace, assert on the text. No database is mocked and none is touched.

**Watch red (required):** Stop. User runs `npm run test` and confirms the failure before any implementation.

**Implement:**

1. `npx wrangler d1 migrations create quizmaker create_mcqs`
2. Put the Database Schema SQL in the generated file
3. User applied `0002_create_mcqs` locally and in production. Later phases **do not** run `d1 migrations apply`
4. No `wrangler.jsonc` change and no `cf-typegen` — the `quizmaker` binding already exists

**Green / acceptance:**

- `npm run test` green (new schema test + all 36 Sprint 1 tests)
- Acceptance owned here: local D1 has all three tables from a migration, with the documented foreign keys and indexes

**Watch green (required):** Stop. User runs `npm run test` and confirms the passing suite.

**TDD completion:**

- [x] Red: listed tests written first (`migrations/create_mcqs.schema.test.ts`)
- [x] Red: `npm run test` observed failing (quote the failure in the Watch log)
- [x] Watch red: user confirmed `11 files / 36 tests` (Sprint 1 still green; schema test red)
- [x] Implement: `0002_create_mcqs.sql` written and applied to local D1 only
- [x] Green: `npm run test` passing (this phase + Sprint 1; quote in the Watch log)
- [x] Watch green: user confirmed Phase 1 looks good (local and production apply verified)
- [x] Acceptance: this phase's criteria checked (three tables from a migration; FKs and indexes in SQL)
- [x] Stop: PRD status updated; waiting for user confirmation before Phase 2

**Watch log:**

| Gate | `npm run test` result (quote) | User watched? |
|------|-------------------------------|---------------|
| Red (before implement) | `FAIL  migrations/create_mcqs.schema.test.ts > mcqs migration > creates mcqs, mcq_choices, and mcq_attempts with columns, foreign keys, and indexes` — `AssertionError: expected 0 to be greater than 0` at `create_mcqs.schema.test.ts:12`. `Test Files  1 failed \| 11 passed (12)` / `Tests  1 failed \| 36 passed (37)` | Yes — user quoted `11 files / 36 tests` and said implement |
| Green (after implement) | `Test Files  12 passed (12)` / `Tests  37 passed (37)` | Yes — user confirmed Phase 1 looks good |

**Deliverables**:

- `migrations/0002_create_mcqs.sql` with all three tables
- `migrations/create_mcqs.schema.test.ts` observed red, then green
- User applied the migration locally and in production. Agents do not apply further migrations.

### Phase 2: Signed session cookie - COMPLETED

**Objective**: The server can tell who is signed in. Login issues a session, logout clears it, and the helpers MCQ code will depend on exist and fail closed.

**Red (write first, confirm fail):**

| File | What it proves | Why it is red first |
|------|----------------|---------------------|
| `src/lib/session.test.ts` | `createSessionCookie` returns a `Set-Cookie` with `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure`, and a `Max-Age`; the cookie value contains the user id and a signature, not a bare id; `getSessionUserIdFromCookieHeader` round-trips the id; it returns `null` for a tampered id, a tampered signature, a missing cookie, a malformed value, and an expired `expiresAt`; `clearedSessionCookie` expires the same cookie name | `@/lib/session` does not exist |
| `src/app/api/auth/login/route.test.ts` (**updated**) | A 200 login response carries a `Set-Cookie` for `quizmaker_session`; a 401 carries none | The current route sets no cookie (`src/app/api/auth/login/route.ts:29`) |
| `src/app/api/auth/logout/route.test.ts` (**updated**) | The 200 response clears `quizmaker_session` with `Max-Age=0` and still returns `{ "ok": true }` | The current route returns a body only (`src/app/api/auth/logout/route.ts:1-2`) |

The tamper cases are the point of this phase. A test that only round-trips a valid cookie would pass against an unsigned `userId` cookie and prove nothing.

**Watch red (required):** Stop. User runs `npm run test` and confirms the failure before any implementation.

**Implement:**

1. `src/lib/session.ts` — HMAC-SHA256 sign / verify over Web Crypto, timing-safe comparison (reuse the approach in `src/lib/password.ts:28-35`), cookie serialize / parse
2. Read `SESSION_SECRET` through `getCloudflareContext()` alongside the D1 binding in `src/lib/db.ts`; throw a clear error if it is missing rather than signing with a default
3. Add `SESSION_SECRET` to `.dev.vars` (gitignored) and an empty placeholder to `.dev.vars.example`; run `npm run cf-typegen`
4. Login route: attach `createSessionCookie(user.id)` on success
5. Logout route: attach `clearedSessionCookie()`
6. `getSessionUserId()` for Server Components via `cookies()` from `next/headers`

No MCQ code in this phase.

**Green / acceptance:**

- `npm run test` green (Phases 1–2 + Sprint 1, with the two updated auth route tests)
- Acceptance owned here: login sets an `HttpOnly` signed session; logout clears it; a tampered or expired cookie resolves to no user

**Watch green (required):** Stop. User runs `npm run test` and confirms the passing suite.

**TDD completion:**

- [x] Red: listed tests written first (`src/lib/session.test.ts`, updated login and logout route tests)
- [x] Red: `npm run test` observed failing (quote the failure in the Watch log)
- [x] Watch red: user confirmed the red and asked to implement
- [x] Implement: `src/lib/session.ts`, login/logout Set-Cookie, `SESSION_SECRET` via `.dev.vars` + typegen
- [x] Green: `npm run test` passing (this phase + earlier + Sprint 1; quote in the Watch log)
- [x] Watch green: user confirmed Phase 2 looks good
- [x] Acceptance: this phase's criteria checked (login sets signed session; logout clears it; tamper/expiry fail closed)
- [x] Stop: PRD status updated; waiting for user confirmation before Phase 3

**Watch log:**

| Gate | `npm run test` result (quote) | User watched? |
|------|-------------------------------|---------------|
| Red (before implement) | `Failed to resolve import "@/lib/session"` from `src/lib/session.test.ts`. Login 200: `expected null to be truthy` (`set-cookie`). Logout: `expected null to be truthy` (`set-cookie`). `Test Files  3 failed \| 10 passed (13)` / `Tests  2 failed \| 35 passed (37)` | Yes — user confirmed red |
| Green (after implement) | `Test Files  13 passed (13)` / `Tests  44 passed (44)` | Yes — user confirmed Phase 2 looks good |

**Deliverables**:

- `src/lib/session.ts` + `src/lib/session.test.ts`
- Login and logout routes issuing and clearing the cookie, with updated tests
- `SESSION_SECRET` in `.dev.vars` and `.dev.vars.example`; regenerated `cloudflare-env.d.ts`

### Phase 3: MCQ service layer - PLANNED

**Objective**: A server-only module can list, create, read, update, and delete questions with their choices, and record and list attempts — always scoped to the owning instructor.

**Red (write first, confirm fail):**

| File | What it proves | Why it is red first |
|------|----------------|---------------------|
| `src/lib/services/mcqs.test.ts` | `createMcq` stores trimmed name and question, sets `created_by` from the argument, and writes choices with positions `0..n-1` and exactly one `is_correct`; `getMcq` returns choices ordered by position; `listMcqs` returns only that instructor's rows, newest `updated_at` first, with `choiceCount`; `getMcq` / `updateMcq` / `deleteMcq` / `listAttempts` all return null-or-false for **another instructor's** id; `updateMcq` replaces choices and bumps `updated_at`; `deleteMcq` removes attempts, choices, and the question; `recordAttempt` computes `is_correct` from the stored choice and throws `ChoiceMismatchError` for a choice from another question; fewer than 2, more than 6, or not exactly one correct choice throws `InvalidChoiceSetError` | `@/lib/services/mcqs` does not exist |

Extend the in-memory fake D1 from `src/lib/services/users.test.ts:23-78` to cover the three new tables and `batch()`. Never touch real D1.

**Watch red (required):** Stop. User runs `npm run test` and confirms the failure before any implementation.

**Implement:**

1. `src/lib/services/mcqs.ts` with the methods in the API Endpoints service table
2. Prepared statements, numbered placeholders (`?1`, `?2`), `db.batch([...])` for multi-statement writes
3. Row → public mappers (`snake_case` → `camelCase`), same style as `toPublicUser` (`src/lib/services/users.ts:58-68`)
4. `ChoiceMismatchError` and `InvalidChoiceSetError`, same shape as `DuplicateEmailError` (`src/lib/services/users.ts:7-12`)
5. Ownership in the SQL `WHERE` clause, not filtered in JavaScript after the read

**Green / acceptance:**

- `npm run test` green (Phases 1–3 + Sprint 1)
- Acceptance owned here: choices persist with positions and one correct answer; attempt correctness is computed server-side; another instructor's question is unreachable through every service method

**Watch green (required):** Stop. User runs `npm run test` and confirms the passing suite.

**TDD completion:**

- [ ] Red: listed tests written first
- [ ] Red: `npm run test` observed failing (quote the failure in the Watch log)
- [ ] Watch red: user ran `npm run test` and confirmed the failure; no implementation until then
- [ ] Implement: only enough to satisfy those tests
- [ ] Green: `npm run test` passing (this phase + earlier + Sprint 1; quote in the Watch log)
- [ ] Watch green: user ran `npm run test` and confirmed the passing suite
- [ ] Acceptance: this phase's criteria checked
- [ ] Stop: PRD status updated; waiting for user confirmation before Phase 4

**Watch log:**

| Gate | `npm run test` result (quote) | User watched? |
|------|-------------------------------|---------------|
| Red (before implement) | | No — do not implement until Yes |
| Green (after implement) | | No — not COMPLETED until Yes |

**Deliverables**:

- `src/lib/services/mcqs.ts` + `src/lib/services/mcqs.test.ts`
- Public MCQ / choice / attempt types
- Extended in-memory fake D1 covering the three tables and `batch()`

### Phase 4: MCQ API routes - PLANNED

**Objective**: HTTP surface for list, create, read, update, delete, and attempts — each one session-guarded.

**Red (write first, confirm fail):**

| File | What it proves | Why it is red first |
|------|----------------|---------------------|
| `src/lib/validators/mcq.test.ts` | Rejects empty name / question, over-length fields, fewer than 2 or more than 6 choices, an empty choice text, zero correct answers, and two correct answers; accepts a valid body; the attempt schema requires a non-empty `choiceId` | The validator does not exist |
| `src/app/api/mcqs/route.test.ts` | `GET` 200 lists only the session user's questions and 401 without a cookie; `POST` 201 returns the question with choices, 400 on validation failure, 401 without a cookie, and ignores a client-sent `createdBy` | The route does not exist |
| `src/app/api/mcqs/[id]/route.test.ts` | `GET` 200 / 404 (missing **and** other-owner) / 401; `PUT` 200 / 400 / 404 / 401; `DELETE` 200 `{ ok: true }` / 404 / 401 | The route does not exist |
| `src/app/api/mcqs/[id]/attempts/route.test.ts` | `POST` 201 returns the attempt with server-computed `isCorrect` plus `correctChoiceId`, ignores a client-sent `isCorrect`, 400 for a choice from another question, 404 for an unowned question, 401 without a cookie; `GET` 200 lists attempts newest first | The route does not exist |

Mock the MCQ service and `@/lib/session`, not D1. Build `Request` objects with and without a `Cookie` header.

**Watch red (required):** Stop. User runs `npm run test` and confirms the failure before any implementation.

**Implement:**

1. `src/lib/validators/mcq.ts` — Zod schemas, including a `superRefine` for the exactly-one-correct rule
2. `src/app/api/mcqs/route.ts` — `GET`, `POST`
3. `src/app/api/mcqs/[id]/route.ts` — `GET`, `PUT`, `DELETE`
4. `src/app/api/mcqs/[id]/attempts/route.ts` — `GET`, `POST`
5. A small shared helper that resolves the session user or returns the 401 response, so all six handlers guard identically
6. Map `ChoiceMismatchError` → 400 and a null service result → 404

No new npm package: `zod` is already installed (`package.json:28`).

**Green / acceptance:**

- `npm run test` green (Phases 1–4 + Sprint 1)
- Acceptance owned here: every MCQ endpoint 401s without a session and 404s for another instructor's id; create / update reject a bad choice set with 400; attempts store server-computed correctness

**Watch green (required):** Stop. User runs `npm run test` and confirms the passing suite.

**TDD completion:**

- [ ] Red: listed tests written first
- [ ] Red: `npm run test` observed failing (quote the failure in the Watch log)
- [ ] Watch red: user ran `npm run test` and confirmed the failure; no implementation until then
- [ ] Implement: only enough to satisfy those tests
- [ ] Green: `npm run test` passing (this phase + earlier + Sprint 1; quote in the Watch log)
- [ ] Watch green: user ran `npm run test` and confirmed the passing suite
- [ ] Acceptance: this phase's criteria checked
- [ ] Stop: PRD status updated; waiting for user confirmation before Phase 5

**Watch log:**

| Gate | `npm run test` result (quote) | User watched? |
|------|-------------------------------|---------------|
| Red (before implement) | | No — do not implement until Yes |
| Green (after implement) | | No — not COMPLETED until Yes |

**Deliverables**:

- `src/lib/validators/mcq.ts` + test
- Three route files under `src/app/api/mcqs/` + colocated tests
- Shared session guard helper for route handlers

### Phase 5: MCQ pages - PLANNED

**Objective**: Instructors can list, create, edit, preview, and delete questions in the browser.

**Red (write first, confirm fail):**

| File | What it proves | Why it is red first |
|------|----------------|---------------------|
| `src/components/mcq/mcq-list.test.tsx` | Renders a `table` with Name, Question, and Actions headers and one row per question; the three-dots trigger has an accessible name; opening it shows Edit, Preview, and Delete; Edit and Preview point at `/home/mcqs/[id]/edit` and `/home/mcqs/[id]/preview`; Delete opens a confirmation and only then sends `DELETE /api/mcqs/:id`; a **Create question** action points at `/home/mcqs/new`; the empty state shows the no-questions message and Create instead of an empty table | The component does not exist |
| `src/components/mcq/mcq-form.test.tsx` | Renders name, question, and **two** empty choices by default; **Add choice** adds rows up to 6 then disables; Remove is disabled at 2 choices; removing the correct choice clears the selection; submit is blocked with a message when a field is empty or no correct answer is chosen; a valid new question POSTs `/api/mcqs` with 2–6 choices and exactly one `isCorrect: true`, then navigates to `/home`; in edit mode it prefills from the loaded question and PUTs `/api/mcqs/:id`; an API error renders and the typed values survive | The component does not exist |
| `src/components/mcq/mcq-preview.test.tsx` | Renders the question and its choices in position order without revealing the answer; submitting with nothing selected shows a message and sends no request; selecting and submitting POSTs `/api/mcqs/:id/attempts` with the chosen `choiceId`; an incorrect response shows an incorrect result and marks the correct choice from `correctChoiceId`; a correct response shows a correct result; **Try again** clears the result and allows another submit | The component does not exist |
| `src/components/home/instructor-home.test.tsx` (**rewritten**) | Instructor home renders the MCQ list and the Create button, keeps **Log out** top-right, and no longer shows the "quiz making is next" stub copy | The current component is the Sprint 1 stub (`src/components/home/instructor-home.tsx:10-14`) |

Mock `fetch` and `next/navigation`. Pages are Server Components and are not rendered by Testing Library — their redirect / `notFound()` logic is exercised through the session and service functions they call.

**Watch red (required):** Stop. User runs `npm run test` and confirms the failure before any implementation.

**Implement:**

1. Add the missing shadcn components (`dropdown-menu` or `menu`, `textarea`, `radio-group`) and report what the registry actually provided
2. `src/components/mcq/mcq-list.tsx` (`'use client'`) — table, actions menu, delete confirmation dialog
3. `src/components/mcq/mcq-form.tsx` (`'use client'`) — shared create / edit form with the choices editor
4. `src/components/mcq/mcq-preview.tsx` (`'use client'`) — answer panel that records an attempt
5. `src/components/home/instructor-home.tsx` — Log out top-right plus the list and Create button
6. Pages: `/home` (session redirect + service load), `/home/mcqs/new`, `/home/mcqs/[id]/edit` (`notFound()` when unowned), `/home/mcqs/[id]/preview`
7. `'use client'` only on those three components; no `@/lib/db`, `@/lib/session`, or `@/lib/services/*` import in any of them

**Green / acceptance:**

- `npm run test` green (Phases 1–5 + Sprint 1)
- Acceptance owned here: the list, three-dots menu, create / edit page with Save and Cancel, 2–6 choice editor, delete confirmation, and preview-records-an-attempt all work; `/home` redirects to `/login` without a session

**Watch green (required):** Stop. User runs `npm run test` and confirms the passing suite.

**TDD completion:**

- [ ] Red: listed tests written first
- [ ] Red: `npm run test` observed failing (quote the failure in the Watch log)
- [ ] Watch red: user ran `npm run test` and confirmed the failure; no implementation until then
- [ ] Implement: only enough to satisfy those tests
- [ ] Green: `npm run test` passing (this phase + earlier + Sprint 1; quote in the Watch log)
- [ ] Watch green: user ran `npm run test` and confirmed the passing suite
- [ ] Acceptance: this phase's criteria checked
- [ ] Stop: PRD status updated; waiting for user confirmation before Phase 6

**Watch log:**

| Gate | `npm run test` result (quote) | User watched? |
|------|-------------------------------|---------------|
| Red (before implement) | | No — do not implement until Yes |
| Green (after implement) | | No — not COMPLETED until Yes |

**Deliverables**:

- `src/components/mcq/mcq-list.tsx`, `mcq-form.tsx`, `mcq-preview.tsx` + colocated tests
- Rewritten `src/components/home/instructor-home.tsx` + test
- Pages `/home`, `/home/mcqs/new`, `/home/mcqs/[id]/edit`, `/home/mcqs/[id]/preview`
- Newly added shadcn components under `src/components/ui/`

### Phase 6: Verify - PLANNED

**Objective**: Prove the sprint works before calling it done. The suite should already be **green**. Preview covers real D1, real cookies, and the Workers runtime.

**Red (only if preview finds a bug):**

Write or tighten a Vitest case in the matching phase's file first. `npm run test` must go red for that bug. **Stop** so the user can watch that red before the fix.

**Gate (suite already green):**

1. `npm run test` — full suite green. **Stop** so the user can watch this green even when there is no bug
2. `npm run lint`
3. `npm run build`
4. Manual flow against `npm run preview`:
   - `/home` with no cookie → redirected to `/login`
   - Log in → `quizmaker_session` cookie present, `HttpOnly`, and `/home` shows an empty state
   - Create a question with 4 choices → row in local `mcqs`, 4 rows in `mcq_choices` with positions 0–3 and one `is_correct = 1`
   - Edit it, remove a choice down to 2, save → choices replaced, `updated_at` bumped
   - Preview it, answer wrong → incorrect result, correct choice marked, one row in `mcq_attempts` with `is_correct = 0`
   - Answer again correctly → a second attempt row with `is_correct = 1`
   - Delete it → confirmation, then the question, its choices, and its attempts are gone
   - Log out → cookie cleared; `/home` redirects to `/login` again
5. Confirm a second instructor cannot see or open the first instructor's question (register a second user, try the id in the URL → 404)

**Green / acceptance:**

- `npm run test`, `npm run lint`, and `npm run build` succeed (report actual results)
- Remaining acceptance criteria checked off
- Any preview bug has a regression test that went red, then green

**TDD completion:**

- [ ] Red: only if a preview bug — regression test written first, observed failing, and user watched red
- [ ] Watch red: user confirmed (or n/a if no bug)
- [ ] Implement: fix, if any
- [ ] Green: full `npm run test` passing (quote in the Watch log)
- [ ] Watch green: user ran `npm run test` and confirmed the passing suite
- [ ] Acceptance: remaining criteria checked; lint and build reported
- [ ] Stop: sprint ready; **user deploys** — do not run `npm run deploy`

**Watch log:**

| Gate | `npm run test` result (quote) | User watched? |
|------|-------------------------------|---------------|
| Red (only if a preview bug) | | n/a until a bug appears |
| Green (verify suite) | | No — not COMPLETED until Yes |

**Verify command results:**

| Command | Result |
|---------|--------|
| `npm run test` | |
| `npm run lint` | |
| `npm run build` | |

**Deliverables**:

- Reported `npm run test` / `lint` / `build` results
- Manual preview notes, including the cross-instructor 404 check
- `SESSION_SECRET` documented for production (`npx wrangler secret put SESSION_SECRET`) — the user runs it when they deploy

**Status Markers**:

- PLANNED - Not started yet
- IN PROGRESS / RED - Phase tests written; `npm run test` failing; **stopped so the user can watch red**
- IN PROGRESS / GREEN - Implementation made this phase's tests pass; **stopped so the user can watch green**
- COMPLETED - Watch log filled, user watched both gates, tests green, earlier phases and Sprint 1 still green, this phase's acceptance criteria checked

---

## Technical Implementation Details

### Key files (planned)

| File | Purpose |
|---|---|
| `migrations/0002_create_mcqs.sql:3-36` | `mcqs`, `mcq_choices`, `mcq_attempts` (as built) |
| `migrations/create_mcqs.schema.test.ts:23-73` | SQL contract test for that migration (as built) |
| `src/lib/session.ts:122-142` | Signed session cookie: create, clear, verify (as built) |
| `src/lib/services/mcqs.ts` | The only module running SQL for the MCQ tables |
| `src/lib/validators/mcq.ts` | Zod schemas for MCQ bodies and attempts |
| `src/app/api/mcqs/route.ts` | `GET` list, `POST` create |
| `src/app/api/mcqs/[id]/route.ts` | `GET`, `PUT`, `DELETE` one question |
| `src/app/api/mcqs/[id]/attempts/route.ts` | `GET` list, `POST` record an attempt |
| `src/app/home/page.tsx` | Session guard + MCQ list (replaces the stub) |
| `src/app/home/mcqs/new/page.tsx` | Create page |
| `src/app/home/mcqs/[id]/edit/page.tsx` | Edit page, `notFound()` when unowned |
| `src/app/home/mcqs/[id]/preview/page.tsx` | Preview page |
| `src/components/mcq/mcq-list.tsx` | Table, three-dots actions menu, delete dialog |
| `src/components/mcq/mcq-form.tsx` | Shared create / edit form and choices editor |
| `src/components/mcq/mcq-preview.tsx` | Answer panel that records an attempt |
| `src/components/home/instructor-home.tsx` | Rewritten: Log out top-right + list + Create |

Each gets a colocated `*.test.ts` / `*.test.tsx`. Domain logic stays under `src/lib/services/`; routes under `src/app/`.

### Implementation Patterns

**D1 access** — unchanged, through the existing helper (`src/lib/db.ts:3-6`):

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return env.quizmaker;
}
```

**Session secret** — read from the same context, and fail loudly if absent:

```typescript
export async function getSessionSecret() {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return env.SESSION_SECRET;
}
```

**Ownership in SQL, not in JavaScript** — the `WHERE` clause carries the user id so no call site can forget it:

```typescript
const { results } = await db
  .prepare(
    `SELECT id, name, question, created_by, created_at, updated_at
     FROM mcqs WHERE id = ?1 AND created_by = ?2`,
  )
  .bind(id, userId)
  .all<McqRow>();
```

**Atomic multi-row writes** — a question plus its choices go in one `batch()`:

```typescript
await db.batch([
  db.prepare(`INSERT INTO mcqs (...) VALUES (?1, ?2, ?3, ?4)`).bind(...),
  ...choices.map((choice, position) =>
    db.prepare(`INSERT INTO mcq_choices (...) VALUES (?1, ?2, ?3, ?4, ?5)`).bind(...),
  ),
]);
```

**Exactly one correct answer, in Zod:**

```typescript
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
```

**Session guard in a route handler:**

```typescript
const userId = await getSessionUserIdFromCookieHeader(
  request.headers.get("cookie"),
);
if (!userId) {
  return Response.json({ error: "Not signed in" }, { status: 401 });
}
```

**Vitest + session** — mock the session module in route tests so no secret or cookie crypto is needed:

```typescript
vi.mock("@/lib/session", () => ({
  getSessionUserIdFromCookieHeader: vi.fn(async () => "user-1"),
}));
```

`src/lib/session.test.ts` is the one place that exercises the real signing, with `SESSION_SECRET` supplied through the mocked Cloudflare context.

### Important Notes

- `npm run dev` runs on Node and may not expose D1 or `.dev.vars` the way Workers does. Verify anything touching `env.quizmaker` or `SESSION_SECRET` with `npm run preview`
- D1 enforces foreign keys, but cascade behaviour inside `batch()` is not something to lean on. Delete attempts, then choices, then the question, explicitly
- `Secure` is always set on `quizmaker_session` (`src/lib/session.ts:5`). That matches the contract tests. Local `npm run preview` is `http://127.0.0.1:8787`, so the browser may refuse to store the cookie until HTTPS or a later exception. Recorded 2026-09-24.
- Client components never import `@/lib/db`, `@/lib/session`, or `@/lib/services/*`. The pages pass plain serializable data down
- shadcn components are source files, not packages — no approval needed. Any npm package does need approval first
- Do not edit `cloudflare-env.d.ts` by hand; regenerate with `npm run cf-typegen` after adding `SESSION_SECRET`
- Do not run `d1 migrations apply` (local or remote). Write SQL files only; the user applies them.

### Dependencies to add

| Package | Why |
|---|---|
| — | None. `zod` is installed; the session uses Web Crypto; shadcn components are copied source |

Ask before adding anything to `package.json`. Specifically: no auth library, no `react-hook-form`, no drag-and-drop library, no AI SDK.

---

## Acceptance Criteria

**Database**

- [x] Local D1 has `mcqs`, `mcq_choices`, and `mcq_attempts`, created by a migration (not ad-hoc SQL)
- [x] `mcq_choices.mcq_id` and `mcq_attempts.mcq_id` / `choice_id` cascade on delete
- [ ] A saved question has between 2 and 6 choice rows with positions `0..n-1` and exactly one `is_correct = 1`

**Sessions**

- [x] A successful login sets an `HttpOnly` signed `quizmaker_session` cookie; a failed login sets none
- [x] Logout clears that cookie
- [x] A tampered, malformed, or expired cookie resolves to no user
- [x] `SESSION_SECRET` is in `.dev.vars` with a placeholder in `.dev.vars.example`, and is never committed

**API**

- [ ] Every `/api/mcqs*` endpoint returns 401 without a valid session
- [ ] Another instructor's question id returns 404 on read, update, delete, and attempts
- [ ] Create and update reject fewer than 2 choices, more than 6, an empty choice, and zero or multiple correct answers with 400
- [ ] `created_by` comes from the session; a `createdBy` in the body is ignored
- [ ] An attempt's `isCorrect` is computed server-side; an `isCorrect` in the body is ignored
- [ ] A `choiceId` from another question returns 400
- [ ] Delete removes the question, its choices, and its attempts, and returns `{ "ok": true }`

**UI**

- [ ] `/home` without a session redirects to `/login`
- [ ] `/home` lists the instructor's questions in a shadcn table with Name, Question, and Actions columns
- [ ] The Actions column is a three-dots menu offering Edit, Preview, and Delete
- [ ] `/home` has a Create question button that opens the create page
- [ ] The create / edit page has question details, a choices editor, Save, and Cancel
- [ ] The choices editor starts with 2 choices and allows up to 6, with exactly one marked correct
- [ ] Cancel returns to `/home` without saving
- [ ] Delete asks for confirmation before removing the question
- [ ] Preview shows the question without revealing the answer, then reports correct / incorrect after an answer is submitted
- [ ] Submitting an answer in Preview writes a row to `mcq_attempts` with server-computed correctness
- [ ] Log out stays at the top right of the instructor home
- [ ] Client components do not import D1, the session module, or the MCQ service

**Process**

- [ ] Each phase wrote its tests first (observed red), the user watched red then green via `npm run test`, and both gates are quoted in that phase's Watch log
- [ ] All 36 Sprint 1 tests still pass, except where this PRD names a deliberate contract change (login / logout cookies, instructor home)
- [ ] Unit tests do not call real D1 or the network
- [ ] `npm run test`, `npm run lint`, and `npm run build` succeed

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Question saved in one pass | A question with 4 choices is created from one Save, with no retyping | Manual preview run + `mcqs` / `mcq_choices` row counts |
| Choices persist correctly | Positions `0..n-1`, exactly one `is_correct = 1`, no orphan rows after edit | Direct D1 read after create and after edit |
| Ownership holds | A second instructor gets 404 for the first instructor's question id | Manual preview check in Phase 6 + service and route tests |
| Attempts recorded | Each Preview submit adds one `mcq_attempts` row with correct `is_correct` | Direct D1 read after answering right and wrong |
| Correctness not client-trusted | A forged `isCorrect` in the request body does not change the stored row | Route test + manual `curl.exe` |
| Session integrity | A hand-edited cookie value yields 401, not another user's data | `src/lib/session.test.ts` tamper cases + manual check |
| Scope held | No student quiz-taking UI, no analytics screens, no new npm dependency | Diff review + `package.json` unchanged in `dependencies` |
| Automated phase signal | Tests written first (red), user watches red, then green, user watches green; both quoted in the Watch log | Vitest output + PRD Watch logs |
| Failure paths covered | 401, 404 cross-owner, 400 bad choice set, 400 mismatched choice each have a failing-path test | Suite contents |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — question, choice, and attempt persistence
- Wrangler — migrations, typegen, local preview, production secret
- Web Crypto (`crypto.subtle`) — HMAC-SHA256 session signatures

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` — `env.quizmaker` and `env.SESSION_SECRET`
- `src/lib/db.ts` — existing D1 accessor
- `src/lib/services/users.ts` — `users.id` is the foreign key for `created_by` and `attempted_by`
- `src/app/api/auth/login|logout/route.ts` — extended in Phase 2 to issue and clear the session
- `zod` — installed in Sprint 1, reused for MCQ validation
- shadcn/ui — installed: `badge`, `button`, `card`, `dialog`, `field`, `input`, `label`, `separator`, `table`; to add: a three-dots menu, `textarea`, `radio-group`
- Vitest harness — installed (`npm run test`, `npm run test:watch`)

### Environment / config

- `wrangler.jsonc` `d1_databases` binding `quizmaker` — already present, unchanged
- **New**: `SESSION_SECRET` — `.dev.vars` locally, placeholder in `.dev.vars.example`, `npx wrangler secret put SESSION_SECRET` for production (the user runs this)
- `npm run cf-typegen` after adding the variable

---

## Risks and Mitigation

### Technical Risks

- **Risk**: Editing a question replaces its choices, and `ON DELETE CASCADE` takes the old attempts with them. Attempt history silently disappears on edit.
- **Mitigation**: This is the documented behaviour — an attempt against wording that no longer exists is not useful data. It is stated in the `PUT` contract and covered by a service test so it cannot change by accident. If attempt history needs to survive edits later, that is a schema change (snapshot the choice text on the attempt row), not a patch.

- **Risk**: Sprint 1 shipped no sessions, so adding a cookie now touches already-green login and logout tests.
- **Mitigation**: Those two test files are updated inside Phase 2, going red for the old contract and green for the new one. No other Sprint 1 test may change.

- **Risk**: A hand-rolled session cookie is easy to get subtly wrong (unsigned value, missing expiry, non-timing-safe compare).
- **Mitigation**: Phase 2's tests lead with the tamper and expiry cases, not the happy path. A test that only round-trips a valid cookie would pass against an unsigned id.

- **Risk**: `Secure` cookies are not sent over `http://127.0.0.1:8787`, so local preview could appear broken.
- **Mitigation**: Decide the `Secure` rule in Phase 2 (conditional on HTTPS) and record it in Important Notes before the manual preview run.

- **Risk**: "Exactly one correct answer" cannot be enforced by SQLite without a trigger, so a bad row could be written by a future code path.
- **Mitigation**: Enforce in the Zod schema and again in the service (`InvalidChoiceSetError`). Both have tests.

- **Risk**: Ownership filtering done in JavaScript after a broad read leaks data the moment someone forgets the filter.
- **Mitigation**: Ownership lives in the SQL `WHERE` clause and every service function takes `userId` as its first parameter. Cross-owner tests exist for all of them.

- **Risk**: A half-written question (row inserted, choices failed) leaves unusable data.
- **Mitigation**: `db.batch([...])` for multi-statement writes; the fake D1 in tests implements `batch()` so this path is actually exercised.

- **Risk**: Tests mock D1 and miss a Workers-only failure, exactly as in Sprint 1.
- **Mitigation**: Phase 6 still runs `npm run preview` against local D1 with a real cookie. Mocks are not a substitute for that pass.

- **Risk**: The Base UI flavour of shadcn may not ship a `dropdown-menu`, blocking the three-dots menu.
- **Mitigation**: Phase 5 tries `@shadcn/dropdown-menu`, then `@shadcn/menu`, and reports what the registry actually returned. If neither exists, build the menu from `button` + `dialog` and say so rather than adding a dependency unasked.

### User Experience Risks

- **Risk**: A teacher writes a long question, hits a validation error, and loses their work.
- **Mitigation**: Validation runs client-side before submit, and API errors leave the form filled in.

- **Risk**: Delete is destructive with no undo.
- **Mitigation**: A confirmation dialog naming the question. Soft delete is explicitly Cut.

- **Risk**: A teacher expects to see colleagues' questions, since the long-term product is a shared bank.
- **Mitigation**: The list is per-instructor this sprint by decision. Collaboration is Out of Scope and needs its own sprint for sharing and permissions.

- **Risk**: Preview looks like a graded quiz, and teachers think their clicks are being scored.
- **Mitigation**: Preview copy frames it as checking your own question; attempts are stored but no score is shown anywhere.

- **Risk**: A double click on Save creates two questions.
- **Mitigation**: Save is disabled while the request is in flight, with a test for it.

---

## Troubleshooting Guide

Carried forward from Sprint 1 and still relevant: Vitest hanging on build directories, `@vitejs/plugin-react` v6, the fake D1 treating `DELETE` as `SELECT`, `npm run preview` EPERM on Windows, 500s under `npm run dev`, and `getCloudflareContext` throwing under jsdom. See `ai-workspace/register-login-logout-prd.md` Troubleshooting Guide.

Add entries here as this sprint's bugs are found and fixed.

### Wrangler `d1 migrations apply --local` waits for confirmation

**Problem**: `npx wrangler d1 migrations apply quizmaker --local` hangs after printing `Resource location: local` and never finishes.
**Cause**: Wrangler prompts to confirm migrations when the terminal looks interactive.
**Solution**: Set `CI=true` for a non-interactive apply (`$env:CI = "true"; npx wrangler d1 migrations apply quizmaker --local`). Never add `--remote`.

### Anticipated: cookie not sent on local preview

**Problem**: Login succeeds but `/home` still redirects to `/login`.
**Cause**: The session cookie is marked `Secure` and local preview is served over `http://`.
**Solution**: Set `Secure` only for HTTPS requests. Confirm with the browser devtools Application → Cookies panel that `quizmaker_session` is present.

### Anticipated: choices vanish after edit

**Problem**: Saving an edit leaves a question with no choices.
**Cause**: The delete-then-insert replacement ran as separate statements and the insert failed.
**Solution**: Do the replacement in one `db.batch([...])`. The service test covers replace-on-update.

---

## Notes for AI Agents

1. Read Overview, Hypothesis, and Scope first. Do not build student quiz taking, analytics screens, sharing, or AI question generation.
2. Sprint 1 (`ai-workspace/register-login-logout-prd.md`) is the precedent for structure, service shape, and test style. Follow it rather than inventing a new pattern.
3. Sessions are **in scope this sprint** and are a deliberate change to Sprint 1's "no cookies" boundary. Do not extend that to JWTs, refresh tokens, or an auth library.
4. No new npm package without asking. `zod` is installed; shadcn components are copied source and need no approval.
5. Do not apply D1 migrations (`--local` or `--remote`). The user applies them. Write the SQL file only if a later phase needs a schema change.
6. Never run `npm run deploy`. The user deploys. Commit and push later phases to `feat/mcq`.
7. Ownership is a security boundary. Every service function takes `userId` first, filtering happens in SQL, and every route 401s without a session. Write the cross-owner test.
8. Never trust the client for `createdBy` or an attempt's `isCorrect`. Both are derived server-side.
9. Centralize SQL in `src/lib/services/mcqs.ts`; numbered placeholders only.
10. Cite code as `filepath:line-number` once the implementation exists, and fill in the Key Files table with real line numbers as you go.
11. Every phase uses the same loop: Red → **Watch red** → Implement → Green → **Watch green** → Acceptance → Stop. Fill that phase's TDD completion checklist and Watch log. After writing failing tests, stop and wait for the user to run `npm run test` and confirm red — do not implement yet. After tests pass, stop again. Do not mark COMPLETED until every box is checked, and do not start the next phase until the user confirms.
12. Never write tests that cannot fail. Never hit real D1 from Vitest. If preview finds a bug, add a regression test (red) first, then fix (green).
13. Update phase status, acceptance checkboxes, test file lists, and the Troubleshooting section as work happens.

---

## Current Status

**Last Updated**: 2026-09-24
**Current Phase**: Phase 2 COMPLETED
**Status**: Signed `quizmaker_session` cookie is issued on login and cleared on logout. `npm run test` is `Test Files  13 passed (13)` / `Tests  44 passed (44)`. Do not apply migrations. Production still needs `npx wrangler secret put SESSION_SECRET` when the user deploys.
**Next Steps**: Start Phase 3 (MCQ service) when the user confirms.

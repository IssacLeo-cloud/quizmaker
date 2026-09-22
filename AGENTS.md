# AGENTS.md

Instructions for AI agents working in this repository. This file is loaded into every
agent conversation, so it describes only what is stable and true of the project.

## Project

<!--
Replace this section during Sprint 1 with a short description of what you are building:
the problem, the primary user, and the current state. Two or three sentences.
Keep it current. An out-of-date description here misleads every future conversation.
-->

QuizMaker is a greenfield app for teachers who will later collaborate on a
multiple-choice question bank. The source of truth is
`ai-workspace/register-login-logout-prd.md`. Phase 1 added a D1 `users`
table (binding `quizmaker`). Phase 2 added PBKDF2 password hashing and a
user service. Phase 3 added register / login / logout HTTP APIs. Phase 4 added
auth pages (shadcn forms): `/` redirects to login; instructor home is `/home`
with logout only. Phase 4 is complete; slice verify (Phase 5) is not done yet.
Implementation is test-driven: write failing Vitest tests first, stop so
the user can run `npm run test` and see **red**, implement only after they
confirm, then stop so they can see **green**. Quote both runs in that phase's
Watch log in the PRD. Wait for confirmation before the next phase.

## Stack

- **Next.js 16** with the App Router and React 19
- **Cloudflare Workers** for hosting, via `@opennextjs/cloudflare`
- **Tailwind CSS v4**, configured in CSS rather than a JS config file
- **shadcn/ui** on Base UI, `base-nova` style, with Lucide icons
- **TypeScript** in strict mode
- **Wrangler** for Cloudflare configuration, secrets, and deployment

Vitest is installed for unit tests (`npm run test`). Cloudflare D1 is bound as
`quizmaker` (`env.quizmaker`); apply migrations with `--local` only unless the
user asks otherwise. Zod is installed for auth API validation. An AI SDK is not
installed yet. Do not write code that imports one without adding it first and
telling the user.

## Layout

```
src/app/            Routes, layouts, and global styles (App Router)
src/components/ui/  shadcn/ui components (generated; avoid hand-editing)
src/lib/            Shared utilities and services
ai-workspace/       Technical PRDs and planning documents
.cursor/rules/      File-scoped conventions
.cursor/skills/     Task-specific guidance loaded on demand
public/             Static assets
```

Import through the `@/` alias, which maps to `src/`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server on Node at `localhost:3000` |
| `npm run preview` | Build and run on the local **Workers** runtime |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest once (`vitest run`) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` after changing bindings |

`npm run dev` runs on Node and will not surface Workers-specific problems. Verify
anything runtime-sensitive with `npm run preview`.

## Working agreements

- **Do not deploy.** Never run `npm run deploy` unless explicitly asked.
- **Do not touch the remote database.** Migrations may be applied locally only.
- **Ask before adding a dependency.** This is a teaching repository; an unexplained
  dependency is a cost. Propose it and say why.
- **Do not edit generated files.** `cloudflare-env.d.ts`, `next-env.d.ts`, and
  `package-lock.json` are generated.
- **Keep secrets out of the repo.** Local values belong in `.dev.vars`, which is
  gitignored. When adding a variable, also add an empty placeholder to
  `.dev.vars.example`. Production values go in `wrangler secret put`.
- **Verify before claiming completion.** A phase is done only when its TDD
  checklist is complete: tests written first and observed red, **user watched
  red** (`npm run test`) before any implementation, implementation, `npm run
  test` green (including earlier phases), **user watched green**, Watch log
  quoted in the PRD, acceptance boxes checked. Then stop for confirmation.
  Also run `npm run lint` (and `npm run build` at Phase 5) and report the
  actual result. Do not implement while the user is still supposed to be
  looking at a red suite.
- **Say when you are unsure.** A flagged uncertainty is more useful than a confident
  guess that has to be unwound later.

## Cursor Cloud specific instructions

Cloud agents have no Cloudflare credentials and no `.dev.vars`. In that environment:

- `npm run dev`, `npm run build`, and `npm run lint` work normally.
- `npm run preview`, `npm run deploy`, and any `wrangler` command that needs
  authentication will fail. This is expected. Do not try to authenticate.
- If a task genuinely requires Cloudflare access, stop and report that it must be run
  locally instead.

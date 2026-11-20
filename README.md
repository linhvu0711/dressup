# dressup

A web app that shows your clothes on a drawn mannequin, in your colours, so you can judge which colours go together before you put them on.

Status: the build has started. The app lives at the repo root, made from Cloudflare's Vite, React, and Hono template.

## Commands

```sh
bun install       # install the packages
bun run dev       # the app at http://localhost:5173
bun run check     # Biome lint and format, and the type check
bun test          # unit tests
bun run e2e       # click-through in a hidden browser at phone and laptop size
bun run build     # production build
bun run db:generate       # a SQL migration from the Drizzle schema, named by time
bun run db:migrate:local  # apply the migrations to the local database
bun run auth:schema       # write the Better Auth tables after its config changes
bun run deploy            # build, migrate the remote database, make the picture bucket if it is missing, then deploy
```

GitHub runs `bun run check`, `bun test`, `bun run build`, and `bun run e2e` on every push to `main` and every pull request (`.github/workflows/ci.yml`).

`bun install` also adds a git pre-commit hook. Before each commit it runs `bun run check`, Biome and then the type check, and stops the commit when it fails, with the errors shown. It takes about 12 seconds. To skip it once, run `git commit --no-verify`. Hooks in your global `core.hooksPath` folder, or in `.git/hooks`, still run. It needs git 2.54 or newer; on an older git, `bun install` prints a warning and the hook does not run.

Before the first `bun run e2e`, run `bunx playwright install chromium` once. Before you write an e2e test, read the Tests rules in `CODING_STANDARDS.md`. After a build, `bunx wrangler deploy --dry-run` checks the Worker bundle without deploying it.

Run `bun run db:migrate:local` once before the first `bun run dev`, and again after a new migration.

A new migration's file name starts with the time it was made, in UTC, as `migrations/20261119160142_<name>.sql`. Its schema change sits beside it in `migrations/meta/20261119160142_<name>_change.json`. Two branches can each add one with no rename. Make migrations only with `bun run db:generate`. It adds every change file, in name order, onto the last numbered snapshot, then runs drizzle-kit on the result. Plain `drizzle-kit generate` stops, since the migrations folder has no `_journal.json`. The first 20 migrations keep their numbers.

## Settings

Copy `.dev.vars.example` to `.dev.vars` and fill in each value. Wrangler reads `.dev.vars` in dev. On Cloudflare, the same names are Worker secrets (#8).

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: the Google OAuth client. Its redirect address is `<BETTER_AUTH_URL>/api/auth/callback/google`.
- `BETTER_AUTH_SECRET`: signs the session cookies. Use at least 32 random characters, for example from `openssl rand -base64 32`.
- `BETTER_AUTH_URL`: the app's address. In dev it is `http://localhost:5173`. AI apps connect at `<BETTER_AUTH_URL>/api/mcp`.

## Stop new sign-ups

`SIGNUPS_CLOSED` stops new accounts.

- Set to `true`: a Google account with no dressup account gets "No new accounts for now". People with an account sign in as before.
- Not set, or any other value: sign-up is open.

On Cloudflare, set it in the dashboard, under the Worker's Settings, in Variables and Secrets, as a plain text variable. `keep_vars` in `wrangler.jsonc` keeps it on each deploy. In dev, put `SIGNUPS_CLOSED=true` in `.dev.vars`.

## Pictures

Pictures live in the R2 bucket `dressup-pictures`, bound as `PICTURES` in `wrangler.jsonc`. `bun run dev`, `bun test`, and `bun run e2e` use a local bucket: dev and e2e keep it under `.wrangler/state`, and the worker tests use a fake in memory. No Cloudflare account is needed.

`bun run deploy` makes the bucket on Cloudflare when it does not exist. If a deploy says the bucket is missing, run `bunx wrangler r2 bucket create dressup-pictures` once.

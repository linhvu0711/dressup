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
bun run db:generate       # a SQL migration from the Drizzle schema
bun run db:migrate:local  # apply the migrations to the local database
bun run auth:schema       # write the Better Auth tables after its config changes
bun run deploy            # build, migrate the remote database, then deploy
```

Before the first `bun run e2e`, run `bunx playwright install chromium` once. After a build, `bunx wrangler deploy --dry-run` checks the Worker bundle without deploying it.

Run `bun run db:migrate:local` once before the first `bun run dev`, and again after a new migration.

## Settings

Copy `.dev.vars.example` to `.dev.vars` and fill in each value. Wrangler reads `.dev.vars` in dev. On Cloudflare, the same names are Worker secrets (#8).

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: the Google OAuth client. Its redirect address is `<BETTER_AUTH_URL>/api/auth/callback/google`.
- `BETTER_AUTH_SECRET`: signs the session cookies. Use at least 32 random characters, for example from `openssl rand -base64 32`.
- `BETTER_AUTH_URL`: the app's address. In dev it is `http://localhost:5173`.

## Stop new sign-ups

`SIGNUPS_CLOSED` stops new accounts.

- Set to `true`: a Google account with no dressup account gets "No new accounts for now". People with an account sign in as before.
- Not set, or any other value: sign-up is open.

On Cloudflare, set it in the dashboard, under the Worker's Settings, in Variables and Secrets, as a plain text variable. `keep_vars` in `wrangler.jsonc` keeps it on each deploy. In dev, put `SIGNUPS_CLOSED=true` in `.dev.vars`.

## The prototype is the reference

`docs/prototype/dressup.html` is a working model of the whole app. Build the app to look and behave like it.

- `docs/prototype/dressup.html`: the prototype. One file, no build step.
- `docs/prototype/scope.md`: each screen, control, and state the prototype has.
- `docs/prototype/tokens.md`: colours, fonts, sizes, and the real-app screens it borrows from.
- `docs/prototype/icon/`: the app icon files.
- `docs/prototype/walk.js`: an automatic click-through of the prototype.

To open it, start a small web server in the folder and open the page:

```sh
cd docs/prototype && python3 -m http.server 8791 --bind 127.0.0.1
# then open http://127.0.0.1:8791/dressup.html
```

The dark box at the top right is a test panel. It is not part of the app. It puts the app into states that are hard to reach by hand, for example "saving fails". The backtick key hides it.

In the prototype, the data is fake and nothing is saved.

# Kudumbam family tree — notes for Claude Code

Shared, editable family tree for any family. Angular 20 (standalone components, signals, zoneless) + D3.js v7 in the browser; Express 5 +
PostgreSQL API in `server/`; Supabase for sign-in only. See README.md for setup and usage.

## Resuming (paused 22 Oct 2026, after multi-tree phase 2)
- Start everything (each in its own terminal, Node from `D:\nodejs-v24.11.0` on PATH):
  `cd server && npm run db:dev` → `cd server && npm start` → `npm start` (app on http://localhost:4200).
- The owner's real dev data is in `server/.pgdata` (PGlite); latest safety copy `data/backup-2026-10-21T19-09-55-173Z.json`.
  Run `npm run backup` before any migration.
- Supabase project `vyzygojjbhxqcpknasmm`: email sign-in on, Google off; Site URL / redirect must be
  `http://localhost:4200`. The owner's tree still uses the default surname rule; they meant to switch it to
  "Father's given name" in Settings.
- **`server/` is its own git repository**: https://github.com/pbrajesh/kudumbam-app (public), branch `main`
  (first commit 23 Oct 2026). Commit and push server changes from inside `server/`. It is self-contained: its data
  types are in `server/src/models.ts` (a copy of the app's types — change both together) and its tests use
  `test/fixtures/sample.json` (the made-up `sample.ged`, parsed).
- **The project root is the web app repository**: https://github.com/pbrajesh/kudumbam-web (public), branch `main`
  (first commit 23 Oct 2026): Angular app, `deploy/`, `docs/`, README, this file. It ignores `server/` (separate
  repo, cloned into `server/`), `data/` (family data — never commit), `.claude/`, `dist/`, `deploy/out/`.
  Both repos are public: never commit family data, `.env` files, backups or secret keys.
- On this PC, `git add` sometimes fails once with "unable to write file .git/objects/…: Permission denied"
  (a brief file lock); running it again works.
- Phases 3–5 done 22 Oct 2026 (members; router + My trees; limits, rate limiting, delete account, privacy page).
  Hosting chosen 23 Oct 2026: a headless Raspberry Pi — guide and files in `deploy/raspberry-pi/` (not yet set up
  on the Pi). Undecided: product name.

## Status
- Node is not on PATH on this machine. Use `D:\nodejs-v24.11.0` (Node 24.11.0, npm 11.6.1):
  prepend it to PATH before any `npm` / `npx` command.
- 21 Oct 2026: shared database (docs/shared-database-plan.md, option 3) implemented with PostgreSQL.
  - `cd server && npm test`: 12 API tests against real Postgres (in-memory PGlite) with real token checks.
  - Browser-tested end to end with `server/test/e2e-server.ts` and fake sessions: sign-in gate, not-a-member
    screen, empty tree → load bundled file, add/rename/undo/redo saved to Postgres, 409 conflict reload,
    rollback on a rejected save, viewer read-only mode, sign-out.
  - Supabase project `vyzygojjbhxqcpknasmm` is configured; the owner's email sign-in has worked once
    (member row linked). Google sign-in is not enabled in that project.
- 22 Oct 2026: made generic (step 1 of `docs/multi-tree-plan.md`). No family data is built into the app any more:
  the owner's file moved to `data/` (gitignored, not served) and `sample-data.ts` was deleted. New trees start
  empty ("Add the first person" / import). Home person and surname rule are per-tree settings
  (`PUT /api/settings`, Settings dialog; stored on `trees` since phase 1). App name is `environment.appName`. Tests use a
  made-up family (`server/test/fixtures/sample.ged`); 17 tests. Fixed: submitter NAME in a separate SUBM record
  was not read on import (the app's own exports lost it).
- 22 Oct 2026: **multi-tree phase 1 done** (see the status block in `docs/multi-tree-plan.md`): numbered
  migrations, `trees` + `tree_members` (viewer/editor/owner), `tree_id` on every row with composite keys,
  repository takes `treeId`, routes still use the caller's first tree. 23 API tests (incl. migration and cross-tree
  isolation). The owner's dev DB is migrated (backups in `data/`). Open sign-up was chosen.
- 22 Oct 2026: **phase 2 done**: every tree route is `/api/trees/:treeId/…` (404 for non-members), `GET /api/me`
  lists trees, `POST /api/trees` (open sign-up, `MAX_TREES_PER_USER`), `PATCH`/`DELETE /api/trees/:id`.
  App: "Start your family tree" screen, tree picker, owner rename/delete in Settings. 29 tests; browser-tested
  with `test/e2e-server.ts`.
- 22 Oct 2026: **phase 3 done**: members API under `/api/trees/:id/members` (list: any member; add/role/remove:
  owner; `members/me` DELETE = leave; last-owner rule → 409; `MAX_MEMBERS_PER_TREE`), `server/src/members-repo.ts`,
  and `src/app/members.component.ts` (Members dialog with copy-a-message invites). 37 tests; browser-tested.
- 22 Oct 2026: **phase 4 done**: Angular router — `/` My trees, `/t/:treeId` a tree; shareable tree links (invite
  message links to the tree; the page is restored after sign-in); "This tree isn't available" page. 37 tests;
  browser-tested incl. Back/Forward and phone width.
- 22 Oct 2026: **phase 5 done except deploying**: `MAX_PEOPLE_PER_TREE`, rate limits (`src/limits.ts`),
  `DELETE /api/me` (`src/account-repo.ts`), `/privacy` page (public route; `PUBLIC_PATHS` in `app.routes.ts`),
  log hygiene, `TRUST_PROXY`, `public/_redirects`. 46 tests; browser-tested.
- 23 Oct 2026: **Raspberry Pi deployment prepared** (`deploy/raspberry-pi/`): Caddyfile (app + `/api` proxy, SPA
  fallback, strict CSP tested in a browser against the packaged app, log filtering), systemd units for the API
  (hardened, runs as `familytree`) and a nightly `pg_dump` timer, `package.ps1` (PC: build + pack, no secrets/data),
  `install-update.sh` (Pi: backup, install, restart, health check) and `rollback.sh`. The package was unpacked and
  run from a clean folder with production dependencies only. Production builds no longer inline critical CSS
  (`angular.json`), because its `onload` handler would be blocked by the CSP. DB access on the Pi is by local socket
  and peer auth: `postgresql://familytree@/familytree?host=/var/run/postgresql`.
- 23 Oct 2026: the app is served from `/opt/family-tree/app` (was `/srv/…`). **Apache replaces Caddy** (already on
  the owner's Pi): `deploy/raspberry-pi/family-tree.apache.conf` (same headers, SPA fallback, `/api` proxy, log
  without query strings), tested with Apache 2.4 against the real build and API. **Two zips**: this repo's
  `deploy/raspberry-pi/package.sh` → `kudumbam-web-<date>.zip` (`app/` + `deploy/`); kudumbam-app's
  `deploy/package.sh` → `kudumbam-app-<date>.zip` (`server/`). Both are bash (PowerShell dropped) and do not build:
  the owner runs `npm run build` first. They zip with `zip`, or Python when `zip` is missing (Git Bash). No `.env` (not even `.env.example`), data or backups in either.
  `install-update.sh` takes either zip or both; `rollback.sh [app|server]`. The Pi needs `unzip`.
  `install-update.sh` checks for `/usr/bin/node` (22.18+) and `npm` before changing anything when the API zip is
  given (the owner's first run on the Pi failed with "npm: not found").
- 23 Oct 2026: **members linked to people** ("This is me" + owner approval). kudumbam-app migration 003 adds
  `tree_members.person_id` (approved) and `claimed_person_id` (pending), cleared when the person is deleted or a
  file is imported; routes `PUT/DELETE …/members/me/claim`, `DELETE …/members/me/person`, owners
  `PUT/DELETE …/members/:email/person`, `DELETE …/members/:email/claim`; `/tree` returns `you` and `pendingClaims`.
  App: store `you`/`me()`/`findMe()`, "This is me" in the person panel, You mark on cards, Find me, hint banner,
  Approve/Turn down/Link in Members. 54 API tests.
- **Next:** the owner sets up the Pi following `deploy/raspberry-pi/README.md` (needs: Pi OS Lite 64-bit,
  a domain on Cloudflare for the tunnel, Supabase Site URL change). Small follow-up: tree-page header buttons wrap to
  three rows on phones. Still to decide: product name.
- A browser-only copy was published earlier as a claude.ai artifact (Angular JIT from jsDelivr). It predates the
  shared database and still uses localStorage. The local CLI build is the reference version.

## Architecture — browser (`src/app/`)
- `gedcom.ts` — `parseGedcom()` / `serializeGedcom()`. Unknown tags are kept in `extra` and written back.
  Families are the source of truth for links; INDI `FAMS`/`FAMC` are regenerated on export.
  No automated tests cover it since the server became its own repository (the round-trip test lived there);
  adding app-side tests for parse → export → parse is a good follow-up.
- `models.ts` — `Person`, `Family`, `TreeData`, name/date helpers. The server keeps a copy of the types in
  `server/src/models.ts`; change both together.
- `family-store.service.ts` — the only place that mutates data. `mutate()` applies the edit locally, records undo
  history, diffs before/after into an `Edit` (ids to upsert/delete), and queues it. The queue sends one
  `POST /api/changes` at a time, filling in record versions at send time. Errors: 409 or later edits queued →
  quiet reload from the server; otherwise roll back. Undo/redo are sent as ordinary edits. Viewers: `canEdit()`
  is false and `mutate()` does nothing. Only the centred person is kept in localStorage (`family-tree:focus:v1`).
- `tree-api.service.ts` — HttpClient wrapper: `getMe`, `createTree`, and per tree `getTree`, `sendChanges`,
  `importTree`, `updateTree`, `deleteTree`; error helpers.
- `members.component.ts` — Members dialog: list for everyone; owners add by email (then a copyable invite
  message), change roles, remove (inline confirm); anyone can leave (`store.leaveTree()`), except the only owner.
- `create-tree.component.ts` — "Start a tree" form (name + surname rule), used on the no-trees screen and in a dialog.
- The store holds `trees` (`loadTrees()`, `treesStatus`) and the tree on screen (`treeId`, `openTree(id)` from
  the URL, `load()` to refresh; `status` includes `not-found`). `createTree` returns the new ID; `deleteTree` /
  `leaveTree` clear `treeId`, and the tree page then navigates to `/`. `lastTreeId` marks the last-opened tree.
- `auth.service.ts` — supabase-js: session signal, Google / magic-link sign-in, sign-out, `accessToken()`.
  `configured` is false while `environment.ts` has placeholders.
- `auth.interceptor.ts` — adds `Authorization: Bearer <token>` to `${apiUrl}/api/` requests only.
- Routing (`app.routes.ts`): `/` → `trees-page.component.ts` (My trees, start a tree), `/t/:treeId` →
  `tree-page.component.ts` (header with tree picker, people list, tree view, editor, Settings / Members / Export /
  new-tree dialogs, not-found and error states), `**` → `/`.
- `app.component.ts` — only the sign-in gate and `<router-outlet>`; clears the store on sign-out and restores the
  saved page on sign-in. `login.component.ts` — sign-in screen; saves the current page (`return-url.ts`).
- `tree-layout.ts`, `tree-view.component.ts` — unchanged D3 hourglass layout and rendering.
- `person-editor.component.ts` — draft via `linkedSignal`, Save/Revert, relationship actions; read-only
  (`fieldset[disabled]`, no action buttons) for viewers.
- `src/environments/environment(.production).ts` — Supabase URL + publishable key + `apiUrl`. Public values only.
- Dev: `proxy.conf.json` forwards `/api` from `ng serve` to `localhost:3000`.

## Architecture — API (`server/`, Node 22.18+ runs the .ts files directly, no build step)
- `src/index.ts` — env → pool → `migrate()` → `createApp()` → listen.
- `src/db.ts` — pool, `withTx`, `migrate()`: applies `migrations/NNN_*.sql` in order, recorded in
  `schema_migrations`. Never edit an applied migration; add a new numbered file. 002 needs PostgreSQL 15+.
- `src/app.ts` — routes. `/api/health` is open; `/api/me` and `POST /api/trees` need sign-in; everything else is
  under `/api/trees/:treeId` and needs membership (writes: editor; rename/delete: owner). `POST …/changes` (what the
  app uses: one edit, many records, one transaction), `POST …/import`, `GET/PATCH/DELETE /api/trees/:treeId`, plus
  the REST routes for people/families/children/spouses, built on the same code.
- `src/auth.ts` — token check with `jose` against `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`
  (issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`). `memberships()` links pending `tree_members` rows
  (added by email) to the Supabase user ID on sign-in. `authenticate` (401) → `requireTreeMember` (tree from the
  URL; 404 when not a member, so IDs reveal nothing) → `requireRole(min)` (403; viewer < editor < owner).
- `src/members-repo.ts` — `listMembers`, `addMember`, `changeRole`, `removeMember`; each locks the tree row and
  enforces "at least one owner".
- `src/tree-repo.ts` — all take `treeId` first and filter every statement on it: `loadTree`, `applyChanges`
  (people upserts → family upserts → family deletes → people deletes; every write checks `version`, mismatch →
  409), `importTree`, `saveSettings`, `createTree`. Tree settings, file name and submitter live on `trees`.
- `src/validation.ts` — zod schemas for every body (strict: unknown fields rejected).
- `scripts/dev-db.ts` — PGlite (embedded Postgres) on port 54329, data in `server/.pgdata`. Single session
  underneath: keep `PG_POOL_MAX=1` with it.
- `scripts/member.ts` — `npm run member -- trees | create-tree "<name>" <owner email> | add <email> [role] |
  remove <email> | list`, with `--tree <id or name>` when there is more than one tree. Keeps at least one owner.
- `scripts/backup.ts` — `npm run backup`: every table to `data/backup-<time>.json`.
- `test/api.test.ts` — 45 API tests (`npm test`, plain `node --test`). `test/e2e-server.ts` (`node test/e2e-server.ts`;
  set `E2E_SUPABASE_URL` to the real project URL to reuse its storage key) — test-only API with a local signing key that prints
  fake browser sessions (for manual browser testing; point `environment.ts` at `https://e2etest.supabase.co`
  and key `sb_publishable_e2e` temporarily, then put the placeholders back).

## Conventions
- Components use `inject()` and `@Component` only (no `input()`/`output()`/`viewChild()`), so the same files
  also run in Angular JIT mode for the artifact build. Keep that if the artifact copy matters.
- Templates are inline. Global styles, including the D3 SVG card styles, are in `src/styles.css` with
  light/dark tokens on `:root`.
- New child / parent names follow the tree's `surnameRule` (`father-surname` default, `father-given`, `none`);
  see `childSurname()` and `addParent()` in the store.
- Never build a real family's data into the app or test fixtures; use made-up names.
- Server code uses only erasable TypeScript (no enums, no parameter properties) and `.ts` import extensions.
- Never put a Supabase secret key in `src/`. The server does not need one either.

## Known limits / ideas
- No live updates: other people's edits appear on reload or "Reload latest", or when a save hits a 409.
- New IDs are chosen in the browser (`I<max+1>`); two editors adding at once → one gets 409 and reloads.
- Undo history is per tab and is cleared on reload.
- Invitations are a message the owner copies and sends; the site sends no emails yet.

# Kudumbam — shared family tree (Angular + D3.js + PostgreSQL)

A family tree that family members sign in to and edit together. Any family can use it: a tree starts empty,
or from a GEDCOM (.ged) file exported from another family tree app. The app name is a setting
(`appName` in `src/environments/`).

One site serves many families: anyone can sign in and start a tree, and each tree is visible only to the relatives
invited to it (see `docs/multi-tree-plan.md`).

- **Browser app** (`src/`): Angular 20 + D3.js. Signs in with Supabase, reads and writes the tree through the API.
- **API server** (`server/`, its own repository: https://github.com/pbrajesh/kudumbam-app): Express 5 + PostgreSQL. Checks each sign-in token and who is allowed to do what.
- **Supabase**: sign-in only (Google and email links). It does not hold any family data.

Requires Node 22.18+.

## Get the code

The web app (this repository) and the API server ([kudumbam-app](https://github.com/pbrajesh/kudumbam-app)) are
separate repositories. Clone the server **into a `server/` folder inside this one** — the dev proxy, the guides and
the Raspberry Pi packaging expect that layout:

```bash
git clone https://github.com/pbrajesh/kudumbam-web.git
cd kudumbam-web
git clone https://github.com/pbrajesh/kudumbam-app.git server
```

`server/` is ignored by this repository; commit server changes from inside `server/`.

## Set up

### 1. Supabase (sign-in only)
1. Create a project at supabase.com.
2. **Authentication → Sign In / Providers**: enable **Email** (magic link) and **Google**
   (Google needs an OAuth client from Google Cloud Console; Supabase shows the redirect URL to give Google).
3. **Authentication → URL Configuration**: Site URL `http://localhost:4200`; add your production URL to the
   redirect URLs when you have one.
4. **Project Settings → JWT Keys**: make sure the project uses the newer asymmetric signing keys (ES256/RS256).
   The API checks tokens with the public keys and needs no Supabase secret.
5. **Project Settings → API Keys**: copy the project URL and the **publishable** key (`sb_publishable_…`)
   into `src/environments/environment.ts` (and `environment.production.ts`).
   Never put the secret key (`sb_secret_…`) in the app.

### 2. Database and API server
```bash
cd server
npm install
cp .env.example .env          # then set SUPABASE_URL in .env
npm run db:dev                # terminal 1: local PostgreSQL (PGlite, nothing to install), port 54329
npm run member -- create-tree "The Example family" you@example.com   # terminal 2: your tree, you as owner
npm start                     # terminal 2: API on http://localhost:3000
```
To use a real PostgreSQL server (version 15 or later) instead, set `DATABASE_URL` in `server/.env` and remove
`PG_POOL_MAX`. Tables are created and updated automatically on start from the numbered files in
`server/migrations/` (never edit one that has run; add a new file). `npm run backup` saves every table to a JSON
file in `data/`.

### 3. Browser app
```bash
npm install
npm start          # http://localhost:4200 (forwards /api to the API server)
npm run build      # production build in dist/
```

Sign in, then either click **Add the first person**, or **Import a .ged file**. Your own family files can live
in `data/`, which is neither served by the app nor committed to git.

## Who can do what

Anyone who signs in can start a family tree (up to `MAX_TREES_PER_USER`, default 5) and becomes its owner.
Each person can belong to several trees with a different role in each. The front page, **My trees**, lists
them; each tree has its own link (`/t/<id>`) that can be bookmarked or shared, and the picker in a tree's header
switches between them. A tree is visible only to its members. Owners can rename or delete a tree in **Settings**
(deleting asks you to type the tree's name).

| Role | Can |
|---|---|
| Not in any tree | Sign in, then sees "not on the family list yet" |
| `viewer` | See the tree and export it |
| `editor` | Edit, add, delete, undo/redo, settings, import (replaces the whole tree) |
| `owner` | Everything an editor can, plus manage members, rename and delete the tree. Every tree keeps at least one owner. |

**Inviting relatives:** an owner opens **Members**, adds the person's email and a role, and sends them the
ready-made message it shows (WhatsApp, email…). They get access the first time they sign in with that address.
Owners can change roles or remove people there; anyone can leave a tree (except its only owner).
The command-line script below does the same from the server:

```bash
cd server
npm run member -- trees
npm run member -- create-tree "The Example family" owner@example.com
npm run member -- add cousin@example.com viewer      # add --tree "<name or id>" when there is more than one tree
npm run member -- add aunt@example.com editor
npm run member -- remove cousin@example.com
npm run member -- list
```

## Using it

- **Tree**: hourglass view. Ancestors of the centred person above, descendants with their spouses below.
  Click a card to open it; double-click (or Enter) to centre the tree on that person. Drag to pan, scroll to zoom.
  A `+` on a card means there are more relatives off-screen. Dashed cards are deceased; dashed couple lines are former partnerships.
- **People list**: search anyone and jump to them.
- **Edit** (editors): names, sex, birth/death dates and places, notes. Add father, mother, spouse, son, daughter, brother or sister;
  link an existing person as a spouse; unlink or delete. Every change is saved for everyone straight away
  ("saving…" shows in the header). Undo/redo also save.
- **Two people editing**: if someone else changed the same people first, your change is not saved, the latest tree is
  shown, and you are asked to make the change again. Use **Reload latest** to see others' edits.
- **Settings** (editors): how a new child's surname is filled in — father's surname (default), father's given name
  (common in South India), or blank. **Make home person** in a person's panel sets who the tree opens on.
- **Import / Export**: import any GEDCOM 5.5.x file (replaces the shared tree; undo puts the previous one back);
  export writes GEDCOM 5.5.1 (UTF-8). Tags the editor does not handle are kept and written back unchanged.

## Tests
```bash
cd server
npm test           # 45 API tests against a real (in-memory) PostgreSQL, using a made-up family
npm run typecheck
```

## Going live
**On a Raspberry Pi (the chosen set-up):** follow [deploy/raspberry-pi/README.md](deploy/raspberry-pi/README.md) —
PostgreSQL, the API and the app all on the Pi behind Apache, reached through a Cloudflare Tunnel or port forwarding.
On your PC, after `npm run build`, `deploy/raspberry-pi/package.sh` zips the app, and the API's own
`deploy/package.sh` (in kudumbam-app) zips the API; `install-update.sh` installs or updates either zip, or both, on the Pi.

**On hosted services instead:** three pieces — the Angular app (static files), the API server with a PostgreSQL
database, and Supabase (sign-in).

1. **Database:** a managed PostgreSQL **15 or newer** with daily backups (Neon, Render, Railway, Supabase Postgres…).
   Copy its connection string. Tables are created by the API on its first start.
2. **API server** (Render, Railway, Fly.io, or any machine with Node 22.18+): root folder `server`, build command
   `npm ci`, start command `npm start`. Environment variables:
   - `DATABASE_URL` — from step 1 (no `PG_POOL_MAX`)
   - `SUPABASE_URL` — your Supabase project URL
   - `CORS_ORIGINS` — the app's address, e.g. `https://family.example.com`
   - `TRUST_PROXY=1` — these hosts put a proxy in front of the API
   - optional: `MAX_TREES_PER_USER`, `MAX_MEMBERS_PER_TREE`, `MAX_PEOPLE_PER_TREE`

   Check `https://<api address>/api/health` answers `{"ok":true}`.
3. **App:** set `apiUrl` (the API's address) and, if you like, `privacyContact` in
   `src/environments/environment.production.ts`, run `npm run build`, and publish `dist/family-tree/browser`
   (Netlify, Vercel, Cloudflare Pages…). The host must send `index.html` for paths it has no file for, so links like
   `/t/<id>` open directly: Netlify reads the included `_redirects`; on Vercel add a rewrite of `/(.*)` to `/index.html`.
4. **Supabase:** Authentication → URL Configuration: Site URL = the app's address, and add it to Redirect URLs.
   Add custom SMTP (e.g. Resend) before many people sign in — the built-in email only sends a few an hour.
5. **Before inviting others:** read `/privacy` and adjust it to your situation, and move your own tree across
   (export a .ged here, import it there, or point `DATABASE_URL` at a copy of your database).

## Source map

| File | What it does |
|---|---|
| `src/app/gedcom.ts` | GEDCOM parser and serializer (lossless round-trip of the sample file) |
| `src/app/models.ts` | `Person`, `Family`, `TreeData` types and name/date helpers (the server has a copy of the types) |
| `src/app/family-store.service.ts` | Signal store: selection, focus, edits, undo/redo, saving to the API |
| `src/app/tree-api.service.ts` | Calls to the API server |
| `src/app/auth.service.ts`, `auth.interceptor.ts` | Supabase sign-in; adds the sign-in token to API calls |
| `src/app/login.component.ts` | Sign-in screen |
| `src/app/tree-layout.ts` | Hourglass layout with `d3.hierarchy` + `d3.tree` (couples drawn side by side) |
| `src/app/tree-view.component.ts` | D3 rendering, zoom/pan, transitions, keyboard access |
| `src/app/person-editor.component.ts` | Edit panel and relationship actions (read-only for viewers) |
| `src/app/app.component.ts` | Shell: sign-in gates, toolbar, people list, import, export dialog |
| `server/src/app.ts` | API routes |
| `server/src/auth.ts` | Token check and member lookup |
| `server/src/tree-repo.ts` | Reading and writing one tree in PostgreSQL (every query is limited to that tree), with version checks |
| `server/migrations/*.sql` | Database structure, applied in order: `trees`, `tree_members`, and `people`, `families`, `family_children` (each row belongs to a tree) |
| `server/test/fixtures/sample.ged` | A made-up family used by the tests |


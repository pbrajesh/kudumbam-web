# Multi-tree plan: one site, many families

Goal: anyone can sign in, start a family tree, and invite relatives. Each family's tree is private to the people
it is shared with. Builds on the shared-database design (`docs/shared-database-plan.md`): Supabase for sign-in
only, our Express API, our PostgreSQL.

Status: **phases 1–5 done (22 Oct 2026) except the actual deploy**, which waits for the hosting decision. Decided: **open sign-up** — anyone who signs in
can start a tree. The earlier cleanup is also done: no family data is built into the app, a new tree starts empty,
and the home person and surname rule are per-tree settings.

Phase 1 as built:
- `server/migrations/001_initial.sql` (old schema, adopted as-is) and `002_multi_tree.sql`; `migrate()` applies
  them in order, records them in `schema_migrations`, and takes an advisory lock.
- 002 needs **PostgreSQL 15+** (`on delete set null (husband_id)`); PGlite is 17.
- Every repository function takes `treeId` first; `createTree()` added.
- Until phase 2, the existing `/api/...` routes use the caller's **first** tree (oldest membership).
  `GET /api/me` already lists all of the caller's trees.
- `owner` role exists; owners can edit. Member management is still `npm run member` (now tree-aware;
  refuses to remove or demote a tree's last owner). `npm run backup` dumps all tables to `data/`.
- The owner's dev database was migrated: one tree "My-Family-16-Feb-2020-564", every row identical apart from
  `tree_id`, their membership became `owner`.

Phase 2 as built:
- All tree routes are under `/api/trees/:treeId/…`; the old unscoped `/api/tree`, `/api/settings` etc. are gone.
  `authenticate` (any signed-in user) → `requireTreeMember` (404 if not a member or not a UUID) →
  `requireRole('editor' | 'owner')` (403).
- `GET /api/me` → `{ id, email, trees: [{ id, name, role, peopleCount }] }`, claiming pending invitations.
- `POST /api/trees` `{ name, surnameRule? }` → creator is owner; limit `MAX_TREES_PER_USER` (default 5,
  counts trees the user created and still exist).
- `GET /api/trees/:id` (info), `PATCH /api/trees/:id` (settings: editor; `name`: owner) replaces `PUT /api/settings`,
  `DELETE /api/trees/:id?confirm=<exact name>` (owner).
- Tests: every one of the 16 tree routes, as editor/owner/viewer of tree A against tree B → 404 and B unchanged;
  made-up and malformed tree IDs → 404; create/limit/rename/delete. 29 tests.
- App (minimal ahead of phase 4): signed-in users with no tree get "Start your family tree"; a tree picker in the
  header (with "Start a new tree…"); owners can rename and delete (type the name) in Settings. The last tree and
  the centred person per tree are remembered in localStorage.

Phase 3 as built (invitations: **copy-a-message**, the recommended option; no email service):
- `GET /api/trees/:id/members` (any member) → `[{ email, role, joined, you, addedAt }]`.
- Owners: `POST …/members { email, role }` (409 if already a member; `MAX_MEMBERS_PER_TREE`, default 200),
  `PATCH …/members/:email { role }`, `DELETE …/members/:email`. Any member: `DELETE …/members/me` (leave).
- Last-owner rule: demoting, removing or leaving as the only owner → 409. Member changes lock the tree row
  (`select … for update`) so two owners cannot demote each other at once. Code: `server/src/members-repo.ts`.
- Emails are trimmed and lower-cased; pending until first sign-in with that address (`claimInvitations`).
- App: **Members** button for everyone → list (owners: role menus, remove with inline confirm, add form, then a
  ready-to-copy invite message); everyone can leave unless they are the only owner. Changing your own role reloads
  your permissions; leaving moves to your next tree or the "Start your family tree" screen.
- Tests: 37 (adds member list/add/role/remove/leave/limit, and the 5 member routes in the cross-tree 404 check,
  which now also asserts the other tree's members are unchanged).

Phase 4 as built:
- Angular router (`@angular/router` added): `/` = **My trees** (`trees-page.component.ts`), `/t/:treeId` = one tree
  (`tree-page.component.ts`, the former main screen), anything else → `/`. `app.component.ts` is now only the
  sign-in gate and `<router-outlet>`.
- My trees: cards with name, people count, role and "last opened" (listed first); "Start a new tree" inline; the
  first-run "Start your family tree" form when there are none; "Check again" for new invitations.
- Tree page: the tree picker navigates (`/t/<id>`), plus "All my trees…" and "Start a new tree…"; the app name links
  to `/`; the browser tab shows the tree's name. Unknown/deleted/not-a-member tree → "This tree isn't available".
  Deleting or leaving a tree goes back to `/`.
- Links to a tree can be shared: the invite message now links to `/t/<id>`, and the page someone was on when they
  had to sign in is restored afterwards (`return-url.ts`; localStorage for an hour, because email links open in a
  new tab). No Supabase redirect settings change needed.
- Store: `loadTrees()` (the list, `treesStatus`), `openTree(id)` / `load()` (the tree in the URL; `not-found`
  status), `createTree` returns the new ID, `lastTreeId`. The old "pick a tree for you" logic is gone.
- Production hosting must serve `index.html` for unknown paths (SPA fallback) so `/t/<id>` links work.
- Not done: on phones the tree page's header buttons wrap onto three rows (works, but cramped).

Phase 5 as built:
- Limits (server settings): `MAX_PEOPLE_PER_TREE` (default 20,000; checked inside the edit's transaction, so a
  refused edit or import saves nothing), plus the existing tree, member and request-size limits.
- Rate limits (`server/src/limits.ts`, express-rate-limit, in-memory per process): any `/api` request 1000 per
  5 min per IP; changes 120/min per user; new trees 10/hour; added members 60/hour. 429 with a readable message
  and standard `RateLimit` headers. `TRUST_PROXY` (e.g. 1) so a host's proxy does not make everyone one IP.
- Delete my account: `DELETE /api/me?confirm=<email>` (`server/src/account-repo.ts`) — leaves every tree, deletes
  trees only that user is in, drops pending invitations to their email, clears their email from `updated_by` and
  their ID from `created_by` / `invited_by`; refused (409) while they are the only owner of a tree others use.
  The Supabase sign-in record stays (needs the operator; stated on the privacy page). App: "Your account" section
  on My trees.
- Privacy page at `/privacy`, open without signing in, linked from sign-in and My trees. Optional
  `privacyContact` in `src/environments/`. It is a plain-language description of what the app does, not legal
  advice — review it before going live.
- 500 errors are logged as `500 METHOD /route` + stack only; member emails in URLs are masked; bodies never logged.
- API also sends `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- Deploy prep: `public/_redirects` (Netlify SPA fallback), README "Going live" checklist. Not deployed.
- Tests: 46 (adds size limit, each rate limit, account deletion incl. the only-owner refusal).

## 1. Concepts

| Term | Meaning |
|---|---|
| **Tree** | One family's data: people, families, settings. Has a name, e.g. "The Iyer family". |
| **Member** | A person with access to a tree, with one role in it. One account can be in many trees with different roles. |
| **Owner** | Can do everything an editor can, plus manage members, rename and delete the tree. Every tree has at least one. |
| **Editor** | Can change people and families, import, change settings. |
| **Viewer** | Can see and export. |

## 2. How people get in (invitations)

Recommended: **invite by email address, claimed at sign-in**, the same way `members` works today.

1. An owner adds `aunt@example.com` as editor in the Members screen. This creates a pending membership.
2. The app shows a ready-to-send message with the site link ("Sign in with this email address to see the tree")
   to paste into WhatsApp or email.
3. When the aunt signs in with that address, the server links the pending membership to her account.

No invitation tokens and no email-sending service are needed, because Supabase sign-in already proves she owns
that address. Sending invitation emails from the site (via Resend/Postmark) can come later.

**Open sign-up:** anyone who signs in and has no trees sees "Start a family tree". Sign-up can be restricted
later (invite-only, or a waiting list) by a server setting.

## 3. Database changes

New tables:

```sql
trees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  surname_rule text not null default 'father-surname',
  home_person_id text,               -- validated in the API (same tree)
  file_name text not null default '',
  submitter_name text not null default '',
  created_by uuid not null,          -- Supabase user id
  created_at timestamptz not null default now()
)

tree_members (
  tree_id uuid not null references trees(id) on delete cascade,
  email text not null check (email = lower(email)),
  user_id uuid,                      -- filled on first sign-in, like members today
  role text not null check (role in ('viewer', 'editor', 'owner')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  primary key (tree_id, email)
)
-- unique (tree_id, user_id) where user_id is not null

schema_migrations (version integer primary key, applied_at timestamptz not null default now())
```

Changed tables:
- `people`, `families`, `family_children` get `tree_id uuid not null references trees(id) on delete cascade`.
- Primary keys become `(tree_id, id)`; foreign keys become composite `(tree_id, husband_id) → people(tree_id, id)`,
  so a family can never point at a person in another tree.
- Indexes lead with `tree_id`.
- `tree_meta` and `members` are replaced by `trees` and `tree_members`.

Person and family IDs (`I12`, `F3`) stay per tree, so GEDCOM import and export keep working unchanged.

**Migrations:** `schema.sql` ("create if not exists") is no longer enough once existing tables change shape.
Switch to numbered files (`server/migrations/001_initial.sql`, `002_multi_tree.sql`, …) applied in order and
recorded in `schema_migrations`, each in a transaction.

**Moving today's data:** `002_multi_tree.sql` creates one tree from the current data (named from `tree_meta.fileName`,
or "Family tree"), copies the home person and surname rule into it, sets `tree_id` on every row, and turns each
`members` row into a `tree_members` row. The first editor becomes the owner. Existing members keep their access.

## 4. API changes

Every tree route is scoped: `/api/trees/:treeId/…`.

| Route | Who |
|---|---|
| `GET /api/me` | Signed in: account plus list of trees with role (also claims pending invitations) |
| `POST /api/trees` | Signed in (subject to limits): create a tree; creator becomes owner |
| `GET /api/trees/:treeId` · `/tree` | Viewer+ |
| `PATCH /api/trees/:treeId` (name, settings) | Editor+ (rename: owner) |
| `DELETE /api/trees/:treeId` | Owner, with the tree name typed as confirmation |
| `POST /api/trees/:treeId/changes` · `/import` and the per-record routes | Editor+ |
| `GET /api/trees/:treeId/members` | Viewer+ (emails visible to members only) |
| `POST/PATCH/DELETE /api/trees/:treeId/members…` | Owner. Cannot remove or demote the last owner. |
| `DELETE /api/trees/:treeId/members/me` | Any member: leave a tree (not the last owner) |

How isolation is enforced:
- One middleware, `requireTreeRole(minRole)`, loads the caller's membership for `:treeId`.
  If there is none, it answers **404, not 403**, so other trees' IDs reveal nothing.
- Every repository function takes `treeId` as its first parameter, and every SQL statement filters on it.
  Composite foreign keys back this up in the database.
- Tests: for every route, call it with a valid member of tree A against tree B and expect 404 with nothing changed.

## 5. Browser app changes

- **Routing** (Angular router): `/` shows My trees, `/t/:treeId` shows the tree.
- **My trees**: list with role and size, "Start a family tree" (name + surname rule), and pending invitations.
- **Header**: tree name with a switcher menu; Settings and Members buttons depending on role.
- **Members screen** (owner): add by email with role, change role, remove, copy the invite message.
- **Store**: keyed by tree. Switching tree clears history and the save queue (as `load()` already does), and
  `TreeApi` takes the tree ID.
- **Remembered focus**: the localStorage focus key becomes `family-tree:focus:<treeId>`.
- Settings move from `/api/settings` into `PATCH /api/trees/:treeId`. The Settings dialog gains the tree name.

## 6. Limits, privacy and running costs

- **Limits**, as server settings:
  - trees each account can create (e.g. 5)
  - people per tree (e.g. 20,000)
  - members per tree (e.g. 200)
  - the existing request-size limits

  Rate limiting with `express-rate-limit` on sign-in-dependent writes and tree creation.
- **Privacy:** this holds personal data about living people from many families.
  - a short privacy page: what is stored, who can see it, how to delete it
  - delete tree (owner): removes everything at once (cascade)
  - delete my account: leave every tree; trees where you are the only owner must be handed over or deleted first
  - export is already there (GEDCOM)
  - server logs must not contain names or notes, only IDs and status codes
- **Backups:** use a managed PostgreSQL with daily backups and point-in-time restore (Neon, Render, Railway,
  Supabase Postgres).
- **Email:** Supabase's built-in email service only sends a few emails per hour. Add custom SMTP (e.g. Resend)
  in Supabase before inviting many people.
- **Cost:** a small managed Postgres and one small API instance cover hundreds of families, usually at or near
  free-tier pricing. The static app is free on Netlify, Vercel or GitHub Pages.

## 7. Phases

| # | Work | Rough size |
|---|---|---|
| 1 | Numbered migrations; `trees`, `tree_members`, `tree_id` everywhere; migrate current data; repository functions take `treeId` | 1 day |
| 2 | Tree-scoped routes, `requireTreeRole`, owner role, `/api/me` tree list, create/delete tree; cross-tree isolation tests | 1 day |
| 3 | Members API (add/change/remove/leave, last-owner rule) and Members screen | 1 day |
| 4 | Router, My trees page, create-tree flow, switcher, per-tree settings and focus | 1 day |
| 5 | Limits, rate limiting, delete account, privacy page, production deploy | 1 day |

Each phase ends with the API tests passing and an end-to-end check in the browser (`server/test/e2e-server.ts`).

## 8. Decisions needed before starting

1. ~~**Sign-up:** open to anyone, or invite-only to begin with?~~ **Open sign-up** (decided 22 Oct 2026).
2. **Product name:** keep "Kudumbam" (`environment.appName`) or choose another for the public site?
3. ~~**Invitation emails:**~~ **Copy-a-message** for now (built in phase 3); site-sent emails can come later.
4. ~~**Hosting:**~~ **A headless Raspberry Pi** (decided 23 Oct 2026): PostgreSQL, the API and the app on the Pi
   behind Caddy; Cloudflare Tunnel (or port forwarding) for internet access. Guide: `deploy/raspberry-pi/README.md`.

## Not in this plan

- Live updates while someone else edits.
- Change history (who changed what, and restoring an old version).
- Public read-only links.
- Linking or merging trees between families.

# Shared database plan (option 3)

> **Implemented 21 Oct 2026** with PostgreSQL and Express (`server/`). Differences from the plan below:
> - The app saves each edit with one `POST /api/changes` (all records it touches, one transaction) so an edit
>   like "add son" (person + family + child link) can't half-save. The per-record REST routes exist too and use
>   the same code.
> - Members are added by email with `npm run member`; the Supabase user ID is stored on their first sign-in.
> - `tree_meta` table added for the file name and GEDCOM submitter.
> - Local development uses PGlite (embedded Postgres, `npm run db:dev`); production uses any PostgreSQL via `DATABASE_URL`.

Goal: family members sign in and edit one shared tree. Supabase handles **sign-in only**; an API server
(Express.js or NestJS) checks each request; the tree lives in the user's own database (type not yet chosen).

## 1. Supabase setup (dashboard only)
- Create a project; enable Google and email magic-link sign-in.
- Add redirect URLs: `http://localhost:4200` and the production domain.
- Use the publishable key (`sb_publishable_…`) in the browser. The secret key is not needed for this design.

## 2. Angular changes
| Area | Change |
|---|---|
| `auth.service.ts` (new) | `@supabase/supabase-js`: sign in, sign out, `session` signal with user + access token |
| Login screen (new) | Shown when signed out: "Continue with Google", "Email me a link" |
| `main.ts` | `provideHttpClient(withInterceptors([authInterceptor]))` adding `Authorization: Bearer <token>` |
| `family-store.service.ts` | Load from `GET /api/tree`; each edit calls the API with optimistic update + rollback on error; replace localStorage persistence |
| Undo/redo | Undo is sent to the server as a normal edit |
| Import | Parse in browser (`gedcom.ts` unchanged), send to `POST /api/import` |
| Export | Unchanged, client-side |
| Roles | Hide edit controls for viewers |

Unchanged: `gedcom.ts`, `tree-layout.ts`, `tree-view.component.ts`, most of the editor.

## 3. API server
Token check against Supabase's public signing keys (no Supabase secret needed):

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwks = createRemoteJWKSet(
  new URL('https://<project>.supabase.co/auth/v1/.well-known/jwks.json'));

export async function requireUser(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const { payload } = await jwtVerify(token, jwks, {
      issuer: 'https://<project>.supabase.co/auth/v1',
      audience: 'authenticated',
    });
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in again.' });
  }
}
```
Confirm the JWKS URL and issuer in the Supabase project settings (assumes the newer asymmetric signing keys).

Permissions: look up the user in a `members` table — not listed → 403; `viewer` → read only; `editor` → read/write.

Endpoints:
- `GET /api/tree`
- `POST` / `PATCH` / `DELETE` `/api/people/:id`
- `POST` / `PATCH` / `DELETE` `/api/families/:id`, plus add/remove child and spouse
- `POST /api/import` (editors only, replaces the tree)

Also: DB credentials in environment variables, CORS limited to the app's domain, input validation,
a `version` column per record for optimistic concurrency (reject stale writes with 409).

## 4. Database tables
- `people`: id, given, surname, married_name, sex, birth_date, birth_place, deceased, death_date, death_place,
  notes, extra (raw GEDCOM lines as JSON/text), version, updated_by, updated_at
- `families`: id, husband_id, wife_id, marriage_date, marriage_place, is_current, extra, version
- `family_children`: family_id, person_id, position
- `members`: supabase_user_id or email, role (`viewer` | `editor`)

## 5. Hosting
Angular static build (Netlify/Vercel), Node API (Render/Railway/own machine), the database, Supabase (free tier, auth only).

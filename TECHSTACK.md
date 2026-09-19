# Tech stack

## The choice

**Next.js 16 (App Router) + Supabase Postgres + Vercel, with Gemini called from
route handlers.**

Every requirement in the problem statement is CRUD over organisational data plus
language-model inference over text. Nothing in it forces a Python runtime — no
training, no numerical pipeline, no Python-only library — so a second service on
Render would have cost a second deploy and a CORS story for no capability. One
repo, one deploy, one auth model.

## Dependencies

| Package | Why it is here |
|---|---|
| `next` 16.3 | App Router: Server Components for data-heavy pages, route handlers as the backend, one deployment unit. |
| `react` / `react-dom` 19.2 | Required by Next 16. |
| `@supabase/supabase-js` | Postgres, Auth and the PostgREST client in one SDK. |
| `@supabase/ssr` | Cookie-based sessions that work across Server Components, route handlers and `proxy.ts`. Without it the session cannot be read on the server. |
| `zod` 4 | Schema validation at every trust boundary — request bodies **and** model output. |
| `tailwindcss` 4 | Utility styling with no component framework to fight; the design system is ~30 lines of CSS variables in `globals.css`. |
| `vitest` | Unit tests for the scoring rule and the model-output parsing. Fast, ESM-native, no extra config. |
| `typescript`, `eslint`, `eslint-config-next` | Type checking and the Next.js lint rules. |

No charting library: the charts are hand-drawn SVG in Server Components
(`src/components/charts.tsx`), which ships zero client JavaScript for them.

No component library: nine pages did not justify the bundle.

## Architecture

```
Browser
  │  session cookie
  ▼
proxy.ts ─ refreshes the Supabase session on every request
  │
  ├─ Server Components (src/app/**/page.tsx)
  │     read through src/lib/data.ts with the CALLER'S session client
  │     → RLS decides what comes back
  │
  └─ Route handlers (src/app/api/**/route.ts)
        1. Zod-validate the body               (src/lib/validation.ts)
        2. Authorise the caller                (src/lib/auth.ts)
        3. Compute what can be computed        (src/lib/scoring.ts — pure, tested)
        4. Call the model ladder if needed     (src/lib/ai/provider.ts)
        5. Zod-validate the MODEL'S output     (src/lib/ai/schemas.ts)
        6. Write through RLS + append audit    (src/lib/audit.ts)
                     │
                     ▼
              Supabase Postgres
              12 tb_* tables, RLS on every one, tb_audit_log append-only
```

### Two decisions worth defending

**The score is code, the prose is AI.** `scoreMatch()` is pure arithmetic over
skill levels and role weights, unit tested in `src/lib/scoring.test.ts`. The
model receives the finished number and is instructed not to contradict it. A
provider outage costs an explanation, never a ranking, and the same inputs
always produce the same shortlist.

**The AI proposes; a human disposes.** The HR command bar is two endpoints.
`/api/hr/command/plan` writes nothing: it turns an instruction into a structured
plan, resolves names to ids *server-side under the caller's own RLS*, and
returns a before/after diff. `/api/hr/command/execute` re-verifies everything
and performs the write — and calls no model at all. The LLM never holds a
database connection and never sees an id.

### Model ladder

`gemini-flash-latest` → `gemini-3.1-flash-lite` → `openai/gpt-oss-120b` (Groq).

All three rungs were live-tested on 2026-09-19 while building this, and the test
is the argument for the design: `gemini-flash-latest` returned **503 "currently
experiencing high demand"** on the first call, and the Groq id this project was
originally written against — `llama-3.3-70b-versatile` — returned **404, no
longer served on this key**. The middle rung answered. A single-provider build
would have been down at that moment; a two-vendor build with a stale second id
would have been down too.

Two models on the same key before a second vendor, because a burst limit
or a model-specific fault is more likely than a whole provider disappearing, and
a fallback that depends on a second vendor's key still being valid is a fallback
that silently rots. Each rung has an 8s timeout, and every AI route sets
`maxDuration = 60` so the platform does not kill the function before the ladder
finishes.

## Environment variables

Names only — values live in `.env.local` locally (gitignored) and in the Vercel
project settings in production.

| Name | Where it is used | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | No, public by definition |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | No — all authority comes from RLS |
| `GEMINI_API_KEY` | route handlers only | **Yes** |
| `GROQ_API_KEY` | route handlers only | **Yes** |

The Supabase **service-role key is not used anywhere in this project**. There is
no admin client, so there is no code path that can bypass row level security.

## Database

Twelve tables, all prefixed `tb_`, defined in `supabase/migrations/`:

- `0001_schema.sql` — enums, tables, CHECK constraints, indexes on every foreign
  key and every column an RLS policy filters on, `updated_at` triggers.
- `0002_rls.sql` — RLS enabled on all twelve, policies for employee-self and
  HR-wide access, and `REVOKE UPDATE, DELETE` on the audit table.
- `0003_seed_auth_users.sql` — eight real Supabase Auth users.
- `0004_seed_org_data.sql` — the seeded organisation.
- `0005_fix_profile_column_grants.sql` — closes a privilege-escalation hole.
  `0002` tried to stop self-promotion with a column-level
  `REVOKE UPDATE (app_role)`, which is silently a no-op: Postgres cannot
  subtract a column from a table-wide grant, and Supabase grants `ALL` on public
  tables to `authenticated`. An employee could `PATCH` their own `app_role` to
  `hr` and get a 200. A pre-deploy RLS test caught it. The fix revokes `UPDATE`
  at the table level and grants it back for only the self-editable columns,
  adds a trigger pinning `app_role` to `tb_hr_admins`, and the application now
  derives HR authority from that membership table rather than the column.
  Data was never exposed — RLS already took authority from `tb_hr_admins`,
  which has no insert policy — but the app's own UI gate trusted the column.

`auth.uid()` is wrapped in `(select …)` in every policy so Postgres evaluates it
once per statement rather than once per row.

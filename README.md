# TalentBridge

**AI-powered talent discovery and internal mobility.**
Your next hire already works here — this finds them.

An organisation cannot see the skills its own people already have, so open roles
get filled externally while capable insiders stay invisible. TalentBridge reads
each employee's real work history, infers the skills their job title hides,
scores them against every internal opening, and turns the remaining gap into a
learning plan.

> **Live Demo:** https://talentbridge-ten.vercel.app
> **GitHub Repo:** https://github.com/Harshini-1021/talentbridge

---

## Two minutes: what to click

Sign in with the demo accounts listed on the login page (one click fills the
form). Password for every demo account: `TalentBridge#2026`.

**As Priya Raman** (`priya@talentbridge.dev`) — a Data Analyst:

1. **My skills → Run skill discovery.** The model reads her four work-history
   entries and writes back a skill profile. Watch the **Hidden strengths**
   section appear: skills like dbt, Airflow and machine learning that her title
   "Data Analyst" never advertised, each with the sentence of evidence it came
   from and a confidence score.
2. **Opportunities.** Every open role, scored. Open *Data Platform Engineer* →
   the requirement coverage matrix, then **Explain my fit** for the written
   justification, then **Build my roadmap** for a learning plan addressing the
   gaps in order of importance.
3. **Career assistant.** Ask "Am I ready for Data Platform Engineer?" — it
   answers from her own profile and quotes the real scores.

**As Arun Mehta** (`arun@talentbridge.dev`) — HR:

4. **Workforce.** Skill supply, emerging skill gaps (skills the open roles need
   that nobody internal can fill), and the best internal candidate for each role.
5. **Command bar.** Type *"Shortlist the top 3 internal candidates for Data
   Platform Engineer and nominate them."* It plans the action, resolves the names
   under HR's own permissions, and shows a **before/after diff**. Nothing is
   written until **Confirm and apply**.
6. **Audit log.** The change you just made, with its before and after state.

---

## The two design decisions

**The score is code; the prose is AI.** `scoreMatch()` in
[`src/lib/scoring.ts`](src/lib/scoring.ts) is pure arithmetic — weighted coverage
of each required level, with an inferred skill discounted by the model's own
confidence. The model is handed the finished number and told not to contradict
it. So rankings are reproducible, an LLM outage costs an explanation rather than
a shortlist, and the rule is unit tested — which a prompt cannot be.

**The AI proposes; a human disposes.** The HR command bar is two endpoints. The
plan step writes nothing and never sees a database id: it produces a structured
plan, and the *server* resolves names to ids under the caller's own RLS. The
execute step re-verifies everything, writes, and appends an audit row — and
calls no model at all. An LLM never holds a connection to this database.

---

## Security

- **RLS on all twelve tables.** An employee reaches their own rows; HR reaches
  the organisation. Enforced in Postgres, not in application code.
- **No service-role key anywhere in this project.** There is no admin client, so
  there is no code path that can bypass RLS.
- **Privilege escalation blocked at the column level:** `REVOKE UPDATE
  (app_role)` on `tb_profiles`, so even a valid-looking update cannot promote
  anyone.
- **The audit log is append-only:** no update or delete policy exists, and both
  privileges are revoked from client roles.
- **Career-assistant conversations are private to the employee** — there is no
  HR policy on that table, deliberately.
- **Model output is validated like any request body**, with Zod, before it
  reaches Postgres.
- Real Supabase Auth with credentialed accounts. No role switcher.

---

## Local setup

```bash
npm install
```

Create `.env.local` (it is gitignored — never commit it):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable / anon key>
GEMINI_API_KEY=<key>
GROQ_API_KEY=<key>
```

Apply the migrations in order — paste each into the Supabase dashboard SQL
editor, or run them with the Supabase CLI:

```
supabase/migrations/0001_schema.sql
supabase/migrations/0002_rls.sql
supabase/migrations/0003_seed_auth_users.sql
supabase/migrations/0004_seed_org_data.sql
```

Then:

```bash
npm run dev
```

## Tests

```bash
npm test
```

51 tests over the parts that would fail quietly: the scoring rule (weighting,
confidence discounting, division-by-zero on a role with no requirements, NaN
inputs, tie-break stability) and the model-output layer (JSON buried in prose,
braces inside strings, trailing commas, and schemas rejecting an out-of-range
level or an invented command action).

## Docker

```bash
docker build -t talentbridge \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... .

docker run --env-file .env.local -p 3000:3000 talentbridge
```

Multi-stage, runs as an unprivileged user, and private keys are supplied at run
time rather than baked into a layer.

## Deploying

Pushing to `main` deploys to Vercel. Set the four environment variables above in
the Vercel project settings before the first build — `NEXT_PUBLIC_*` values are
inlined into the client bundle at build time, so a build without them produces
an app that cannot reach Supabase.

## Project layout

```
proxy.ts                     session refresh (Next 16 renamed middleware → proxy)
src/lib/scoring.ts           the deterministic match rule (+ .test.ts)
src/lib/ai/provider.ts       Gemini → Gemini → Groq ladder, 8s per rung
src/lib/ai/schemas.ts        Zod schemas for every model response (+ .test.ts)
src/lib/ai/json.ts           recovering JSON from model prose (+ .test.ts)
src/lib/validation.ts        Zod schemas for every request body
src/lib/data.ts              every read, through the caller's session client
src/lib/audit.ts             append-only audit writes
src/app/api/**/route.ts      the backend
src/components/charts.tsx    hand-drawn SVG charts, zero client JS
supabase/migrations/         schema, RLS, seed
```

## Status

Built in one session for an on-spot hackathon. Working: authentication, skill
discovery, role matching, gap analysis, learning roadmaps, the career assistant,
the HR workforce view, the agentic command bar, and the audit trail.

Deliberately out of scope: resume/PDF upload, real course-provider integrations
(the roadmap names real courses but does not call a catalogue API), email
notifications, manager approval chains, and multi-tenancy.

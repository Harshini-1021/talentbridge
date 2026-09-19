# ANALYSIS — TalentBridge

**Track:** AI × Web Development
**Written:** 2026-09-19 (Phase 1 — checkpoint output)

## 0. Source transcription

Problem statement arrived as four phone screenshots of a modal. Transcribed in
full; nothing was unreadable.

**AI-Powered Talent Discovery & Internal Mobility** — tagged `AI X WEB DEVELOPMENT`

*AI-Powered Talent Discovery & Employee Profiling*
- Analyze employee experience, projects, work history, learning activities, and existing organizational data.
- Discover both explicit and hidden or transferable skills that may not be visible through job titles or resumes.
- Build dynamic AI-powered employee skill profiles that continuously evolve with new experience and learning.
- Identify employee strengths, expertise areas, and potential capabilities for future roles.

*AI-Powered Internal Role Matching*
- Match employees with suitable internal jobs, projects, teams, and career opportunities based on their skills and experience.
- Analyze organizational role requirements and compare them with employee skill profiles.
- Explain why an employee is suitable for a particular role using relevant skills, experience, and achievements.
- Help organizations discover suitable internal talent for emerging business requirements.

*Skill Gap Analysis & Career Development*
- Identify missing skills between an employee's current capabilities and their desired or future roles.
- Predict potential skill requirements for emerging roles based on organizational needs.
- Recommend personalized courses, certifications, projects, and learning activities to close identified skill gaps.
- Generate personalized career development and internal mobility roadmaps for employees.

*AI Career Assistant & Continuous Learning*
- Provide an AI career assistant that answers employee questions about skills, roles, opportunities, and career growth.
- Explain recommended career paths, role matches, skill gaps, and learning recommendations.
- Collect employee feedback and analyze career outcomes to improve future recommendations.
- Provide HR administrators with AI-driven insights into workforce skills, talent availability, and emerging skill gaps.

## 1. Problem restated

An organization cannot see the skills its own people already have, so open roles
get filled externally while capable insiders stay invisible. TalentBridge reads
each employee's real work history and learning activity, infers both stated and
hidden/transferable skills into a living profile, matches those profiles against
internal openings with a written justification, and turns the remaining gap into
a concrete learning roadmap — with an AI assistant on the employee side and
workforce insight plus an action-taking command bar on the HR side.

## 2. Judging criteria (inferred)

Round 1 is scored by an AI jury that reads the repository. The weight sits in
Backend, Security & Auth, Database, Code Quality and Architecture — the previous
entry lost its 6-point gap there while winning on UI. So this build treats
validation, tests, migrations, audit trail, RLS and Docker as scored
deliverables, not polish. Innovation rewards an AI that *acts* (plan → diff →
confirm → audit), not an AI that prints paragraphs.

## 3. Core user flow

The single path a judge walks:

1. Land on `/` → one-click demo login as **Priya (employee)**.
2. Her profile shows AI-extracted skills, each with evidence and a confidence
   score, and flags **hidden/transferable** skills her job title never revealed.
3. **Opportunities** lists internal roles ranked by fit, each with a "why you fit"
   explanation, a gap list and a generated learning roadmap.
4. Ask the **Career Assistant**: "Am I ready for Data Platform Engineer?" — it
   answers grounded in her own profile, under her own RLS.
5. Log out, log in as **Arun (HR)** → workforce dashboard: skill supply charts,
   talent availability, emerging gaps.
6. HR types a natural-language command: *"Shortlist the top 3 internal candidates
   for Data Platform Engineer and nominate them."* The system plans it, resolves
   names to ids under HR's own RLS, shows a **before/after diff**, and writes
   only after HR confirms — leaving an audit row.

## 4. MVP features (three)

**F1 — Dynamic AI skill profile.** Ingest an employee's projects, work history
and learning records; Gemini returns Zod-validated JSON of skills with level,
confidence, an evidence sentence and an `is_hidden` flag for transferable
skills; persisted and re-runnable so the profile evolves as new experience lands.

**F2 — Role match, gap analysis and roadmap.** Score every open role against a
profile, generate the justification, the missing-skill list, and a personalized
learning plan (courses/certifications/projects with effort estimates). Visible
both ways: the employee sees their opportunities, HR sees each role's internal
candidate bench.

**F3 — Career assistant + HR agentic command bar.** Employee Q&A grounded in
their own data. HR command bar that plans a mutation, shows a before/after diff
and executes only on confirmation, appending to the audit log.

**Later (not in MVP):** resume/PDF upload and parsing, feedback-loop retraining
on career outcomes, predicted skill requirements for not-yet-created roles,
manager approval chains, notifications, external course-catalog APIs, org chart.

## 5. Stack choice

**T2 — Next.js (App Router) + Supabase + Vercel, with Gemini in route handlers.**
Every requirement is CRUD plus LLM inference over text; nothing forces Python, so
T3's second deploy would be 25 minutes spent for nothing. LLM calls live in route
handlers only, with the `gemini-flash-latest` → `gemini-3.1-flash-lite` → Groq
ladder and `maxDuration = 60`.

## 6. Data model

All tables prefixed `tb_` (the Supabase project may still hold tables from a
previous run — nothing gets dropped). RLS enabled on every one.

| Table | Columns | Notes |
|---|---|---|
| `tb_profiles` | `user_id` PK → `auth.users`, `full_name`, `email`, `app_role` (`employee`\|`hr`), `department`, `job_title`, `years_experience` | self-readable; HR reads all |
| `tb_experiences` | `id`, `employee_id` → profiles, `kind` (`project`\|`job`\|`learning`\|`achievement`), `title`, `description`, `started_on`, `ended_on` | the raw input F1 reads |
| `tb_skills` | `id`, `name` UNIQUE, `category` | shared taxonomy |
| `tb_employee_skills` | `id`, `employee_id`, `skill_id`, `level` 1–5, `confidence`, `source` (`declared`\|`ai_inferred`), `evidence`, `is_hidden`, `updated_at` | UNIQUE(employee, skill) |
| `tb_roles` | `id`, `title`, `department`, `description`, `is_open`, `created_by` | internal openings |
| `tb_role_skills` | `role_id`, `skill_id`, `required_level`, `weight` | requirement matrix |
| `tb_matches` | `id`, `employee_id`, `role_id`, `score`, `rationale`, `gaps` jsonb, `created_at` | cached AI result |
| `tb_learning_recs` | `id`, `employee_id`, `skill_id`, `title`, `provider`, `url`, `effort_hours`, `rationale` | the roadmap |
| `tb_nominations` | `id`, `employee_id`, `role_id`, `status` (`proposed`\|`confirmed`\|`rejected`), `created_by`, `note` | what the HR command writes |
| `tb_assistant_messages` | `id`, `employee_id`, `role` (`user`\|`assistant`), `content`, `created_at` | chat history |
| `tb_audit_log` | `id`, `actor` default `auth.uid()`, `action`, `entity`, `entity_id`, `before` jsonb, `after` jsonb, `created_at` | append-only; insert-only RLS, no update/delete policy |

Match score is computed in TypeScript/SQL (deterministic, testable: weighted
coverage of required level) and only the *explanation* comes from the model — so
the number survives an LLM outage and the grading maths is unit-testable.

## 7. Time plan (3h budget)

| Elapsed | Work |
|---|---|
| 0:00–0:15 | This analysis, checkpoint |
| 0:15–0:35 | Scaffold, migrations, RLS, seeded demo accounts + 8 employees / 5 roles — **ask for Vercel env vars now** |
| 0:35–0:45 | Skeleton live on Vercel, verified by fetching the URL |
| 0:45–1:45 | F1 → F2 → F3, pushing as each lands |
| 1:45–2:30 | Zod at every boundary, vitest on the scoring maths + JSON repair, audit writes, Dockerfile, hand-drawn SVG charts |
| 2:30–2:50 | UI polish, empty/error states, seed realism |
| 2:50–3:00 | README, final push, end-to-end verify on the live URL |

## 8. Non-goals

Resume/PDF upload and OCR. Real course-provider integrations (seeded catalog
instead). Email/notifications. Manager approval workflow. Org-chart visualisation.
Multi-tenant orgs — one company, one workspace. Embeddings/vector search: the
corpus is ~8 employees, so weighted skill overlap is more accurate and far easier
to defend than cosine similarity over 8 rows. Model fine-tuning or any training.
Mobile-native app.

## 9. Open question for the checkpoint

None blocking. Default assumption unless told otherwise: **two roles only**
(employee, HR admin) — no separate manager role — and demo accounts are seeded
with one-click login fill buttons on `/`.

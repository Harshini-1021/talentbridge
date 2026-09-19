-- TalentBridge 0001 — schema
-- AI-Powered Talent Discovery & Internal Mobility
-- Every object is prefixed tb_ so it cannot collide with anything already in
-- this Supabase project. Nothing existing is dropped or altered.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type tb_app_role as enum ('employee', 'hr');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tb_experience_kind as enum ('project', 'job', 'learning', 'achievement');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tb_skill_source as enum ('declared', 'ai_inferred');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tb_nomination_status as enum ('proposed', 'confirmed', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tb_message_role as enum ('user', 'assistant');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table if not exists public.tb_profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  full_name        text        not null check (length(btrim(full_name)) between 1 and 120),
  email            text        not null unique check (position('@' in email) > 1),
  app_role         tb_app_role not null default 'employee',
  department       text        not null check (length(btrim(department)) between 1 and 80),
  job_title        text        not null check (length(btrim(job_title)) between 1 and 120),
  years_experience numeric(4,1) not null default 0 check (years_experience >= 0 and years_experience <= 60),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.tb_profiles is
  'One row per person in the organisation, keyed to the auth user.';

-- Membership table used by RLS to answer "is the caller an HR admin?" without
-- a self-referencing policy on tb_profiles (which would recurse).
create table if not exists public.tb_hr_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

comment on table public.tb_hr_admins is
  'HR admin membership. Read-only to clients; rows are granted by migration only.';

-- ---------------------------------------------------------------------------
-- Raw organisational data the AI reads
-- ---------------------------------------------------------------------------
create table if not exists public.tb_experiences (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.tb_profiles (user_id) on delete cascade,
  kind        tb_experience_kind not null,
  title       text not null check (length(btrim(title)) between 1 and 160),
  description text not null check (length(btrim(description)) between 1 and 4000),
  started_on  date,
  ended_on    date,
  created_at  timestamptz not null default now(),
  constraint tb_experiences_date_order check (ended_on is null or started_on is null or ended_on >= started_on)
);

create index if not exists tb_experiences_employee_id_idx
  on public.tb_experiences (employee_id);

-- ---------------------------------------------------------------------------
-- Skill taxonomy
-- ---------------------------------------------------------------------------
create table if not exists public.tb_skills (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique check (length(btrim(name)) between 1 and 80),
  category text not null check (length(btrim(category)) between 1 and 60)
);

create index if not exists tb_skills_category_idx on public.tb_skills (category);

create table if not exists public.tb_employee_skills (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.tb_profiles (user_id) on delete cascade,
  skill_id    uuid not null references public.tb_skills (id) on delete cascade,
  level       smallint not null check (level between 1 and 5),
  confidence  numeric(3,2) not null default 1.0 check (confidence >= 0 and confidence <= 1),
  source      tb_skill_source not null default 'declared',
  evidence    text check (evidence is null or length(btrim(evidence)) between 1 and 600),
  is_hidden   boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (employee_id, skill_id)
);

comment on column public.tb_employee_skills.is_hidden is
  'True when the skill was inferred from work history rather than stated by the job title or a declared list.';

create index if not exists tb_employee_skills_employee_id_idx
  on public.tb_employee_skills (employee_id);
create index if not exists tb_employee_skills_skill_id_idx
  on public.tb_employee_skills (skill_id);

-- ---------------------------------------------------------------------------
-- Internal opportunities
-- ---------------------------------------------------------------------------
create table if not exists public.tb_roles (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) between 1 and 140),
  department  text not null check (length(btrim(department)) between 1 and 80),
  description text not null check (length(btrim(description)) between 1 and 4000),
  is_open     boolean not null default true,
  created_by  uuid references public.tb_profiles (user_id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists tb_roles_created_by_idx on public.tb_roles (created_by);
create index if not exists tb_roles_open_idx on public.tb_roles (is_open) where is_open;

create table if not exists public.tb_role_skills (
  id             uuid primary key default gen_random_uuid(),
  role_id        uuid not null references public.tb_roles (id) on delete cascade,
  skill_id       uuid not null references public.tb_skills (id) on delete cascade,
  required_level smallint not null check (required_level between 1 and 5),
  weight         numeric(3,2) not null default 1.0 check (weight > 0 and weight <= 3),
  unique (role_id, skill_id)
);

create index if not exists tb_role_skills_role_id_idx on public.tb_role_skills (role_id);
create index if not exists tb_role_skills_skill_id_idx on public.tb_role_skills (skill_id);

-- ---------------------------------------------------------------------------
-- AI output: cached match rationale, learning roadmap, nominations
-- ---------------------------------------------------------------------------
create table if not exists public.tb_matches (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.tb_profiles (user_id) on delete cascade,
  role_id     uuid not null references public.tb_roles (id) on delete cascade,
  score       numeric(5,2) not null check (score >= 0 and score <= 100),
  rationale   text not null check (length(btrim(rationale)) between 1 and 4000),
  gaps        jsonb not null default '[]'::jsonb,
  model       text,
  created_at  timestamptz not null default now(),
  unique (employee_id, role_id)
);

comment on table public.tb_matches is
  'Cache of the generated explanation. The score itself is recomputed deterministically in the app, so a model outage never changes a ranking.';

create index if not exists tb_matches_employee_id_idx on public.tb_matches (employee_id);
create index if not exists tb_matches_role_id_idx on public.tb_matches (role_id);

create table if not exists public.tb_learning_recs (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.tb_profiles (user_id) on delete cascade,
  role_id      uuid references public.tb_roles (id) on delete cascade,
  skill_id     uuid references public.tb_skills (id) on delete set null,
  skill_name   text not null check (length(btrim(skill_name)) between 1 and 80),
  title        text not null check (length(btrim(title)) between 1 and 200),
  provider     text not null check (length(btrim(provider)) between 1 and 80),
  url          text check (url is null or url ~ '^https?://'),
  effort_hours smallint not null check (effort_hours between 1 and 400),
  rationale    text not null check (length(btrim(rationale)) between 1 and 1000),
  created_at   timestamptz not null default now()
);

create index if not exists tb_learning_recs_employee_id_idx on public.tb_learning_recs (employee_id);
create index if not exists tb_learning_recs_role_id_idx on public.tb_learning_recs (role_id);
create index if not exists tb_learning_recs_skill_id_idx on public.tb_learning_recs (skill_id);

create table if not exists public.tb_nominations (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.tb_profiles (user_id) on delete cascade,
  role_id     uuid not null references public.tb_roles (id) on delete cascade,
  status      tb_nomination_status not null default 'proposed',
  note        text check (note is null or length(btrim(note)) between 1 and 1000),
  created_by  uuid not null references public.tb_profiles (user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (employee_id, role_id)
);

create index if not exists tb_nominations_employee_id_idx on public.tb_nominations (employee_id);
create index if not exists tb_nominations_role_id_idx on public.tb_nominations (role_id);
create index if not exists tb_nominations_created_by_idx on public.tb_nominations (created_by);

create table if not exists public.tb_assistant_messages (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.tb_profiles (user_id) on delete cascade,
  role        tb_message_role not null,
  content     text not null check (length(btrim(content)) between 1 and 8000),
  created_at  timestamptz not null default now()
);

create index if not exists tb_assistant_messages_employee_id_created_idx
  on public.tb_assistant_messages (employee_id, created_at);

-- ---------------------------------------------------------------------------
-- Append-only audit log
-- ---------------------------------------------------------------------------
create table if not exists public.tb_audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action     text not null check (length(btrim(action)) between 1 and 80),
  entity     text not null check (length(btrim(entity)) between 1 and 80),
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

comment on table public.tb_audit_log is
  'Append-only. No update or delete policy exists, and both privileges are revoked from client roles.';

create index if not exists tb_audit_log_actor_idx on public.tb_audit_log (actor);
create index if not exists tb_audit_log_created_at_idx on public.tb_audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.tb_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tb_profiles_touch on public.tb_profiles;
create trigger tb_profiles_touch before update on public.tb_profiles
  for each row execute function public.tb_touch_updated_at();

drop trigger if exists tb_employee_skills_touch on public.tb_employee_skills;
create trigger tb_employee_skills_touch before update on public.tb_employee_skills
  for each row execute function public.tb_touch_updated_at();

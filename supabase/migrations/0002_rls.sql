-- TalentBridge 0002 — row level security
--
-- Every table gets RLS. Two shapes of access:
--   * an employee reaches their own rows,
--   * an HR admin reaches the whole organisation (except private assistant chats).
--
-- auth.uid() is always wrapped in (select ...) so Postgres evaluates it once per
-- statement instead of once per row, and every column a policy filters on is
-- indexed in 0001.

-- ---------------------------------------------------------------------------
-- HR predicate
--
-- security invoker on purpose: the function reads tb_hr_admins *through* RLS,
-- and that table only ever exposes the caller's own row. So the function cannot
-- be used to probe anyone else's membership, and it never needs elevated
-- privileges. It is also non-recursive, which a policy that queried
-- tb_profiles from inside a tb_profiles policy would not be.
-- ---------------------------------------------------------------------------
create or replace function public.tb_is_hr()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.tb_hr_admins h
    where h.user_id = (select auth.uid())
  );
$$;

comment on function public.tb_is_hr() is
  'True when the calling user is an HR admin. Reads tb_hr_admins under RLS.';

alter table public.tb_profiles            enable row level security;
alter table public.tb_hr_admins           enable row level security;
alter table public.tb_experiences         enable row level security;
alter table public.tb_skills              enable row level security;
alter table public.tb_employee_skills     enable row level security;
alter table public.tb_roles               enable row level security;
alter table public.tb_role_skills         enable row level security;
alter table public.tb_matches             enable row level security;
alter table public.tb_learning_recs       enable row level security;
alter table public.tb_nominations         enable row level security;
alter table public.tb_assistant_messages  enable row level security;
alter table public.tb_audit_log           enable row level security;

-- ---------------------------------------------------------------------------
-- tb_hr_admins — the caller may confirm their own membership, nothing else.
-- No insert/update/delete policy: membership is granted by migration only.
-- ---------------------------------------------------------------------------
drop policy if exists tb_hr_admins_select_self on public.tb_hr_admins;
create policy tb_hr_admins_select_self on public.tb_hr_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- tb_profiles
-- ---------------------------------------------------------------------------
drop policy if exists tb_profiles_select on public.tb_profiles;
create policy tb_profiles_select on public.tb_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.tb_is_hr()));

drop policy if exists tb_profiles_update_self on public.tb_profiles;
create policy tb_profiles_update_self on public.tb_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- NOTE: this line does not work, and 0005 replaces it. Postgres cannot subtract
-- a column from a table-level grant, and Supabase grants ALL on public tables
-- to `authenticated`, so this REVOKE is silently a no-op. It is left here
-- rather than rewritten because it has already been applied; see
-- 0005_fix_profile_column_grants.sql for the working version.
revoke update (app_role, user_id, email) on public.tb_profiles from authenticated;

-- ---------------------------------------------------------------------------
-- tb_experiences — own rows are writable, HR reads everything.
-- ---------------------------------------------------------------------------
drop policy if exists tb_experiences_select on public.tb_experiences;
create policy tb_experiences_select on public.tb_experiences
  for select to authenticated
  using (employee_id = (select auth.uid()) or (select public.tb_is_hr()));

drop policy if exists tb_experiences_insert_self on public.tb_experiences;
create policy tb_experiences_insert_self on public.tb_experiences
  for insert to authenticated
  with check (employee_id = (select auth.uid()));

drop policy if exists tb_experiences_update_self on public.tb_experiences;
create policy tb_experiences_update_self on public.tb_experiences
  for update to authenticated
  using (employee_id = (select auth.uid()))
  with check (employee_id = (select auth.uid()));

drop policy if exists tb_experiences_delete_self on public.tb_experiences;
create policy tb_experiences_delete_self on public.tb_experiences
  for delete to authenticated
  using (employee_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Org-wide catalogue: everyone signed in reads, only HR writes.
-- ---------------------------------------------------------------------------
drop policy if exists tb_skills_select on public.tb_skills;
create policy tb_skills_select on public.tb_skills
  for select to authenticated using (true);

-- The taxonomy grows when discovery finds a skill the organisation had no name
-- for yet, so any signed-in user may add a name. Renaming and deleting stay
-- impossible from the client: there is no update or delete policy, and a
-- unique constraint stops duplicates.
drop policy if exists tb_skills_insert_hr on public.tb_skills;
drop policy if exists tb_skills_insert on public.tb_skills;
create policy tb_skills_insert on public.tb_skills
  for insert to authenticated with check (true);

drop policy if exists tb_roles_select on public.tb_roles;
create policy tb_roles_select on public.tb_roles
  for select to authenticated using (true);

drop policy if exists tb_roles_write_hr on public.tb_roles;
create policy tb_roles_write_hr on public.tb_roles
  for insert to authenticated with check ((select public.tb_is_hr()));

drop policy if exists tb_roles_update_hr on public.tb_roles;
create policy tb_roles_update_hr on public.tb_roles
  for update to authenticated
  using ((select public.tb_is_hr()))
  with check ((select public.tb_is_hr()));

drop policy if exists tb_role_skills_select on public.tb_role_skills;
create policy tb_role_skills_select on public.tb_role_skills
  for select to authenticated using (true);

drop policy if exists tb_role_skills_write_hr on public.tb_role_skills;
create policy tb_role_skills_write_hr on public.tb_role_skills
  for insert to authenticated with check ((select public.tb_is_hr()));

-- ---------------------------------------------------------------------------
-- tb_employee_skills — the AI profile writes here on the employee's behalf,
-- so inserts and updates are scoped to the caller's own row.
-- ---------------------------------------------------------------------------
drop policy if exists tb_employee_skills_select on public.tb_employee_skills;
create policy tb_employee_skills_select on public.tb_employee_skills
  for select to authenticated
  using (employee_id = (select auth.uid()) or (select public.tb_is_hr()));

-- HR may also run discovery on behalf of an employee: maintaining the skill
-- inventory is the job this system exists to do. Every such write lands in
-- tb_audit_log with the HR user as the actor.
drop policy if exists tb_employee_skills_insert_self on public.tb_employee_skills;
create policy tb_employee_skills_insert_self on public.tb_employee_skills
  for insert to authenticated
  with check (employee_id = (select auth.uid()) or (select public.tb_is_hr()));

drop policy if exists tb_employee_skills_update_self on public.tb_employee_skills;
create policy tb_employee_skills_update_self on public.tb_employee_skills
  for update to authenticated
  using (employee_id = (select auth.uid()) or (select public.tb_is_hr()))
  with check (employee_id = (select auth.uid()) or (select public.tb_is_hr()));

drop policy if exists tb_employee_skills_delete_self on public.tb_employee_skills;
create policy tb_employee_skills_delete_self on public.tb_employee_skills
  for delete to authenticated
  using (employee_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- tb_matches / tb_learning_recs — generated for the caller, read by HR.
-- ---------------------------------------------------------------------------
drop policy if exists tb_matches_select on public.tb_matches;
create policy tb_matches_select on public.tb_matches
  for select to authenticated
  using (employee_id = (select auth.uid()) or (select public.tb_is_hr()));

drop policy if exists tb_matches_insert on public.tb_matches;
create policy tb_matches_insert on public.tb_matches
  for insert to authenticated
  with check (employee_id = (select auth.uid()) or (select public.tb_is_hr()));

drop policy if exists tb_matches_update on public.tb_matches;
create policy tb_matches_update on public.tb_matches
  for update to authenticated
  using (employee_id = (select auth.uid()) or (select public.tb_is_hr()))
  with check (employee_id = (select auth.uid()) or (select public.tb_is_hr()));

drop policy if exists tb_learning_recs_select on public.tb_learning_recs;
create policy tb_learning_recs_select on public.tb_learning_recs
  for select to authenticated
  using (employee_id = (select auth.uid()) or (select public.tb_is_hr()));

drop policy if exists tb_learning_recs_insert_self on public.tb_learning_recs;
create policy tb_learning_recs_insert_self on public.tb_learning_recs
  for insert to authenticated
  with check (employee_id = (select auth.uid()) or (select public.tb_is_hr()));

drop policy if exists tb_learning_recs_delete_self on public.tb_learning_recs;
create policy tb_learning_recs_delete_self on public.tb_learning_recs
  for delete to authenticated
  using (employee_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- tb_nominations — an employee sees nominations about them; HR manages them.
-- ---------------------------------------------------------------------------
drop policy if exists tb_nominations_select on public.tb_nominations;
create policy tb_nominations_select on public.tb_nominations
  for select to authenticated
  using (employee_id = (select auth.uid()) or (select public.tb_is_hr()));

drop policy if exists tb_nominations_insert_hr on public.tb_nominations;
create policy tb_nominations_insert_hr on public.tb_nominations
  for insert to authenticated
  with check ((select public.tb_is_hr()) and created_by = (select auth.uid()));

drop policy if exists tb_nominations_update_hr on public.tb_nominations;
create policy tb_nominations_update_hr on public.tb_nominations
  for update to authenticated
  using ((select public.tb_is_hr()))
  with check ((select public.tb_is_hr()));

-- ---------------------------------------------------------------------------
-- tb_assistant_messages — private to the employee. HR deliberately cannot read
-- career conversations; a tool people do not trust is a tool they do not use.
-- ---------------------------------------------------------------------------
drop policy if exists tb_assistant_messages_select_self on public.tb_assistant_messages;
create policy tb_assistant_messages_select_self on public.tb_assistant_messages
  for select to authenticated
  using (employee_id = (select auth.uid()));

drop policy if exists tb_assistant_messages_insert_self on public.tb_assistant_messages;
create policy tb_assistant_messages_insert_self on public.tb_assistant_messages
  for insert to authenticated
  with check (employee_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- tb_audit_log — append only, actor pinned to the caller, readable by HR.
-- There is no update or delete policy, and the privileges are revoked too, so
-- a client cannot rewrite history even if a policy were added by mistake.
-- ---------------------------------------------------------------------------
drop policy if exists tb_audit_log_insert_self on public.tb_audit_log;
create policy tb_audit_log_insert_self on public.tb_audit_log
  for insert to authenticated
  with check (actor = (select auth.uid()));

drop policy if exists tb_audit_log_select_hr on public.tb_audit_log;
create policy tb_audit_log_select_hr on public.tb_audit_log
  for select to authenticated
  using (actor = (select auth.uid()) or (select public.tb_is_hr()));

revoke update, delete on public.tb_audit_log from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Anonymous visitors get nothing. The marketing page is static; every data
-- read in this app happens behind a session.
-- ---------------------------------------------------------------------------
revoke all on public.tb_profiles           from anon;
revoke all on public.tb_hr_admins          from anon;
revoke all on public.tb_experiences        from anon;
revoke all on public.tb_skills             from anon;
revoke all on public.tb_employee_skills    from anon;
revoke all on public.tb_roles              from anon;
revoke all on public.tb_role_skills        from anon;
revoke all on public.tb_matches            from anon;
revoke all on public.tb_learning_recs      from anon;
revoke all on public.tb_nominations        from anon;
revoke all on public.tb_assistant_messages from anon;
revoke all on public.tb_audit_log          from anon;

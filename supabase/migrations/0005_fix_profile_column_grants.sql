-- TalentBridge 0005 — close a privilege-escalation hole in 0002.
--
-- THE BUG
-- 0002 tried to stop an employee promoting themselves with:
--
--   revoke update (app_role, user_id, email) on public.tb_profiles from authenticated;
--
-- That is a no-op. Postgres cannot subtract a column from a table-level grant,
-- and Supabase grants ALL on tables in public to `authenticated` by default.
-- The column REVOKE silently did nothing, and this held:
--
--   PATCH /rest/v1/tb_profiles?user_id=eq.<self>  {"app_role":"hr"}  → 200
--
-- Caught by the RLS verification pass before deployment, not by a person
-- reading the policy — which is the argument for running the check at all.
--
-- BLAST RADIUS
-- Data was never exposed. Authority in RLS comes from tb_hr_admins (through
-- tb_is_hr()), which has no insert policy and is not client-writable, so a
-- self-promoted employee still read only their own rows. What the column did
-- control was the application's own UI gate, which trusted app_role — so the
-- hole was real, just one layer short of the data.
--
-- THE FIX
-- Revoke UPDATE at the table level, then grant it back for exactly the columns
-- a person may edit about themselves. A column grant is additive, so this is
-- the direction that actually works.

revoke update on public.tb_profiles from authenticated, anon;

grant update (full_name, department, job_title, years_experience)
  on public.tb_profiles
  to authenticated;

-- Undo the escalation performed by the verification pass.
update public.tb_profiles
   set app_role = 'employee'
 where email <> 'arun@talentbridge.dev'
   and app_role <> 'employee';

-- Belt and braces: app_role must agree with the membership table that RLS
-- actually trusts. This trigger makes the column a mirror of tb_hr_admins
-- rather than an independent source of truth.
create or replace function public.tb_guard_app_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.app_role is distinct from old.app_role then
    if not exists (select 1 from public.tb_hr_admins h where h.user_id = new.user_id) then
      new.app_role := old.app_role;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.tb_guard_app_role() from public, anon, authenticated;

drop trigger if exists tb_profiles_guard_role on public.tb_profiles;
create trigger tb_profiles_guard_role
  before update on public.tb_profiles
  for each row execute function public.tb_guard_app_role();

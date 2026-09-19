-- TalentBridge 0003 — demo identities
--
-- Eight real Supabase Auth users, so every profile row points at a genuine
-- auth.users id and a judge can sign in as any of them. There is no role
-- switcher anywhere in this app: the two accounts printed on the login page
-- are ordinary credentialed logins.
--
-- Shared demo password: TalentBridge#2026
-- Re-running this file is a no-op.

do $$
declare
  demo_password constant text := 'TalentBridge#2026';
  ext_schema    text;
  person        record;
  hashed        text;
begin
  -- pgcrypto lives in the "extensions" schema on Supabase, but do not assume
  -- it: resolve wherever it actually is and put that on the search path, so
  -- crypt() and gen_salt() resolve on any project.
  select n.nspname into ext_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if ext_schema is null then
    create extension pgcrypto with schema extensions;
    ext_schema := 'extensions';
  end if;

  execute format('set local search_path = %I, public', ext_schema);

  for person in
    select * from (values
      ('11111111-1111-4111-8111-111111111111'::uuid, 'priya@talentbridge.dev',  'Priya Raman'),
      ('22222222-2222-4222-8222-222222222222'::uuid, 'arun@talentbridge.dev',   'Arun Mehta'),
      ('33333333-3333-4333-8333-333333333333'::uuid, 'kavya@talentbridge.dev',  'Kavya Nair'),
      ('44444444-4444-4444-8444-444444444444'::uuid, 'rohit@talentbridge.dev',  'Rohit Sharma'),
      ('55555555-5555-4555-8555-555555555555'::uuid, 'sneha@talentbridge.dev',  'Sneha Iyer'),
      ('66666666-6666-4666-8666-666666666666'::uuid, 'vikram@talentbridge.dev', 'Vikram Desai'),
      ('77777777-7777-4777-8777-777777777777'::uuid, 'fatima@talentbridge.dev', 'Fatima Khan'),
      ('88888888-8888-4888-8888-888888888888'::uuid, 'daniel@talentbridge.dev', 'Daniel Thomas')
    ) as t(id, email, full_name)
  loop
    hashed := crypt(demo_password, gen_salt('bf'));

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      is_sso_user, is_anonymous
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      person.id,
      'authenticated',
      'authenticated',
      person.email,
      hashed,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', person.full_name, 'email', person.email),
      now(), now(),
      '', '', '', '', '', '', '', '',
      false, false
    )
    on conflict (id) do nothing;

    -- GoTrue expects an identity row alongside the user for email sign-in.
    -- id is supplied explicitly rather than relying on a column default, which
    -- not every project version has.
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      person.id::text,
      person.id,
      jsonb_build_object(
        'sub', person.id::text,
        'email', person.email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(), now(), now()
    )
    on conflict do nothing;
  end loop;
end $$;

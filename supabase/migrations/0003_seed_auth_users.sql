-- TalentBridge 0003 — demo identities
--
-- Eight real Supabase Auth users, so every profile row points at a genuine
-- auth.users id and a judge can sign in as any of them. There is no role
-- switcher anywhere in this app: the two accounts printed on the login page
-- are ordinary credentialed logins.
--
-- Shared demo password: TalentBridge#2026
-- Re-running this file is a no-op.

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  demo_password constant text := 'TalentBridge#2026';
  person        record;
begin
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
      extensions.crypt(demo_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', person.full_name),
      now(), now(),
      '', '', '', '', '', '', '', '',
      false, false
    )
    on conflict (id) do nothing;

    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      person.id::text,
      person.id,
      jsonb_build_object('sub', person.id::text, 'email', person.email, 'email_verified', true),
      'email',
      now(), now(), now()
    )
    on conflict do nothing;
  end loop;
end $$;

-- LunchHub access by allowlisted email (step 1 of the security lockdown).
-- Additive only: the app keeps working as before after this runs.

-- 1) Storage: nobody but the service role may write to 'releases'
--    (bucket is empty and unused — the APK is served from GitHub Releases).
drop policy if exists anon_update_releases on storage.objects;
drop policy if exists anon_write_releases on storage.objects;

-- 2) Allowlist: work (or Google) email -> existing LunchHub person.
create table if not exists public.allowed_emails (
  email text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  user_id uuid not null references public.users(id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists allowed_emails_user_id_idx on public.allowed_emails(user_id);
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon;

-- The signed-in auth user's allowlist row — only for a *confirmed* email.
create or replace function public.current_allowed_email()
returns public.allowed_emails
language sql stable security definer set search_path = ''
as $$
  select a.* from public.allowed_emails a
  join auth.users u on lower(u.email) = a.email
  where u.id = auth.uid() and u.email_confirmed_at is not null
  limit 1
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select (public.current_allowed_email()).email is not null $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((public.current_allowed_email()).is_admin, false) $$;

-- Who am I in LunchHub? (users row linked to my email)
create or replace function public.my_lunch_user()
returns table (id uuid, name text, avatar_url text, is_admin boolean)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.name, u.avatar_url, a.is_admin
  from public.users u
  join public.allowed_emails a on a.user_id = u.id
  where a.email = (public.current_allowed_email()).email
$$;

-- Yes/no "may this address get a login code?" for a friendly message.
create or replace function public.email_allowed(p_email text)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.allowed_emails where email = lower(btrim(p_email))) $$;

revoke all on function public.current_allowed_email() from public, anon, authenticated;
revoke execute on function public.is_member(), public.is_admin(), public.my_lunch_user() from public, anon;
grant execute on function public.is_member(), public.is_admin(), public.my_lunch_user() to authenticated;
grant execute on function public.email_allowed(text) to anon, authenticated;

create policy allowed_emails_select on public.allowed_emails for select to authenticated
  using ((select public.is_admin()) or email = (select (public.current_allowed_email()).email));
create policy allowed_emails_admin_insert on public.allowed_emails for insert to authenticated
  with check ((select public.is_admin()));
create policy allowed_emails_admin_update on public.allowed_emails for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy allowed_emails_admin_delete on public.allowed_emails for delete to authenticated
  using ((select public.is_admin()));
grant select, insert, update, delete on public.allowed_emails to authenticated;

-- 3) No new auth user (email code, Google, Facebook, password) unless the
--    address is on the list — so codes are never mailed outside it.
create or replace function public.enforce_email_allowlist()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null or not exists (
    select 1 from public.allowed_emails where email = lower(new.email)
  ) then
    raise exception 'LUNCHHUB_EMAIL_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_email_allowlist() from public, anon, authenticated;
drop trigger if exists enforce_email_allowlist on auth.users;
create trigger enforce_email_allowlist before insert on auth.users
  for each row execute function public.enforce_email_allowlist();

-- 4) Seed: the two Google accounts already linked to people.
insert into public.allowed_emails (email, user_id, is_admin)
select lower(au.email), u.id, lower(au.email) = 'nikolay.koychev@gmail.com'
from public.users u join auth.users au on au.id = u.auth_user_id
on conflict (email) do nothing;

-- 5) Avatars bucket: public read; writes only via the service role.
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- LunchHub security lockdown (step 2, after migration_allowed_emails.sql).
--
-- RUN ONLY AFTER the email-code login version of the app is live (web + OTA)
-- and the email code works: from then on the tables answer only to a signed-in
-- person whose confirmed email is on public.allowed_emails. The old app
-- (name login, publishable key only) stops seeing any data.
--
-- LunchHub objects ONLY. This Supabase project also hosts Stara Zagora
-- (sz_*, sz-api, sz-gtfs) and radio-* — none of them are touched here.
-- The Edge Functions that import menus and VEAS BG use the service/secret
-- key, which bypasses RLS, so they keep working.

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'users', 'orders', 'order_items', 'day_payers', 'ratings',
    'push_tokens', 'menu_items', 'restaurants', 'daily_steps'
  ] loop
    -- drop the old "anyone with the publishable key may do anything" policies
    for p in select polname from pg_policy where polrelid = format('public.%I', t)::regclass loop
      execute format('drop policy %I on public.%I', p.polname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.is_member())) with check ((select public.is_member()))',
      t || '_members', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Views run with the caller's rights (security_invoker = on), so the table
-- policies above already apply; just close them to anon as well.
revoke all on public.rating_summary, public.today_orders from anon;
grant select on public.rating_summary, public.today_orders to authenticated;

notify pgrst, 'reload schema';

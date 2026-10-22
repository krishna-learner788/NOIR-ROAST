-- Provision the FIRST (or an additional) administrator.
--
-- Admin is a database fact, never a sign-up option. Run this yourself, as the project owner, in
-- the Supabase SQL editor (or `psql` with the owner connection string) AFTER the person has
-- registered on the site. It cannot be run through the public API: admin_users has no policies
-- and no client privileges.
--
-- 1. Replace the email below (keep the quotes).
-- 2. Run. It is idempotent and prints the row it created/kept.
-- 3. Revoke later with:  delete from public.admin_users where user_id = (select id from auth.users where email = '...');

insert into public.admin_users (user_id, note)
select id, 'granted via supabase/scripts/grant-admin.sql'
from auth.users
where email = 'owner@example.com'          -- <-- CHANGE ME
on conflict (user_id) do nothing
returning user_id;

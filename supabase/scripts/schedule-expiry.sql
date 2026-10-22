-- OPTIONAL: release stock held by unpaid orders on a schedule.
--
-- Unpaid orders already expire the next time ANY order is created (create_order calls
-- release_expired_orders()). On a quiet store that can leave stock reserved for longer than the
-- reservation window, so schedule it. Run this yourself in the Supabase SQL editor after enabling
-- the pg_cron extension (Dashboard > Database > Extensions). Not applied automatically.
--
-- Runs every 5 minutes as the database owner (release_expired_orders is service-role only for API callers).

select cron.schedule(
  'noir-release-expired-orders',
  '*/5 * * * *',
  $$ select public.release_expired_orders(); $$
);

-- To stop it:  select cron.unschedule('noir-release-expired-orders');

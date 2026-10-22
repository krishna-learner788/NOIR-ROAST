-- NOIR ROAST — Row Level Security and privileges.
-- Model: deny by default. Customers can READ their own data and edit their own name/phone;
-- they can never write orders, items, payments, stock, settings or roles. All of those are
-- written by SECURITY DEFINER functions called with service_role (edge functions) or admin RPCs.
--
-- Supabase auto-grants broad table/function privileges to anon/authenticated; RLS is the gate
-- for tables, but we ALSO strip the privileges (defence in depth) and re-grant the minimum.

-- ---------------------------------------------------------------------------------------
-- RLS on every table in the exposed schema
-- ---------------------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.admin_users          enable row level security;   -- no policies: unreadable via API
alter table public.store_settings       enable row level security;
alter table public.products             enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.payments             enable row level security;
alter table public.payment_events       enable row level security;   -- no policies: service_role only
alter table public.inventory_movements  enable row level security;
alter table public.order_status_history enable row level security;

-- ---------------------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Shoppers see active products only; admins also see drafts.
create policy products_select on public.products
  for select to anon, authenticated using (is_active or (select public.is_admin()));

create policy settings_select on public.store_settings
  for select to anon, authenticated using (true);

create policy orders_select on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Child rows are visible exactly when their parent order is visible (orders' own RLS applies
-- to the sub-select because it runs as the caller).
create policy order_items_select on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));
create policy payments_select on public.payments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = payments.order_id));
create policy order_history_select on public.order_status_history
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_status_history.order_id));

create policy inventory_select_admin on public.inventory_movements
  for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------------------
-- Table privileges: start from nothing, grant the minimum
-- ---------------------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.products, public.store_settings to anon;
grant select on public.products, public.store_settings, public.profiles, public.orders,
                public.order_items, public.payments, public.order_status_history,
                public.inventory_movements to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Function privileges: nothing is callable by clients unless listed below
-- ---------------------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- RLS policies evaluate this as the calling role, so it must be executable by clients.
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- Customer-callable (ownership re-checked inside)
grant execute on function public.cancel_pending_order(uuid) to authenticated;

-- Admin-callable (is_admin() re-checked inside; an ordinary user gets 'forbidden')
grant execute on function public.admin_set_order_status(uuid, public.order_status, text, text) to authenticated;
grant execute on function public.admin_upsert_product(jsonb) to authenticated;

-- Trusted server only (edge functions use the service-role key; it never reaches the browser)
grant execute on function public.create_order(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.attach_payment(uuid, text, integer) to service_role;
grant execute on function public.abort_unpaid_order(uuid, text) to service_role;
grant execute on function public.order_policy_facts(uuid) to service_role;
grant execute on function public.apply_payment_event(text, text, public.payment_status, integer, text) to service_role;
grant execute on function public.record_payment_event(text, text, text, text, jsonb) to service_role;
grant execute on function public.set_payment_event_outcome(text, text) to service_role;
grant execute on function public.release_expired_orders() to service_role;
grant execute on function public.release_order_stock(uuid, text) to service_role;
grant execute on function public.try_reserve_order_stock(uuid) to service_role;
grant execute on function public.setting_int(text, integer) to service_role;
grant execute on function public.setting_text(text, text) to service_role;

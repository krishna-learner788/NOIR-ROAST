-- Security boundaries: RLS isolation, privilege limits, admin authorization.
-- Runs inside a transaction that is rolled back. Roles are switched with SET LOCAL ROLE so every
-- assertion below executes with the real privileges of anon / authenticated, not as superuser.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---- fixtures (as superuser) ------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'alice@example.com', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000002', 'bob@example.com',   'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000003', 'admin@example.com', 'authenticated', 'authenticated');
insert into public.admin_users (user_id) values ('a0000000-0000-0000-0000-000000000003');

insert into public.products (id, name, price_paise, weight_grams, is_active, stock_quantity, price_status, weight_status) values
  ('t-tracked',  'T Tracked',  10000, 250, true,  5,    'confirmed',   'confirmed'),
  ('t-draft',    'T Draft',     5000, 250, false, 3,    'confirmed',   'confirmed');

select public.create_order('a0000000-0000-0000-0000-000000000001', 'alice@example.com',
  '[{"product_id":"t-tracked","quantity":1}]'::jsonb,
  '{"name":"Alice Test","phone":"9876543210","line1":"12 Test Street","city":"Bengaluru","state":"Karnataka","pincode":"560001"}'::jsonb);
select public.create_order('a0000000-0000-0000-0000-000000000002', 'bob@example.com',
  '[{"product_id":"t-tracked","quantity":2}]'::jsonb,
  '{"name":"Bob Test","phone":"9123456780","line1":"7 Other Road","city":"Pune","state":"Maharashtra","pincode":"411001"}'::jsonb);
select public.attach_payment((select id from public.orders where user_id = 'a0000000-0000-0000-0000-000000000002'),
  'order_bobtest0001', 20000);

-- ---- helpers ---------------------------------------------------------------------------
create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.as_user(uuid) to public;

-- ================= anonymous visitors ====================================================
set local role anon;
select is((select count(*)::int from public.products where id in ('t-tracked', 't-draft')), 1,
  'anon sees the active product only (draft hidden)');
select is((select count(*)::int from public.store_settings), 6, 'anon can read public store settings');
select throws_ok($$select * from public.orders$$, '42501', 'permission denied for table orders', 'anon cannot read orders');
select throws_ok($$select * from public.payments$$, '42501', 'permission denied for table payments', 'anon cannot read payments');
select throws_ok($$select * from public.admin_users$$, '42501', 'permission denied for table admin_users', 'anon cannot read admin_users');
select throws_ok($$select * from public.profiles$$, '42501', 'permission denied for table profiles', 'anon cannot read profiles');
select throws_ok($$insert into public.products (id, name, price_paise, weight_grams) values ('x-evil','Evil',1,1)$$,
  '42501', null, 'anon cannot insert products');
select throws_ok($$select public.create_order('a0000000-0000-0000-0000-000000000001','a@b.co','[]'::jsonb,'{}'::jsonb)$$,
  '42501', null, 'anon cannot call create_order');
reset role;

-- ================= signed-in customer (Alice) ============================================
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');

select is((select count(*)::int from public.orders), 1, 'alice sees exactly her own order');
select is((select user_id from public.orders limit 1), 'a0000000-0000-0000-0000-000000000001'::uuid, '...and it is hers');
select is((select count(*)::int from public.order_items), 1, 'alice sees only her order items');
select is((select count(*)::int from public.payments), 0, 'alice cannot see bob''s payment');
select is((select count(*)::int from public.order_status_history), 1, 'alice sees only her order history');
select is((select count(*)::int from public.profiles), 1, 'alice sees only her profile');
select is((select count(*)::int from public.inventory_movements), 0, 'alice sees no inventory movements (admin only)');
select is(public.is_admin(), false, 'is_admin() is false for a normal customer');

-- she cannot write anything that matters
select throws_ok($$insert into public.orders (user_id, subtotal_paise, shipping_paise, tax_paise, total_paise, contact_email, ship_name, ship_phone, ship_line1, ship_city, ship_state, ship_pincode)
  values ('a0000000-0000-0000-0000-000000000001', 1, 0, 0, 1, 'a@b.co', 'Al', '9876543210', '1 Street', 'City', 'Goa', '403001')$$,
  '42501', null, 'alice cannot insert an order directly');
select throws_ok($$update public.orders set total_paise = 1, subtotal_paise = 1$$,
  '42501', null, 'alice cannot edit order totals');
select throws_ok($$update public.orders set status = 'paid'$$,
  '42501', null, 'alice cannot mark her order paid');
select throws_ok($$delete from public.orders$$,
  '42501', null, 'alice cannot delete orders');
select throws_ok($$update public.order_items set unit_price_paise = 1$$,
  '42501', null, 'alice cannot edit order items');
select throws_ok($$update public.payments set status = 'captured'$$,
  '42501', null, 'alice cannot edit payments');
select throws_ok($$update public.products set price_paise = 1$$,
  '42501', null, 'alice cannot change product prices');
select throws_ok($$update public.products set stock_quantity = 999$$,
  '42501', null, 'alice cannot change stock');
select throws_ok($$update public.store_settings set value = '0'$$,
  '42501', null, 'alice cannot change store settings');
select throws_ok($$insert into public.admin_users (user_id) values ('a0000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'alice cannot make herself an admin');
select throws_ok($$select * from public.admin_users$$,
  '42501', null, 'alice cannot read admin_users');
select throws_ok($$select * from public.payment_events$$,
  '42501', null, 'alice cannot read webhook events');

-- privileged functions are closed to her
select throws_ok($$select public.create_order('a0000000-0000-0000-0000-000000000002','x@y.co','[{"product_id":"t-tracked","quantity":1}]'::jsonb,'{}'::jsonb)$$,
  '42501', null, 'alice cannot call create_order (service role only)');
select throws_ok($$select public.apply_payment_event('order_bobtest0001','pay_x','captured',20000,null)$$,
  '42501', null, 'alice cannot mark anyone''s payment captured');
select throws_ok($$select public.release_expired_orders()$$,
  '42501', null, 'alice cannot trigger stock release');
select throws_ok($$select public.record_payment_event('e1','payment.captured','o','p','{}'::jsonb)$$,
  '42501', null, 'alice cannot write webhook events');

-- admin RPCs reject her with 'forbidden' even though she may call them
select throws_ok($$select public.admin_set_order_status((select id from public.orders limit 1), 'processing', null, null)$$,
  '42501', 'forbidden', 'non-admin cannot change order status via RPC');
select throws_ok($$select public.admin_upsert_product('{"id":"x-evil","name":"E","price_paise":1,"weight_grams":1}'::jsonb)$$,
  '42501', 'forbidden', 'non-admin cannot create products via RPC');

-- profile: may edit own name/phone only
select lives_ok($$update public.profiles set full_name = 'Alice A', phone = '9876543210'$$, 'alice can edit her own name and phone');
select throws_ok($$update public.profiles set phone = '12345'$$,
  '23514', null, 'phone format is enforced');
select throws_ok($$update public.profiles set id = 'a0000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'alice cannot change a profile id');
select lives_ok($$update public.profiles set full_name = 'Hacked' where id = 'a0000000-0000-0000-0000-000000000002'$$,
  'updating bob''s profile is a silent no-op for alice (row is invisible)');

-- she cannot cancel someone else's order, but can cancel her own pending one
select throws_ok($$select public.cancel_pending_order((select id from public.orders where user_id = 'a0000000-0000-0000-0000-000000000002'))$$,
  'P0001', 'order_not_found', 'alice cannot cancel bob''s order (no existence leak)');
reset role;

select isnt((select full_name from public.profiles where id = 'a0000000-0000-0000-0000-000000000002'), 'Hacked',
  'bob''s profile really was not modified');

-- ================= signed-in customer (Bob) ==============================================
select pg_temp.as_user('a0000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.orders), 1, 'bob sees exactly one order');
select is((select count(*)::int from public.payments), 1, 'bob sees his own payment');
select is((select count(*)::int from public.order_items where product_id = 't-tracked' and quantity = 2), 1, 'bob sees his own items');
reset role;

-- ================= administrator =========================================================
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003');
select is(public.is_admin(), true, 'is_admin() is true for the admin');
select is((select count(*)::int from public.orders where user_id in ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002')), 2,
  'admin sees every customer''s orders (not just their own)');
select is((select count(*)::int from public.products where id = 't-draft'), 1, 'admin sees draft products');
select ok((select count(*)::int from public.inventory_movements) >= 2, 'admin can read inventory movements');
select lives_ok($$select public.admin_upsert_product('{"id":"t-new","name":"New Roast","price_paise":12345,"weight_grams":250,"stock_quantity":4,"is_active":false}'::jsonb)$$,
  'admin can create a product via RPC');
select is((select stock_quantity from public.products where id = 't-new'), 4, '...with the requested stock');
select is((select count(*)::int from public.inventory_movements where product_id = 't-new' and reason = 'opening_stock' and delta = 4), 1,
  '...and an opening-stock movement is logged');
select throws_ok($$select public.admin_set_order_status((select id from public.orders limit 1), 'paid', null, null)$$,
  'P0001', 'status_not_allowed_for_admin', 'admin cannot hand-mark an order paid');
select throws_ok($$update public.products set price_paise = 1$$,
  '42501', null, 'even admin has no direct table write (RPC only)');
reset role;

select * from finish();
rollback;

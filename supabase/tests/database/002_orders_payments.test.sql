-- Order creation, server-side pricing, stock, expiry and the payment state machine.
-- Functions are called as the superuser here (their privilege boundaries are asserted in
-- 001_security); the admin / owner RPC sections switch to the real roles.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---- fixtures ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('b0000000-0000-0000-0000-000000000001', 'alice@example.com', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000002', 'bob@example.com',   'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000003', 'carol@example.com', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000009', 'admin@example.com', 'authenticated', 'authenticated');
insert into public.admin_users (user_id) values ('b0000000-0000-0000-0000-000000000009');

insert into public.products (id, name, price_paise, weight_grams, is_active, stock_quantity, price_status, weight_status) values
  ('t-tracked',   'T Tracked',   10000, 250, true,  5,    'confirmed',   'confirmed'),
  ('t-untracked', 'T Untracked', 20000, 500, true,  null, 'provisional', 'provisional'),
  ('t-inactive',  'T Inactive',   5000, 250, false, 3,    'confirmed',   'confirmed'),
  ('t-huge',      'T Huge',   20000000, 250, true,  null, 'confirmed',   'confirmed');

create function pg_temp.ship() returns jsonb language sql as $$
  select '{"name":"Alice Test","phone":"9876543210","line1":"12 Test Street","city":"Bengaluru","state":"Karnataka","pincode":"560001"}'::jsonb $$;
create function pg_temp.mk(p_uid uuid, p_items jsonb) returns uuid language sql as $$
  select (public.create_order(p_uid, 'x@example.com', p_items, pg_temp.ship()) ->> 'order_id')::uuid $$;
create function pg_temp.pay(p_order uuid, p_rzp text) returns uuid language sql as $$
  select public.attach_payment(p_order, p_rzp, (select total_paise from public.orders where id = p_order)) $$;
create function pg_temp.ostatus(p_order uuid) returns text language sql as $$
  select status::text from public.orders where id = p_order $$;
create function pg_temp.pstatus(p_rzp text) returns text language sql as $$
  select status::text from public.payments where provider_order_id = p_rzp $$;
create function pg_temp.stock() returns integer language sql as $$
  select stock_quantity from public.products where id = 't-tracked' $$;
create temp table ctx (k text primary key, v text);
grant select on ctx to public;
create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.as_user(uuid) to public;

-- ================= create_order: pricing comes from the database ==========================
select is((public.create_order('b0000000-0000-0000-0000-000000000001', 'a@x.co',
    '[{"product_id":"t-tracked","quantity":2},{"product_id":"t-untracked","quantity":1}]'::jsonb, pg_temp.ship()) ->> 'subtotal_paise')::int,
  40000, 'subtotal = DB price x quantity (2 x 10000 + 20000)');
select is((select total_paise from public.orders order by created_at desc, id limit 1), 40000, 'total = subtotal + shipping placeholder (0)');
select is((select count(*)::int from public.order_items where unit_price_paise in (10000, 20000)), 2, 'item rows snapshot the DB prices');
select is(pg_temp.stock(), 3, 'tracked stock is reserved at order creation (5 - 2)');
select is((select count(*)::int from public.inventory_movements where product_id = 't-tracked' and reason = 'order_reserved' and delta = -2), 1,
  'a stock movement row is written');

-- the client cannot influence price: extra numeric fields are ignored
select is((public.create_order('b0000000-0000-0000-0000-000000000002', 'b@x.co',
    '[{"product_id":"t-tracked","quantity":1,"price_paise":1,"unit_price_paise":1,"total":1}]'::jsonb, pg_temp.ship()) ->> 'subtotal_paise')::int,
  10000, 'client-supplied prices are ignored');
select is((public.create_order('b0000000-0000-0000-0000-000000000002', 'b@x.co',
    '[{"product_id":"t-untracked","quantity":1}]'::jsonb, pg_temp.ship()) ->> 'contains_provisional')::boolean,
  true, 'order with provisional data is flagged');

-- validation
update public.products set stock_quantity = 3 where id = 't-tracked';
select throws_ok($$select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"t-tracked","quantity":4}]'::jsonb)$$,
  'P0001', 'out_of_stock', 'cannot order more than the stock');
select is(pg_temp.stock(), 3, 'a failed order leaves stock untouched');
select throws_ok($$select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"t-inactive","quantity":1}]'::jsonb)$$,
  'P0001', 'product_unavailable', 'inactive products cannot be ordered');
select throws_ok($$select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"nope","quantity":1}]'::jsonb)$$,
  'P0001', 'product_unavailable', 'unknown products cannot be ordered');
select throws_ok($$select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"t-tracked","quantity":0}]'::jsonb)$$,
  'P0001', 'invalid_quantity', 'quantity 0 rejected');
select throws_ok($$select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"t-untracked","quantity":11}]'::jsonb)$$,
  'P0001', 'invalid_quantity', 'quantity above the per-line cap rejected');
select throws_ok($$select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"t-untracked","quantity":99999999999}]'::jsonb)$$,
  'P0001', 'invalid_quantity', 'absurd quantity rejected without an integer overflow');
select throws_ok($$select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"t-untracked","quantity":1.5}]'::jsonb)$$,
  'P0001', 'invalid_items', 'fractional quantity rejected');
select throws_ok($$select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"t-untracked","quantity":"2"}]'::jsonb)$$,
  'P0001', 'invalid_items', 'string quantity rejected');
select throws_ok($$select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"t-untracked","quantity":1},{"product_id":"t-untracked","quantity":1}]'::jsonb)$$,
  'P0001', 'duplicate_item', 'duplicate lines rejected');
select throws_ok($$select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[]'::jsonb)$$, 'P0001', 'invalid_items', 'empty order rejected');
select throws_ok($$select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '{"product_id":"t-tracked"}'::jsonb)$$, 'P0001', 'invalid_items', 'non-array items rejected');
select throws_ok($$select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"t-huge","quantity":10}]'::jsonb)$$,
  'P0001', 'order_too_large', 'absurdly large basket rejected');
select throws_ok($$select public.create_order('b0000000-0000-0000-0000-000000000003','x@x.co','[{"product_id":"t-untracked","quantity":1}]'::jsonb,
    '{"name":"X Y","phone":"9876543210","line1":"1 Street","city":"Pune","state":"Maharashtra","pincode":"012345"}'::jsonb)$$,
  '23514', null, 'bad PIN code rejected by the database');
select throws_ok($$select public.create_order('b0000000-0000-0000-0000-000000000003','x@x.co','[{"product_id":"t-untracked","quantity":1}]'::jsonb,
    '{"name":"X Y","phone":"1234567890","line1":"1 Street","city":"Pune","state":"Maharashtra","pincode":"411001"}'::jsonb)$$,
  '23514', null, 'bad mobile number rejected by the database');
select throws_ok($$select public.create_order('b0000000-0000-0000-0000-000000000003','x@x.co','[{"product_id":"t-untracked","quantity":1}]'::jsonb,
    '{"name":"X Y","phone":"9876543210","line1":"1 Street","city":"Pune","state":"Narnia","pincode":"411001"}'::jsonb)$$,
  '23514', null, 'unknown state rejected by the database');
select throws_ok($$select public.create_order('b0000000-0000-0000-0000-000000000003','x@x.co','[{"product_id":"t-untracked","quantity":1}]'::jsonb, '[]'::jsonb)$$,
  'P0001', 'invalid_shipping', 'shipping must be an object');

-- stock-hoarding protection: at most 3 unpaid orders per customer
select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"t-untracked","quantity":1}]'::jsonb);
select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"t-untracked","quantity":1}]'::jsonb);
select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"t-untracked","quantity":1}]'::jsonb);
select throws_ok($$select pg_temp.mk('b0000000-0000-0000-0000-000000000003', '[{"product_id":"t-untracked","quantity":1}]'::jsonb)$$,
  'P0001', 'too_many_pending_orders', 'a 4th unpaid order is refused');

-- ================= expiry returns stock ===================================================
update public.products set stock_quantity = 5 where id = 't-tracked';
insert into ctx values ('exp', pg_temp.mk('b0000000-0000-0000-0000-000000000001', '[{"product_id":"t-tracked","quantity":2}]'::jsonb)::text);
select is(pg_temp.stock(), 3, 'reserved 2 of 5');
update public.orders set reservation_expires_at = now() - interval '1 minute' where id = (select v::uuid from ctx where k = 'exp');
select ok(public.release_expired_orders() >= 1, 'release_expired_orders() processes the lapsed order');
select is(pg_temp.ostatus((select v::uuid from ctx where k = 'exp')), 'expired', 'order becomes expired');
select is(pg_temp.stock(), 5, 'stock is returned');
select is((select count(*)::int from public.inventory_movements where order_id = (select v::uuid from ctx where k = 'exp') and reason = 'order_released'), 1,
  'a release movement is logged');
select is(public.release_expired_orders(), 0, 'running it again changes nothing (idempotent)');

-- ================= attach_payment =========================================================
update public.products set stock_quantity = 5 where id = 't-tracked';
insert into ctx values ('a', pg_temp.mk('b0000000-0000-0000-0000-000000000002', '[{"product_id":"t-tracked","quantity":1}]'::jsonb)::text);
select throws_ok($$select public.attach_payment((select v::uuid from ctx where k='a'), 'order_A', 999)$$, 'P0001', 'amount_mismatch',
  'payment amount must equal the order total');
select lives_ok($$select pg_temp.pay((select v::uuid from ctx where k='a'), 'order_A')$$, 'payment session attaches');
select throws_ok($$select pg_temp.pay((select v::uuid from ctx where k='a'), 'order_A')$$, '23505', null, 'a provider order id cannot be reused');

-- ================= apply_payment_event: the state machine =================================
select is(public.apply_payment_event('order_nope', 'pay_1', 'captured', 10000) ->> 'result', 'unknown_payment', 'unknown provider order');
select is(public.apply_payment_event('order_A', 'pay_A1', 'captured', 9999) ->> 'result', 'amount_mismatch', 'wrong amount refused');
select is(pg_temp.ostatus((select v::uuid from ctx where k='a')), 'pending_payment', '...and the order is NOT paid');
select is(pg_temp.pstatus('order_A'), 'created', '...and the payment is unchanged');

select is(public.apply_payment_event('order_A', 'pay_A1', 'failed', 10000, 'card declined') ->> 'result', 'applied', 'failed attempt recorded');
select is(pg_temp.ostatus((select v::uuid from ctx where k='a')), 'pending_payment', 'a failed attempt leaves the order payable');
select is(public.apply_payment_event('order_A', 'pay_A2', 'captured', 10000) ->> 'order_status', 'paid', 'a retry that succeeds marks the order paid');
select is(pg_temp.pstatus('order_A'), 'captured', 'payment captured');
select is((select provider_payment_id from public.payments where provider_order_id = 'order_A'), 'pay_A2', 'the successful payment id is stored');
select isnt((select paid_at from public.orders where id = (select v::uuid from ctx where k='a')), null, 'paid_at is set');
select is(public.apply_payment_event('order_A', 'pay_A2', 'captured', 10000) ->> 'result', 'already_applied', 'duplicate capture is idempotent');
select is((select count(*)::int from public.order_status_history where order_id = (select v::uuid from ctx where k='a') and to_status = 'paid'), 1,
  'the paid transition is recorded exactly once');
select is(public.apply_payment_event('order_A', 'pay_A9', 'failed', 10000, 'late') ->> 'result', 'ignored_out_of_order',
  'a late failure cannot downgrade a captured payment');
select is(pg_temp.pstatus('order_A'), 'captured', '...still captured');
select is(public.apply_payment_event('order_A', 'pay_A2', 'authorized', 10000) ->> 'result', 'ignored_out_of_order', 'a late authorization is ignored');
select is(public.apply_payment_event('order_A', 'pay_OTHER', 'captured', 10000) ->> 'result', 'duplicate_capture_refund_required',
  'a second, different captured payment flags a refund');
select is((select refund_required from public.payments where provider_order_id = 'order_A'), true, 'refund_required is set');
select is((select provider_payment_id from public.payments where provider_order_id = 'order_A'), 'pay_A2', '...and the original payment id is kept');

-- authorized then captured
insert into ctx values ('b', pg_temp.mk('b0000000-0000-0000-0000-000000000002', '[{"product_id":"t-tracked","quantity":1}]'::jsonb)::text);
select pg_temp.pay((select v::uuid from ctx where k='b'), 'order_B');
select is(public.apply_payment_event('order_B', 'pay_B1', 'authorized', 10000) ->> 'payment_status', 'authorized', 'authorized recorded');
select is(pg_temp.ostatus((select v::uuid from ctx where k='b')), 'pending_payment', 'authorized alone does not make the order paid');
select is(public.apply_payment_event('order_B', 'pay_B1', 'captured', 10000) ->> 'order_status', 'paid', 'capture after authorization pays the order');

-- late capture after expiry, stock still available -> re-reserved and paid
update public.products set stock_quantity = 5 where id = 't-tracked';
insert into ctx values ('c', pg_temp.mk('b0000000-0000-0000-0000-000000000001', '[{"product_id":"t-tracked","quantity":2}]'::jsonb)::text);
select pg_temp.pay((select v::uuid from ctx where k='c'), 'order_C');
update public.orders set reservation_expires_at = now() - interval '1 minute' where id = (select v::uuid from ctx where k='c');
select public.release_expired_orders();
select is(pg_temp.stock(), 5, 'expired order released its stock');
select is(public.apply_payment_event('order_C', 'pay_C1', 'captured', 20000) ->> 'result', 'captured_after_expiry', 'late capture is accepted when stock allows');
select is(pg_temp.ostatus((select v::uuid from ctx where k='c')), 'paid', '...order is paid');
select is(pg_temp.stock(), 3, '...and stock is reserved again');

-- late capture after expiry, stock gone -> refund required, order stays expired
update public.products set stock_quantity = 5 where id = 't-tracked';
insert into ctx values ('d', pg_temp.mk('b0000000-0000-0000-0000-000000000001', '[{"product_id":"t-tracked","quantity":2}]'::jsonb)::text);
select pg_temp.pay((select v::uuid from ctx where k='d'), 'order_D');
update public.orders set reservation_expires_at = now() - interval '1 minute' where id = (select v::uuid from ctx where k='d');
select public.release_expired_orders();
update public.products set stock_quantity = 1 where id = 't-tracked';        -- sold out meanwhile
select is(public.apply_payment_event('order_D', 'pay_D1', 'captured', 20000) ->> 'result', 'captured_after_expiry_refund_required',
  'late capture with no stock is flagged for refund');
select is(pg_temp.ostatus((select v::uuid from ctx where k='d')), 'expired', '...the order is NOT silently marked paid');
select is((select refund_required from public.payments where provider_order_id = 'order_D'), true, '...refund_required is set');
select is(pg_temp.stock(), 1, '...and stock was not touched');

-- capture on an order the customer already cancelled -> refund required
update public.products set stock_quantity = 5 where id = 't-tracked';
insert into ctx values ('e', pg_temp.mk('b0000000-0000-0000-0000-000000000001', '[{"product_id":"t-tracked","quantity":1}]'::jsonb)::text);
select pg_temp.pay((select v::uuid from ctx where k='e'), 'order_E');
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001');
select lives_ok($$select public.cancel_pending_order((select v::uuid from ctx where k='e'))$$, 'owner can cancel an unpaid order');
reset role;
select is(pg_temp.stock(), 5, 'cancelling returns the stock at once');
select is(public.apply_payment_event('order_E', 'pay_E1', 'captured', 10000) ->> 'result', 'captured_on_cancelled_order_refund_required',
  'payment on a cancelled order is flagged for refund');
select is(pg_temp.ostatus((select v::uuid from ctx where k='e')), 'cancelled', '...order stays cancelled');
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001');
select throws_ok($$select public.cancel_pending_order((select v::uuid from ctx where k='e'))$$, 'P0001', 'order_not_cancellable', 'a cancelled order cannot be cancelled again');
reset role;

-- refund of a paid order cancels it and returns stock
select is(public.apply_payment_event('order_B', 'pay_B1', 'refunded', null) ->> 'payment_status', 'refunded', 'refund recorded');
select is(pg_temp.ostatus((select v::uuid from ctx where k='b')), 'cancelled', 'refunded order is cancelled');
select is(public.apply_payment_event('order_B', 'pay_B1', 'refunded', null) ->> 'result', 'ignored_out_of_order', 'second refund event ignored');

-- ================= integrity triggers =====================================================
insert into ctx values ('t', pg_temp.mk('b0000000-0000-0000-0000-000000000002', '[{"product_id":"t-untracked","quantity":1}]'::jsonb)::text);
select throws_ok($$update public.orders set status = 'delivered' where id = (select v::uuid from ctx where k='t')$$, 'P0001', 'invalid_order_transition',
  'pending -> delivered is illegal');
select throws_ok($$update public.orders set status = 'processing' where id = (select v::uuid from ctx where k='t')$$, 'P0001', 'invalid_order_transition',
  'pending -> processing is illegal');
select throws_ok($$update public.orders set total_paise = 1, subtotal_paise = 1 where id = (select v::uuid from ctx where k='t')$$, 'P0001', 'order_immutable',
  'order totals cannot be edited');
select throws_ok($$update public.orders set ship_city = 'Elsewhere' where id = (select v::uuid from ctx where k='t')$$, 'P0001', 'order_immutable',
  'the shipping address cannot be edited');
select throws_ok($$update public.orders set user_id = 'b0000000-0000-0000-0000-000000000001' where id = (select v::uuid from ctx where k='t')$$, 'P0001', 'order_immutable',
  'the order owner cannot be changed');
select throws_ok($$update public.order_items set unit_price_paise = 1$$, 'P0001', 'order_items_immutable', 'order items are immutable');
select throws_ok($$update public.payments set amount_paise = 1 where provider_order_id = 'order_A'$$, 'P0001', 'payment_immutable', 'payment amount is immutable');
select throws_ok($$insert into public.orders (user_id, subtotal_paise, shipping_paise, tax_paise, total_paise, contact_email, ship_name, ship_phone, ship_line1, ship_city, ship_state, ship_pincode)
  values ('b0000000-0000-0000-0000-000000000001', 100, 0, 0, 99, 'a@b.co', 'Al', '9876543210', '1 Street', 'City', 'Goa', '403001')$$, '23514', null,
  'total must equal subtotal + shipping + tax');

-- ================= webhook idempotency gate ===============================================
select is(public.record_payment_event('evt_1', 'payment.captured', 'order_A', 'pay_A2', '{}'::jsonb), 'new', 'first delivery is new');
select is(public.record_payment_event('evt_1', 'payment.captured', 'order_A', 'pay_A2', '{}'::jsonb), 'retry', 'unfinished event may be reprocessed');
select public.set_payment_event_outcome('evt_1', 'already_applied');
select is(public.record_payment_event('evt_1', 'payment.captured', 'order_A', 'pay_A2', '{}'::jsonb), 'duplicate', 'completed event is a duplicate');

-- ================= admin fulfilment RPCs ==================================================
update public.products set stock_quantity = 5 where id = 't-tracked';
insert into ctx values ('f', pg_temp.mk('b0000000-0000-0000-0000-000000000001', '[{"product_id":"t-tracked","quantity":2}]'::jsonb)::text);
select pg_temp.pay((select v::uuid from ctx where k='f'), 'order_F');
select public.apply_payment_event('order_F', 'pay_F1', 'captured', 20000);
select pg_temp.as_user('b0000000-0000-0000-0000-000000000009');
select throws_ok($$select public.admin_set_order_status((select v::uuid from ctx where k='f'), 'delivered', null, null)$$, 'P0001', 'invalid_order_transition',
  'admin cannot skip fulfilment steps');
select lives_ok($$select public.admin_set_order_status((select v::uuid from ctx where k='f'), 'processing', 'Packing', null)$$, 'paid -> processing');
select lives_ok($$select public.admin_set_order_status((select v::uuid from ctx where k='f'), 'shipped', null, 'Courier X, AWB 123')$$, 'processing -> shipped with tracking');
select lives_ok($$select public.admin_set_order_status((select v::uuid from ctx where k='f'), 'delivered', null, null)$$, 'shipped -> delivered');
select throws_ok($$select public.admin_set_order_status((select v::uuid from ctx where k='f'), 'cancelled', null, null)$$, 'P0001', 'invalid_order_transition',
  'a delivered order cannot be cancelled');
reset role;
select is((select tracking_note from public.orders where id = (select v::uuid from ctx where k='f')), 'Courier X, AWB 123', 'tracking note stored');
select isnt((select shipped_at from public.orders where id = (select v::uuid from ctx where k='f')), null, 'shipped_at set');
select is((select array_agg(to_status::text order by id) from public.order_status_history where order_id = (select v::uuid from ctx where k='f')),
  array['pending_payment', 'paid', 'processing', 'shipped', 'delivered'], 'full status history is recorded in order');
select is((select count(*)::int from public.order_status_history where order_id = (select v::uuid from ctx where k='f') and changed_by = 'b0000000-0000-0000-0000-000000000009'), 3,
  'admin-made changes record who made them (webhook-made ones are null)');

-- admin cancel of a paid order: stock back, refund flagged
update public.products set stock_quantity = 5 where id = 't-tracked';
insert into ctx values ('g', pg_temp.mk('b0000000-0000-0000-0000-000000000001', '[{"product_id":"t-tracked","quantity":2}]'::jsonb)::text);
select pg_temp.pay((select v::uuid from ctx where k='g'), 'order_G');
select public.apply_payment_event('order_G', 'pay_G1', 'captured', 20000);
select pg_temp.as_user('b0000000-0000-0000-0000-000000000009');
select lives_ok($$select public.admin_set_order_status((select v::uuid from ctx where k='g'), 'cancelled', 'Customer request', null)$$, 'admin cancels a paid order');
reset role;
select is(pg_temp.stock(), 5, 'cancel returned the stock');
select is((select refund_required from public.payments where provider_order_id = 'order_G'), true, 'cancel of a paid order flags the refund');

-- admin product management
select pg_temp.as_user('b0000000-0000-0000-0000-000000000009');
select lives_ok($$select public.admin_upsert_product('{"id":"t-tracked","price_paise":11000,"price_status":"confirmed","stock_quantity":9}'::jsonb)$$, 'admin edits a product');
reset role;
select is((select price_paise from public.products where id = 't-tracked'), 11000, 'price updated');
select is((select count(*)::int from public.inventory_movements where product_id = 't-tracked' and reason = 'adjustment' and delta = 4), 1, 'stock change logged as an adjustment (5 -> 9)');
select is((select unit_price_paise from public.order_items where order_id = (select v::uuid from ctx where k='f') limit 1), 10000,
  'existing orders keep their original price snapshot');
select pg_temp.as_user('b0000000-0000-0000-0000-000000000009');
select lives_ok($$select public.admin_upsert_product('{"id":"t-tracked","stock_quantity":null}'::jsonb)$$, 'admin can stop tracking stock');
reset role;
select is((select stock_quantity from public.products where id = 't-tracked'), null, 'stock is untracked (NULL)');

select * from finish();
rollback;

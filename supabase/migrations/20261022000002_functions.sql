-- NOIR ROAST — trusted functions. Every function here is SECURITY DEFINER with an empty
-- search_path (all references schema-qualified). Who may call each one is set in 0003.
--   service_role only : create_order, attach_payment, apply_payment_event, release_expired_orders,
--                       record_payment_event
--   authenticated     : cancel_pending_order (owner only), admin_* (is_admin() re-checked inside)

-- ---------------------------------------------------------------------------------------
-- Authorization
-- ---------------------------------------------------------------------------------------
create function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

-- ---------------------------------------------------------------------------------------
-- Inventory helpers
-- ---------------------------------------------------------------------------------------

-- Return the stock held by an order (tracked products only) and log it. Lock order is by
-- product id so concurrent releases/reservations cannot deadlock.
create function public.release_order_stock(p_order_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select oi.product_id, oi.quantity
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id and p.stock_quantity is not null
    order by oi.product_id
  loop
    update public.products set stock_quantity = stock_quantity + r.quantity where id = r.product_id;
    insert into public.inventory_movements (product_id, delta, reason, order_id, note)
    values (r.product_id, r.quantity, 'order_released', p_order_id, p_note);
  end loop;
end $$;

-- Re-reserve stock for an already-created order (a late payment arrived after expiry).
-- All-or-nothing: returns false (and changes nothing) if any tracked product is short.
create function public.try_reserve_order_stock(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select oi.product_id, oi.quantity, p.stock_quantity
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
    order by oi.product_id
    for update of p
  loop
    if r.stock_quantity is not null and r.stock_quantity < r.quantity then
      return false;
    end if;
  end loop;
  for r in
    select oi.product_id, oi.quantity
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id and p.stock_quantity is not null
    order by oi.product_id
  loop
    update public.products set stock_quantity = stock_quantity - r.quantity where id = r.product_id;
    insert into public.inventory_movements (product_id, delta, reason, order_id, note)
    values (r.product_id, -r.quantity, 'order_reserved', p_order_id, 'Re-reserved for late payment');
  end loop;
  return true;
end $$;

create function public.release_expired_orders()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_count integer := 0;
begin
  for v_id in
    select id from public.orders
    where status = 'pending_payment' and reservation_expires_at is not null and reservation_expires_at < now()
    order by created_at
    for update skip locked
  loop
    perform public.release_order_stock(v_id, 'Reservation expired');
    perform set_config('app.status_note', 'Reservation expired', true);
    update public.orders set status = 'expired' where id = v_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------------------
-- create_order: the ONLY place an order total is computed. Prices come from the products table;
-- nothing numeric from the caller is trusted. One transaction: lock -> validate -> price ->
-- insert -> reserve stock.
-- ---------------------------------------------------------------------------------------
create function public.create_order(p_user_id uuid, p_email text, p_items jsonb, p_shipping jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_max_qty   integer := public.setting_int('max_qty_per_line', 10);
  v_cap       integer := public.setting_int('max_pending_orders_per_user', 3);
  v_minutes   integer := public.setting_int('reservation_minutes', 30);
  v_shipping  integer := public.setting_int('shipping_flat_paise', 0);
  v_item      jsonb;
  v_pid       text;
  v_qty       integer;
  v_prod      public.products%rowtype;
  v_lines     jsonb := '[]'::jsonb;
  v_subtotal  bigint := 0;
  v_provisional boolean := false;
  v_seen      text[] := '{}';
  v_pending   integer;
  v_order     public.orders%rowtype;
  v_line      jsonb;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'invalid_items' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_shipping) is distinct from 'object' then
    raise exception 'invalid_shipping' using errcode = 'P0001';
  end if;

  perform public.release_expired_orders();

  select count(*) into v_pending from public.orders
  where user_id = p_user_id and status = 'pending_payment';
  if v_pending >= v_cap then
    raise exception 'too_many_pending_orders' using errcode = 'P0001';
  end if;

  -- Pass 1: lock rows in a stable order, validate, price.
  for v_item in
    select value from jsonb_array_elements(p_items) order by value ->> 'product_id'
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item -> 'product_id') is distinct from 'string'
       or jsonb_typeof(v_item -> 'quantity') is distinct from 'number'
       or (v_item ->> 'quantity') !~ '^[0-9]+$' then
      raise exception 'invalid_items' using errcode = 'P0001';
    end if;
    v_pid := v_item ->> 'product_id';
    if char_length(v_item ->> 'quantity') > 4 then   -- guards the int cast below against overflow
      raise exception 'invalid_quantity' using errcode = 'P0001', detail = v_pid;
    end if;
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty < 1 or v_qty > v_max_qty then
      raise exception 'invalid_quantity' using errcode = 'P0001', detail = v_pid;
    end if;
    if v_pid = any (v_seen) then
      raise exception 'duplicate_item' using errcode = 'P0001', detail = v_pid;
    end if;
    v_seen := v_seen || v_pid;

    select * into v_prod from public.products where id = v_pid for update;
    if not found or not v_prod.is_active then
      raise exception 'product_unavailable' using errcode = 'P0001', detail = v_pid;
    end if;
    if v_prod.stock_quantity is not null and v_prod.stock_quantity < v_qty then
      raise exception 'out_of_stock' using errcode = 'P0001', detail = v_pid;
    end if;

    v_subtotal := v_subtotal + v_prod.price_paise::bigint * v_qty;
    if v_prod.price_status = 'provisional' or v_prod.weight_status = 'provisional' then
      v_provisional := true;
    end if;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_prod.id, 'name', v_prod.name, 'unit_price_paise', v_prod.price_paise,
      'weight_grams', v_prod.weight_grams, 'quantity', v_qty, 'tracked', v_prod.stock_quantity is not null);
  end loop;

  if v_subtotal > 100000000 then  -- INR 10 lakh: sanity ceiling, far above any real basket
    raise exception 'order_too_large' using errcode = 'P0001';
  end if;

  insert into public.orders (
    user_id, status, subtotal_paise, shipping_paise, tax_paise, total_paise, contact_email,
    ship_name, ship_phone, ship_line1, ship_line2, ship_city, ship_state, ship_pincode,
    reservation_expires_at)
  values (
    p_user_id, 'pending_payment', v_subtotal, v_shipping, 0, v_subtotal + v_shipping, p_email,
    p_shipping ->> 'name', p_shipping ->> 'phone', p_shipping ->> 'line1',
    nullif(p_shipping ->> 'line2', ''), p_shipping ->> 'city', p_shipping ->> 'state',
    p_shipping ->> 'pincode', now() + make_interval(mins => v_minutes))
  returning * into v_order;

  -- Pass 2: snapshots + stock reservation.
  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    insert into public.order_items (order_id, product_id, product_name, unit_price_paise, weight_grams, quantity)
    values (v_order.id, v_line ->> 'product_id', v_line ->> 'name', (v_line ->> 'unit_price_paise')::integer,
            (v_line ->> 'weight_grams')::integer, (v_line ->> 'quantity')::integer);
    if (v_line ->> 'tracked')::boolean then
      update public.products set stock_quantity = stock_quantity - (v_line ->> 'quantity')::integer
      where id = v_line ->> 'product_id';
      insert into public.inventory_movements (product_id, delta, reason, order_id, note)
      values (v_line ->> 'product_id', -(v_line ->> 'quantity')::integer, 'order_reserved', v_order.id, 'Reserved at checkout');
    end if;
  end loop;

  return jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number, 'status', v_order.status,
    'subtotal_paise', v_order.subtotal_paise, 'shipping_paise', v_order.shipping_paise,
    'tax_paise', v_order.tax_paise, 'total_paise', v_order.total_paise,
    'expires_at', v_order.reservation_expires_at,
    'contains_provisional', v_provisional,
    'shipping_status', public.setting_text('shipping_status', 'placeholder'),
    'tax_status', public.setting_text('tax_status', 'placeholder'));
end $$;

-- Called by the edge function right after the Razorpay order exists.
create function public.attach_payment(p_order_id uuid, p_provider_order_id text, p_amount_paise integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if v_order.status <> 'pending_payment' then raise exception 'order_not_payable' using errcode = 'P0001'; end if;
  if v_order.total_paise <> p_amount_paise then raise exception 'amount_mismatch' using errcode = 'P0001'; end if;
  insert into public.payments (order_id, provider_order_id, amount_paise)
  values (p_order_id, p_provider_order_id, p_amount_paise)
  returning id into v_id;
  return v_id;
end $$;

-- Facts the checkout safety policy needs about an existing order (used when resuming payment).
create function public.order_policy_facts(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'contains_provisional', coalesce(bool_or(p.price_status = 'provisional' or p.weight_status = 'provisional'), true),
    'shipping_status', public.setting_text('shipping_status', 'placeholder'),
    'tax_status', public.setting_text('tax_status', 'placeholder'))
  from public.order_items oi join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id;
$$;

-- Undo an order whose Razorpay order could not be created (releases stock, marks cancelled).
create function public.abort_unpaid_order(p_order_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.order_status;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if v_status = 'pending_payment' then
    perform public.release_order_stock(p_order_id, p_note);
    perform set_config('app.status_note', p_note, true);
    update public.orders set status = 'cancelled' where id = p_order_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------
-- apply_payment_event: the ONLY writer of payment state and the "paid" order state.
-- Idempotent, amount-checked and monotonic, so duplicates, retries and out-of-order events are safe.
--   authorized : created|failed -> authorized
--   captured   : created|authorized|failed -> captured (+ order paid). Same payment again = no-op.
--                A DIFFERENT payment id captured for an already-captured order = duplicate charge ->
--                refund_required. Capture on an expired order re-reserves stock or flags a refund.
--                Capture on a cancelled order flags a refund.
--   failed     : created|authorized -> failed (ignored once captured/refunded)
--   refunded   : captured -> refunded (paid/processing orders are cancelled and stock returned)
-- ---------------------------------------------------------------------------------------
create function public.apply_payment_event(
  p_provider_order_id text, p_provider_payment_id text, p_new_status public.payment_status,
  p_amount_paise integer, p_failure_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_pay    public.payments%rowtype;
  v_order  public.orders%rowtype;
  v_result text := 'applied';
begin
  select * into v_pay from public.payments where provider_order_id = p_provider_order_id for update;
  if not found then
    return jsonb_build_object('result', 'unknown_payment');
  end if;
  if p_amount_paise is not null and p_amount_paise <> v_pay.amount_paise then
    return jsonb_build_object('result', 'amount_mismatch', 'payment_status', v_pay.status);
  end if;
  select * into v_order from public.orders where id = v_pay.order_id for update;

  if p_new_status = 'authorized' then
    if v_pay.status in ('created', 'failed') then
      update public.payments
        set status = 'authorized', failure_reason = null,
            provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id)
        where id = v_pay.id;
    else
      v_result := 'ignored_out_of_order';
    end if;

  elsif p_new_status = 'captured' then
    if v_pay.status in ('captured', 'refunded') then
      if v_pay.provider_payment_id is not null and p_provider_payment_id is not null
         and v_pay.provider_payment_id <> p_provider_payment_id then
        update public.payments set refund_required = true where id = v_pay.id;
        v_result := 'duplicate_capture_refund_required';
      else
        v_result := 'already_applied';
      end if;
    else
      update public.payments
        set status = 'captured', captured_at = now(), failure_reason = null,
            provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id)
        where id = v_pay.id;
      if v_order.status = 'pending_payment' then
        perform set_config('app.status_note', 'Payment captured', true);
        update public.orders set status = 'paid', reservation_expires_at = null where id = v_order.id;
      elsif v_order.status = 'expired' then
        if public.try_reserve_order_stock(v_order.id) then
          perform set_config('app.status_note', 'Payment captured after reservation expired', true);
          update public.orders set status = 'paid', reservation_expires_at = null where id = v_order.id;
          v_result := 'captured_after_expiry';
        else
          update public.payments set refund_required = true where id = v_pay.id;
          v_result := 'captured_after_expiry_refund_required';
        end if;
      elsif v_order.status = 'cancelled' then
        update public.payments set refund_required = true where id = v_pay.id;
        v_result := 'captured_on_cancelled_order_refund_required';
      end if;
    end if;

  elsif p_new_status = 'failed' then
    if v_pay.status in ('created', 'authorized') then
      update public.payments set status = 'failed', failure_reason = left(p_failure_reason, 500) where id = v_pay.id;
    else
      v_result := 'ignored_out_of_order';
    end if;

  elsif p_new_status = 'refunded' then
    if v_pay.status = 'captured' then
      update public.payments set status = 'refunded', refund_required = false where id = v_pay.id;
      if v_order.status in ('paid', 'processing') then
        perform public.release_order_stock(v_order.id, 'Payment refunded');
        perform set_config('app.status_note', 'Payment refunded', true);
        update public.orders set status = 'cancelled' where id = v_order.id;
      end if;
    else
      v_result := 'ignored_out_of_order';
    end if;

  else
    v_result := 'unsupported_status';
  end if;

  return jsonb_build_object(
    'result', v_result,
    'order_id', v_order.id,
    'order_status', (select status from public.orders where id = v_order.id),
    'payment_status', (select status from public.payments where id = v_pay.id));
end $$;

-- Idempotency gate for webhooks. Returns:
--   'new'       first time this event id is seen            -> process it
--   'retry'     seen before but never completed (outcome NULL, e.g. the handler crashed) -> process
--               again; apply_payment_event is idempotent so this is safe
--   'duplicate' seen and completed                          -> acknowledge, do nothing
create function public.record_payment_event(
  p_event_id text, p_event_type text, p_provider_order_id text, p_provider_payment_id text, p_payload jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v_inserted integer;
begin
  insert into public.payment_events (event_id, event_type, provider_order_id, provider_payment_id, payload)
  values (p_event_id, p_event_type, p_provider_order_id, p_provider_payment_id, p_payload)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then return 'new'; end if;
  if exists (select 1 from public.payment_events where event_id = p_event_id and outcome is null) then
    return 'retry';
  end if;
  return 'duplicate';
end $$;

create function public.set_payment_event_outcome(p_event_id text, p_outcome text)
returns void language sql security definer set search_path = '' as $$
  update public.payment_events set outcome = left(p_outcome, 200) where event_id = p_event_id;
$$;

-- ---------------------------------------------------------------------------------------
-- Customer: abandon an unpaid order (returns the reserved stock immediately).
-- ---------------------------------------------------------------------------------------
create function public.cancel_pending_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id is distinct from (select auth.uid()) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.status <> 'pending_payment' then
    raise exception 'order_not_cancellable' using errcode = 'P0001';
  end if;
  perform public.release_order_stock(v_order.id, 'Cancelled by customer');
  perform set_config('app.status_note', 'Cancelled by customer', true);
  update public.orders set status = 'cancelled' where id = v_order.id;
end $$;

-- ---------------------------------------------------------------------------------------
-- Admin RPCs (authenticated callers; authorization re-checked here, not trusted from the client)
-- ---------------------------------------------------------------------------------------
create function public.admin_set_order_status(p_order_id uuid, p_to public.order_status, p_note text default null, p_tracking text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to not in ('processing', 'shipped', 'delivered', 'cancelled') then
    raise exception 'status_not_allowed_for_admin' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;

  if p_to = 'cancelled' and v_order.status in ('pending_payment', 'paid', 'processing') then
    perform public.release_order_stock(v_order.id, coalesce(nullif(p_note, ''), 'Cancelled by admin'));
    -- money may have been taken: flag it so it is refunded in the Razorpay dashboard
    update public.payments set refund_required = true where order_id = v_order.id and status = 'captured';
  end if;

  perform set_config('app.status_note', coalesce(nullif(p_note, ''), 'Status changed by admin'), true);
  update public.orders
    set status = p_to,
        tracking_note = coalesce(nullif(left(p_tracking, 500), ''), tracking_note)
    where id = v_order.id;     -- trigger rejects illegal transitions
end $$;

create function public.admin_upsert_product(p jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_id    text := p ->> 'id';
  v_old   public.products%rowtype;
  v_found boolean;
  v_new_stock integer;
  v_stock_given boolean := p ? 'stock_quantity';
  v_notes text[];
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_id is null then raise exception 'id_required' using errcode = 'P0001'; end if;
  if v_stock_given and nullif(p ->> 'stock_quantity', '') is not null and (p ->> 'stock_quantity') !~ '^[0-9]+$' then
    raise exception 'invalid_stock' using errcode = 'P0001';
  end if;
  v_new_stock := nullif(p ->> 'stock_quantity', '')::integer;
  if p ? 'tasting_notes' then
    v_notes := array(select jsonb_array_elements_text(p -> 'tasting_notes'));
  end if;

  select * into v_old from public.products where id = v_id for update;
  v_found := found;

  if not v_found then
    insert into public.products (
      id, name, origin, roast_level, roast_label, tasting_notes, description, price_paise, price_status,
      weight_grams, weight_status, stock_quantity, is_active, sort_order,
      image_src, image_alt, image_width, image_height, image_position)
    values (
      v_id, p ->> 'name', p ->> 'origin', (p ->> 'roast_level')::smallint, p ->> 'roast_label',
      coalesce(v_notes, '{}'), p ->> 'description', (p ->> 'price_paise')::integer,
      coalesce((p ->> 'price_status')::public.catalogue_status, 'provisional'),
      (p ->> 'weight_grams')::integer,
      coalesce((p ->> 'weight_status')::public.catalogue_status, 'provisional'),
      v_new_stock, coalesce((p ->> 'is_active')::boolean, false), coalesce((p ->> 'sort_order')::integer, 0),
      p ->> 'image_src', p ->> 'image_alt', (p ->> 'image_width')::integer, (p ->> 'image_height')::integer,
      p ->> 'image_position');
    if v_new_stock is not null then
      insert into public.inventory_movements (product_id, delta, reason, note, created_by)
      select v_id, v_new_stock, 'opening_stock'::public.inventory_reason, 'Product created', (select auth.uid())
      where v_new_stock <> 0;
    end if;
  else
    update public.products set
      name = coalesce(p ->> 'name', name),
      origin = case when p ? 'origin' then p ->> 'origin' else origin end,
      roast_level = case when p ? 'roast_level' then (p ->> 'roast_level')::smallint else roast_level end,
      roast_label = case when p ? 'roast_label' then p ->> 'roast_label' else roast_label end,
      tasting_notes = coalesce(v_notes, tasting_notes),
      description = case when p ? 'description' then p ->> 'description' else description end,
      price_paise = coalesce((p ->> 'price_paise')::integer, price_paise),
      price_status = coalesce((p ->> 'price_status')::public.catalogue_status, price_status),
      weight_grams = coalesce((p ->> 'weight_grams')::integer, weight_grams),
      weight_status = coalesce((p ->> 'weight_status')::public.catalogue_status, weight_status),
      is_active = coalesce((p ->> 'is_active')::boolean, is_active),
      sort_order = coalesce((p ->> 'sort_order')::integer, sort_order),
      image_src = case when p ? 'image_src' then p ->> 'image_src' else image_src end,
      image_alt = case when p ? 'image_alt' then p ->> 'image_alt' else image_alt end,
      image_width = case when p ? 'image_width' then (p ->> 'image_width')::integer else image_width end,
      image_height = case when p ? 'image_height' then (p ->> 'image_height')::integer else image_height end,
      image_position = case when p ? 'image_position' then p ->> 'image_position' else image_position end,
      stock_quantity = case when v_stock_given then v_new_stock else stock_quantity end
    where id = v_id;

    if v_stock_given and v_new_stock is not null
       and v_new_stock - coalesce(v_old.stock_quantity, 0) <> 0 then
      insert into public.inventory_movements (product_id, delta, reason, note, created_by)
      values (v_id,
              v_new_stock - coalesce(v_old.stock_quantity, 0),
              case when v_old.stock_quantity is null then 'opening_stock'::public.inventory_reason
                   else 'adjustment'::public.inventory_reason end,
              'Set by admin', (select auth.uid()));
    end if;
  end if;
  return v_id;
end $$;

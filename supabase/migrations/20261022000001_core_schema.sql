-- NOIR ROAST — core schema.
-- Money is always integer paise (1 INR = 100 paise). Order/payment/stock writes are NOT possible
-- for customers: they go through SECURITY DEFINER functions (see 0002) guarded by grants (0003).

-- ---------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------
create type public.order_status as enum
  ('pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'expired');
create type public.payment_status as enum
  ('created', 'authorized', 'captured', 'failed', 'refunded');
-- provisional = placeholder the owner has not confirmed; confirmed = verified business fact
create type public.catalogue_status as enum ('provisional', 'confirmed');
create type public.inventory_reason as enum
  ('opening_stock', 'order_reserved', 'order_released', 'adjustment');

-- ---------------------------------------------------------------------------------------
-- Generic helpers (trigger functions live here because triggers below need them to exist)
-- ---------------------------------------------------------------------------------------
create function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function public.is_indian_state(p_value text)
returns boolean language sql immutable set search_path = '' as $$
  select p_value = any (array[
    'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana',
    'Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
    'Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
    'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
    'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi',
    'Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'
  ]);
$$;

-- Legal order-status moves. Enforced by a trigger so that no code path (including service_role)
-- can skip a step. expired -> paid exists only for a payment captured after the reservation lapsed.
create function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean language sql immutable set search_path = '' as $$
  select case p_from
    when 'pending_payment' then p_to in ('paid', 'cancelled', 'expired')
    when 'expired'         then p_to in ('paid')
    when 'paid'            then p_to in ('processing', 'cancelled')
    when 'processing'      then p_to in ('shipped', 'cancelled')
    when 'shipped'         then p_to in ('delivered')
    else false
  end;
$$;

-- ---------------------------------------------------------------------------------------
-- Customers and administrators
-- ---------------------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text check (full_name is null or char_length(full_name) <= 120),
  -- Indian mobile number: 10 digits starting 6-9 (no country code stored)
  phone      text check (phone is null or phone ~ '^[6-9][0-9]{9}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- A row here IS the admin role. No API role can write this table (RLS on, no policies, no grants).
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  note       text
);

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(left(new.raw_user_meta_data ->> 'full_name', 120), ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------
-- Store settings (business rules the owner has not supplied are PLACEHOLDERS, flagged as such)
-- ---------------------------------------------------------------------------------------
create table public.store_settings (
  key        text primary key,
  value      jsonb not null,
  note       text,
  updated_at timestamptz not null default now()
);
create trigger store_settings_touch before update on public.store_settings
  for each row execute function public.touch_updated_at();

insert into public.store_settings (key, value, note) values
  ('shipping_flat_paise',  '0',             'PLACEHOLDER: no shipping charge has been decided. Flat rate in paise.'),
  ('shipping_status',      '"placeholder"', 'placeholder | confirmed. Live payments are refused until confirmed.'),
  ('tax_status',           '"placeholder"', 'placeholder | confirmed. Tax treatment (e.g. GST inclusive/extra) is undecided; tax is not computed.'),
  ('reservation_minutes',  '30',            'Unpaid orders hold stock for this many minutes, then expire.'),
  ('max_qty_per_line',     '10',            'Per-product quantity cap per order (abuse/UX limit, not a stock claim).'),
  ('max_pending_orders_per_user', '3',      'Limits simultaneous unpaid orders per customer (stock-hoarding protection).');

create function public.setting_int(p_key text, p_default integer)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::integer from public.store_settings where key = p_key), p_default);
$$;

create function public.setting_text(p_key text, p_default text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select value #>> '{}' from public.store_settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------------------
create table public.products (
  id            text primary key
                check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 60),
  name          text not null check (char_length(name) between 1 and 120),
  origin        text check (origin is null or char_length(origin) <= 120),
  roast_level   smallint check (roast_level between 1 and 5),
  roast_label   text check (roast_label is null or char_length(roast_label) <= 30),
  tasting_notes text[] not null default '{}',
  description   text check (description is null or char_length(description) <= 4000),
  price_paise   integer not null check (price_paise > 0),
  price_status  public.catalogue_status not null default 'provisional',
  weight_grams  integer not null check (weight_grams > 0),
  weight_status public.catalogue_status not null default 'provisional',
  -- NULL = not tracked / unknown (we do not invent stock). Otherwise units available to sell.
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  is_active     boolean not null default false,
  sort_order    integer not null default 0,
  image_src     text,
  image_alt     text,
  image_width   integer check (image_width is null or image_width > 0),
  image_height  integer check (image_height is null or image_height > 0),
  image_position text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index products_active_sort_idx on public.products (is_active, sort_order);
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------------------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  order_number  text not null unique default ('NR-' || nextval('public.order_number_seq')),
  user_id       uuid not null references auth.users (id) on delete restrict,
  status        public.order_status not null default 'pending_payment',
  currency      text not null default 'INR' check (currency = 'INR'),
  subtotal_paise integer not null check (subtotal_paise >= 0),
  shipping_paise integer not null check (shipping_paise >= 0),
  tax_paise      integer not null check (tax_paise >= 0),
  total_paise    integer not null check (total_paise > 0),
  check (total_paise = subtotal_paise + shipping_paise + tax_paise),

  contact_email text not null check (contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  ship_name     text not null check (char_length(ship_name) between 2 and 120),
  ship_phone    text not null check (ship_phone ~ '^[6-9][0-9]{9}$'),
  ship_line1    text not null check (char_length(ship_line1) between 3 and 200),
  ship_line2    text check (ship_line2 is null or char_length(ship_line2) <= 200),
  ship_city     text not null check (char_length(ship_city) between 2 and 80),
  ship_state    text not null check (public.is_indian_state(ship_state)),
  ship_pincode  text not null check (ship_pincode ~ '^[1-9][0-9]{5}$'),

  reservation_expires_at timestamptz,
  tracking_note text check (tracking_note is null or char_length(tracking_note) <= 500),
  paid_at       timestamptz,
  shipped_at    timestamptz,
  delivered_at  timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index orders_user_created_idx   on public.orders (user_id, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_pending_expiry_idx on public.orders (reservation_expires_at) where status = 'pending_payment';

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  product_id       text not null references public.products (id) on delete restrict,
  -- snapshots: later catalogue edits never rewrite history
  product_name     text not null,
  unit_price_paise integer not null check (unit_price_paise > 0),
  weight_grams     integer not null check (weight_grams > 0),
  quantity         integer not null check (quantity between 1 and 100),
  unique (order_id, product_id)
);
create index order_items_order_idx on public.order_items (order_id);

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete restrict,
  provider            text not null default 'razorpay' check (provider = 'razorpay'),
  provider_order_id   text not null unique,
  provider_payment_id text unique,
  status              public.payment_status not null default 'created',
  amount_paise        integer not null check (amount_paise > 0),
  currency            text not null default 'INR' check (currency = 'INR'),
  -- set when money was taken but the order cannot be fulfilled (late/duplicate/cancelled): refund in Razorpay
  refund_required     boolean not null default false,
  failure_reason      text,
  captured_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- Webhook idempotency + audit. The provider's event id is the primary key, so a replayed event
-- is detected by a unique violation / ON CONFLICT before any state change.
create table public.payment_events (
  event_id            text primary key,
  event_type          text not null,
  provider_order_id   text,
  provider_payment_id text,
  payload             jsonb not null,
  outcome             text,
  received_at         timestamptz not null default now()
);

create table public.inventory_movements (
  id          bigint generated always as identity primary key,
  product_id  text not null references public.products (id) on delete restrict,
  delta       integer not null check (delta <> 0),
  reason      public.inventory_reason not null,
  order_id    uuid references public.orders (id) on delete set null,
  note        text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index inventory_movements_product_idx on public.inventory_movements (product_id, created_at desc);

create table public.order_status_history (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status   public.order_status not null,
  changed_by  uuid references auth.users (id) on delete set null, -- NULL = system / webhook
  note        text,
  created_at  timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- ---------------------------------------------------------------------------------------
-- Integrity triggers (defence in depth: apply to every caller, including service_role)
-- ---------------------------------------------------------------------------------------
create function public.orders_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.user_id, new.order_number, new.currency, new.subtotal_paise, new.shipping_paise, new.tax_paise,
        new.total_paise, new.contact_email, new.ship_name, new.ship_phone, new.ship_line1, new.ship_line2,
        new.ship_city, new.ship_state, new.ship_pincode)
       is distinct from
       (old.user_id, old.order_number, old.currency, old.subtotal_paise, old.shipping_paise, old.tax_paise,
        old.total_paise, old.contact_email, old.ship_name, old.ship_phone, old.ship_line1, old.ship_line2,
        old.ship_city, old.ship_state, old.ship_pincode) then
      raise exception 'order_immutable' using errcode = 'P0001',
        detail = 'Money, owner and shipping columns cannot change after creation.';
    end if;
    if new.status is distinct from old.status then
      if not public.order_transition_allowed(old.status, new.status) then
        raise exception 'invalid_order_transition' using errcode = 'P0001',
          detail = format('%s -> %s', old.status, new.status);
      end if;
      if new.status = 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now()); end if;
      if new.status = 'paid'      then new.paid_at      := coalesce(new.paid_at, now()); end if;
      if new.status = 'shipped'   then new.shipped_at   := coalesce(new.shipped_at, now()); end if;
      if new.status = 'delivered' then new.delivered_at := coalesce(new.delivered_at, now()); end if;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger orders_guard_trg before insert or update on public.orders
  for each row execute function public.orders_guard();

create function public.orders_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
    values (new.id, null, new.status, (select auth.uid()), 'Order created');
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, (select auth.uid()),
            nullif(current_setting('app.status_note', true), ''));
  end if;
  return null;
end $$;
create trigger orders_history_trg after insert or update on public.orders
  for each row execute function public.orders_history();

create function public.order_items_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'order_items_immutable' using errcode = 'P0001';
end $$;
create trigger order_items_no_update before update on public.order_items
  for each row execute function public.order_items_immutable();

create function public.payments_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.order_id, new.provider_order_id, new.amount_paise, new.currency)
     is distinct from (old.order_id, old.provider_order_id, old.amount_paise, old.currency) then
    raise exception 'payment_immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger payments_guard_trg before update on public.payments
  for each row execute function public.payments_guard();

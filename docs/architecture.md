# NOIR ROAST — Technical Architecture

Companion to [`implementation-plan.md`](./implementation-plan.md) (what and why) and [`design-system.md`](../design-system.md) (visual rules). This file explains **how it fits together** and how to **run, verify, deploy and operate** it. Every "verified" claim below was actually run; anything that was not is listed under [Not verified](#not-verified-needs-your-accounts-or-credentials).

## 1. System overview

```
                       ┌──────────────────────────── Vercel (static hosting) ────────────────────────────┐
 Browser ──────────────►  React + Vite SPA  (homepage = original site; shop/account/admin lazy-loaded)    │
   │                    └────────────────────────────────────────────────────────────────────────────────┘
   │  anon key + user JWT                                        ▲ public key id only
   ▼                                                             │
 ┌──────────────────────────── Supabase ────────────────────────┴──────────────────────────────┐
 │ Auth (email+password)   PostgREST (RLS-gated reads)   Edge Functions (Deno, service role)     │
 │                                                                                               │
 │   create-order ──► create_order() SQL fn ──► Razorpay Orders API ──► attach_payment()         │
 │   verify-payment ─► HMAC check + Razorpay fetch ─► apply_payment_event()                      │
 │   razorpay-webhook ► HMAC over raw body ─► record_payment_event() ─► apply_payment_event()    │
 │                                                                                               │
 │ PostgreSQL: products · orders · order_items · payments · payment_events · inventory_movements │
 │             order_status_history · profiles · admin_users · store_settings   (RLS everywhere) │
 └───────────────────────────────────────────────────────────────────────────────────────────────┘
                                         ▲
                               Razorpay (test mode first) ── Checkout.js in the browser, webhooks to us
```

**Principle:** the browser is untrusted. It can *ask* (create an order, claim a payment) but never *decide* (price, stock, paid status, roles). Every decision is made in Postgres functions or Edge Functions that read authoritative data.

## 2. Repository map

| Path | Purpose |
|---|---|
| `src/components/sections/*`, `src/motion/*`, `src/components/ui/{Figure,Button,ScrollProgress}*` | **Original site — protected.** Byte-identical to the baseline commit (guarded by `tests/unit/protected-files.test.js`). |
| `src/motion/directional.jsx` | New directional entrances (`RevealFrom`, `RevealItemFrom`) and `MaskImage`. Additive; used by new pages only. |
| `src/pages/*` | Routes: `Home` (original sections), `shop/*`, `auth/*`, `account/*`, `Checkout`, `admin/*`, `NotFound`. All but `Home` are lazy-loaded. |
| `src/cart/*`, `src/components/cart/*` | Cart: pure logic (`cartLogic.js`, tested), provider, drawer. Stores `{productId, quantity}` only. |
| `src/catalogue/*` | Catalogue provider: database when a backend is configured, local seed otherwise; sorting/filtering. |
| `src/auth/*` | Auth provider + route guards (UX only). |
| `src/lib/*` | Config, lazy Supabase loader, Edge Function caller, Razorpay loader, SEO meta, formatting. |
| `supabase/migrations/*` | Schema, functions, RLS/privileges (forward-only). |
| `supabase/functions/_shared/*` | **Single source of truth** for validation, error codes, Razorpay crypto and the three request handlers. Imported by the Edge Functions, by the browser (validation, error text) and by the tests. |
| `supabase/functions/{create-order,verify-payment,razorpay-webhook}/index.ts` | Thin Deno entrypoints (wiring only). |
| `supabase/tests/database/*` | pgTAP: RLS, privileges, order/stock/payment state machine. |
| `tests/unit`, `tests/integration` | Node tests; integration runs against the local stack with a fake Razorpay. |
| `scripts/` | Protected-file baseline, fake Razorpay server for local browser testing. |

## 3. Data model

Money is integer **paise**. `total = subtotal + shipping + tax` is a CHECK. All tables have RLS enabled.

| Table | Notes |
|---|---|
| `products` | `id` is a slug (stable, used in URLs/cart/order items). `price_paise`, `weight_grams`, each with `*_status` ∈ `provisional|confirmed`. `stock_quantity` **NULL = not tracked** (no invented stock). `is_active`. |
| `orders` | owner `user_id`, status enum, money columns, shipping address columns (validated by CHECK), `reservation_expires_at`. Money/owner/address are **immutable** after insert (trigger). |
| `order_items` | Snapshots of name/price/weight/qty; immutable. |
| `payments` | One row per Razorpay order. `provider_order_id` unique, `provider_payment_id` unique, `status`, `refund_required`. |
| `payment_events` | Webhook idempotency + audit; PK = provider event id. |
| `inventory_movements` | Ledger of every stock change (reserve/release/adjust/opening). |
| `order_status_history` | Every transition, who made it (NULL = system/webhook), optional note. |
| `profiles` | Created by trigger on `auth.users`; name + Indian mobile. |
| `admin_users` | A row = administrator. No API role can read or write it. |
| `store_settings` | Business rules as data: shipping flat rate (placeholder ₹0), `shipping_status`/`tax_status` (placeholder|confirmed), reservation minutes, quantity caps. |

### Order lifecycle (enforced by a trigger, not by application code)

```
pending_payment ──paid──► paid ──► processing ──► shipped ──► delivered
      │  │                  │           │
      │  └─expired─► (expired ──paid──► paid   only for a payment captured after expiry, if stock can be re-reserved)
      └─cancelled           └──cancelled──┘   (cancelling a paid order returns stock and sets payments.refund_required)
```

### Stock

Stock is reserved (decremented) in the same transaction that creates the order, with a movement row. Unpaid orders expire after `reservation_minutes` (default 30) and stock returns. Expiry runs on every `create_order`, and optionally on a schedule (`supabase/scripts/schedule-expiry.sql`). A customer can have at most 3 unpaid orders (hoarding protection). Concurrency is handled by row locks taken in a stable order (verified with a two-buyer race against the real stack: exactly one succeeds).

## 4. Payments (Razorpay)

1. **`create-order`** (JWT required): validate input shape → `create_order()` prices the order from the DB inside one transaction → **policy check** → Razorpay Orders API with the *database* total → `attach_payment()`. On any failure after reservation, `abort_unpaid_order()` releases stock.
2. Browser opens Razorpay Checkout with the **key id** + Razorpay order id. The result `{order_id, payment_id, signature}` is only a *claim*.
3. **`verify-payment`**: recompute HMAC-SHA256(`order_id|payment_id`, key secret) (constant-time) → fetch the payment from Razorpay and require matching order id, amount (paise) and currency → `apply_payment_event()`. If Razorpay cannot be reached it answers **202 pending** and does not guess.
4. **`razorpay-webhook`** (no JWT; HMAC over the **raw body**): dedupes on `x-razorpay-event-id` (`new` / `retry` / `duplicate`), maps events (`payment.authorized|captured|failed`, `order.paid`, `refund.processed`), then `apply_payment_event()`. Returns 500 if processing failed so Razorpay retries; the event stays "unfinished" so the retry is reprocessed.
5. **`apply_payment_event()`** is the only writer of payment state and the "paid" order state: idempotent, amount-checked, monotonic (a late `failed` cannot undo `captured`), duplicate captures with a different payment id and captures on cancelled/expired orders set `refund_required` instead of losing money.

**Live-key guard:** `rzp_live_` keys are refused while any ordered product has a provisional price/weight or while shipping/tax are `placeholder`. Test keys always work. (Re-checked on "resume payment" too.)

**Razorpay dashboard requirement:** payment capture must be **Automatic**. If it is Manual, payments stay `authorized`, our webhook never receives `payment.captured`, and orders stay unpaid.

## 5. Security model

| Actor | Can | Cannot |
|---|---|---|
| Anonymous | Read active products, public store settings | Read any order/profile/role; call any function except `is_admin()` |
| Customer | Read **own** profile/orders/items/payments/history; edit own name+phone; cancel own unpaid order | Write orders, items, payments, stock, prices, settings, roles; read others' data; call privileged functions |
| Admin (row in `admin_users`) | Read all orders/movements; call `admin_set_order_status`, `admin_upsert_product` | Skip fulfilment steps (trigger); mark orders paid by hand; edit tables directly; move money |
| Edge Functions (service role) | Call trusted functions | Anything their code does not do; the service key never leaves them |

Defence in depth: RLS **and** revoked table/function privileges **and** triggers (immutability, legal transitions) **and** CHECK constraints. Edge Functions return generic error codes (no SQL text, no provider bodies). The browser bundle contains only the public URL, anon key and key id (verified by scanning `dist/`).

**Admin provisioning:** register normally, then run `supabase/scripts/grant-admin.sql` as the project owner (SQL editor). Sign-ups never become admins.

## 6. Frontend notes

* **Original homepage untouched** (same sections/markup/animation files). Nav/Footer gained router links and an Account link (≥1200px in the header; mobile menu/footer otherwise), and the header is always solid on inner routes (light-first pages would otherwise hide it).
* New motion: directional entrances (left/right/up/depth) and mask-reveal images on shop/product pages, page fade (inner routes only, never wrapping the pinned 3D scene), cart drawer. Reduced motion: transforms/parallax stripped by `MotionConfig`, fades kept. Magnetic buttons intentionally **not** built (design-system §6.4 forbids them).
* Performance: only the homepage is in the entry bundle (~466 kB raw / ~148 kB gz including the shared motion chunk, vs 400 / 128 for the original); the Supabase client (~55 kB gz) loads after first paint, and not at all without a backend; all other pages lazy.
* SEO: per-page title/description/canonical/OG, `noindex` on private pages, JSON-LD `Product` **without offers while the price is provisional**, `robots.txt`, placeholder `sitemap.xml`. Client-side rendering limits non-JS crawlers (prerendering is a later option).

## 7. Run it locally

Prerequisites: Node 22+, Docker.

```powershell
npm install
# Throwaway local secrets for the FAKE Razorpay used in tests (not real keys)
$env:RAZORPAY_KEY_ID="rzp_test_localfakekey"; $env:RAZORPAY_KEY_SECRET="local_fake_key_secret"
$env:RAZORPAY_WEBHOOK_SECRET="local_fake_webhook_secret"; $env:RAZORPAY_API_BASE="http://host.docker.internal:4010/v1"
npm run supabase:start          # local Postgres/Auth/REST/Edge runtime; applies migrations + seed
npx supabase status -o env      # copy API_URL and ANON_KEY into .env.local (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
node scripts/fake-razorpay.mjs  # optional: fake provider on :4010 for browser testing
npm run dev                     # http://localhost:5173
```

Without `.env.local` the site runs in **demo mode**: local catalogue and bag, no accounts, checkout switched off (honest messaging).

## 8. Tests

| Command | What | Needs |
|---|---|---|
| `npm test` | 140+ unit tests: cart, money, sort/filter, validation, HMAC, handlers (fakes), seed parity, protected originals | nothing |
| `npm run test:db` | pgTAP: 152 assertions (RLS, privileges, pricing, stock, expiry, payment state machine, admin RPCs) | local stack |
| `npm run test:integration` | 32 end-to-end checks through real Auth + PostgREST + Deno Edge Functions with a fake Razorpay (incl. concurrent oversell race, forged signatures, out-of-order webhooks) | local stack + env above |
| `npm run lint` / `npm run build` | static checks / production build | nothing |

Browser verification was done with BrowserOS automation against the local stack (journeys, responsive widths, reduced motion, axe-core accessibility audit of every page, console errors).

## 9. Deployment

**Vercel** (static hosting, existing production project is untouched by this work): build `npm run build`, output `dist`. `vercel.json` rewrites all paths to `index.html` (SPA routing), adds `nosniff` / `Referrer-Policy` / `X-Frame-Options` headers, and long-cache for hashed `/assets`. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ optional `VITE_RAZORPAY_KEY_ID`, `VITE_SITE_URL`) per environment. Use a **Preview** deployment for the first smoke test. Not deployed from here.

**Supabase** (not connected from here): create a *development* project first → `supabase link --project-ref <ref>` → `supabase db push` (migrations only; **do not** push `seed.sql` to production) → `supabase secrets set RAZORPAY_KEY_ID=… RAZORPAY_KEY_SECRET=… RAZORPAY_WEBHOOK_SECRET=…` → `supabase functions deploy create-order verify-payment razorpay-webhook` (webhook has `verify_jwt = false` in `config.toml`) → Auth settings: site URL, redirect URLs, email confirmation, password policy → provision the admin → in Razorpay (test mode) set the webhook URL + events and **Automatic capture**.

### Launch checklist (production)
1. Owner confirms prices, weights, descriptions; set `price_status`/`weight_status` = `confirmed` per product (admin console).
2. Decide shipping + tax; update `store_settings` and flip `shipping_status`/`tax_status` to `confirmed`.
3. Add real stock numbers (or leave untracked deliberately).
4. Legal pages Razorpay requires (privacy, terms, refund/cancellation, shipping, contact); FSSAI/GST details.
5. Razorpay KYC → live keys → set as **production** Edge secrets → live webhook.
6. Enable Supabase backups/PITR; schedule `release_expired_orders` (`schedule-expiry.sql`).
7. Replace `.example` contact details and sample footer text; real photography/video (asset checklist in the plan).
8. Preview deploy smoke test with a Razorpay **test** payment, then production deploy (requires your explicit approval).

## 10. Operations runbook

* **`refund_required = true`** on a payment (late/duplicate/cancelled-order capture): refund it in the Razorpay dashboard; the admin console flags these orders. The console never moves money.
* **Stuck "pending" after payment:** check Razorpay webhook delivery logs; events are stored in `payment_events` (`outcome IS NULL` = unfinished, safe to retry from the dashboard).
* **Wrong price/shipping:** edit via admin console / `store_settings`; existing orders keep their snapshots.
* **Rollback:** migrations are forward-only; take a backup before each production migration.

## 11. Known limitations

* Single SKU per product (no variants — none are defined yet). Account required to check out (no guest checkout). Single currency (INR). No order emails/notifications and no courier integration (no real emails are sent). No tax engine (tax is 0 and flagged placeholder). Admin order search uses `ILIKE` (fine for small volumes). Pagination/limits are modest by design.
* Client-side rendering only.

## Not verified (needs your accounts or credentials)

* A real Supabase project (nothing remote was created or touched) and the hosted Edge Function deploy path (`supabase functions deploy`) — functions were exercised only in the **local** Deno runtime.
* Real Razorpay traffic: order creation, Checkout UI, webhook delivery and capture settings were **not** exercised; the provider API was faked in tests (the HMAC/verification logic is real and unit-tested against the published algorithm).
* Vercel: no project, preview or deployment was created or modified.
* Email delivery (confirmation / password reset) — local stack has email confirmation off.
* Real-device and cross-browser testing (only Chromium via automation).

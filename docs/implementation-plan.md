# NOIR ROAST — Implementation Plan

Status: **living document** — updated as decisions change. Last updated: 2026-10-22.
Companion: [`architecture.md`](./architecture.md) (how the pieces fit), [`design-system.md`](../design-system.md) (visual rules — authoritative).

Legend used throughout: ✅ done and verified · 🟡 built, verified only in part · ⏳ blocked on an external input · ⬜ not started.
Verification status of every item is tracked in the **Status ledger** at the end. Nothing is marked ✅ unless it was actually run.

---

## 1. Product vision and customer journeys

NOIR ROAST is a small-batch specialty-coffee brand selling in India (INR). The site is an editorial, scroll-led experience ("a candlelit tasting room, printed as a magazine") that must also be a trustworthy shop.

Journeys (all implemented against the existing design language):

| # | Journey | Route(s) | Needs backend? |
|---|---|---|---|
| J1 | Discover → read the story → shop | `/` (existing sections), `/shop` | no (local catalogue) |
| J2 | Inspect a roast → add to bag | `/shop/:id`, bag drawer | no |
| J3 | Register / sign in / reset password | `/login`, `/register`, `/account` | Supabase Auth |
| J4 | Checkout: shipping details → pay (Razorpay) → confirmation | `/checkout`, `/orders/:id` | Supabase + Razorpay |
| J5 | Track orders | `/account/orders`, `/orders/:id` | Supabase |
| J6 | Operate the shop (admin) | `/admin`, `/admin/orders`, `/admin/products` | Supabase (admin role) |

Without a configured backend the site degrades honestly: browsing, the catalogue and the bag work from the local catalogue; account and checkout screens say the backend is not configured instead of failing.

## 2. Existing design audit and animation-recovery strategy

**Audit result (verified, not assumed):**

* The repository has **one commit** (`4e76a69`) on `main`; there are no other branches, stashes, worktrees or other copies of the project on disk. 171 dangling Git objects exist; they are design-tool data files from `.claude/skills/*`, not site source (searched for `framer-motion`, `three`, React imports and brand strings).
* Therefore **there is no earlier version to "recover"**: the original animation code *is* what is in `HEAD`, and every animation/motion/section file is byte-identical to `HEAD` in the working tree (`Hero`, `Craft*`, `CraftJourney`, `Origins`, `Journal`, `Visit`, `Footer`, `Figure`, `Reveal`, `tokens`, `useParallaxEnabled`, `ScrollProgress`, all CSS, `design-system.md`). Files changed since `HEAD` are listed in the status ledger.
* **Most likely reason motion can look "weakened" on a given machine:** the site *intentionally* downgrades — `Craft.jsx` renders the static editorial fallback when the OS reports `prefers-reduced-motion: reduce`, when the browser reports Save-Data, or when WebGL is unavailable (e.g. hardware acceleration off); `useParallaxEnabled` and `Figure` also switch parallax/wipes off under reduced motion, and `MotionConfig reducedMotion="user"` removes transform animation globally. On Windows, *Settings → Accessibility → Visual effects → Animation effects = off* triggers exactly this. See **Motion diagnostic** below.

**Strategy — protect, then extend:**

1. **Never edit the original motion files** except for additive, opt-in props (e.g. `Button` gains a `to` prop for router links; `Reveal` gains an optional `from` direction defaulting to today's behaviour). A regression test fails if a protected file's hash changes unexpectedly (`tests/protected-files.test.js`, list + hashes recorded from `HEAD`).
2. The existing homepage moves into `pages/Home.jsx` **unchanged** (same sections, same order, same markup).
3. New pages reuse `Figure`, `Reveal*`, `LineReveal`, `Rule`, tokens and `data-theme` banding, and add *varied* entrance directions (left / right / depth) through the opt-in `from` prop.
4. Verify in a real browser (full motion and reduced motion) that the homepage still renders the WebGL craft journey, hero entrance, parallax and reveals.

**Motion diagnostic** (run in DevTools console on the site):
`matchMedia('(prefers-reduced-motion: reduce)').matches` — if `true`, the OS setting is on; `navigator.connection?.saveData` — if `true`, Data Saver is on; `!!document.createElement('canvas').getContext('webgl2')` — if `false`, WebGL/hardware acceleration is off. Any of these produces the static fallback by design.

**Original effects that cannot be "recovered":** none were found to be missing. If an effect existed outside this repository, it is not in any recoverable location and needs the original source from you.

**Creative-brief deviation (documented, deliberate):** the brief lists *magnetic* buttons as an optional effect; `design-system.md` §6.4 explicitly says "no tilt, no magnetic buttons, no glow" and the brief says the design system is authoritative, so magnetic movement is **not** implemented. Easy to add later if you overrule §6.4.

## 3. Pages, routes, components, responsive layouts

Router: `react-router-dom` (BrowserRouter). `vercel.json` already rewrites all paths to `index.html`.

| Route | Page | Guard |
|---|---|---|
| `/` | `Home` — the original single-page experience | — |
| `/shop` | Product listing, sort, availability filter | — |
| `/shop/:id` | Product detail (+ JSON-LD, sticky mobile add-to-bag) | — |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Auth forms | redirect if signed in |
| `/account` | Profile (name, phone) | signed in |
| `/account/orders`, `/orders/:id` | History, detail, pay-now, cancel pending | signed in (+ RLS) |
| `/checkout` | Shipping form → server order → Razorpay | signed in |
| `/admin`, `/admin/orders`, `/admin/orders/:id`, `/admin/products` | Admin console | signed in **and** admin (server enforced) |
| `*` | Not found; route-level error boundary | — |

Reusable pieces: `Layout` (Nav + `<main id="main">` + Footer + bag drawer), `Field`, `StatusBadge`, `PageHeader`, `Notice`, `Skeleton`, `PageMeta` hook, `RequireAuth`, `RequireAdmin`. Pages are lazy-loaded (`React.lazy`) so the homepage bundle does not grow with shop/admin code. Responsive: mobile-first, tested at 375 / 768 / 1024 / 1280.

## 4. Database schema, relationships, indexes, migrations

All in `supabase/migrations/` (version-controlled, forward-only). Tables (`public`): `profiles`, `admin_users`, `store_settings`, `products`, `orders`, `order_items`, `payments`, `payment_events`, `inventory_movements`, `order_status_history`. Enums: `order_status`, `payment_status`, `catalogue_status`, `inventory_reason`.

Key design points:

* Money is **integer paise**; `total = subtotal + shipping + tax` is a CHECK constraint.
* `products.id` is a text slug (stable key used in URLs, cart and order items). Single SKU per product for now (price, weight, stock on the product row). **Variants are not modelled** because no real variants exist; they would be a later additive migration (`product_variants`), see §14.
* `stock_quantity` NULL = "not tracked / unknown" — we do not fabricate stock; admin sets real numbers.
* Order/payment/inventory writes happen only inside `SECURITY DEFINER` functions callable by `service_role` (or admin-checked RPCs). Triggers enforce legal order-status transitions, immutable money columns and audit history independent of the caller.
* Indexes: `orders(user_id, created_at desc)`, `orders(status, created_at desc)`, `payments(order_id)`, `order_items(order_id)`, `inventory_movements(product_id, created_at desc)`, `products(is_active, sort_order)`.

## 5. Authentication, authorization, security policies

* Supabase Auth, email + password (email confirmation is a dashboard setting; the code works either way). Profile row created by trigger on `auth.users`.
* **Admin is a database fact** (`admin_users` table, no client write path). Initial admin is provisioned by running a documented SQL statement as the project owner (`supabase/scripts/grant-admin.sql`), never by sign-up.
* RLS on every exposed table; deny-by-default; customers can only `select` their own profile/orders/items/payments (and update their own name/phone). No customer INSERT/UPDATE/DELETE on orders, items, payments, stock or settings. Admin-only reads of all orders/movements via `is_admin()`.
* Privileged functions have `EXECUTE` revoked from `public/anon/authenticated` and granted to `service_role` only, except admin RPCs (granted to `authenticated` but they re-check `is_admin()`).
* Edge Functions verify the caller's JWT with Supabase Auth in code (not only at the gateway).
* Browser holds only the anon key + Razorpay *key id*. Service-role key, Razorpay key secret and webhook secret exist only as Edge Function secrets.

## 6. Cart, pricing, inventory, checkout, order lifecycle

* **Cart** (client): `{productId, quantity}` only, capped, re-validated on load, synced across tabs (✅ built in Phase 1). Prices are display-only.
* **Server pricing:** `create_order()` (SQL, one transaction) locks the product rows, validates active + quantity + stock, reads *current DB prices*, adds shipping from `store_settings`, writes order + immutable item snapshots. The client total is never accepted.
* **Inventory:** stock is decremented at order creation (reservation) with a ledger row; unpaid orders expire after `reservation_minutes` (default 30) and stock is returned (`release_expired_orders()`, also run opportunistically on every order creation; a `pg_cron` schedule is documented). A per-user cap on simultaneous unpaid orders limits stock-hoarding.
* **Lifecycle:** `pending_payment → paid → processing → shipped → delivered`; `cancelled` from pending/paid/processing; `expired` from pending (and `expired → paid` only for a late captured payment that can re-reserve stock). Every transition is written to `order_status_history`.
* **Placeholders, not invented rules:** shipping charge, tax, delivery promises, returns policy are *settings flagged `placeholder`* (shipping ₹0, tax ₹0). Live-mode checkout is refused while any of price, weight, shipping, tax is not `confirmed` (see §7).

## 7. Razorpay integration and payment verification

Flow: `create-order` (Edge Function, JWT) → DB order → Razorpay Orders API (server, key secret) → browser opens Checkout with *key id + razorpay order id* → handler returns `{order_id, payment_id, signature}` → `verify-payment` (Edge Function): recompute HMAC-SHA256(`order_id|payment_id`, key secret) with a constant-time compare, confirm the payment with Razorpay's API (status, amount, order id), then call `apply_payment_event()`. The **webhook** (`razorpay-webhook`, HMAC over the raw body, dedupe on `x-razorpay-event-id`) is the second, authoritative path and covers closed tabs, delays and failures.

* A browser redirect, "success" callback or any client-supplied status never marks an order paid.
* `apply_payment_event()` is the only writer of payment/paid state: idempotent, amount-checked, monotonic (a late `failed` can never downgrade `captured`; duplicate captures with a different payment id set `refund_required`; capture on an expired/cancelled order sets `refund_required` instead of silently losing money).
* **Safety rule:** an order containing any *provisional* price/weight, or with shipping/tax not confirmed, can only be created when the configured key id starts with `rzp_test_`. A live key refuses it. Live charging is therefore impossible until you confirm the business data.
* Verified only with a **fake Razorpay server** for the API calls (real HMAC logic); real Razorpay test-mode traffic needs your test keys (⏳, see §14).

## 8. Admin operations and product management

* Orders: list with search (order number / email / name) and status filter, detail with items, shipping, payments, history; status changes through `admin_set_order_status()` (validated transitions, cancel releases stock and flags refund), tracking note.
* Products: list/create/edit (price, weight, statuses, stock, active, copy) through `admin_upsert_product()`; stock changes always write inventory movements.
* Every admin screen sits behind `RequireAdmin` (UX only); the real gate is the database/RPC.

## 9. Supabase and Vercel infrastructure

* **Supabase:** CLI is a devDependency. `supabase/config.toml`, migrations, seed, pgTAP tests and Edge Functions are in the repo. **Verified locally** against a Docker stack (`npx supabase start`). **No remote Supabase project is linked or accessed** — creating one needs your account; steps in §14 / `docs/architecture.md`.
* **Vercel:** `vercel.json` (SPA rewrite, security + cache headers). No Vercel CLI/integration is available here and no project is linked; nothing was deployed or changed. Build verified locally (`npm run build`, `vite preview`).

## 10. Environment variables and secrets

See `.env.example` (placeholders only) and `docs/architecture.md#environment-and-secrets`. Summary: browser gets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public by design), `VITE_RAZORPAY_KEY_ID` (public). Edge Function secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (+ platform-injected `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Nothing secret is ever in `VITE_*`.

## 11. Testing strategy

| Layer | Tool | Covers |
|---|---|---|
| Unit | `node --test` | cart logic, money, validation, HMAC, handler logic with fakes, catalogue/seed parity, protected-file guard |
| Database | pgTAP via `supabase test db` | RLS isolation, no self-promotion to admin, privilege boundaries, `create_order`, stock/expiry, `apply_payment_event` idempotency + out-of-order + duplicate, status-transition trigger, admin RPC authz |
| Integration | `node --test` against the local stack (opt-in, `npm run test:integration`) | real Auth + PostgREST + RLS, Edge Functions end to end with a fake Razorpay server |
| Browser | BrowserOS automation | shop journey, drawer, mobile nav, responsive widths, reduced motion, console errors, broken images |
| Static | ESLint, `vite build` | |

## 12. Performance, accessibility, SEO

* Route-level code splitting; the 3D chunk stays lazy; images keep intrinsic sizes (no CLS); fonts unchanged.
* WCAG 2.2 AA per design-system §8: labelled forms, error summaries with focus, focus trap/restore in drawers, `aria-live` status, reduced-motion respected everywhere new.
* SEO: per-page `<title>`/description/canonical/Open Graph via a small `usePageMeta` hook, JSON-LD `Product` on product pages (only verified fields; provisional price flagged in the visible page, omitted from structured data while provisional), `robots.txt`, `sitemap.xml`, `noindex` on account/admin/checkout.
* Note: client-side rendering limits what non-JS crawlers see; prerendering is listed as a later improvement (§14).

## 13. Deployment, monitoring, recovery, launch checklist

Launch is **blocked until** you supply the business inputs in §14. Checklist (also in `docs/architecture.md`): confirm prices/weights/shipping/tax → flip statuses to `confirmed` → create Supabase prod project → apply migrations → set Edge secrets → deploy functions → provision admin → Razorpay KYC + live keys + webhook URL → Vercel env vars → preview deploy smoke test → production deploy (**needs your explicit approval**). Recovery: migrations are forward-only; enable Supabase PITR/daily backups; webhook events are stored in `payment_events` so they can be replayed; Razorpay dashboard is the payment source of truth for reconciliation.

## 14. Dependencies, risks, assumptions, decisions needed from you

**Added dependencies (justified):** `react-router-dom` (real routes), `@supabase/supabase-js` (client), `supabase` CLI (dev only: local stack, migrations, DB tests, function serving). No UI kit, no state library, no test framework beyond Node's runner.

**Decisions / inputs needed (⏳):**
1. Final prices, weights, descriptions per roast; real stock numbers (until then stock is "untracked").
2. Shipping policy/charges, GST treatment (inclusive vs. added; rate), returns/refund policy, delivery promises — and Razorpay-required legal pages.
3. Guest checkout? (Currently **account required** — simpler ownership/RLS; guest checkout is a contained later change.)
4. Variants (grind size, pack sizes)? None modelled because none are confirmed.
5. Supabase: create/choose the **development** project and a production project; provide the Razorpay **test** key id/secret (as secrets, not in files).
6. Admin email(s) to provision.
7. Product video / photography (see asset checklist below).

**Risks:** provisional business data must not reach live payments (guarded in code, still needs a human checklist); Edge Functions' Deno entrypoints are thin and only exercised on the local stack; real Razorpay behaviour (capture mode, webhook retries) must be confirmed in test mode with real keys; client-side rendering limits SEO.

**Asset replacement checklist (no videos exist in the repo; none were invented or hot-linked):**
* Hero ambient loop (≤10 s, muted, 1080p, ≤3 MB, with poster) — currently a still, `/images/hero-beans.jpg`.
* Product packshots per roast (consistent low-key lighting, 4:5 and 3:2 crops) — currently editorial stills reused.
* Pour / roast macro loop for the product page — none.
Replace by dropping files in `public/images|video/` and updating `src/data/products.js` / the DB `image_*` columns.

---

## Status ledger

Last verified 2026-10-22 against the **local** Supabase stack (Docker). "Verified" means it was run and observed, not assumed.

| Area | Status | Evidence |
|---|---|---|
| Original homepage preserved | ✅ | 36 protected files (hero, 3D craft journey, reveals, parallax, image frame, tokens, original CSS, design system, all photography) are byte-identical to baseline `4e76a69` (`tests/unit/protected-files.test.js`); browser shows WebGL canvas, hero entrance, all six sections; reduced-motion fallback renders `CraftStatic` |
| Router + lazy pages | ✅ | Build splits every non-home page; entry ≈466 kB raw / 148 kB gz (original 400 / 128) |
| Catalogue (DB-backed, local fallback) | ✅ | Browser: shop/product pages render from Postgres; sort/filter work; seed parity test |
| Cart (persistence, tabs, tamper-proof) | ✅ | Unit tests + browser; cart restored before catalogue loads |
| Product page, directional motion, sticky mobile bar | ✅ | Browser at 1280 and 375; no horizontal overflow; JSON-LD without offers while provisional |
| Auth: register / sign in / sign out / reset | 🟡 | Register, sign-in, sign-out, errors and redirects verified in browser; **password-reset email flow not exercised** (needs an email provider) |
| Checkout → server pricing → pay → paid | ✅ (against fake Razorpay) | Browser journey: order created with server total, dismissed-window path, successful payment verified server-side |
| Razorpay verification logic | ✅ | HMAC verified against the published test vector; 62 handler tests; 32 integration tests incl. forged signature, amount mismatch, replay, out-of-order, duplicate charge, refund |
| Real Razorpay (orders API, Checkout UI, webhooks, capture mode) | ⏳ | Needs your Razorpay **test** keys; nothing real was contacted |
| Database schema, constraints, triggers | ✅ | Applied from scratch via `supabase db reset`; 152 pgTAP assertions via `supabase test db` |
| RLS / privilege boundaries | ✅ | pgTAP as `anon`/`authenticated` + integration through the real API |
| Inventory / oversell protection | ✅ | pgTAP + two-buyer concurrent race against the real stack |
| Admin console (orders, status walk, products) | ✅ | Browser: search, paid→processing→shipped→delivered with tracking, product edit + stock tracking; non-admin denied |
| Customer orders (history, detail, pay now, cancel) | 🟡 | Browser: list, detail, **Pay now on a pending order** and the checkout "Change details" discard (same cancel RPC). The order page's own "Cancel order" confirmation UI was not clicked (RPC covered by pgTAP + integration) |
| Accessibility | ✅ | axe-core: 0 violations on home, shop, product, login, register, forgot, 404, account, orders, order detail, admin ×4, checkout (+errors), bag drawer (after fixing 3 findings in the drawer) |
| Reduced motion | ✅ | Static craft fallback, no transforms, content reveals on scroll |
| Supabase **hosted** project | ⏳ | Not created or touched; steps in `architecture.md` §9 |
| Vercel project / preview / production | ⏳ | Not touched; `vercel.json` prepared and the build verified locally |
| Hosted Edge Function deploy | ⏳ | Functions ran in the local Deno runtime only |
| Email (confirmation, receipts) | ⏳ | Not implemented (no real emails are sent) |
| Cross-browser / real devices | ⬜ | Chromium via automation only |

### Things I found and fixed along the way
Webhook bad-signature status (400 → 401); JSON-array request bodies were accepted; `amount_mismatch` surfaced as a 500; header invisible on light-first pages; horizontal scroll from off-axis entrances on phones; drawer `role="dialog"` on `<aside>` and duplicate landmarks; integration tests left products active in the dev DB; JSON-LD `</script>` injection hardening; a cart-sanitise gap that could drop a restored cart before the catalogue loaded; and "Your orders" listing every customer's orders when viewed by an **admin** (RLS lets admins read all orders, so the customer page now filters by owner).

### Verified test totals
`npm test` 144 · `npm run test:db` 152 assertions · `npm run test:integration` 32 · lint clean · build OK.

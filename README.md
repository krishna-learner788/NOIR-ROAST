# NOIR ROAST

Small-batch specialty coffee, sold in India. An editorial, scroll-led storefront (React + Vite + Framer Motion + Three.js) backed by Supabase (Postgres, Auth, Edge Functions) and Razorpay payments, hosted on Vercel.

* **Design identity:** [`design-system.md`](./design-system.md) — authoritative. The original homepage and its motion files are protected by tests.
* **Plan and status:** [`docs/implementation-plan.md`](./docs/implementation-plan.md)
* **How it works, runbook, deployment, launch checklist:** [`docs/architecture.md`](./docs/architecture.md)

## Quick start

```bash
npm install
npm run dev          # demo mode: local catalogue + bag, no accounts/checkout
```

Full stack locally (needs Docker; see `docs/architecture.md` §7 for the environment variables):

```bash
npm run supabase:start     # Postgres + Auth + REST + Edge Functions, migrations and seed applied
# put API_URL / ANON_KEY from `npx supabase status -o env` in .env.local (see .env.example)
npm run dev
```

## Scripts

| Script | |
|---|---|
| `npm run dev` / `build` / `preview` | Vite |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (no services needed) |
| `npm run test:db` | pgTAP database tests (local stack) |
| `npm run test:integration` | End-to-end API/Edge Function tests with a fake Razorpay (local stack) |
| `npm run supabase:start` / `stop` / `reset` | Local Supabase stack |

## Secrets

Never commit real keys. `.env.example` lists every variable and where it belongs (browser vs Edge Function secrets). The Razorpay key **secret**, webhook secret and Supabase **service-role** key must only ever live in Supabase Edge Function secrets.

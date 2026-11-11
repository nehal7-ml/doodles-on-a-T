# Doodles on a T

Nuxt 4 storefront for a print-on-demand apparel shop. Products come from
Printful, carts and orders are stored in SQLite locally / Turso in production,
authentication is Auth.js with database sessions, and checkout goes through a
swappable payment provider (Stripe hosted Checkout by default).

## Stack

| Area | Choice |
| --- | --- |
| App | Nuxt 4 + Vue 3 + Tailwind CSS |
| Database | Prisma 7 + SQLite locally, Turso (libSQL) in production |
| Auth | Auth.js (`@auth/core`) + `@auth/prisma-adapter`, database sessions |
| Passwords | Argon2id (`@node-rs/argon2`) |
| Payments | Provider adapter; Stripe hosted Checkout or `manual` |
| Email | Provider adapter; Resend in production, console in development |
| Fulfilment | Printful sync products, webhooks, shipping rates and orders |

Money is stored as integer cents (`*Cents` columns) and the storefront is
USD-only. The catalog API still exposes major-unit `price` for display and adds
`priceCents` for exact arithmetic.

## Requirements

- [Bun](https://bun.sh) 1.2+ (the scripts and lockfile use Bun)
- Node.js 20.19+ or 22.12+ (Nuxt 4 requirement)

## Quick start

```bash
bun install
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
bun run db:deploy             # apply migrations to the local SQLite file
bun run db:seed               # optional: admin + demo catalogue
bun run dev                   # http://localhost:3000
```

`bun run dev` loads `.env` and then `.env.development` (see `package.json`).
`prisma.config.ts` additionally reads `.env`, `.env.development` and
`.env.local` for CLI commands. Never commit real secrets.

### Minimum local configuration

```dotenv
AUTH_SECRET="<openssl rand -base64 32>"
AUTH_URL="http://localhost:3000"
AUTH_TRUST_HOST="true"

PAYMENT_PROVIDER="manual"     # no Stripe keys needed locally
EMAIL_PROVIDER="console"

ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="<at least 12 characters>"
SEED_PRODUCTS="true"          # wipe + recreate the demo catalogue
```

Use `PAYMENT_PROVIDER="manual"` to exercise the full checkout flow without a
Stripe account. The order is created with `paymentStatus = "unpaid"`; an admin
settles it with `POST /api/orders/{id}/mark-paid` (admin session or
`ADMIN_TOKEN`). For card payments set `PAYMENT_PROVIDER="stripe"`,
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then forward webhooks with
`stripe listen` or the Stripe dashboard.

Google sign-in is optional: set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` and
register `{AUTH_URL}/api/auth/callback/google` as an authorised redirect URI.
Email/password works without it.

### Seeding

`bun run db:seed` has two independent steps:

1. Upsert the admin from `ADMIN_EMAIL` + `ADMIN_PASSWORD` (skipped when unset).
2. Reset the demo catalogue **only** when `SEED_PRODUCTS=true`. This deletes
   existing products, variants and images first, so never enable it against a
   live catalogue.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Start Nuxt with `.env` + `.env.development` |
| `bun run build` | Production build |
| `bun run preview` | Preview the production build |
| `bun run typecheck` | `nuxt typecheck` (Vue + server) |
| `bun run db:migrate --name <name>` | Create and apply a migration to local SQLite |
| `bun run db:deploy` | Apply pending migrations to local SQLite |
| `bun run db:seed` | Seed admin and optionally the demo catalogue |
| `bun run db:studio` | Open Prisma Studio |
| `bun run db:turso:status` | Show which migrations have reached Turso |
| `bun run db:turso:deploy` | Apply pending migrations to Turso |
| `bun run printful:webhooks` | Register Printful webhooks |

The Prisma CLI's migration engine only accepts `file:` SQLite URLs, so
`prisma migrate` always runs against `LOCAL_DATABASE_URL`. Generate the
migration locally, then ship it to Turso with `bun run db:turso:deploy`.

## Database

The data model, roles, money rules and migration phases are documented in
[`docs/database.md`](docs/database.md); treat it as the source of truth. Schema
changes must update that file and ship with a migration.

Current status: phases 1, 3, 4 and 5 are implemented. Phase 2 (saved addresses,
phone numbers, billing profiles) is deferred — checkout snapshots the shipping
address into `OrderAddress` instead. Phase 6 is partial: order admin endpoints
enforce `staff`/`admin` sessions, Printful automation still uses `ADMIN_TOKEN`,
and there is no admin UI yet.

## Cart and checkout

- `GET /api/cart`, `POST /api/cart/items`, `PATCH/DELETE /api/cart/items/{id}`
  back the server cart for guests and signed-in users. Guests get an httpOnly
  `cart_token` cookie that is merged on login.
- `POST /api/checkout` re-prices the cart, creates the order and its address
  snapshot, then returns a payment redirect (Stripe) or completes as unpaid
  (`manual`).
- `POST /api/orders/track` looks up an order by `orderNumber` + `email`.
  Customers can list their own orders; `staff`/`admin` can see all.
- Fulfilment only starts after a captured payment: `confirm` requires
  `paymentStatus IN (paid, processing)`.

Storefront behaviour (catalog API, images, colour/size selection, cart) is in
[`docs/storefront.md`](docs/storefront.md).

## Payments and email

[`docs/payments.md`](docs/payments.md) describes the provider contracts,
webhook idempotency, refund reconciliation and email templates. Stripe is the
only payment adapter shipped; `manual` is intended for development and bank
transfers. Polar was rejected for physical goods. Resend and SMTP sit behind the
same `EmailProvider` interface; `console` logs messages in development.

## Printful

Product/variant sync, webhook registration and signature verification, live
shipping rates, order submission and tracking, and Printful order states are
documented in [`docs/printful.md`](docs/printful.md). The storefront never calls
Printful directly; it reads the local product tables populated by the sync.

Set `PRINTFUL_KEY` (and `PRINTFUL_STORE_ID` when the token has multiple stores)
before syncing. `PUBLIC_SITE_URL` must be a public HTTPS URL for webhook
registration; use a tunnel during local development.

## Production

1. Create a Turso database and set `DATABASE_URL` (`libsql://…`) and
   `DATABASE_TOKEN` in the host environment. Nitro does not read `.env*` files
   at runtime.
2. Run `bun run db:turso:deploy` from a machine with Turso credentials.
3. Set `AUTH_SECRET`, `AUTH_URL` (the public HTTPS origin),
   `AUTH_TRUST_HOST=true`, and the Google/Stripe/Resend/Printful variables you
   actually use.
4. Set `ADMIN_TOKEN` for machine-to-machine Printful/CLI calls. Browser admin
   actions use `staff`/`admin` sessions instead.
5. Build with `bun run build` and run the Nuxt output with your host's Node/Bun
   runtime. Configure the Stripe webhook to
   `{PUBLIC_SITE_URL}/api/payments/webhook/stripe`.

## Further documentation

- [`docs/database.md`](docs/database.md) — schema, auth/session model, roles,
  money rules, migration phases and environment variables.
- [`docs/payments.md`](docs/payments.md) — payment/email adapters, checkout flow,
  webhooks, refunds and reconciliation.
- [`docs/storefront.md`](docs/storefront.md) — product API, images, variants,
  cart and page behaviour.
- [`docs/printful.md`](docs/printful.md) — Printful sync, webhooks, shipping and
  order lifecycle.

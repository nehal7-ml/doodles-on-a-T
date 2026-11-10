# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Database

Prisma with a local SQLite file in development and Turso (libSQL) in production.

The data model, auth model, roles and migration phases are specified in [`docs/database.md`](docs/database.md). Treat it as the source of truth: schema changes must update that file and ship with a migration.

Payments and transactional email are specified in [`docs/payments.md`](docs/payments.md): Stripe is the default provider (Polar was evaluated and rejected for physical goods), and Resend is the default email provider. Both sit behind adapters so they can be swapped without schema changes.

| Command | What it does |
| --- | --- |
| `bun run db:migrate --name <name>` | Create and apply a migration against the local SQLite file |
| `bun run db:deploy` | Apply pending migrations to the local SQLite file |
| `bun run db:turso:status` | Show which migrations have reached Turso |
| `bun run db:turso:deploy` | Apply pending migrations to Turso |
| `bun run db:seed` | Seed the database selected by `DATABASE_URL` |
| `bun run db:studio` | Open Prisma Studio against the local SQLite file |

The Prisma CLI's migration engine only accepts `file:` URLs for SQLite, so `prisma migrate` always runs against the local file. Generate the migration locally, then ship it to Turso with `db:turso:deploy`.

Production needs `DATABASE_URL` (`libsql://…`) and `DATABASE_TOKEN` set in the host environment — Nitro does not read `.env` files at runtime.

## Printful integration

Product/variant sync, webhooks, order submission and tracking, and live
shipping rates are documented in [docs/printful.md](docs/printful.md). The
storefront data flow (product API, colour/size selection, image priority and
current assumptions) is in [docs/storefront.md](docs/storefront.md). Set the
Printful and database variables from `.env.example` before running the app.

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

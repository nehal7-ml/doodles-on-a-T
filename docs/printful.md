# Printful integration

This app mirrors Printful Sync Products into the local database, creates
Printful orders, keeps their status/tracking up to date through webhooks, and
quotes live shipping rates.

It deliberately uses **both** Printful API versions:

| Feature | API | Why |
| --- | --- | --- |
| Sync products + variants | v1 | v2 does not expose sync products. |
| `product_synced`, `product_updated`, `product_deleted`, `stock_updated` webhooks | v1 | Product events only exist in v1. |
| Draft order creation, confirmation, tracking | v1 | v1 orders use `sync_variant_id`. |
| Shipping rates | v2 | `POST /v2/shipping-rates`. |
| Signed order/shipment webhooks | v2 | HMAC-signed and includes shipment events. |

The v1 and v2 webhook configurations are independent, so both are registered.

## 1. Environment

Copy the relevant values from `.env.example` into `.env.development` (or
`.env`):

```dotenv
PRINTFUL_KEY="..."
PRINTFUL_STORE_ID="8295388"
PUBLIC_SITE_URL="https://your-public-url.example"
ADMIN_TOKEN="a-long-random-string"
```

- `PRINTFUL_KEY` needs the `orders`, `sync_products`, `file_library` and
  `webhooks` scopes.
- `PRINTFUL_STORE_ID` is required when the token belongs to an account with
  multiple stores. Every request sends it as `X-PF-Store-Id`.
- `PUBLIC_SITE_URL` must be the public HTTPS origin of the app. Printful
  rejects `http://` and `localhost` webhook URLs.

Apply the schema and generate the Prisma client:

```bash
bun run db:deploy        # apply committed migrations to the local SQLite file
bun run db:turso:deploy  # apply them to the hosted Turso/libSQL database
bun run db:generate      # regenerate the Prisma client
```

Use `bun run db:migrate` instead of `db:deploy` when you change the Prisma
schema. `LOCAL_DATABASE_URL` points the Prisma CLI at the local file, while
`DATABASE_URL` / `DATABASE_TOKEN` are used by the running app. See `.env.example`
for the full set of database variables.

`bun run dev` loads both `.env` and `.env.development` (later values win), so
the Printful variables can live in either file.

## 2. Import products

Start the dev server and run a full sync:

```bash
curl -X POST http://localhost:3000/api/printful/sync \
  -H "x-admin-token: $ADMIN_TOKEN"
```

Response:

```json
{
  "total": 2,
  "synced": 2,
  "failed": 0,
  "deactivated": 0,
  "products": [
    { "printfulProductId": 485566101, "name": "…", "ok": true, "variants": 12 }
  ]
}
```

Each Sync Variant becomes a `ProductVariant` row with:

- `printfulVariantId` — the sync variant id sent when creating an order
- `catalogVariantId` — the blank catalog variant id used for shipping quotes
- `size`, `color`, `price`, `currency`, `image`, `sku`, `inStock`

Variants that disappear from Printful are marked `isActive = false` instead of
being deleted, so historical orders keep their snapshot.

Sync a single product:

```bash
curl -X POST http://localhost:3000/api/printful/sync/485566101 \
  -H "x-admin-token: $ADMIN_TOKEN"
```

## 3. Register webhooks

Printful only accepts a public **HTTPS** URL; `http://` and `localhost` are
rejected. For local development use a tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
# or: ngrok http 3000
```

Set `PUBLIC_SITE_URL` to the tunnel origin, then register both webhook sets.

### Production (CLI)

The CLI talks to Printful directly, so it does not need a running Nuxt server
or `ADMIN_TOKEN`:

```bash
# Uses PUBLIC_SITE_URL and appends /api/webhooks/printful
PUBLIC_SITE_URL="https://shop.example.com" bun run printful:webhooks register

# Inspect the registered configuration and stored secrets
bun run printful:webhooks status

# Remove both Printful configurations and the local secrets
bun run printful:webhooks delete
```

You can also pass the origin (or the full listener URL) as an argument:

```bash
bun run printful:webhooks register https://shop.example.com
```

Run this once after the production database is migrated and the app is
reachable at its final domain. Re-run it whenever the domain changes or
Printful reports a signature mismatch.

### Alternative (admin API)

With the server running and `ADMIN_TOKEN` set:

```bash
curl -X POST http://localhost:3000/api/printful/webhooks \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"url":"https://abc123.trycloudflare.com/api/webhooks/printful"}'
```

Both entry points use `server/utils/printful-webhooks.ts` and:

1. Register v1 product webhooks at
   `…/api/webhooks/printful?v=1&secret=<random>`.
2. Register v2 order/shipment webhooks at the plain URL.
3. Store the v2 signing secret, the v2 public key and the v1 query secret in
   `AppSetting`.

Inspect or remove the registration through the API:

```bash
curl http://localhost:3000/api/printful/webhooks -H "x-admin-token: $ADMIN_TOKEN"
curl -X DELETE http://localhost:3000/api/printful/webhooks -H "x-admin-token: $ADMIN_TOKEN"
```

### How the receiver validates requests

`POST /api/webhooks/printful` handles both versions:

- **v1** requests have no signature. The receiver compares `?secret=` with
  `printful_webhook_query_secret` (or `PRINTFUL_WEBHOOK_SECRET`).
- **v2** requests carry `x-pf-webhook-signature`, a hex HMAC-SHA256 of the raw
  body. The stored secret is hex, so it is hex-decoded before use.

Every delivery is stored in `WebhookEvent` with a `received` → `processed` /
`ignored` / `failed` status, which makes debugging and replaying easy.

In production the receiver returns `503` when the relevant secret is missing
rather than accepting unsigned events. In development unsigned v1 events are
accepted so the webhook simulator works without a tunnel.

### Product events

| Event | Action |
| --- | --- |
| `product_synced` | Re-fetch and upsert the full product + variants. |
| `product_updated` | Same as above. |
| `product_deleted` | Mark the product and its variants inactive. |
| `stock_updated` | Re-enable the product's variants, then mark the listed catalog variant ids out of stock. |

v1 product payloads only contain a summary (`data.sync_product.id`), so the
handler re-fetches the full product from Printful. `stock_updated` carries
`data.product_id` plus `variant_stock.out` / `variant_stock.discontinued`,
which are **catalog** variant ids; variants that are not listed are treated as
in stock. Because catalog stock is shared by every product that uses the same
blank, the unavailable ids are applied across the catalog.

### Order and shipment events

`order_created`, `order_updated`, `order_failed`, `order_canceled`,
`order_put_hold`, `order_put_hold_approval`, `order_remove_hold`,
`order_refunded`, `shipment_sent`, `shipment_delivered`, `shipment_returned`,
`shipment_out_of_stock` and `shipment_canceled` are applied to the local order.
The handler also records an `OrderEvent` for each one.

Because v2 payloads only contain an order summary, the handler fetches the full
order with `GET /orders/{id}`. Shipment-specific fields (tracking number, URL,
delivered date) are applied on top.

### Assumptions

- v1 stays in use for Sync Products and product webhooks because v2 does not
  expose sync products or equivalent product events.
- v2 stays in use for order/shipment webhooks and shipping rates because those
  events are signed and include shipment updates that v1 lacks.
- Webhooks are the primary update path; the admin sync endpoint remains as a
  manual repair/replay tool.
- Deletions and removed variants are soft-deactivated, never hard-deleted, so
  historical orders keep their snapshots.

## 4. Storefront product API

`GET /api/products` and `GET /api/products/{id}` return active products only,
with the shape below. `GET /api/products` accepts `q`, `sort` (`featured`,
`price-asc`, `price-desc`, `name`) and `limit` (max 100).

See `docs/storefront.md` for how the pages consume this data.

```json
{
  "id": "…",
  "name": "Doodle Tee",
  "price": 32,
  "currency": "USD",
  "images": ["…"],
  "thumbnailUrl": "…",
  "sizes": ["S", "M", "L"],
  "variants": [
    {
      "id": "white",
      "name": "White",
      "colors": ["#ffffff"],
      "sizes": ["S", "M", "L"],
      "price": 32,
      "inStock": true
    }
  ],
  "options": [
    {
      "id": "cm…",
      "name": "Doodle Tee / White / M",
      "size": "M",
      "color": "White",
      "price": 32,
      "currency": "USD",
      "inStock": true
    }
  ]
}
```

- `variants` are grouped by colour for swatches.
- `options` is the flat list of purchasable combinations. Send an option's
  `id` as `items[].variantId` when creating an order.

## 5. Shipping availability and rates

List the countries Printful ships to (cached for one hour):

```bash
curl "http://localhost:3000/api/shipping/countries?includeStates=true"
```

Quote a cart. Only `country_code` is required; `state_code` is required for
`US`, `CA` and `AU`:

```bash
curl -X POST http://localhost:3000/api/shipping/rates \
  -H "content-type: application/json" \
  -d '{
    "recipient": { "country_code": "US", "state_code": "CA", "zip": "90210" },
    "items": [{ "variantId": "cm…", "quantity": 1 }]
  }'
```

Response:

```json
{
  "available": true,
  "country": { "code": "US", "name": "United States" },
  "currency": "USD",
  "rates": [
    {
      "id": "STANDARD",
      "name": "Flat Rate",
      "rate": 4.75,
      "currency": "USD",
      "minDeliveryDays": 3,
      "maxDeliveryDays": 7,
      "minDeliveryDate": "2026-10-30",
      "maxDeliveryDate": "2026-11-03",
      "customsFeesPossible": false
    }
  ],
  "customsFeesPossible": false
}
```

`available: false` means Printful returned no rates (or rejected the address)
for those items, i.e. the destination is not serviceable.

## 6. Orders

### Create an order

`POST /api/orders` is the public checkout endpoint. Prices always come from the
database; the client only sends variant ids and quantities.

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "content-type: application/json" \
  -d '{
    "email": "buyer@example.com",
    "recipient": {
      "name": "Ada Lovelace",
      "address1": "1 Analytical Engine Way",
      "city": "Los Angeles",
      "state_code": "CA",
      "country_code": "US",
      "zip": "90210",
      "email": "buyer@example.com"
    },
    "items": [{ "variantId": "cm…", "quantity": 1 }],
    "shippingMethod": "STANDARD"
  }'
```

The endpoint always quotes Printful live and uses the rate matching
`shippingMethod` (or the first available rate). The order is created locally
with `status: "pending"` and a `DOT-…` order number.

Add `"submit": true` to immediately create the Printful **draft** order. A
draft is not charged or produced.

### Admin endpoints

All of these require `x-admin-token` (or a Bearer token):

| Method + path | Purpose |
| --- | --- |
| `GET /api/orders?status=&email=&limit=&offset=` | List orders. |
| `GET /api/orders/{id}` | Order details; add `?refresh=true` to pull from Printful. |
| `POST /api/orders/{id}/submit` | Create the Printful draft order. |
| `POST /api/orders/{id}/confirm` | Confirm the draft for fulfillment (**charges the store**). |
| `POST /api/orders/{id}/sync` | Refresh status/tracking from Printful. |
| `POST /api/orders/{id}/cancel` | Cancel locally or in Printful. |

Typical flow:

```bash
# 1. Create locally and submit as a draft
curl -X POST http://localhost:3000/api/orders \
  -H "content-type: application/json" \
  -d '{ ..., "submit": true }'

# 2. Once payment is captured, confirm fulfillment
curl -X POST http://localhost:3000/api/orders/cm…/confirm \
  -H "x-admin-token: $ADMIN_TOKEN"
```

> **Important:** do not call `confirm` before payment is captured. Confirming
> submits the order to production and charges the Printful account.

### Public tracking

`POST /api/orders/track` requires the order number **and** the checkout email.
It refreshes from Printful when the order is still in flight, then returns the
local snapshot. A wrong email returns `404`, so order numbers cannot be probed.

```bash
curl -X POST http://localhost:3000/api/orders/track \
  -H "content-type: application/json" \
  -d '{ "orderNumber": "DOT-…", "email": "buyer@example.com" }'
```

The storefront page at `/track` uses this endpoint.

## 7. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `PRINTFUL_KEY is not configured` | Missing/empty env var; restart the dev server. |
| Printful returns 404 for a product | Wrong store: set `PRINTFUL_STORE_ID`. |
| Webhook registration says HTTPS is required | Use a tunnel and set `PUBLIC_SITE_URL`. |
| v2 webhooks return 401 | The stored `printful_webhook_secret` does not match the registration. Re-register the webhooks. |
| Webhooks return 503 in production | No signing/query secret is stored. Register the webhooks (or set `PRINTFUL_WEBHOOK_SECRET` as a fallback). |
| `external_id` rejected | Printful limits it to ~32 characters. Generated `DOT-…` ids are safe; do not replace them with long UUIDs. |
| Shipping quote is `available: false` | The destination is not serviceable for those items, or a required state is missing. |
| Order stuck in `pending` | It has only been created locally. Call `/submit` to create the Printful draft. |

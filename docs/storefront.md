# Storefront data flow

Status: **current implementation** — 2026-11-11 (phase 5 cents + `ProductImage`, server cart)
Audience: anyone changing the home page, catalog, product page, cart or the
product API.

This document describes how Printful products reach the storefront. The
database schema itself is documented in `docs/database.md`; where the two
documents disagree, `docs/database.md` wins for schema and this file wins for
storefront behaviour.

## 1. Pipeline

```
Printful Sync Product
        │  (v1 webhook, or manual sync)
        ▼
server/api/webhooks/printful.post.ts
        │  re-fetches the full product
        ▼
server/utils/printful-sync.ts        → Product + ProductVariant + ProductImage rows
        ▼
server/utils/products.ts             → Product / ApparelVariant / ProductOption
        ▼
GET /api/products, GET /api/products/{id}
        ▼
app/pages/index.vue, explore.vue, products/[id].vue
```

- The storefront **never calls Printful directly**. It only reads the local
  product tables through the API.
- `Product.status = "archived"` and `ProductVariant.isActive = false` rows are
  filtered out of both API endpoints. Deletions are soft so historical orders
  keep their snapshots. Only `status = "active"` products can be added to a
  cart or ordered.
- Webhooks are the normal update path. `POST /api/printful/sync` remains a
  manual repair tool. See `docs/printful.md`.

## 2. API shapes

`GET /api/products` (list) and `GET /api/products/{id}` (detail) return the
same object:

| Field | Meaning |
| --- | --- |
| `id` | Local product id, used in `/products/{id}`. |
| `slug` | Stable URL slug. `GET /api/products/{id}` also accepts the slug. |
| `status` | `active` (only active products are returned), `draft`, `archived`. |
| `printfulProductId` | Printful sync product id. |
| `name`, `description` | Product copy. Description comes from the Printful catalog product. |
| `price` | Lowest active variant price in **major units** (for display). |
| `priceCents` | The same value in integer cents; use this for arithmetic. |
| `compareAtPriceCents` | Optional strike-through/original price in cents. |
| `currency` | Product currency. |
| `images` | Ordered image URLs from the `ProductImage` relation. |
| `thumbnailUrl` | Printful thumbnail, or the first image. |
| `sizes` | Every active size across colours, sorted XS → 5XL. |
| `variants` | One entry per **colour**, for swatches and colour selection. |
| `options` | One entry per **purchasable colour + size combination**. |

`variants` (colour groups) contain `name`, `colors` (hex swatches), `sizes`,
lowest `price`/`priceCents`, `currency`, a representative `image`, and
`inStock`.

`options` (flat combinations) contain the local variant `id` that must be sent
to `POST /api/cart/items` as `variantId`, plus `size`, `color`, `price`,
`priceCents`, `compareAtPriceCents`, `currency`, `image`, `inStock` and `sku`.

`GET /api/products` query parameters:

- `q` — case-insensitive substring match on name/description.
- `sort` — `featured` (newest first, default), `price-asc`, `price-desc`,
  `name`.
- `limit` — 1–100; used by the home page for its three featured products.

## 3. Page behaviour

### Home (`app/pages/index.vue`)

- Fetches `/api/products?limit=3` with `useFetch`.
- The hero showcase uses the first product's image and colour, and links to
  its detail page. It falls back to the sketch icon while loading or when the
  catalog is empty.
- The "Staff Pick Doodles" grid renders `GalleryProductCard` for the same
  three products.
- Loading skeletons, an error + retry state and an empty state are handled
  without mock data.

### Explore (`app/pages/explore.vue`)

- Fetches the full catalog and filters/sorts client-side.
- Renders `Gallery/MainGallery.vue` → `Gallery/ProductCard.vue`.

### Product card (`app/components/Gallery/ProductCard.vue`)

- Image: `thumbnailUrl` → `images[0]` → icon fallback on load error.
- Price: `formatPrice(product.price, product.currency)`.
- Colour: up to five swatches from `product.variants[].colors`, with the
  colour count (or the single colour name) beside them.
- Sizes: first four sizes, with `+N` when there are more.
- Sold-out badge when no option and no colour group is in stock.

### Product detail (`app/pages/products/[id].vue`)

- Colour buttons come from `variants`; the first in-stock colour is selected
  initially.
- Size buttons come from the selected colour's `sizes`. A size is **disabled
  and struck through** when no `option` for that colour + size is in stock.
  Selecting a colour moves the selection to the first available size.
- Gallery order: selected option image → selected colour image → remaining
  `product.images` → thumbnail. The carousel is keyed by colour so switching
  colours starts on that colour's artwork.
- Price and currency come from the selected `option`, falling back to the
  product. `formatPrice` takes major units; convert from `priceCents` when the
  value comes from an order/cart response. It falls back to USD if a currency
  code is invalid.
- "Add to cart" sends `option.id` to `POST /api/cart/items` and updates the
  shared cart state; it is disabled when the selected combination is out of
  stock.

## 4. Cart, checkout and the product API

- `useCart()` is the only client entry point for cart data. It keeps a shared
  `cart` ref, refreshes after every mutation and exposes `itemCount` for the
  header badge.
- `CartView.items[]` carries `unitPriceCents`, `lineTotalCents`, `currency` and
  an `available` flag. Unavailable lines stay visible but are excluded from
  `totals.subtotalCents` and block checkout.
- `/checkout` posts the recipient + email to `POST /api/checkout`. The server
  re-prices the cart, creates the order, snapshots `OrderAddress`, then asks the
  payment provider for a hosted checkout URL. With `PAYMENT_PROVIDER=manual`
  no redirect is returned; an admin settles the order with
  `POST /api/orders/{id}/mark-paid`.
- Order tracking is `POST /api/orders/track` with `orderNumber` + `email`.
  Logged-in customers see their own orders at `GET /api/orders`.

## 5. Assumptions

- **The product tables are the storefront source of truth.** A webhook or sync
  must run before new Printful products appear.
- **One product has one currency.** Prices are displayed per product/option.
  Checkout rejects mixed-currency carts with `409`.
- **Colour identity is the slugified colour name.** `variants[].id` is a slug
  (for example `white`), not a database id. Only `options[].id` is a real
  variant id.
- **Images are Printful-hosted URLs.** They are not downloaded or resized; the
  UI relies on `object-cover` and lazy loading. They are stored in the
  `ProductImage` relation and replaced wholesale on each Printful sync.
- **Money is stored in integer cents.** The catalog/order APIs keep major-unit
  `price`/`totals` for display and add `priceCents`/`totalsCents` for exact
  arithmetic. Cart and checkout always use cents; never do floating-point math
  on `price`.
- **Sold-out means not purchasable.** A colour group is shown as sold out when
  none of its variants are in stock; a size is disabled when that exact
  colour + size is unavailable.
- **The cart is server-side.** `useCart()` talks to `GET /api/cart`,
  `POST /api/cart/items`, `PATCH/DELETE /api/cart/items/{id}`. Guests get an
  httpOnly `cart_token` cookie, which is merged into the user cart on login.
  `app/pages/cart.vue` and `/checkout` render that cart; there is no demo cart
  data. Prices are re-read from the variant on every response, so a stale
  client price is never trusted.
- **Unlisted stock variants are in stock.** The v1 `stock_updated` payload only
  lists out/discontinued catalog variants, so everything else is re-enabled
  for the affected product before the listed ids are marked unavailable.

## 6. Verifying changes

```bash
bun run typecheck
bun run build

# With the dev server running:
curl "http://localhost:3000/api/products?limit=3"
curl http://localhost:3000/api/products/<local-id-or-slug>
curl -c cookies.txt http://localhost:3000/api/cart
curl -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/cart/items \
  -H "content-type: application/json" -d '{"variantId":"<option-id>","quantity":1}'
```

Check that:

1. New Printful products appear after the webhook or a manual sync.
2. The home page hero and grid show real names, images and prices.
3. Colour switches change the gallery image.
4. Sold-out colour + size combinations are disabled.
5. Prices are formatted from cents and use the product currency.
6. Adding/updating/removing a cart line returns refreshed cents totals.

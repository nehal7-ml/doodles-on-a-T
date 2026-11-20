# Storefront data flow

Status: **current implementation** — 2026-11-20 (Printful removed: static demo catalogue + local demo shipping), previously 2026-11-16 (phase 5 cents + `ProductImage`, server cart, slug product URLs)
Audience: anyone changing the home page, catalog, product page, cart or the
product API.

This document describes how the demo catalogue reaches the storefront and how
checkout quotes shipping. The database schema itself is documented in
`docs/database.md`; where the two documents disagree, `docs/database.md` wins
for schema and this file wins for storefront behaviour.

## 1. Pipeline

```
app/testData/products.json  (bun run db:seed with SEED_PRODUCTS=true)
        │
        ▼
Product + ProductVariant + ProductImage rows
        ▼
server/utils/products.ts             → Product / ApparelVariant / ProductOption
        ▼
GET /api/products, GET /api/products/{slug}
        ▼
app/pages/index.vue, explore.vue, products/[slug].vue
```

- The catalogue is **static demo data**. There is no fulfilment or product
  API in the loop: nothing in this repo calls Printful (or any other
  provider), and no order is ever placed with a printer.
- `Product.status = "archived"` and `ProductVariant.isActive = false` rows are
  filtered out of both API endpoints. Deletions are soft so historical orders
  keep their snapshots. Only `status = "active"` products can be added to a
  cart or ordered.
- Shipping is served locally too: `GET /api/shipping/countries` returns a
  built-in country list and `POST /api/shipping/rates` quotes two flat demo
  rates (Standard $4.99, Express $12.99) after re-validating the cart
  server-side. `server/utils/shipping.ts` is the single module to replace when
  a real carrier/fulfilment provider is wired up — the API shape it returns is
  what the checkout consumes.

## 2. API shapes

`GET /api/products` (list) and `GET /api/products/{slug}` (detail) return the
same object:

| Field | Meaning |
| --- | --- |
| `id` | Local product id (cuid). Not used in storefront URLs. |
| `slug` | Readable URL slug, used in `/products/{slug}`. The detail endpoint accepts the slug **or** the id. |
| `status` | `active` (only active products are returned), `draft`, `archived`. |
| `printfulProductId` | Legacy Printful sync product id (always `null` for new demo data; kept for old rows). |
| `name`, `description` | Product copy from the seeded catalogue. |
| `price` | Lowest active variant price in **major units** (for display). |
| `priceCents` | The same value in integer cents; use this for arithmetic. |
| `compareAtPriceCents` | Optional strike-through/original price in cents. |
| `currency` | Product currency. |
| `images` | Ordered image URLs from the `ProductImage` relation. |
| `thumbnailUrl` | Legacy thumbnail field, or the first image. |
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

### Product detail (`app/pages/products/[slug].vue`)

- The URL is the product **slug** (`/products/short-sleeve-unisex-t-shirt`).
  Old id-based links are fetched by id and then **301-redirected** to the
  canonical slug, so only one URL per product is indexed. The page emits a
  canonical `<link>`, `description`, Open Graph (`og:title`, `og:description`,
  `og:type=product`, `og:url`, `og:image`) and Twitter card tags.
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
- `/checkout` loads the country dropdown from `GET /api/shipping/countries` and
  the shipping estimate from `POST /api/shipping/rates` (both local demo data,
  see §1). The server re-quotes the rate on checkout, so a client can never
  invent a shipping price. Orders are created locally only — there is no
  submit/confirm/sync step and nothing leaves the machine.

## 5. Assumptions

- **The product tables are the storefront source of truth.** They are seeded
  from `app/testData/products.json` and updated thereafter through the CSV
  import (`docs/products-csv.md`); there is no live product feed.
- **One product has one currency.** Prices are displayed per product/option.
  Checkout rejects mixed-currency carts with `409`.
- **Colour identity is the slugified colour name.** `variants[].id` is a slug
  (for example `white`), not a database id. Only `options[].id` is a real
  variant id. The same slug is the shareable `?color=` product URL parameter
  and the cart line's `colorSlug` — all three come from
  `colorGroupKey()` in `server/utils/products.ts`.
- **Images are external URLs.** They are not downloaded or resized; the
  UI relies on `object-cover` and lazy loading. They are stored in the
  `ProductImage` relation and replaced wholesale when the catalogue is
  re-seeded.
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
- **Shareable variant URLs.** The product page mirrors the selection into the
  query string as `?color=<colour-group-slug>&size=<M>` (`color` equals the
  API's `variants[].id`, e.g. `white`; `size` matches case-insensitively), so
  any colour/size combination can be copied from the address bar and shared.
  The write-back is client-only, uses `router.replace` (no history entries),
  keeps unrelated parameters and is value-compared so it cannot loop. Older
  links carrying `?variant=<optionId>` still work: they are resolved to a
  colour + size, then normalised to the readable form (the opaque parameter
  is dropped). Cart lines link with the readable form — each serialized line
  carries `colorSlug` and `CartTable` builds
  `/products/{slug}?color={colorSlug}&size={size}`.
- **One line per variant, not per product.** The unique key is
  `(cartId, variantId)`, so adding the same product in two colours/sizes
  creates two labelled lines, while adding the same variant twice bumps the
  quantity of the existing line (capped at 99). Each serialized line carries
  `productSlug` + `colorSlug`, and `CartTable` links the image and name to
  `/products/{slug}?color={colorSlug}&size={size}` — the product page reads
  the query parameters and preselects the exact colour + size, so a shopper
  can jump back from the cart and immediately pick a *different* variant.
  The product page also shows green "in cart" badges on the colour/size
  buttons and a note under **Add to cart** when the selected variant is
  already in the cart.

## 6. Verifying changes

```bash
bun run typecheck
bun run build

# With the dev server running:
curl "http://localhost:3000/api/products?limit=3"
curl http://localhost:3000/api/products/<local-id-or-slug>
curl -sI http://localhost:3000/products/<local-id>   # 301 -> /products/<slug>
curl -s http://localhost:3000/products/<slug> | grep -o 'rel="canonical" [^>]*'
curl -c cookies.txt http://localhost:3000/api/cart
curl -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/cart/items \
  -H "content-type: application/json" -d '{"variantId":"<option-id>","quantity":1}'
```

Check that:

1. The home page hero and grid show real names, images and prices.
2. `GET /api/shipping/countries` returns the static list and
   `POST /api/shipping/rates` (with a recipient + items) returns
   `STANDARD`/`EXPRESS` demo rates; `/api/printful/*` no longer exists (404).
3. Colour switches change the gallery image.
4. Sold-out colour + size combinations are disabled.
5. Prices are formatted from cents and use the product currency.
6. Adding/updating/removing a cart line returns refreshed cents totals.
7. Card links are `/products/<slug>`, an id URL answers `301` with the slug
   `Location`, and the product page emits canonical + Open Graph tags.
8. Adding one product in two different variants produces two labelled cart
   lines, adding the same variant again bumps its quantity, and each cart line
   links to `/products/<slug>?color=<group>&size=<size>` which opens the
   product page with that colour + size already selected; changing the colour
   or size on the page updates the same query parameters in the address bar
   so the URL can be copied and shared, and a legacy `?variant=<optionId>`
   link still preselects (then normalises to the readable form).

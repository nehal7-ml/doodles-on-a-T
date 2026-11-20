# Product catalogue CSV import

The demo catalogue lives in the database, and this import is the supported way
to add or update products without touching code or running the destructive
JSON seeder. One CSV row describes one variant; product-level columns repeat
on the product's rows. Two triggers share the same logic:

- **CLI** — `bun run products:import` (add `-- --dry-run` to validate only)
- **HTTP** — `POST /api/admin/products/import` (admin session or `ADMIN_TOKEN`)

Both read the CSV itself from the **`PRODUCTS_CSV`** environment variable — a
local path (relative to the working directory) or an `http(s)` URL (Vercel
Blob storage, a raw GitHub file, a Google Drive direct link). The file is
never uploaded to the endpoint; edit it wherever it lives, then re-trigger
the import.

Implementation: `server/utils/products-csv.ts` (shared logic),
`scripts/import-products.ts` (CLI), `server/api/admin/products/import.post.ts`
(endpoint). A complete example matching the seeded catalogue is committed at
[`app/testData/products.csv`](../app/testData/products.csv).

## Column reference

| Column           | Level   | Required | Default   | Notes                                                          |
| ---------------- | ------- | -------- | --------- | -------------------------------------------------------------- |
| `slug`           | product | no       | slugified `name` | Identity key. Two different names must not slugify alike. |
| `name`           | product | **yes**  | —         | Display name. Must be identical on every row of the product.   |
| `description`    | product | no       | `""`      | May contain line breaks (quote the cell).                      |
| `status`         | product | no       | `active`  | `draft` \| `active` \| `archived`.                             |
| `compare_at_price` | product | no     | none      | Dollars, ≤ 2 decimals. Product-level only.                     |
| `thumbnail`      | product | no       | none      | `http(s)://…` or `/path`.                                      |
| `images`         | product | no       | none      | `\|`-separated URLs; **replaces the whole image list**.        |
| `color`          | variant | no       | none      | Colour label; defines the colour group and `?color=` URLs.     |
| `size`           | variant | no       | none      | e.g. `M`.                                                      |
| `price`          | variant | **yes**  | —         | Dollars > 0, ≤ 2 decimals (e.g. `19.99`). USD only.            |
| `sku`            | variant | no       | none      |                                                                |
| `in_stock`       | variant | no       | `true`    | `true`/`false` (`yes`/`no`/`1`/`0` also accepted).             |
| `active`         | variant | no       | `true`    | `false` hides the variant from the storefront.                 |
| `variant_image`  | variant | no       | none      | Per-variant image shown in the gallery/swatch.                 |
| `colors`         | variant | no       | none      | `\|`-separated hex swatches, e.g. `#1d4ed8\|#000000`.          |

Unknown columns are rejected (they are almost always typos), as are a missing
`name`/`price` header. Column order does not matter.

### Format rules

- **One row per variant.** A product with 2 colours × 3 sizes has 6 rows.
  Product columns only need to be filled in on one row, but if they are
  repeated they must agree exactly — conflicting values are an error.
- Rows are RFC 4180 CSV: quote cells that contain commas or line breaks,
  double quotes inside a quoted cell (`""`). A UTF-8 BOM is tolerated.
- Lists (`images`, `colors`) use the pipe character `|`, never commas, so
  URLs with query strings stay safe.
- Error messages reference **row numbers** that count the header as row 1.
- Limits: 5 MB per file, 30 s fetch timeout for URL sources.

## Import semantics

- **Validate first, write never-partial.** Every row is checked before any
  database write; a single bad row aborts the whole import with a list of
  row-numbered problems (HTTP 422 / CLI exit code 1). Re-run after fixing.
- **Upsert by `slug`.** Unknown slug → product created; known slug → product
  updated. Variants are matched by `(color, size)`, with a name fallback so
  older rows (colour stored in `name`, `color` null) update in place instead
  of duplicating.
- **Products absent from the file are left alone.** The import never deletes
  products, so the file only needs to list what you want to change — safe to
  re-run, safe to split into several CSVs.
- **Variants of a listed product that are missing from the file are
  deactivated** (`isActive = false`), not deleted: they disappear from the
  storefront, existing order history keeps its snapshots, and a cart holding
  one reports it as unavailable instead of silently re-pricing. Re-adding the
  row reactivates it.
- **Images are replaced wholesale** for listed products (order = column
  order); an identical list is skipped. `thumbnail` falls back to the first
  image at render time.
- **`priceCents` on the product is derived** as the minimum price of its
  active variants, matching the schema comment; the storefront re-derives
  displayed prices the same way.
- **Empty optional column = its default**, every run: an empty `description`
  clears the description, an empty `status` means `active`, an empty `images`
  clears the gallery. The file is the source of truth for what it lists.
- Every real (non-dry-run) import writes one `AuditLog` row
  (`action = "products.import"`, actor = admin user id or `null` for the
  token path).

### Dry run

`--dry-run` (CLI) or `{"dryRun": true}` (endpoint) parses and validates the
file and reports exactly what would happen — created/updated product slugs,
variant counts, image rows — **without writing anything**. Use it after every
edit to a non-trivial CSV.

## CLI

```bash
# PRODUCTS_CSV points at app/testData/products.csv (local path or URL)
bun run products:import
bun run products:import -- --dry-run     # validate + report only

# One-off source, ignoring PRODUCTS_CSV
bun scripts/import-products.ts --file ../shared/tee-catalogue.csv
bun scripts/import-products.ts --file https://example.com/products.csv --dry-run
```

The script loads `.env`, `.env.development` and `.env.local` in that order,
so locally it targets whatever `DATABASE_URL` resolves to (in this repo's
setup: the Turso production database).

Sample output:

```
Import complete. Source: app/testData/products.csv
  records:  55
  products: 1 created (smoke-test-tee), 5 updated
  variants: 4 created, 51 updated, 0 deactivated
  images:   4 written
```

## HTTP endpoint

`POST /api/admin/products/import` — admin **session** (Auth.js cookie, plus
the usual same-origin CSRF check) or machine callers sending
`x-admin-token: $ADMIN_TOKEN`. A signed-in non-admin is rejected; there is no
anonymous path.

```bash
curl -X POST https://your-host/api/admin/products/import \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"dryRun": true}'
```

| Outcome                | Status | Body                                        |
| ---------------------- | ------ | ------------------------------------------- |
| Imported (or dry run)  | 200    | the report shown below                      |
| `PRODUCTS_CSV` unset/unreadable | 400 | `{ statusCode, statusMessage, data.message }` |
| CSV validation failed  | 422    | the report with `errors: [{ row, message }]` |
| No/bad credentials     | 401/403 | —                                          |

```json
{
  "source": "https://…/products.csv",
  "dryRun": false,
  "records": 55,
  "products": { "created": [], "updated": ["classic-cotton-t-shirt"] },
  "variants": { "created": 0, "updated": 2, "deactivated": 0 },
  "images": 0,
  "warnings": []
}
```

On production (Vercel) set `PRODUCTS_CSV` in the project environment —
Nitro does not read `.env*` files at runtime.

## Example

```csv
slug,name,description,status,compare_at_price,thumbnail,images,color,size,price,sku,in_stock,active,variant_image,colors
doodle-tee,Doodle Tee,"A soft tee with a hand-drawn doodle.",active,,,https://cdn.example.com/tee-1.png|https://cdn.example.com/tee-2.png,Black,M,24.99,DT-BLK-M,true,true,,#000000
doodle-tee,Doodle Tee,"A soft tee with a hand-drawn doodle.",active,,,https://cdn.example.com/tee-1.png|https://cdn.example.com/tee-2.png,Black,L,24.99,DT-BLK-L,true,true,,#000000
doodle-tee,Doodle Tee,"A soft tee with a hand-drawn doodle.",active,,,https://cdn.example.com/tee-1.png|https://cdn.example.com/tee-2.png,Sand,M,24.99,DT-SND-M,true,true,,#d9c6a5
```

Three rows → one product, two colour groups (`black`, `sand`), sizes `M`/`L`,
product price $24.99 (min active variant price).

## Limits

- USD only, integer cents internally; no currency column.
- Product-level `compare_at_price` only (no per-variant compare-at).
- No category assignment — categories are not part of the demo scope.
- The JSON seeder (`bun run db:seed` with `SEED_PRODUCTS=true`) remains the
  way to reset the whole catalogue; it is destructive and unrelated to this
  import.

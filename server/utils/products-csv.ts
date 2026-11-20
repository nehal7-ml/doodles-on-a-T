/**
 * CSV catalogue import — one row per variant.
 *
 * The CSV is the source of truth for every product it lists: product columns
 * are written on every run (empty optional columns take their defaults),
 * variants missing from a listed product are deactivated and product images
 * are replaced wholesale. Products that do not appear in the file are never
 * touched, so the import is safe to re-run.
 *
 * Two triggers share this module:
 *   - `bun run products:import`          (scripts/import-products.ts)
 *   - `POST /api/admin/products/import`  (ADMIN_TOKEN or admin session)
 *
 * Both read their source from PRODUCTS_CSV — a local path or an http(s) URL.
 * The column reference lives in docs/products-csv.md.
 */
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { prisma } from "./prisma";
import { slugify } from "./products";

/** Columns understood by the importer, in the documented CSV order. */
export const CSV_COLUMNS = [
  "slug",
  "name",
  "description",
  "status",
  "compare_at_price",
  "thumbnail",
  "images",
  "color",
  "size",
  "price",
  "sku",
  "in_stock",
  "active",
  "variant_image",
  "colors",
] as const;

/** Product-level columns: they describe the product, not one variant row. */
const PRODUCT_RAW_COLUMNS = [
  "description",
  "status",
  "compare_at_price",
  "thumbnail",
  "images",
] as const;

type ProductRawColumn = (typeof PRODUCT_RAW_COLUMNS)[number];

const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const TRUE_TOKENS = new Set(["true", "yes", "y", "1"]);
const FALSE_TOKENS = new Set(["false", "no", "n", "0"]);
const MAX_CSV_BYTES = 5 * 1024 * 1024;

export type CsvImportError = { row: number; message: string };

export type ImportReport = {
  source: string;
  dryRun: boolean;
  /** Number of data records (variant rows) read from the CSV. */
  records: number;
  products: { created: string[]; updated: string[] };
  variants: { created: number; updated: number; deactivated: number };
  /** Product image rows written (0 when images were already identical). */
  images: number;
  errors?: CsvImportError[];
  warnings?: string[];
};

type ParsedVariant = {
  row: number;
  color: string | null;
  size: string | null;
  priceCents: number;
  sku: string | null;
  inStock: boolean;
  isActive: boolean;
  image: string | null;
  colors: string[];
};

type ParsedProduct = {
  slug: string;
  name: string;
  description: string;
  status: string;
  compareAtPriceCents: number | null;
  thumbnailUrl: string | null;
  images: string[];
  variants: ParsedVariant[];
};

type ProductDraft = {
  slug: string;
  row: number;
  name: string;
  raw: Partial<Record<ProductRawColumn, string>>;
  variants: ParsedVariant[];
};

type ParsedCatalog = {
  products: ParsedProduct[];
  errors: CsvImportError[];
  records: number;
};

type VariantWrite = {
  existingId: string | null;
  data: {
    name: string;
    color: string | null;
    size: string | null;
    colors: string;
    priceCents: number;
    image: string | null;
    sku: string | null;
    inStock: boolean;
    isActive: boolean;
  };
};

// ---------------------------------------------------------------------------
// CSV parsing helpers
// ---------------------------------------------------------------------------

/** RFC 4180-ish: quoted fields, escaped quotes, CRLF or LF, BOM tolerated. */
function parseCsvRows(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (quoted || field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parsePriceCents(value: string): number | null {
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number.parseFloat(value) * 100);
  return Number.isFinite(cents) ? cents : null;
}

function parseBoolToken(value: string): boolean | null {
  if (TRUE_TOKENS.has(value)) return true;
  if (FALSE_TOKENS.has(value)) return false;
  return null;
}

function isAssetPath(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value) || value.startsWith("/");
}

function splitList(value: string): string[] {
  return value
    .split("|")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Display name of one variant row. Colourless rows fall back to the product
 * name so a size-only product keeps a single colour group; colour rows use
 * the colour (plus size) exactly as the storefront groups them.
 */
function variantName(
  row: Pick<ParsedVariant, "color" | "size">,
  product: Pick<ParsedProduct, "name">,
): string {
  if (row.color && row.size) return `${row.color} / ${row.size}`;
  if (row.color) return row.color;
  return product.name;
}

function truncate(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function sortErrors(errors: CsvImportError[]): CsvImportError[] {
  return errors.slice().sort((a, b) => a.row - b.row);
}

// ---------------------------------------------------------------------------
// Parse + validate
// ---------------------------------------------------------------------------

function parseCatalog(text: string): ParsedCatalog {
  const errors: CsvImportError[] = [];
  const rows = parseCsvRows(text);

  const headerRow = rows[0] ?? [];
  if (headerRow.every((cell) => cell.trim() === "")) {
    return {
      products: [],
      errors: [{ row: 1, message: "CSV is empty — a header row is required." }],
      records: 0,
    };
  }

  const headerCells = headerRow.map((cell) => cell.trim().toLowerCase());
  const headerIndex = new Map<string, number>();
  headerCells.forEach((cell, index) => {
    if (!cell) return;
    if (headerIndex.has(cell)) {
      errors.push({ row: 1, message: `duplicate header column "${cell}".` });
      return;
    }
    headerIndex.set(cell, index);
  });

  for (const required of ["name", "price"]) {
    if (!headerIndex.has(required)) {
      errors.push({
        row: 1,
        message: `missing required column "${required}". Supported columns: ${CSV_COLUMNS.join(", ")}.`,
      });
    }
  }
  for (const column of headerIndex.keys()) {
    if (!(CSV_COLUMNS as readonly string[]).includes(column)) {
      errors.push({
        row: 1,
        message: `unknown column "${column}". Supported columns: ${CSV_COLUMNS.join(", ")}.`,
      });
    }
  }
  if (errors.length > 0) {
    return { products: [], errors: sortErrors(errors), records: 0 };
  }

  const drafts = new Map<string, ProductDraft>();
  let records = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const record = rows[index] ?? [];
    const row = index + 1;
    if (record.every((cell) => cell.trim() === "")) continue;
    records += 1;

    const get = (column: string): string => {
      const position = headerIndex.get(column);
      if (position === undefined) return "";
      return (record[position] ?? "").trim();
    };

    if (
      record.length > headerCells.length &&
      record.slice(headerCells.length).some((cell) => cell.trim() !== "")
    ) {
      errors.push({
        row,
        message: `has ${record.length} columns but the header declares ${headerCells.length}.`,
      });
      continue;
    }

    const name = get("name");
    if (!name) {
      errors.push({ row, message: '"name" is required.' });
      continue;
    }

    const priceRaw = get("price");
    const priceCents = priceRaw === "" ? null : parsePriceCents(priceRaw);
    if (priceCents === null) {
      errors.push({
        row,
        message:
          priceRaw === ""
            ? '"price" is required (dollars, e.g. 19.99).'
            : `"price" value "${priceRaw}" is invalid — use dollars with up to two decimals, e.g. 19.99.`,
      });
      continue;
    }
    if (priceCents <= 0) {
      errors.push({ row, message: '"price" must be greater than 0.' });
      continue;
    }

    const statusRaw = get("status").toLowerCase();
    if (statusRaw && !(PRODUCT_STATUSES as readonly string[]).includes(statusRaw)) {
      errors.push({
        row,
        message: `"status" must be one of ${PRODUCT_STATUSES.join(", ")} (got "${get("status")}").`,
      });
      continue;
    }

    const compareRaw = get("compare_at_price");
    const compareAtPriceCents =
      compareRaw === "" ? null : parsePriceCents(compareRaw);
    if (compareRaw !== "" && (compareAtPriceCents === null || compareAtPriceCents <= 0)) {
      errors.push({
        row,
        message: `"compare_at_price" value "${compareRaw}" is invalid — use dollars with up to two decimals.`,
      });
      continue;
    }

    const thumbnail = get("thumbnail");
    if (thumbnail && !isAssetPath(thumbnail)) {
      errors.push({
        row,
        message: `"thumbnail" must be an http(s) URL or a path starting with "/" (got "${truncate(thumbnail)}").`,
      });
      continue;
    }

    const imagesRaw = get("images");
    const images = splitList(imagesRaw);
    const badImage = images.find((url) => !isAssetPath(url));
    if (badImage) {
      errors.push({
        row,
        message: `"images" entry "${truncate(badImage)}" must be an http(s) URL or a path starting with "/" (separate multiple with "|").`,
      });
      continue;
    }

    const variantImageRaw = get("variant_image");
    if (variantImageRaw && !isAssetPath(variantImageRaw)) {
      errors.push({
        row,
        message: `"variant_image" must be an http(s) URL or a path starting with "/" (got "${truncate(variantImageRaw)}").`,
      });
      continue;
    }

    const colorsRaw = get("colors");
    const swatches = splitList(colorsRaw);
    const badSwatch = swatches.find((swatch) => !HEX_COLOR.test(swatch));
    if (badSwatch) {
      errors.push({
        row,
        message: `"colors" entry "${badSwatch}" must be a hex colour like #1d4ed8 (separate multiple with "|").`,
      });
      continue;
    }

    const inStockRaw = get("in_stock").toLowerCase();
    const inStockParsed = inStockRaw === "" ? true : parseBoolToken(inStockRaw);
    if (inStockParsed === null) {
      errors.push({ row, message: `"in_stock" must be true or false.` });
      continue;
    }

    const activeRaw = get("active").toLowerCase();
    const activeParsed = activeRaw === "" ? true : parseBoolToken(activeRaw);
    if (activeParsed === null) {
      errors.push({ row, message: `"active" must be true or false.` });
      continue;
    }

    const slug = slugify(get("slug") || name);
    const color = get("color") || null;
    const size = get("size") || null;

    let draft = drafts.get(slug);
    if (!draft) {
      draft = { slug, row, name, raw: {}, variants: [] };
      drafts.set(slug, draft);
    } else if (draft.name !== name) {
      errors.push({
        row,
        message: `conflicting "name" for slug "${slug}": "${truncate(draft.name)}" (row ${draft.row}) vs "${truncate(name)}".`,
      });
      continue;
    }

    const productValues: Record<ProductRawColumn, string> = {
      description: get("description"),
      status: statusRaw,
      compare_at_price: compareRaw,
      thumbnail,
      images: imagesRaw,
    };
    for (const column of PRODUCT_RAW_COLUMNS) {
      const value = productValues[column];
      if (!value) continue;
      const current = draft.raw[column];
      if (current === undefined) {
        draft.raw[column] = value;
      } else if (current !== value) {
        errors.push({
          row,
          message: `conflicting "${column}" for slug "${slug}" (row ${draft.row} says "${truncate(current)}"). Product columns must agree across the product's rows.`,
        });
      }
    }

    const hasColor = color !== null;
    const draftColorful = draft.variants.some((variant) => variant.color !== null);
    if (draft.variants.length > 0 && draftColorful !== hasColor) {
      errors.push({
        row,
        message: `mixes rows with a "color" and rows without — use the color column consistently for slug "${slug}".`,
      });
      continue;
    }

    const identity = `${color ?? ""}\u0000${size ?? ""}`;
    const duplicate = draft.variants.find(
      (variant) =>
        `${variant.color ?? ""}\u0000${variant.size ?? ""}` === identity,
    );
    if (duplicate) {
      errors.push({
        row,
        message: `duplicate variant (color=${color ?? "-"}, size=${size ?? "-"}) for slug "${slug}" — already declared on row ${duplicate.row}.`,
      });
      continue;
    }

    draft.variants.push({
      row,
      color,
      size,
      priceCents,
      sku: get("sku") || null,
      inStock: inStockParsed,
      isActive: activeParsed,
      image: variantImageRaw || null,
      colors: swatches,
    });
  }

  // Finalise product-level fields. Every stored raw value already passed its
  // row-level check; the re-validation below only guards against future
  // changes to that contract.
  const products: ParsedProduct[] = [];
  for (const draft of drafts.values()) {
    const compareRaw = draft.raw.compare_at_price ?? "";
    const compareAtPriceCents =
      compareRaw === "" ? null : parsePriceCents(compareRaw);
    if (compareRaw !== "" && compareAtPriceCents === null) {
      errors.push({
        row: draft.row,
        message: `"compare_at_price" value "${compareRaw}" is invalid.`,
      });
      continue;
    }

    const status = draft.raw.status ?? "";
    if (status && !(PRODUCT_STATUSES as readonly string[]).includes(status)) {
      errors.push({
        row: draft.row,
        message: `"status" value "${status}" is invalid.`,
      });
      continue;
    }

    products.push({
      slug: draft.slug,
      name: draft.name,
      description: draft.raw.description ?? "",
      status: status || "active",
      compareAtPriceCents,
      thumbnailUrl: draft.raw.thumbnail ?? null,
      images: splitList(draft.raw.images ?? ""),
      variants: draft.variants,
    });
  }

  return { products, errors: sortErrors(errors), records };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Reads the CSV source named by the caller — a local path (relative to the
 * working directory) or an http(s) URL such as a Vercel Blob / raw GitHub
 * file. Throws a plain Error with a human-readable message.
 */
export async function readCsvSource(source: string): Promise<string> {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("The CSV source is empty.");
  }

  let text: string;
  if (/^https?:\/\//i.test(trimmed)) {
    const response = await fetch(trimmed, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Fetching ${trimmed} failed with HTTP ${response.status}.`);
    }
    text = await response.text();
  } else {
    const path = isAbsolute(trimmed) ? trimmed : join(process.cwd(), trimmed);
    try {
      text = await readFile(path, "utf8");
    } catch {
      throw new Error(`Cannot read the CSV file at ${path}.`);
    }
  }

  if (Buffer.byteLength(text, "utf8") > MAX_CSV_BYTES) {
    throw new Error(
      `The CSV source is larger than ${Math.round(MAX_CSV_BYTES / 1024 / 1024)} MB.`,
    );
  }
  return text;
}

/**
 * Validates `csv` and applies it to the catalogue. Products absent from the
 * file are untouched; listed products are upserted by slug, their variants
 * matched by (color, size) with a name fallback for older rows, and variants
 * no longer listed are deactivated (never deleted — carts holding them simply
 * become unavailable). With `dryRun` the plan is computed and reported but
 * nothing is written.
 */
export async function importProductsCatalog(
  csv: string,
  options: {
    source: string;
    dryRun?: boolean;
    actorId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<ImportReport> {
  const {
    source,
    dryRun = false,
    actorId = null,
    ip = null,
    userAgent = null,
  } = options;

  const parsed = parseCatalog(csv);
  const report: ImportReport = {
    source,
    dryRun,
    records: parsed.records,
    products: { created: [], updated: [] },
    variants: { created: 0, updated: 0, deactivated: 0 },
    images: 0,
  };

  if (parsed.errors.length > 0) {
    report.errors = parsed.errors;
    return report;
  }

  for (const product of parsed.products) {
    const existing = await prisma.product.findUnique({
      where: { slug: product.slug },
      include: { variants: true, images: { orderBy: { position: "asc" } } },
    });

    const claimed = new Set<string>();
    const variantWrites: VariantWrite[] = [];

    for (const row of product.variants) {
      const identity = `${row.color ?? ""}\u0000${row.size ?? ""}`;
      const name = variantName(row, product);
      const match =
        existing?.variants.find(
          (variant) =>
            !claimed.has(variant.id) &&
            `${variant.color ?? ""}\u0000${variant.size ?? ""}` === identity,
        ) ??
        existing?.variants.find(
          (variant) =>
            !claimed.has(variant.id) &&
            variant.name === name &&
            (variant.size ?? "") === (row.size ?? ""),
        );
      if (match) claimed.add(match.id);

      variantWrites.push({
        existingId: match?.id ?? null,
        data: {
          name,
          color: row.color,
          size: row.size,
          colors: JSON.stringify(row.colors),
          priceCents: row.priceCents,
          image: row.image,
          sku: row.sku,
          inStock: row.inStock,
          isActive: row.isActive,
        },
      });
    }

    const deactivateIds = (existing?.variants ?? [])
      .filter((variant) => !claimed.has(variant.id) && variant.isActive)
      .map((variant) => variant.id);

    const activePrices = product.variants
      .filter((variant) => variant.isActive)
      .map((variant) => variant.priceCents);
    const priceCents = activePrices.length > 0 ? Math.min(...activePrices) : 0;

    const imagesUnchanged =
      existing !== null &&
      existing.images.length === product.images.length &&
      existing.images.every(
        (image, position) => image.url === product.images[position],
      );
    const images = imagesUnchanged ? null : product.images;

    if (existing) report.products.updated.push(product.slug);
    else report.products.created.push(product.slug);
    for (const write of variantWrites) {
      if (write.existingId) report.variants.updated += 1;
      else report.variants.created += 1;
    }
    report.variants.deactivated += deactivateIds.length;
    if (images) report.images += images.length;

    if (dryRun) continue;

    if (!existing) {
      await prisma.product.create({
        data: {
          slug: product.slug,
          name: product.name,
          description: product.description,
          status: product.status,
          priceCents,
          compareAtPriceCents: product.compareAtPriceCents,
          thumbnailUrl: product.thumbnailUrl,
          variants: { create: variantWrites.map((write) => write.data) },
          ...(images
            ? {
                images: {
                  create: images.map((url, position) => ({ url, position })),
                },
              }
            : {}),
        },
      });
      continue;
    }

    const updates = variantWrites.filter(
      (write): write is VariantWrite & { existingId: string } =>
        write.existingId !== null,
    );
    const creates = variantWrites.filter(
      (write) => write.existingId === null,
    );

    await prisma.product.update({
      where: { id: existing.id },
      data: {
        name: product.name,
        description: product.description,
        status: product.status,
        priceCents,
        compareAtPriceCents: product.compareAtPriceCents,
        thumbnailUrl: product.thumbnailUrl,
        variants: {
          update: [
            ...updates.map((write) => ({
              where: { id: write.existingId },
              data: write.data,
            })),
            ...deactivateIds.map((id) => ({
              where: { id },
              data: { isActive: false },
            })),
          ],
          create: creates.map((write) => write.data),
        },
        ...(images
          ? {
              images: {
                deleteMany: {},
                create: images.map((url, position) => ({ url, position })),
              },
            }
          : {}),
      },
    });
  }

  if (!dryRun) {
    try {
      await prisma.auditLog.create({
        data: {
          actorId,
          action: "products.import",
          entityType: "product",
          after: JSON.stringify({
            source,
            productsCreated: report.products.created,
            productsUpdated: report.products.updated,
            variants: report.variants,
            images: report.images,
          }),
          ipAddress: ip?.slice(0, 64) ?? null,
          userAgent: userAgent?.slice(0, 256) ?? null,
        },
      });
    } catch (error) {
      report.warnings = [
        ...(report.warnings ?? []),
        `Audit log entry was not written: ${error instanceof Error ? error.message : String(error)}`,
      ];
    }
  }

  return report;
}

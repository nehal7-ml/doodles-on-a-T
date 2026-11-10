import type {
  Product as DbProduct,
  ProductVariant as DbProductVariant,
} from "../generated/prisma/client";
import {
  printful,
  PrintfulError,
  type CatalogProduct,
  type CatalogVariant,
  type SyncProductInfo,
  type SyncProductSummary,
} from "./printful";
import { prisma } from "./prisma";

export type SyncedProduct = DbProduct & { variants: DbProductVariant[] };

const SIZE_ORDER = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function sortSizes(sizes: string[]): string[] {
  return unique(sizes.filter(Boolean)).sort((a, b) => {
    const rankA = SIZE_ORDER.indexOf(a.toUpperCase());
    const rankB = SIZE_ORDER.indexOf(b.toUpperCase());
    if (rankA !== -1 || rankB !== -1) {
      return (rankA === -1 ? 999 : rankA) - (rankB === -1 ? 999 : rankB);
    }

    const numberA = Number(a);
    const numberB = Number(b);
    if (!Number.isNaN(numberA) && !Number.isNaN(numberB))
      return numberA - numberB;

    return a.localeCompare(b);
  });
}

function parseMoney(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function previewUrl(variant: SyncProductInfo["sync_variants"][number]) {
  const preview = variant.files?.find((file) => file.type === "preview");
  return (
    preview?.preview_url ??
    preview?.thumbnail_url ??
    variant.product?.image ??
    null
  );
}

async function getCatalogExtras(catalogProductId?: number): Promise<{
  description: string;
  colorCodes: Map<number, string>;
}> {
  const colorCodes = new Map<number, string>();
  if (!catalogProductId) return { description: "", colorCodes };

  const [productResult, variantsResult] = await Promise.allSettled([
    printful.getCatalogProduct(catalogProductId),
    printful.getCatalogProductVariants(catalogProductId),
  ]);

  let description = "";
  if (productResult.status === "fulfilled") {
    description = (productResult.value as CatalogProduct).description ?? "";
  }

  if (variantsResult.status === "fulfilled") {
    for (const variant of variantsResult.value as CatalogVariant[]) {
      if (variant.color_code) colorCodes.set(variant.id, variant.color_code);
    }
  }

  return { description, colorCodes };
}

function buildProductData(
  info: SyncProductInfo,
  extras: { description: string; colorCodes: Map<number, string> },
) {
  const { sync_product: syncProduct, sync_variants: syncVariants } = info;
  const activeVariants = syncVariants.filter((variant) => !variant.is_ignored);

  const images = unique(
    [
      syncProduct.thumbnail_url,
      ...activeVariants.map((variant) => previewUrl(variant)),
    ].filter((url): url is string => Boolean(url)),
  );

  const sizes = sortSizes(
    activeVariants
      .map((variant) => variant.size ?? "")
      .filter((size) => Boolean(size)),
  );

  const prices = activeVariants
    .map((variant) => parseMoney(variant.retail_price))
    .filter((price): price is number => price !== null);

  const currency =
    activeVariants.find((variant) => variant.currency)?.currency ?? "USD";

  return {
    product: {
      printfulProductId: syncProduct.id,
      externalId: syncProduct.external_id,
      name: syncProduct.name,
      description: extras.description,
      price: prices.length ? Math.min(...prices) : 0,
      currency,
      images: JSON.stringify(images),
      sizes: JSON.stringify(sizes),
      thumbnailUrl: syncProduct.thumbnail_url,
      isActive: !syncProduct.is_ignored,
      raw: JSON.stringify(syncProduct),
    },
    variants: syncVariants.map((variant) => {
      const colorCode = extras.colorCodes.get(variant.variant_id) ?? null;
      const color = variant.color ?? null;

      return {
        printfulVariantId: variant.id,
        catalogVariantId: variant.variant_id,
        externalId: variant.external_id,
        name: variant.name,
        size: variant.size ?? null,
        color,
        colors: JSON.stringify(colorCode ? [colorCode] : color ? [color] : []),
        price: parseMoney(variant.retail_price),
        currency: variant.currency ?? currency,
        image: previewUrl(variant),
        sku: variant.sku,
        inStock: variant.availability_status
          ? variant.availability_status === "active"
          : !variant.is_ignored,
        isActive: !variant.is_ignored,
      };
    }),
  };
}

/**
 * Fetches a Sync Product from Printful and mirrors it (including every
 * size/colour variant) into the local database.
 */
export async function syncPrintfulProduct(
  idOrExternalId: number | string,
): Promise<SyncedProduct> {
  const info = await printful.getSyncProduct(idOrExternalId);
  const catalogProductId = info.sync_variants[0]?.product?.product_id;
  const extras = await getCatalogExtras(catalogProductId);
  const mapped = buildProductData(info, extras);

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.product.findUnique({
        where: { printfulProductId: mapped.product.printfulProductId },
      });

      // External ids are unique in our database. If a stale row holds the same
      // external id, release it before writing the fresh value.
      if (mapped.product.externalId) {
        const clash = await tx.product.findUnique({
          where: { externalId: mapped.product.externalId },
        });
        if (clash && clash.id !== existing?.id) {
          await tx.product.update({
            where: { id: clash.id },
            data: { externalId: null },
          });
        }
      }

      const product = existing
        ? await tx.product.update({
            where: { id: existing.id },
            data: mapped.product,
          })
        : await tx.product.create({ data: mapped.product });

      const keptVariantIds: number[] = [];

      for (const variant of mapped.variants) {
        if (variant.externalId) {
          const clash = await tx.productVariant.findUnique({
            where: { externalId: variant.externalId },
          });
          if (clash && clash.printfulVariantId !== variant.printfulVariantId) {
            await tx.productVariant.update({
              where: { id: clash.id },
              data: { externalId: null },
            });
          }
        }

        const existingVariant = await tx.productVariant.findUnique({
          where: { printfulVariantId: variant.printfulVariantId },
        });

        if (existingVariant) {
          await tx.productVariant.update({
            where: { id: existingVariant.id },
            data: { ...variant, productId: product.id },
          });
        } else {
          await tx.productVariant.create({
            data: { ...variant, productId: product.id },
          });
        }

        keptVariantIds.push(variant.printfulVariantId);
      }

      // Variants deleted in Printful should disappear from the storefront, but
      // we keep the row so old orders still have their snapshot.
      await tx.productVariant.updateMany({
        where: {
          productId: product.id,
          printfulVariantId: {
            notIn: keptVariantIds.length ? keptVariantIds : [-1],
          },
        },
        data: { isActive: false, inStock: false },
      });

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: { variants: true },
      });
    },
    // Remote libSQL databases add latency per query; a product with many
    // variants easily exceeds Prisma's 5 second default.
    { timeout: 60_000, maxWait: 10_000 },
  );
}

export async function deactivatePrintfulProduct(
  printfulProductId: number,
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { printfulProductId },
  });
  if (!product) return;

  await prisma.product.update({
    where: { id: product.id },
    data: { isActive: false },
  });
  await prisma.productVariant.updateMany({
    where: { productId: product.id },
    data: { isActive: false, inStock: false },
  });
}

export type SyncAllResult = {
  total: number;
  synced: number;
  failed: number;
  deactivated: number;
  products: Array<{
    printfulProductId: number;
    name: string;
    ok: boolean;
    variants?: number;
    error?: string;
  }>;
};

/** Pulls every Sync Product from Printful into the local database. */
export async function syncAllPrintfulProducts(): Promise<SyncAllResult> {
  const summaries: SyncProductSummary[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const page = await printful.listSyncProducts({ limit, offset });
    summaries.push(...page.result);

    if (page.result.length < limit) break;
    offset += limit;
    if (page.paging && offset >= page.paging.total) break;
  }

  const products: SyncAllResult["products"] = [];
  let synced = 0;
  let failed = 0;

  for (const summary of summaries) {
    try {
      const product = await syncPrintfulProduct(summary.id);
      products.push({
        printfulProductId: summary.id,
        name: summary.name,
        ok: true,
        variants: product.variants.length,
      });
      synced++;
    } catch (error) {
      products.push({
        printfulProductId: summary.id,
        name: summary.name,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      failed++;
    }
  }

  const knownIds = summaries.map((summary) => summary.id);
  const stale = await prisma.product.findMany({
    where: {
      printfulProductId: {
        notIn: knownIds.length ? knownIds : [-1],
      },
    },
    select: { id: true },
  });

  for (const product of stale) {
    await prisma.product.update({
      where: { id: product.id },
      data: { isActive: false },
    });
    await prisma.productVariant.updateMany({
      where: { productId: product.id },
      data: { isActive: false, inStock: false },
    });
  }

  return {
    total: summaries.length,
    synced,
    failed,
    deactivated: stale.length,
    products,
  };
}

type StockUpdatePayload =
  | {
      product_id?: number;
      variant_stock?: { out?: number[]; discontinued?: number[] };
    }
  | Array<{
      catalog_variant_id: number;
      availability?: string;
    }>;

/**
 * Applies the v1 `stock_updated` and v2 `catalog_stock_updated` payloads.
 */
export async function applyStockUpdate(
  payload: StockUpdatePayload,
): Promise<{ updated: number }> {
  // v2 sends the current availability of every changed catalog variant, so
  // both restocks and sell-outs can be applied directly.
  if (Array.isArray(payload)) {
    const inStock: number[] = [];
    const outOfStock: number[] = [];

    for (const item of payload) {
      const id = Number(item.catalog_variant_id);
      if (!id) continue;
      if (
        item.availability === "in stock" ||
        item.availability === "in_stock"
      ) {
        inStock.push(id);
      } else {
        outOfStock.push(id);
      }
    }

    const [restocked, removed] = await Promise.all([
      inStock.length
        ? prisma.productVariant.updateMany({
            where: { catalogVariantId: { in: inStock } },
            data: { inStock: true },
          })
        : Promise.resolve({ count: 0 }),
      outOfStock.length
        ? prisma.productVariant.updateMany({
            where: { catalogVariantId: { in: outOfStock } },
            data: { inStock: false },
          })
        : Promise.resolve({ count: 0 }),
    ]);

    return { updated: restocked.count + removed.count };
  }

  // v1 sends a snapshot for one Sync Product: `product_id` is the Printful
  // sync product id and `out`/`discontinued` contain catalog variant ids.
  // Variants that are not listed are considered active and in stock.
  const productId = Number(payload.product_id) || null;
  const outOfStock = [
    ...(payload.variant_stock?.out ?? []),
    ...(payload.variant_stock?.discontinued ?? []),
  ]
    .map(Number)
    .filter(Boolean);

  let productIds: string[] = [];

  if (productId) {
    const product = await prisma.product.findUnique({
      where: { printfulProductId: productId },
      select: { id: true },
    });
    if (product) productIds = [product.id];
  }

  if (!productIds.length && outOfStock.length) {
    // Older/simpler payloads may omit product_id (or use a different id
    // namespace); fall back to the products that own the affected variants.
    const affected = await prisma.productVariant.findMany({
      where: { catalogVariantId: { in: outOfStock } },
      select: { productId: true },
    });
    productIds = unique(affected.map((variant) => variant.productId));
  }

  let reenabled = 0;
  if (productIds.length) {
    const result = await prisma.productVariant.updateMany({
      where: { productId: { in: productIds } },
      data: { inStock: true },
    });
    reenabled = result.count;
  }

  if (!outOfStock.length) return { updated: reenabled };

  // Catalog stock is shared by every product that uses the same blank
  // variant, so apply the unavailable ids across the catalog.
  const removed = await prisma.productVariant.updateMany({
    where: { catalogVariantId: { in: outOfStock } },
    data: { inStock: false },
  });

  return { updated: reenabled + removed.count };
}

export function toPrintfulErrorMessage(error: unknown): string {
  if (error instanceof PrintfulError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unknown Printful error";
}

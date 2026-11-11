import type {
  Prisma,
  Product as DbProduct,
  ProductImage as DbProductImage,
  ProductVariant as DbProductVariant,
} from "../generated/prisma/client";
import type { Product, ProductOption } from "~~/app/types";
import { prisma } from "./prisma";

export type ProductSort = "featured" | "price-asc" | "price-desc" | "name";

type ProductWithVariants = DbProduct & {
  variants: DbProductVariant[];
  images: DbProductImage[];
};

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

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

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
    if (!Number.isNaN(numberA) && !Number.isNaN(numberB)) {
      return numberA - numberB;
    }

    return a.localeCompare(b);
  });
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default"
  );
}

/** Cents are the storage unit; the public catalog API keeps major units. */
export function toMajorUnits(cents: number | null | undefined): number {
  return typeof cents === "number" && Number.isFinite(cents) ? cents / 100 : 0;
}

function variantPriceCents(
  variant: DbProductVariant,
  fallbackCents: number,
): number {
  return variant.priceCents ?? fallbackCents;
}

function toProductOption(
  variant: DbProductVariant,
  fallbackCents: number,
): ProductOption {
  const priceCents = variantPriceCents(variant, fallbackCents);
  return {
    id: variant.id,
    name: variant.name,
    size: variant.size,
    color: variant.color,
    price: toMajorUnits(priceCents),
    priceCents,
    compareAtPriceCents: variant.compareAtPriceCents,
    currency: variant.currency,
    image: variant.image,
    inStock: variant.inStock && variant.isActive,
    sku: variant.sku,
  };
}

function toProduct(product: ProductWithVariants): Product {
  const activeVariants = product.variants.filter((variant) => variant.isActive);
  const options = activeVariants.map((variant) =>
    toProductOption(variant, product.priceCents),
  );

  const groups = new Map<
    string,
    {
      name: string;
      colors: string[];
      sizes: string[];
      prices: number[];
      currency: string | null;
      image: string | null;
      inStock: boolean;
    }
  >();

  for (const variant of activeVariants) {
    const name = variant.color ?? variant.name ?? "Default";
    const key = slugify(name);
    const group = groups.get(key) ?? {
      name,
      colors: [],
      sizes: [],
      prices: [],
      currency: null,
      image: null,
      inStock: false,
    };

    group.colors.push(...parseStringArray(variant.colors));
    if (variant.size) group.sizes.push(variant.size);
    group.prices.push(variantPriceCents(variant, product.priceCents));
    group.currency ??= variant.currency;
    group.image ??= variant.image;
    group.inStock ||= variant.inStock;

    groups.set(key, group);
  }

  const prices = activeVariants.map((variant) =>
    variantPriceCents(variant, product.priceCents),
  );
  const images = product.images
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((image) => image.url);
  const thumbnailUrl = product.thumbnailUrl ?? images[0] ?? null;
  const priceCents = prices.length ? Math.min(...prices) : product.priceCents;

  return {
    id: product.id,
    slug: product.slug,
    status: product.status,
    printfulProductId: product.printfulProductId,
    images,
    thumbnailUrl,
    name: product.name,
    price: toMajorUnits(priceCents),
    priceCents,
    compareAtPriceCents: product.compareAtPriceCents,
    currency: product.currency,
    description: product.description,
    variants: [...groups.entries()].map(([id, group]) => ({
      id,
      name: group.name,
      colors: unique(group.colors),
      sizes: sortSizes(group.sizes),
      price: group.prices.length
        ? toMajorUnits(Math.min(...group.prices))
        : null,
      priceCents: group.prices.length ? Math.min(...group.prices) : null,
      currency: group.currency,
      image: group.image,
      inStock: group.inStock,
    })),
    sizes: sortSizes(activeVariants.map((variant) => variant.size ?? "")),
    options,
  };
}

function getOrderBy(
  sort: ProductSort,
): Prisma.ProductOrderByWithRelationInput {
  if (sort === "price-asc") return { priceCents: "asc" };
  if (sort === "price-desc") return { priceCents: "desc" };
  if (sort === "name") return { name: "asc" };
  return { createdAt: "desc" };
}

const productInclude = {
  variants: {
    orderBy: { name: "asc" as const },
  },
  images: {
    orderBy: { position: "asc" as const },
  },
} satisfies Prisma.ProductInclude;

export async function listProducts(
  options: {
    search?: string;
    sort?: ProductSort;
    limit?: number;
  } = {},
): Promise<Product[]> {
  const { search = "", sort = "featured", limit } = options;

  const where: Prisma.ProductWhereInput = {
    status: "active",
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
          ],
        }
      : {}),
  };

  const products = await prisma.product.findMany({
    where,
    orderBy: getOrderBy(sort),
    include: productInclude,
    ...(limit ? { take: limit } : {}),
  });

  return products.map(toProduct);
}

export async function getProductById(
  idOrSlug: string,
): Promise<Product | undefined> {
  const product = await prisma.product.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      status: "active",
    },
    include: productInclude,
  });

  return product ? toProduct(product) : undefined;
}

import { randomBytes } from "node:crypto";
import {
  createError,
  deleteCookie,
  getCookie,
  setCookie,
  type H3Event,
} from "h3";
import type {
  Cart,
  CartItem,
  Product,
  ProductImage,
  ProductVariant,
} from "../generated/prisma/client";
import { usesSecureCookies } from "../auth/session";
import { prisma } from "../utils/prisma";

export const CART_COOKIE = "cart_token";
export const CART_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const MAX_ITEM_QUANTITY = 99;
export const STORE_CURRENCY = "USD";

type ProductWithImages = Product & { images: ProductImage[] };

export type CartWithDetails = Cart & {
  items: Array<
    CartItem & {
      variant: ProductVariant & { product: ProductWithImages };
    }
  >;
};

export type CartViewItem = {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  size: string | null;
  color: string | null;
  image: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  currency: string;
  available: boolean;
};

export type CartView = {
  id: string | null;
  status: string;
  currency: string;
  items: CartViewItem[];
  itemCount: number;
  hasUnavailable: boolean;
  totals: {
    subtotalCents: number;
    itemCount: number;
  };
  expiresAt: Date | null;
};

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      variant: {
        include: {
          product: {
            include: { images: { orderBy: { position: "asc" as const } } },
          },
        },
      },
    },
  },
};

function cartCookieOptions(event: H3Event) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: usesSecureCookies(event),
  };
}

function isExpired(cart: Cart): boolean {
  return Boolean(cart.expiresAt && cart.expiresAt.getTime() <= Date.now());
}

/** Product/variant prices are stored in integer cents. */
export function toCents(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function variantPriceCents(
  variant: ProductVariant & { product: Product },
): number {
  return variant.priceCents ?? variant.product.priceCents;
}

export function variantCurrency(
  variant: ProductVariant & { product: Product },
): string {
  return variant.currency ?? variant.product.currency ?? STORE_CURRENCY;
}

function imageUrl(
  variant: ProductVariant & { product: ProductWithImages },
): string | null {
  if (variant.image) return variant.image;
  if (variant.product.thumbnailUrl) return variant.product.thumbnailUrl;
  return variant.product.images[0]?.url ?? null;
}

export function emptyCartView(): CartView {
  return {
    id: null,
    status: "active",
    currency: STORE_CURRENCY,
    items: [],
    itemCount: 0,
    hasUnavailable: false,
    totals: { subtotalCents: 0, itemCount: 0 },
    expiresAt: null,
  };
}

export async function getCartWithDetails(
  cartId: string,
): Promise<CartWithDetails | null> {
  return prisma.cart.findUnique({
    where: { id: cartId },
    include: cartInclude,
  });
}

/**
 * Serializes a cart for the client and refreshes the `unitPriceCents` cache.
 * The price is never taken from the client; it always comes from the variant.
 */
export async function serializeCart(
  cart: CartWithDetails,
): Promise<CartView> {
  const priceUpdates: Array<{ id: string; unitPriceCents: number }> = [];
  let subtotalCents = 0;
  let itemCount = 0;
  let hasUnavailable = false;

  const items: CartViewItem[] = cart.items.map((item) => {
    const currentPrice = variantPriceCents(item.variant);
    if (currentPrice !== item.unitPriceCents) {
      priceUpdates.push({ id: item.id, unitPriceCents: currentPrice });
    }

    const available =
      item.variant.isActive &&
      item.variant.inStock &&
      item.variant.product.status === "active";
    const lineTotalCents = currentPrice * item.quantity;

    itemCount += item.quantity;
    if (available) {
      subtotalCents += lineTotalCents;
    } else {
      hasUnavailable = true;
    }

    return {
      id: item.id,
      variantId: item.variantId,
      productId: item.variant.productId,
      productName: item.variant.product.name,
      variantName: item.variant.color ?? item.variant.name,
      size: item.variant.size,
      color: item.variant.color,
      image: imageUrl(item.variant),
      quantity: item.quantity,
      unitPriceCents: currentPrice,
      lineTotalCents,
      currency: item.currency,
      available,
    };
  });

  if (priceUpdates.length) {
    await prisma.$transaction(
      priceUpdates.map((update) =>
        prisma.cartItem.update({
          where: { id: update.id },
          data: { unitPriceCents: update.unitPriceCents },
        }),
      ),
    );
  }

  return {
    id: cart.id,
    status: cart.status,
    currency: cart.currency,
    items,
    itemCount,
    hasUnavailable,
    totals: { subtotalCents, itemCount },
    expiresAt: cart.expiresAt,
  };
}

export async function findUserCart(
  userId: string,
): Promise<CartWithDetails | null> {
  return prisma.cart.findFirst({
    where: { userId, status: "active" },
    orderBy: { updatedAt: "desc" },
    include: cartInclude,
  });
}

function clearGuestCookie(event: H3Event): void {
  deleteCookie(event, CART_COOKIE, cartCookieOptions(event));
}

/** Clears the guest cart cookie after a guest cart has been converted. */
export function clearCartCookie(event: H3Event): void {
  clearGuestCookie(event);
}

async function createGuestCart(event: H3Event): Promise<CartWithDetails> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CART_MAX_AGE_SECONDS * 1000);

  const cart = await prisma.cart.create({
    data: { token, expiresAt, currency: STORE_CURRENCY },
    include: cartInclude,
  });

  setCookie(event, CART_COOKIE, token, {
    ...cartCookieOptions(event),
    expires: expiresAt,
  });

  return cart;
}

async function createUserCart(userId: string): Promise<CartWithDetails> {
  return prisma.cart.create({
    data: { userId, currency: STORE_CURRENCY },
    include: cartInclude,
  });
}

/**
 * Merges a guest cart into the signed-in customer's active cart.
 *
 * If the customer has no cart yet the guest cart is simply claimed (same id),
 * which keeps in-flight checkout/links stable. If both exist, quantities are
 * summed and capped, and the guest cart is deleted.
 */
export async function mergeGuestCart(
  userId: string,
  token: string,
): Promise<void> {
  const guest = await prisma.cart.findUnique({
    where: { token },
    include: { items: true },
  });

  if (!guest || guest.status !== "active") return;

  // The cart was already claimed by this user (e.g. a stale cookie).
  if (guest.userId === userId) {
    await prisma.cart.update({
      where: { id: guest.id },
      data: { token: null },
    });
    return;
  }

  // Never merge a cart that belongs to a different account.
  if (guest.userId) return;
  if (isExpired(guest)) return;

  await prisma.$transaction(async (tx) => {
    const userCart = await tx.cart.findFirst({
      where: { userId, status: "active" },
      orderBy: { updatedAt: "desc" },
    });

    if (!userCart) {
      await tx.cart.update({
        where: { id: guest.id },
        data: { userId, token: null, expiresAt: null },
      });
      return;
    }

    for (const item of guest.items) {
      const existing = await tx.cartItem.findUnique({
        where: {
          cartId_variantId: { cartId: userCart.id, variantId: item.variantId },
        },
      });

      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: {
            quantity: Math.min(
              MAX_ITEM_QUANTITY,
              existing.quantity + item.quantity,
            ),
            unitPriceCents: item.unitPriceCents,
            currency: item.currency,
          },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: userCart.id,
            variantId: item.variantId,
            quantity: Math.min(MAX_ITEM_QUANTITY, item.quantity),
            unitPriceCents: item.unitPriceCents,
            currency: item.currency,
          },
        });
      }
    }

    await tx.cart.delete({ where: { id: guest.id } });
  });
}

/**
 * Resolves the cart for the current request. Reading (`create: false`) never
 * creates rows; mutations pass `create: true`.
 */
export async function resolveCart(
  event: H3Event,
  userId: string | null,
  options: { create: boolean },
): Promise<CartWithDetails | null> {
  const token = getCookie(event, CART_COOKIE);

  if (userId) {
    let cart = await findUserCart(userId);

    if (token) {
      await mergeGuestCart(userId, token);
      clearGuestCookie(event);
      cart = await findUserCart(userId);
    }

    if (!cart && options.create) {
      cart = await createUserCart(userId);
    }
    return cart;
  }

  if (!token) {
    return options.create ? createGuestCart(event) : null;
  }

  const cart = await prisma.cart.findUnique({
    where: { token },
    include: cartInclude,
  });

  if (cart && cart.status === "active" && !isExpired(cart)) {
    return cart;
  }

  clearGuestCookie(event);

  // Expired guest carts have no value; remove them so the table stays small.
  if (cart && cart.status === "active" && isExpired(cart)) {
    await prisma.cart.delete({ where: { id: cart.id } }).catch(() => {});
  }

  return options.create ? createGuestCart(event) : null;
}

export function parseQuantity(value: unknown, field = "quantity"): number {
  const quantity =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_ITEM_QUANTITY
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} must be a whole number between 1 and ${MAX_ITEM_QUANTITY}.`,
    });
  }
  return quantity;
}

export function parseVariantId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 64) {
    throw createError({
      statusCode: 400,
      statusMessage: "variantId is required.",
    });
  }
  return value.trim();
}

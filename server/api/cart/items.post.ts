import {
  createError,
  readBody,
  setHeader,
  setResponseStatus,
} from "h3";
import {
  MAX_ITEM_QUANTITY,
  STORE_CURRENCY,
  parseQuantity,
  parseVariantId,
  resolveCart,
  serializeCart,
  variantCurrency,
  variantPriceCents,
} from "../../cart/service";
import { assertSameOrigin } from "../../auth/csrf";
import { getSessionUser } from "../../utils/auth";
import { prisma } from "../../utils/prisma";

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);

  const user = await getSessionUser(event);

  const body = (await readBody(event).catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, statusMessage: "Invalid request body." });
  }

  const variantId = parseVariantId(body.variantId);
  const requested = parseQuantity(body.quantity ?? 1);

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });

  if (!variant) {
    throw createError({ statusCode: 404, statusMessage: "Product not found." });
  }
  if (!variant.isActive || !variant.inStock || !variant.product.isActive) {
    throw createError({
      statusCode: 409,
      statusMessage: `${variant.product.name} is currently unavailable.`,
    });
  }

  const currency = variantCurrency(variant);
  if (currency !== STORE_CURRENCY) {
    throw createError({
      statusCode: 409,
      statusMessage: `Only ${STORE_CURRENCY} products can be purchased.`,
    });
  }

  const cart = await resolveCart(event, user?.id ?? null, { create: true });
  if (!cart) {
    // resolveCart only returns null when creation is disabled.
    throw createError({ statusCode: 500, statusMessage: "Could not create a cart." });
  }

  const unitPriceCents = variantPriceCents(variant);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
  });

  const quantity = Math.min(
    MAX_ITEM_QUANTITY,
    (existing?.quantity ?? 0) + requested,
  );

  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    create: {
      cartId: cart.id,
      variantId,
      quantity,
      unitPriceCents,
      currency,
    },
    update: { quantity, unitPriceCents, currency },
  });

  const updated = await prisma.cart.findUniqueOrThrow({
    where: { id: cart.id },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: { variant: { include: { product: true } } },
      },
    },
  });

  setResponseStatus(event, 201);
  return await serializeCart(updated);
});

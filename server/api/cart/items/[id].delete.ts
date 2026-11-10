import {
  createError,
  getRouterParam,
  setHeader,
} from "h3";
import {
  emptyCartView,
  resolveCart,
  serializeCart,
} from "../../../cart/service";
import { assertSameOrigin } from "../../../auth/csrf";
import { getSessionUser } from "../../../utils/auth";
import { prisma } from "../../../utils/prisma";

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);

  const itemId = getRouterParam(event, "id");
  if (!itemId) {
    throw createError({ statusCode: 400, statusMessage: "Cart item id is required." });
  }

  const user = await getSessionUser(event);
  const cart = await resolveCart(event, user?.id ?? null, { create: false });

  if (!cart) {
    return emptyCartView();
  }

  // Deleting an item that is already gone is a no-op so retries are safe.
  await prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });

  const updated = await prisma.cart.findUniqueOrThrow({
    where: { id: cart.id },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: { variant: { include: { product: true } } },
      },
    },
  });

  return await serializeCart(updated);
});

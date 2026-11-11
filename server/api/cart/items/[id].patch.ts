import {
  createError,
  getRouterParam,
  readBody,
  setHeader,
} from "h3";
import {
  getCartWithDetails,
  parseQuantity,
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

  const body = (await readBody(event).catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, statusMessage: "Invalid request body." });
  }

  const quantity = parseQuantity(body.quantity);

  const user = await getSessionUser(event);
  const cart = await resolveCart(event, user?.id ?? null, { create: false });

  if (!cart) {
    throw createError({ statusCode: 404, statusMessage: "Cart item not found." });
  }

  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
  });
  if (!item) {
    throw createError({ statusCode: 404, statusMessage: "Cart item not found." });
  }

  await prisma.cartItem.update({
    where: { id: item.id },
    data: { quantity },
  });

  const updated = await getCartWithDetails(cart.id);
  if (!updated) {
    throw createError({
      statusCode: 500,
      statusMessage: "Cart could not be reloaded.",
    });
  }

  return await serializeCart(updated);
});

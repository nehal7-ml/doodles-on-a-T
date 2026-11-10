import { setHeader } from "h3";
import {
  emptyCartView,
  resolveCart,
  serializeCart,
} from "../../cart/service";
import { getSessionUser } from "../../utils/auth";

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store");

  const user = await getSessionUser(event);
  const cart = await resolveCart(event, user?.id ?? null, { create: false });

  return cart ? await serializeCart(cart) : emptyCartView();
});

import { createError } from "h3";
import { getSessionUser, hasRole } from "../../utils/auth";
import { getOrderDetails, serializeOrder } from "../../utils/orders";
import { requireAdminToken } from "../../utils/request";

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const privileged = Boolean(user && hasRole(user, ["staff", "admin"]));

  if (!user) {
    requireAdminToken(event, { allowDevBypass: false });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Order id is required" });
  }

  const existing = await getOrderDetails(id);
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  // A customer may only read their own order.
  if (!privileged && existing.userId !== user?.id) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  return serializeOrder(existing);
});

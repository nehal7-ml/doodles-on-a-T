import { createError } from "h3";
import { getSessionUser, hasRole } from "../../utils/auth";
import {
  getOrderDetails,
  refreshOrderFromPrintful,
  serializeOrder,
} from "../../utils/orders";
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

  const query = getQuery(event);
  const shouldRefresh = query.refresh === "true" || query.refresh === "1";

  const existing = await getOrderDetails(id);
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  // A customer may read their own order, but never refresh it from Printful.
  if (!privileged && existing.userId !== user?.id) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  if (shouldRefresh && privileged && existing.printfulOrderId) {
    return serializeOrder(await refreshOrderFromPrintful(id));
  }

  return serializeOrder(existing);
});

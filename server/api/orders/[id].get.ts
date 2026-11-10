import { createError } from "h3";
import {
  getOrderDetails,
  refreshOrderFromPrintful,
  serializeOrder,
} from "../../utils/orders";
import { requireAdminToken } from "../../utils/request";

export default defineEventHandler(async (event) => {
  requireAdminToken(event);

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Order id is required" });
  }

  const query = getQuery(event);
  const shouldRefresh = query.refresh === "true" || query.refresh === "1";

  if (shouldRefresh) {
    const existing = await getOrderDetails(id);
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: "Order not found" });
    }
    if (existing.printfulOrderId) {
      return serializeOrder(await refreshOrderFromPrintful(id));
    }
  }

  const order = await getOrderDetails(id);
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  return serializeOrder(order);
});

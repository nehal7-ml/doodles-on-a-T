import { createError } from "h3";
import { getOrderDetails, confirmPrintfulOrder, serializeOrder } from "../../../utils/orders";
import { requireStaffOrToken } from "../../../utils/auth";

export default defineEventHandler(async (event) => {
  await requireStaffOrToken(event);

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Order id is required" });
  }

  const order = await getOrderDetails(id);
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  // Never hand an order to production before a captured payment exists.
  if (!["paid", "processing"].includes(order.paymentStatus)) {
    throw createError({
      statusCode: 409,
      statusMessage: "The order must be paid before it can be confirmed.",
    });
  }

  return serializeOrder(await confirmPrintfulOrder(id));
});

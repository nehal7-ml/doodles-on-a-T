import { createError } from "h3";
import { serializeOrder, submitOrderToPrintful } from "../../../utils/orders";
import { requireAdminToken } from "../../../utils/request";

export default defineEventHandler(async (event) => {
  requireAdminToken(event);

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Order id is required" });
  }

  return serializeOrder(await submitOrderToPrintful(id));
});

import { createError } from "h3";
import { refreshOrderFromPrintful, serializeOrder } from "../../../utils/orders";
import { requireStaffOrToken } from "../../../utils/auth";

export default defineEventHandler(async (event) => {
  await requireStaffOrToken(event);

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Order id is required" });
  }

  return serializeOrder(await refreshOrderFromPrintful(id));
});

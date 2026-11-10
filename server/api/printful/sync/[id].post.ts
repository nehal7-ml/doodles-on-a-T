import { createError } from "h3";
import { requireAdminToken } from "../../../utils/request";
import { syncPrintfulProduct } from "../../../utils/printful-sync";

export default defineEventHandler(async (event) => {
  requireAdminToken(event);

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "A Printful product id is required.",
    });
  }

  return await syncPrintfulProduct(id);
});

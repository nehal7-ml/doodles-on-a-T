import { requireAdminToken } from "../../utils/request";
import { syncAllPrintfulProducts } from "../../utils/printful-sync";

export default defineEventHandler(async (event) => {
  requireAdminToken(event);
  return await syncAllPrintfulProducts();
});

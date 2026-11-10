import { unregisterPrintfulWebhooks } from "../../utils/printful-webhooks";
import { requireAdminToken } from "../../utils/request";

export default defineEventHandler(async (event) => {
  requireAdminToken(event);
  return await unregisterPrintfulWebhooks();
});

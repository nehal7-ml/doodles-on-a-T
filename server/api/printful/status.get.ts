import { requireAdminToken } from "../../utils/request";
import { getPrintfulStoreId, printful } from "../../utils/printful";

export default defineEventHandler(async (event) => {
  requireAdminToken(event);

  const [products, webhooks] = await Promise.all([
    printful.listSyncProducts({ limit: 100 }).then((response) => ({
      total: response.paging?.total ?? response.result.length,
      products: response.result.map((product) => ({
        id: product.id,
        name: product.name,
        variants: product.variants,
        isIgnored: product.is_ignored,
      })),
    })),
    printful.getWebhookConfig().catch(() => null),
  ]);

  return {
    configured: Boolean(getPrintfulStoreId()),
    storeId: getPrintfulStoreId() ?? null,
    products,
    productWebhooks: webhooks,
  };
});

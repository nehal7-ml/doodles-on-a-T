import { parseCheckoutItems, parseShippingRecipient } from "../../utils/checkout";
import { calculateShippingRates } from "../../utils/shipping";

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown> | null;

  const recipient = parseShippingRecipient(body?.recipient);
  const items = parseCheckoutItems(body?.items);
  const currency =
    typeof body?.currency === "string" ? body.currency.toUpperCase() : undefined;

  return await calculateShippingRates({ recipient, items, currency });
});

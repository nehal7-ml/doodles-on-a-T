import { createError } from "h3";
import {
  parseCheckoutItems,
  parseEmail,
  parseRecipient,
} from "../../utils/checkout";
import {
  createLocalOrder,
  serializeOrder,
  submitOrderToPrintful,
} from "../../utils/orders";
import { calculateShippingRates } from "../../utils/shipping";

function optionalString(
  value: unknown,
  field: string,
  maxLength = 120,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} must be a string.`,
    });
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} must be at most ${maxLength} characters.`,
    });
  }
  return trimmed;
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!body || typeof body !== "object") {
    throw createError({
      statusCode: 400,
      statusMessage: "A JSON body is required.",
    });
  }

  const recipient = parseRecipient(body.recipient);
  const items = parseCheckoutItems(body.items);
  const email = parseEmail(body.email ?? recipient.email, "email");

  const requestedMethod =
    optionalString(
      body.shippingMethod ?? body.shipping_method,
      "shippingMethod",
      32,
    ) ?? "STANDARD";

  // Always re-quote shipping server-side. The client may choose a method, but
  // it cannot invent a price.
  const quote = await calculateShippingRates({ recipient, items });

  const selected =
    quote.rates.find(
      (rate) => rate.id.toUpperCase() === requestedMethod.toUpperCase(),
    ) ?? quote.rates[0];

  if (!selected) {
    throw createError({
      statusCode: 422,
      statusMessage: `We cannot ship these items to ${recipient.country_code}.`,
    });
  }

  const order = await createLocalOrder({
    recipient,
    items,
    email,
    customerName:
      optionalString(
        body.customerName ?? body.customer_name,
        "customerName",
        128,
      ) ??
      recipient.name ??
      null,
    shippingMethod: selected.id,
    shippingService: selected.name,
    shippingCost: selected.rate,
  });

  let result = order;

  if (body.submit === true) {
    result = await submitOrderToPrintful(order.id);
  }

  setResponseStatus(event, 201);

  return {
    ...serializeOrder(result),
    submitted: Boolean(result.printfulOrderId),
  };
});

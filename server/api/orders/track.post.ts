import { createError } from "h3";
import { parseEmail } from "../../utils/checkout";
import {
  findOrderForTracking,
  refreshOrderFromPrintful,
  serializeOrder,
} from "../../utils/orders";

const FINAL_STATUSES = new Set([
  "delivered",
  "returned",
  "refunded",
  "canceled",
  "failed",
]);

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => null)) as Record<
    string,
    unknown
  > | null;

  const orderNumber =
    typeof body?.orderNumber === "string"
      ? body.orderNumber.trim()
      : typeof body?.order_number === "string"
        ? body.order_number.trim()
        : "";

  if (!orderNumber) {
    throw createError({
      statusCode: 400,
      statusMessage: "orderNumber is required.",
    });
  }

  const email = parseEmail(body?.email, "email");

  let order = await findOrderForTracking(orderNumber, email);

  // Pull the latest tracking information from Printful when the order is
  // still in flight. If Printful is unavailable we still return the local
  // snapshot rather than failing the lookup.
  if (order.printfulOrderId && !FINAL_STATUSES.has(order.status)) {
    try {
      order = await refreshOrderFromPrintful(order.id);
    } catch (error) {
      console.warn(
        `[track] Could not refresh order ${order.orderNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return serializeOrder(order);
});

import { createError } from "h3";
import { parseEmail } from "../../utils/checkout";
import {
  findOrderForTracking,
  serializeOrder,
} from "../../utils/orders";

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

  const order = await findOrderForTracking(orderNumber, email);

  return serializeOrder(order);
});

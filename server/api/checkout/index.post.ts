import {
  createError,
  getRequestURL,
  readBody,
  setHeader,
  setResponseStatus,
  type H3Event,
} from "h3";
import { assertSameOrigin } from "../../auth/csrf";
import { createCheckout, type CheckoutInput } from "../../checkout/service";
import { getSessionUser } from "../../utils/auth";
import { parseEmail, parseRecipient } from "../../utils/checkout";

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

function requestOrigin(event: H3Event): string {
  const configured =
    process.env.PUBLIC_SITE_URL?.trim() || process.env.AUTH_URL?.trim();
  const candidate = configured || getRequestURL(event).origin;
  try {
    return new URL(candidate).origin;
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: "PUBLIC_SITE_URL/AUTH_URL is not a valid URL.",
    });
  }
}

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);

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

  const user = await getSessionUser(event);
  const recipient = parseRecipient(body.recipient);
  const email = parseEmail(body.email ?? recipient.email, "email");

  const input: CheckoutInput = {
    recipient,
    email,
    customerName:
      optionalString(body.customerName ?? body.customer_name, "customerName", 128) ??
      user?.name ??
      recipient.name ??
      null,
    shippingMethod: optionalString(
      body.shippingMethod ?? body.shipping_method,
      "shippingMethod",
      32,
    ),
    origin: requestOrigin(event),
  };

  const result = await createCheckout(event, user, input);

  setResponseStatus(event, 201);
  return result;
});

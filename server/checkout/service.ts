import { createError, type H3Event } from "h3";
import {
  STORE_CURRENCY,
  clearCartCookie,
  resolveCart,
  variantCurrency,
  variantPriceCents,
  type CartWithDetails,
} from "../cart/service";
import type { SessionUser } from "../utils/auth";
import { serializeOrder, type OrderWithDetails } from "../utils/orders";
import type { PrintfulAddress } from "../utils/printful";
import { prisma } from "../utils/prisma";
import { calculateShippingRates } from "../utils/shipping";
import { getPaymentProvider } from "../payments";

export type CheckoutInput = {
  recipient: PrintfulAddress;
  email: string;
  customerName?: string | null;
  shippingMethod?: string;
  /** Origin used to build provider success/cancel URLs. */
  origin: string;
};

export type CheckoutResult = {
  order: ReturnType<typeof serializeOrder>;
  payment: {
    id: string;
    provider: string;
    status: string;
    amountCents: number;
    currency: string;
  };
  redirectUrl?: string;
  clientSecret?: string;
};

function paymentDescription(
  variant: CartWithDetails["items"][number]["variant"],
): string {
  const parts = [variant.color, variant.size].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  const label = variant.product.name || variant.name;
  return parts.length ? `${label} (${parts.join(" / ")})` : label;
}

async function buildOrder(
  cart: CartWithDetails,
  user: SessionUser | null,
  input: CheckoutInput,
) {
  if (cart.status !== "active") {
    throw createError({
      statusCode: 409,
      statusMessage: "This cart has already been checked out.",
    });
  }

  if (cart.items.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "Your cart is empty." });
  }

  let subtotalCents = 0;

  for (const item of cart.items) {
    const variant = item.variant;
    if (
      !variant.isActive ||
      !variant.inStock ||
      variant.product.status !== "active"
    ) {
      throw createError({
        statusCode: 409,
        statusMessage: `${variant.product.name} is no longer available. Remove it from your cart before checking out.`,
      });
    }

    if (variantCurrency(variant) !== STORE_CURRENCY) {
      throw createError({
        statusCode: 409,
        statusMessage: `Only ${STORE_CURRENCY} products can be purchased.`,
      });
    }

    subtotalCents += variantPriceCents(variant) * item.quantity;
  }

  // Always re-quote shipping server-side; the client only chooses a method id.
  const quote = await calculateShippingRates({
    recipient: input.recipient,
    items: cart.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    })),
    currency: STORE_CURRENCY,
  });

  if (!quote.available || quote.rates.length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `We cannot ship these items to ${input.recipient.country_code}.`,
    });
  }

  const requested = (input.shippingMethod ?? "").toUpperCase();
  const selected =
    quote.rates.find((rate) => rate.id.toUpperCase() === requested) ??
    quote.rates[0];

  if (!selected) {
    throw createError({
      statusCode: 422,
      statusMessage: "The selected shipping method is not available.",
    });
  }

  const shippingCents = Math.max(0, Math.round(selected.rate * 100));
  const totalCents = subtotalCents + shippingCents;

  const orderNumber = await generateOrderNumber();

  const order = await prisma.order.create({
    data: {
      orderNumber,
      externalId: orderNumber,
      userId: user?.id ?? null,
      status: "pending",
      paymentStatus: "unpaid",
      email: input.email,
      customerName: input.customerName ?? input.recipient.name ?? null,
      shippingMethod: selected.id,
      shippingService: selected.name,
      shippingCents,
      subtotalCents,
      discountCents: 0,
      taxCents: 0,
      totalCents,
      currency: STORE_CURRENCY,
      addresses: {
        create: {
          kind: "shipping",
          name: input.recipient.name ?? input.customerName ?? "Customer",
          company: input.recipient.company ?? null,
          line1: input.recipient.address1 ?? "",
          line2: input.recipient.address2 ?? null,
          city: input.recipient.city ?? "",
          state: input.recipient.state_code ?? null,
          postalCode: input.recipient.zip ?? null,
          countryCode: input.recipient.country_code,
          phone: input.recipient.phone ?? null,
          email: input.email,
        },
      },
      items: {
        create: cart.items.map((item) => ({
          productId: item.variant.productId,
          variantId: item.variantId,
          printfulVariantId: item.variant.printfulVariantId,
          name: item.variant.product.name,
          sku: item.variant.sku,
          size: item.variant.size,
          color: item.variant.color,
          quantity: item.quantity,
          unitPriceCents: variantPriceCents(item.variant),
          lineTotalCents: variantPriceCents(item.variant) * item.quantity,
          currency: STORE_CURRENCY,
        })),
      },
      events: {
        create: {
          type: "order_created",
          message: "Order created from cart",
        },
      },
    },
    include: {
      items: true,
      addresses: true,
      events: { orderBy: { createdAt: "desc" } },
    },
  });

  return {
    order,
    totalCents,
    items: cart.items.map((item) => ({
      name: paymentDescription(item.variant),
      variantId: item.variantId,
      quantity: item.quantity,
      unitPriceCents: variantPriceCents(item.variant),
    })),
  };
}

/** Kept local so the checkout service has no dependency cycle with orders.ts. */
async function generateOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const stamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    const candidate = `DOT-${stamp}-${random}`;
    const exists = await prisma.order.findUnique({
      where: { orderNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }

  throw new Error("Could not generate a unique order number.");
}

/** Removes a half-created order; the cart is untouched until payment succeeds. */
async function revertCheckout(orderId: string): Promise<void> {
  await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
}

/**
 * Creates the order snapshot, opens a payment session and marks the cart
 * converted. Only the verified webhook may mark the order paid.
 */
export async function createCheckout(
  event: H3Event,
  user: SessionUser | null,
  input: CheckoutInput,
): Promise<CheckoutResult> {
  let provider;
  try {
    provider = getPaymentProvider();
  } catch (error) {
    throw createError({
      statusCode: 503,
      statusMessage:
        error instanceof Error
          ? error.message
          : "The payment provider is not configured.",
    });
  }

  const cart = await resolveCart(event, user?.id ?? null, { create: false });

  if (!cart) {
    throw createError({ statusCode: 400, statusMessage: "Your cart is empty." });
  }

  const built = await buildOrder(cart, user, input);

  const successUrl = new URL("/checkout/success", input.origin);
  successUrl.searchParams.set("order", built.order.orderNumber);
  const cancelUrl = new URL("/checkout/canceled", input.origin);
  cancelUrl.searchParams.set("order", built.order.orderNumber);

  let result;
  try {
    result = await provider.createPayment({
      order: {
        id: built.order.id,
        orderNumber: built.order.orderNumber,
        email: input.email,
        currency: STORE_CURRENCY,
        totalCents: built.totalCents,
        items: built.items,
      },
      successUrl: successUrl.toString(),
      cancelUrl: cancelUrl.toString(),
      idempotencyKey: built.order.id,
    });
  } catch (error) {
    await revertCheckout(built.order.id);
    throw createError({
      statusCode: 502,
      statusMessage:
        error instanceof Error
          ? error.message
          : "The payment provider could not create a payment.",
    });
  }

  const payment = await prisma
    .$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          orderId: built.order.id,
          userId: user?.id ?? null,
          provider: provider.id,
          providerPaymentId:
            result.kind === "client_secret" ? result.providerPaymentId : null,
          providerCheckoutId:
            result.kind === "redirect" ? result.providerCheckoutId : null,
          status:
            result.kind === "client_secret"
              ? "requires_confirmation"
              : "requires_payment_method",
          amountCents: built.totalCents,
          currency: STORE_CURRENCY,
          metadata: JSON.stringify({
            idempotencyKey: built.order.id,
          }),
        },
      });

      const converted = await tx.cart.updateMany({
        where: { id: cart.id, status: "active" },
        data: { status: "converted", token: null, expiresAt: null },
      });

      if (converted.count !== 1) {
        throw createError({
          statusCode: 409,
          statusMessage: "This cart has already been checked out.",
        });
      }

      return created;
    })
    .catch(async (error) => {
      await revertCheckout(built.order.id);
      if ((error as { statusCode?: number }).statusCode) throw error;
      throw createError({
        statusCode: 500,
        statusMessage:
          error instanceof Error
            ? error.message
            : "Could not record the payment attempt.",
      });
    });

  clearCartCookie(event);

  const response: CheckoutResult = {
    order: serializeOrder(built.order as OrderWithDetails),
    payment: {
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      amountCents: payment.amountCents,
      currency: payment.currency,
    },
  };

  if (result.kind === "redirect") {
    response.redirectUrl = result.url;
  } else {
    response.clientSecret = result.clientSecret;
  }

  return response;
}

import Stripe from "stripe";
import type { PaymentProvider } from "./types";

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = raw.trim().replace(/^["']|["']$/g, "");
  return value || undefined;
}

function providerId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function clientFactory(secretKey: string): Stripe {
  // The SDK pins its API version internally; leaving it unset keeps the
  // installed SDK and the account's default API version aligned.
  return new Stripe(secretKey);
}

/**
 * Stripe adapter using hosted Checkout.
 *
 * Hosted Checkout keeps the card form off our origin (SAQ-A) and needs no
 * publishable key or Stripe.js. The PaymentIntent id is copied onto the
 * `Payment` row when the verified webhook arrives, so refunds work exactly as
 * with a PaymentIntent-first integration.
 */
export function createStripeProvider(
  secretKey: string,
  webhookSecret: string,
): PaymentProvider {
  const stripe = clientFactory(secretKey);

  async function constructEvent(rawBody: string, headers: Headers) {
    const signature = headers.get("stripe-signature");
    if (!signature) {
      throw new Error("Missing Stripe-Signature header.");
    }
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
    }
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  return {
    id: "stripe",

    async createPayment(input) {
      const itemTotal = input.order.items.reduce(
        (total, item) => total + item.unitPriceCents * item.quantity,
        0,
      );
      const adjustment = input.order.totalCents - itemTotal;

      if (adjustment < 0) {
        throw new Error(
          "Stripe cannot represent an order whose total is below the item subtotal.",
        );
      }

      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
        input.order.items.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: input.order.currency.toLowerCase(),
            unit_amount: item.unitPriceCents,
            product_data: {
              name: item.name,
              metadata: { variantId: item.variantId },
            },
          },
        }));

      if (adjustment > 0) {
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: input.order.currency.toLowerCase(),
            unit_amount: adjustment,
            product_data: { name: "Shipping & tax" },
          },
        });
      }

      const metadata = {
        orderId: input.order.id,
        orderNumber: input.order.orderNumber,
      };

      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          customer_email: input.order.email,
          client_reference_id: input.order.id,
          line_items: lineItems,
          metadata,
          payment_intent_data: { metadata },
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
        },
        { idempotencyKey: input.idempotencyKey },
      );

      if (!session.url) {
        throw new Error("Stripe did not return a checkout URL.");
      }

      return {
        kind: "redirect",
        url: session.url,
        providerCheckoutId: session.id,
      };
    },

    async verifyAndParseWebhook({ headers, rawBody }) {
      const event = await constructEvent(rawBody, headers);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid") {
          return {
            eventId: event.id,
            eventType: event.type,
            event: { type: "ignored", raw: event },
          };
        }

        return {
          eventId: event.id,
          eventType: event.type,
          event: {
            type: "payment_succeeded",
            providerPaymentId:
              providerId(session.payment_intent) ?? session.id,
            providerCheckoutId: session.id,
            orderId: session.metadata?.orderId ?? session.client_reference_id ?? undefined,
            amountCents: session.amount_total ?? 0,
            raw: event,
          },
        };
      }

      if (event.type === "payment_intent.succeeded") {
        const intent = event.data.object as Stripe.PaymentIntent;
        return {
          eventId: event.id,
          eventType: event.type,
          event: {
            type: "payment_succeeded",
            providerPaymentId: intent.id,
            orderId: intent.metadata?.orderId ?? undefined,
            amountCents: intent.amount_received || intent.amount,
            raw: event,
          },
        };
      }

      if (
        event.type === "payment_intent.payment_failed" ||
        event.type === "payment_intent.canceled"
      ) {
        const intent = event.data.object as Stripe.PaymentIntent;
        return {
          eventId: event.id,
          eventType: event.type,
          event: {
            type: "payment_failed",
            providerPaymentId: intent.id,
            orderId: intent.metadata?.orderId ?? undefined,
            failureMessage:
              intent.last_payment_error?.message ??
              (intent.status === "canceled" ? "Payment canceled." : undefined),
            raw: event,
          },
        };
      }

      if (event.type === "charge.refunded") {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntent = providerId(charge.payment_intent);
        if (!paymentIntent) {
          return {
            eventId: event.id,
            eventType: event.type,
            event: { type: "ignored", raw: event },
          };
        }
        return {
          eventId: event.id,
          eventType: event.type,
          event: {
            type: "payment_refunded",
            providerPaymentId: paymentIntent,
            providerRefundId: charge.refunds?.data?.[0]?.id,
            amountCents: charge.amount_refunded,
            raw: event,
          },
        };
      }

      if (event.type === "refund.updated" || event.type === "refund.failed") {
        const refund = event.data.object as Stripe.Refund;
        const paymentIntent = providerId(refund.payment_intent);
        if (!paymentIntent || refund.status !== "succeeded") {
          return {
            eventId: event.id,
            eventType: event.type,
            event: { type: "ignored", raw: event },
          };
        }
        return {
          eventId: event.id,
          eventType: event.type,
          event: {
            type: "payment_refunded",
            providerPaymentId: paymentIntent,
            providerRefundId: refund.id,
            amountCents: refund.amount,
            raw: event,
          },
        };
      }

      return {
        eventId: event.id,
        eventType: event.type,
        event: { type: "ignored", raw: event },
      };
    },

    async refund({ providerPaymentId, amountCents, reason }) {
      const refund = await stripe.refunds.create({
        payment_intent: providerPaymentId,
        amount: amountCents,
        reason: reason === "fraudulent" || reason === "requested_by_customer"
          ? reason
          : undefined,
        metadata: reason ? { note: reason } : undefined,
      });

      return {
        providerRefundId: refund.id,
        status: refund.status ?? "pending",
      };
    },
  };
}

export function getStripeSecretKey(): string | undefined {
  return readEnv("STRIPE_SECRET_KEY");
}

export function getStripeWebhookSecret(): string | undefined {
  return readEnv("STRIPE_WEBHOOK_SECRET");
}

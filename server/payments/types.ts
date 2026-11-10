/**
 * Provider-agnostic payment boundary.
 *
 * Nothing outside `server/payments/` may import a provider SDK. Checkout passes
 * normalized order data in; adapters return either a client secret or a hosted
 * redirect. Webhooks are always verified and normalized before they reach the
 * order/payment state machine.
 */

export type PaymentProviderId = "stripe" | "polar" | "paypal" | "manual";

export type CreatePaymentInput = {
  order: {
    id: string;
    orderNumber: string;
    email: string;
    currency: string;
    /** Order total in minor units, including shipping/tax/discount. */
    totalCents: number;
    items: Array<{
      name: string;
      variantId: string;
      quantity: number;
      unitPriceCents: number;
    }>;
  };
  successUrl: string;
  cancelUrl: string;
  /** Stable per attempt: `order.id` for the first try, `order.id:2` for retries. */
  idempotencyKey: string;
};

export type CreatePaymentResult =
  | { kind: "client_secret"; clientSecret: string; providerPaymentId: string }
  | { kind: "redirect"; url: string; providerCheckoutId: string };

export type NormalizedEvent =
  | {
      type: "payment_succeeded";
      providerPaymentId: string;
      /** Hosted-checkout session id when the provider has one. */
      providerCheckoutId?: string;
      /** Our order id, copied into provider metadata at session creation. */
      orderId?: string;
      amountCents: number;
      raw: unknown;
    }
  | {
      type: "payment_failed";
      providerPaymentId: string;
      providerCheckoutId?: string;
      orderId?: string;
      failureMessage?: string;
      raw: unknown;
    }
  | {
      type: "payment_refunded";
      providerPaymentId: string;
      providerCheckoutId?: string;
      providerRefundId?: string;
      orderId?: string;
      /** Cumulative refunded amount for the payment, not the delta. */
      amountCents: number;
      raw: unknown;
    }
  | { type: "ignored"; raw: unknown };

export interface PaymentProvider {
  id: PaymentProviderId;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyAndParseWebhook(input: {
    headers: Headers;
    rawBody: string;
  }): Promise<{ eventId: string; eventType?: string; event: NormalizedEvent }>;
  refund(input: {
    providerPaymentId: string;
    amountCents: number;
    reason?: string;
  }): Promise<{ providerRefundId: string; status: string }>;
}

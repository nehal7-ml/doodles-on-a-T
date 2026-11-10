import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "./types";

/**
 * Bank transfer / cash / development provider.
 *
 * It creates no external session. The customer is sent to the success page and
 * an admin marks the payment as paid through `POST /api/orders/:id/mark-paid`.
 * Refunds are recorded locally and settled outside the app.
 */
export function createManualProvider(): PaymentProvider {
  return {
    id: "manual",

    async createPayment(input) {
      return {
        kind: "redirect",
        url: input.successUrl,
        providerCheckoutId: `manual_${randomUUID()}`,
      };
    },

    async verifyAndParseWebhook() {
      // Manual payments have no webhook surface. The endpoint refuses them
      // before calling the adapter, so this can only be reached by a bug.
      return {
        eventId: `manual_${randomUUID()}`,
        eventType: "manual",
        event: { type: "ignored", raw: null },
      };
    },

    async refund(input) {
      return {
        providerRefundId: `manual_refund_${randomUUID()}`,
        status: input.amountCents > 0 ? "pending" : "failed",
      };
    },
  };
}

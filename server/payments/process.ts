import { orderConfirmationEmail } from "../email/templates";
import { sendEmail } from "../email";
import { addOrderEvent, submitOrderToPrintful } from "../utils/orders";
import { prisma } from "../utils/prisma";
import type { NormalizedEvent, PaymentProviderId } from "./types";

function json(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

async function findPayment(event: NormalizedEvent) {
  if (event.type === "ignored") return null;

  const or = [
    ...(event.providerPaymentId
      ? [{ providerPaymentId: event.providerPaymentId }]
      : []),
    ...("providerCheckoutId" in event && event.providerCheckoutId
      ? [{ providerCheckoutId: event.providerCheckoutId }]
      : []),
  ];

  if (or.length > 0) {
    const payment = await prisma.payment.findFirst({
      where: { OR: or },
      include: { order: true },
      orderBy: { createdAt: "desc" },
    });
    if (payment) return payment;
  }

  return null;
}

async function createMissingPayment(
  provider: PaymentProviderId,
  event: NormalizedEvent,
) {
  if (event.type === "ignored" || !event.orderId) return null;

  const order = await prisma.order.findUnique({
    where: { id: event.orderId },
  });
  if (!order) return null;

  const amountCents =
    event.type === "payment_succeeded" && event.amountCents > 0
      ? event.amountCents
      : order.totalCents;

  return prisma.payment.create({
    data: {
      orderId: order.id,
      userId: order.userId,
      provider,
      providerPaymentId: event.providerPaymentId,
      providerCheckoutId:
        "providerCheckoutId" in event ? event.providerCheckoutId ?? null : null,
      status: "requires_payment_method",
      amountCents,
      currency: order.currency,
      metadata: JSON.stringify({ reconciledFromWebhook: true }),
      raw: json(event.raw),
    },
    include: { order: true },
  });
}

export async function sendOrderConfirmation(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order?.email) return;

  const alreadySent = await prisma.orderEvent.findFirst({
    where: { orderId, type: "email.order_confirmation" },
    select: { id: true },
  });
  if (alreadySent) return;

  const template = orderConfirmationEmail({
    name: order.customerName,
    orderNumber: order.orderNumber,
    total: money(order.totalCents, order.currency),
    items: order.items.map((item) => ({
      name: item.size ? `${item.name} (${item.size})` : item.name,
      quantity: item.quantity,
    })),
  });

  try {
    await sendEmail({
      to: order.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
    await addOrderEvent(
      order.id,
      "email.order_confirmation",
      "Order confirmation email sent",
    );
  } catch (error) {
    await addOrderEvent(
      order.id,
      "email.order_confirmation_failed",
      error instanceof Error
        ? error.message
        : "Order confirmation email failed",
    );
  }
}

async function markSucceeded(
  provider: PaymentProviderId,
  event: Extract<NormalizedEvent, { type: "payment_succeeded" }>,
): Promise<{ status: "processed"; orderId?: string; error?: string }> {
  const existing =
    (await findPayment(event)) ?? (await createMissingPayment(provider, event));

  if (!existing) {
    return { status: "processed" };
  }

  const previousStatus = existing.order.paymentStatus;
  const alreadyPaid = previousStatus === "paid";
  const amountCents =
    event.amountCents > 0 ? event.amountCents : existing.amountCents;

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: existing.id },
      data: {
        status: "succeeded",
        providerPaymentId:
          event.providerPaymentId || existing.providerPaymentId,
        providerCheckoutId:
          event.providerCheckoutId ?? existing.providerCheckoutId,
        amountCents,
        raw: json(event.raw),
      },
    });

    await tx.order.update({
      where: { id: existing.orderId },
      data: {
        paymentStatus: "paid",
        ...(existing.order.status === "pending"
          ? { status: "submitted" }
          : {}),
      },
    });

    if (!alreadyPaid) {
      await tx.orderEvent.create({
        data: {
          orderId: existing.orderId,
          type: "payment_succeeded",
          message: `Payment received (${money(amountCents, existing.currency)})`,
          payload: json({
            paymentId: existing.id,
            provider,
            providerPaymentId: event.providerPaymentId,
          }),
        },
      });
    }
  });

  if (alreadyPaid) {
    return { status: "processed", orderId: existing.orderId };
  }

  // Everything below is deliberately outside the money transaction: a failed
  // email or Printful call must never roll back a captured payment.
  let error: string | undefined;

  await sendOrderConfirmation(existing.orderId);

  try {
    await submitOrderToPrintful(existing.orderId);
  } catch (submitError) {
    error =
      submitError instanceof Error
        ? submitError.message
        : "Could not submit the order to Printful.";
  }

  return { status: "processed", orderId: existing.orderId, error };
}

async function markFailed(
  provider: PaymentProviderId,
  event: Extract<NormalizedEvent, { type: "payment_failed" }>,
): Promise<{ status: "processed"; orderId?: string }> {
  const payment =
    (await findPayment(event)) ?? (await createMissingPayment(provider, event));

  if (!payment) return { status: "processed" };

  const succeeded = await prisma.payment.count({
    where: { orderId: payment.orderId, status: "succeeded" },
  });

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "failed",
        failureMessage: event.failureMessage ?? "Payment failed.",
        raw: json(event.raw),
      },
    });

    if (succeeded === 0) {
      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: "failed" },
      });
    }

    await tx.orderEvent.create({
      data: {
        orderId: payment.orderId,
        type: "payment_failed",
        message: event.failureMessage ?? "Payment failed",
        payload: json({
          paymentId: payment.id,
          providerPaymentId: event.providerPaymentId,
        }),
      },
    });
  });

  return { status: "processed", orderId: payment.orderId };
}

async function markRefunded(
  event: Extract<NormalizedEvent, { type: "payment_refunded" }>,
): Promise<{ status: "processed"; orderId?: string }> {
  const payment = await findPayment(event);

  if (!payment) return { status: "processed" };

  const captured = await prisma.payment.count({
    where: { orderId: payment.orderId, status: "succeeded" },
  });

  // A refund event for an order that was never captured must not flip the
  // order to paid/refunded. Record nothing and let the event stay processed.
  if (captured === 0) {
    return { status: "processed", orderId: payment.orderId };
  }

  const nextRefunded = Math.max(
    payment.amountRefundedCents,
    event.amountCents,
  );
  const delta = Math.max(0, nextRefunded - payment.amountRefundedCents);

  const result = await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        amountRefundedCents: nextRefunded,
        raw: json(event.raw),
      },
    });

    const payments = await tx.payment.findMany({
      where: { orderId: payment.orderId },
      select: { amountCents: true, amountRefundedCents: true, status: true },
    });
    const succeeded = payments.filter((row) => row.status === "succeeded");
    const refundedCents = succeeded.reduce(
      (total, row) => total + row.amountRefundedCents,
      0,
    );
    const paidCents = succeeded.reduce(
      (total, row) => total + row.amountCents,
      0,
    );

    const paymentStatus =
      refundedCents >= paidCents && paidCents > 0
        ? "refunded"
        : refundedCents > 0
          ? "partially_refunded"
          : "paid";

    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        refundedCents,
        paymentStatus,
        ...(paymentStatus === "refunded" ? { status: "refunded" } : {}),
      },
    });

    const existingRefund = event.providerRefundId
      ? await tx.refund.findUnique({
          where: { providerRefundId: event.providerRefundId },
        })
      : await tx.refund.findFirst({
          where: { paymentId: payment.id, status: "pending" },
          orderBy: { createdAt: "desc" },
        });

    // A pending row written by the admin refund endpoint is not yet reflected
    // in `payment.amountRefundedCents`; reuse it instead of inserting a second
    // row with the same providerRefundId (which would violate the unique key).
    let coveredCents = 0;
    if (
      existingRefund &&
      existingRefund.status !== "succeeded" &&
      (delta > 0 || Boolean(event.providerRefundId))
    ) {
      coveredCents = Math.min(existingRefund.amountCents, delta);
      await tx.refund.update({
        where: { id: existingRefund.id },
        data: {
          status: "succeeded",
          ...(coveredCents > 0 ? { amountCents: coveredCents } : {}),
          ...(event.providerRefundId && !existingRefund.providerRefundId
            ? { providerRefundId: event.providerRefundId }
            : {}),
        },
      });
    }

    const uncoveredCents = Math.max(0, delta - coveredCents);
    if (uncoveredCents > 0) {
      await tx.refund.create({
        data: {
          paymentId: payment.id,
          providerRefundId: existingRefund
            ? null
            : (event.providerRefundId ?? null),
          amountCents: uncoveredCents,
          currency: payment.currency,
          status: "succeeded",
        },
      });
    }

    if (delta > 0) {
      await tx.orderEvent.create({
        data: {
          orderId: payment.orderId,
          type: "payment_refunded",
          message: `Refund received (${money(delta, payment.currency)})`,
          payload: json({
            paymentId: payment.id,
            providerPaymentId: event.providerPaymentId,
            providerRefundId: event.providerRefundId,
            totalRefundedCents: nextRefunded,
          }),
        },
      });
    }

    return { orderId: payment.orderId };
  });

  return { status: "processed", ...result };
}

/**
 * Applies one verified, de-duplicated provider event.
 *
 * The caller (webhook endpoint) only records the raw event and calls this once
 * per provider event id, so every handler here is safe to replay manually.
 */
export async function applyPaymentEvent(
  provider: PaymentProviderId,
  event: NormalizedEvent,
): Promise<{ status: "processed" | "ignored"; orderId?: string; error?: string }> {
  if (event.type === "ignored") {
    return { status: "ignored" };
  }

  if (event.type === "payment_succeeded") {
    return markSucceeded(provider, event);
  }

  if (event.type === "payment_failed") {
    return markFailed(provider, event);
  }

  return markRefunded(event);
}

import { createError, getRouterParam, readBody } from "h3";
import type { PaymentProviderId } from "../../../payments/types";
import { getPaymentProviderById } from "../../../payments";
import { assertSameOrigin } from "../../../auth/csrf";
import { getOrderDetails, serializeOrder } from "../../../utils/orders";
import { prisma } from "../../../utils/prisma";
import { requireAdminOrToken } from "../../../utils/auth";

/**
 * Admin-only refund. Stripe refunds stay `pending` until the verified webhook
 * confirms them; manual refunds are settled locally (money moves out of band).
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdminOrToken(event);
  assertSameOrigin(event);

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Order id is required." });
  }

  const body = (await readBody(event).catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const reason =
    typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 200)
      : undefined;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: "Order not found." });
  }

  const payment = order.payments.find(
    (row) =>
      row.status === "succeeded" &&
      row.amountRefundedCents < row.amountCents,
  );
  if (!payment) {
    throw createError({
      statusCode: 409,
      statusMessage: "This order has no refundable payment.",
    });
  }

  const remaining = payment.amountCents - payment.amountRefundedCents;
  const requested =
    body?.amountCents === undefined || body.amountCents === null
      ? remaining
      : Number(body.amountCents);

  if (!Number.isInteger(requested) || requested < 1 || requested > remaining) {
    throw createError({
      statusCode: 400,
      statusMessage: `amountCents must be a whole number between 1 and ${remaining}.`,
    });
  }

  const providerId = payment.provider as PaymentProviderId;
  if (providerId !== "stripe" && providerId !== "manual") {
    throw createError({
      statusCode: 409,
      statusMessage: `Refunds are not implemented for ${payment.provider}.`,
    });
  }

  const provider = getPaymentProviderById(providerId);
  if (!payment.providerPaymentId && providerId === "stripe") {
    throw createError({
      statusCode: 409,
      statusMessage:
        "Stripe has not reported a PaymentIntent for this order yet. Try again after the webhook.",
    });
  }

  let remote;
  try {
    remote = await provider.refund({
      providerPaymentId: payment.providerPaymentId ?? payment.id,
      amountCents: requested,
      reason,
    });
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage:
        error instanceof Error ? error.message : "The refund could not be created.",
    });
  }

  const settled = providerId === "manual" || remote.status === "succeeded";

  const refund = await prisma.$transaction(async (tx) => {
    const row = await tx.refund.create({
      data: {
        paymentId: payment.id,
        providerRefundId: remote.providerRefundId,
        amountCents: requested,
        currency: payment.currency,
        reason,
        status: settled ? "succeeded" : "pending",
      },
    });

    if (settled) {
      const nextRefunded = payment.amountRefundedCents + requested;
      await tx.payment.update({
        where: { id: payment.id },
        data: { amountRefundedCents: nextRefunded },
      });

      const payments = await tx.payment.findMany({
        where: { orderId: order.id },
        select: { amountCents: true, amountRefundedCents: true, status: true },
      });
      const refundedCents = payments.reduce(
        (total, item) => total + item.amountRefundedCents,
        0,
      );
      const paidCents = payments
        .filter((item) => item.status === "succeeded")
        .reduce((total, item) => total + item.amountCents, 0);
      const paymentStatus =
        refundedCents >= paidCents && paidCents > 0
          ? "refunded"
          : "partially_refunded";

      await tx.order.update({
        where: { id: order.id },
        data: {
          refundedCents,
          paymentStatus,
          ...(paymentStatus === "refunded" ? { status: "refunded" } : {}),
        },
      });
    }

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: "refund_requested",
        message: `Refund of ${(requested / 100).toFixed(2)} ${payment.currency} requested`,
        payload: JSON.stringify({
          refundId: row.id,
          providerRefundId: remote.providerRefundId,
          status: remote.status,
          reason,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: admin?.id ?? null,
        action: "order.refund",
        entityType: "Order",
        entityId: order.id,
        after: JSON.stringify({
          refundId: row.id,
          amountCents: requested,
          provider: providerId,
          reason,
        }),
      },
    });

    return row;
  });

  const details = await getOrderDetails(order.id);

  return {
    order: details ? serializeOrder(details) : null,
    refund: {
      id: refund.id,
      status: refund.status,
      amountCents: refund.amountCents,
      currency: refund.currency,
    },
  };
});

import { createError } from "h3";
import { getQuery } from "h3";
import { requireUser } from "../../utils/auth";
import { prisma } from "../../utils/prisma";

/**
 * Transaction ledger for the signed-in customer: every payment recorded
 * against their orders (captures, failures, refunds) with the refunds that
 * followed, newest first.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);

  const query = getQuery(event);
  const limitParam =
    typeof query.limit === "string" ? query.limit : "50";
  const limit = Math.min(
    Math.max(Number.parseInt(limitParam, 10) || 50, 1),
    100,
  );

  const payments = await prisma.payment.findMany({
    where: { OR: [{ userId: user.id }, { order: { userId: user.id } }] },
    include: {
      order: { select: { id: true, orderNumber: true, status: true } },
      refunds: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const transactions = payments.map((payment) => ({
    id: payment.id,
    orderId: payment.orderId,
    orderNumber: payment.order?.orderNumber ?? null,
    orderStatus: payment.order?.status ?? null,
    provider: payment.provider,
    status: payment.status,
    amountCents: payment.amountCents,
    amountRefundedCents: payment.amountRefundedCents,
    currency: payment.currency,
    method: payment.method,
    brand: payment.brand,
    last4: payment.last4,
    receiptUrl: payment.receiptUrl,
    failureMessage: payment.failureMessage,
    createdAt: payment.createdAt.toISOString(),
    refunds: payment.refunds.map((refund) => ({
      id: refund.id,
      amountCents: refund.amountCents,
      currency: refund.currency,
      status: refund.status,
      reason: refund.reason,
      createdAt: refund.createdAt.toISOString(),
    })),
  }));

  return { transactions };
});

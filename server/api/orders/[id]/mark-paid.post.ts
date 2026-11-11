import { createError, getRouterParam, readBody } from "h3";
import { assertSameOrigin } from "../../../auth/csrf";
import { sendOrderConfirmation } from "../../../payments/process";
import {
  getOrderDetails,
  serializeOrder,
  submitOrderToPrintful,
} from "../../../utils/orders";
import { prisma } from "../../../utils/prisma";
import { requireAdminOrToken } from "../../../utils/auth";

/**
 * Admin/manual settlement. Only manual (bank transfer, cash) payments may be
 * marked paid by hand; a Stripe payment must arrive through its webhook.
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
  const note =
    typeof body?.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 500)
      : "Marked paid by an administrator";

  const order = await prisma.order.findUnique({
    where: { id },
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: "Order not found." });
  }
  if (order.paymentStatus === "paid") {
    const details = await getOrderDetails(id);
    if (!details) {
      throw createError({ statusCode: 404, statusMessage: "Order not found." });
    }
    return { order: serializeOrder(details) };
  }

  const external = order.payments.find((payment) => payment.provider !== "manual");
  if (external) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "This order has an external payment attempt. Settle it through the provider webhook.",
    });
  }

  const amountCents = order.totalCents;
  const payment = order.payments[0];

  await prisma.$transaction(async (tx) => {
    if (payment) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "succeeded",
          amountCents,
          method: "manual",
          failureCode: null,
          failureMessage: null,
        },
      });
    } else {
      await tx.payment.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          provider: "manual",
          status: "succeeded",
          amountCents,
          currency: order.currency,
          method: "manual",
        },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "paid",
        ...(order.status === "pending" ? { status: "submitted" } : {}),
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: "payment_succeeded",
        message: note,
        payload: JSON.stringify({ method: "manual", amountCents }),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: admin?.id ?? null,
        action: "order.mark_paid",
        entityType: "Order",
        entityId: order.id,
        after: JSON.stringify({ amountCents, note }),
      },
    });
  });

  await sendOrderConfirmation(order.id);

  let printfulError: string | undefined;
  try {
    await submitOrderToPrintful(order.id);
  } catch (error) {
    printfulError =
      error instanceof Error ? error.message : "Printful submission failed.";
  }

  const updated = await getOrderDetails(order.id);
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "Order not found." });
  }
  return {
    order: serializeOrder(updated),
    printfulError,
  };
});

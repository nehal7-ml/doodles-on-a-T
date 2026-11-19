import { createError } from "h3";
import type {
  Order,
  OrderAddress,
  OrderEvent,
  OrderItem,
} from "../generated/prisma/client";
import { prisma } from "./prisma";
import type { ShippingAddress } from "./shipping";

export type OrderWithDetails = Order & {
  items: OrderItem[];
  events: OrderEvent[];
  addresses: OrderAddress[];
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting payment",
  submitted: "Order received",
  draft: "Draft",
  inprocess: "In production",
  in_production: "In production",
  partial: "Partially fulfilled",
  partially_fulfilled: "Partially fulfilled",
  fulfilled: "Fulfilled",
  shipped: "Shipped",
  delivered: "Delivered",
  returned: "Returned",
  refunded: "Refunded",
  canceled: "Canceled",
  failed: "Failed",
  onhold: "On hold",
  on_hold: "On hold",
};

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function generateOrderNumber(): Promise<string> {
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

function toMajorUnits(cents: number): number {
  return cents / 100;
}

export type CreateLocalOrderInput = {
  recipient: ShippingAddress;
  items: Array<{ variantId: string; quantity: number }>;
  email: string;
  customerName?: string | null;
  shippingMethod: string;
  shippingService?: string | null;
  shippingCents: number;
  discountCents?: number;
  taxCents?: number;
};

/**
 * Creates the local order snapshot. Prices always come from the database so a
 * client cannot change them; the selected shipping rate is passed in by the
 * caller after it has been quoted by `calculateShippingRates`.
 */
export async function createLocalOrder(
  input: CreateLocalOrderInput,
): Promise<OrderWithDetails> {
  const variantIds = [...new Set(input.items.map((item) => item.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: true },
  });

  const byId = new Map(variants.map((variant) => [variant.id, variant]));

  const items: Array<Omit<OrderItem, "id" | "orderId">> = [];
  let subtotalCents = 0;
  let currency: string | null = null;

  for (const item of input.items) {
    const variant = byId.get(item.variantId);
    if (!variant) {
      throw createError({
        statusCode: 404,
        statusMessage: `Product variant "${item.variantId}" was not found.`,
      });
    }
    if (
      !variant.isActive ||
      !variant.inStock ||
      variant.product.status !== "active"
    ) {
      throw createError({
        statusCode: 409,
        statusMessage: `${variant.name} is currently unavailable.`,
      });
    }

    const priceCents = variant.priceCents ?? variant.product.priceCents;
    const itemCurrency = variant.currency ?? variant.product.currency ?? "USD";

    // The cart and the shipping quote must use one currency; otherwise the
    // numeric total would silently mix units.
    if (currency && currency !== itemCurrency) {
      throw createError({
        statusCode: 409,
        statusMessage: "Cart items must all use the same currency.",
      });
    }
    currency = itemCurrency;
    subtotalCents += priceCents * item.quantity;

    items.push({
      productId: variant.productId,
      variantId: variant.id,
      printfulItemId: null,
      printfulVariantId: variant.printfulVariantId,
      name: variant.name,
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      quantity: item.quantity,
      unitPriceCents: priceCents,
      lineTotalCents: priceCents * item.quantity,
      currency: itemCurrency,
    });
  }

  const discountCents = Math.max(0, Math.round(input.discountCents ?? 0));
  const taxCents = Math.max(0, Math.round(input.taxCents ?? 0));
  const shippingCents = Math.max(0, Math.round(input.shippingCents));
  const totalCents = Math.max(
    0,
    subtotalCents - discountCents + taxCents + shippingCents,
  );
  const orderNumber = await generateOrderNumber();

  return prisma.order.create({
    data: {
      orderNumber,
      externalId: orderNumber,
      status: "pending",
      email: input.email,
      customerName: input.customerName ?? input.recipient.name ?? null,
      shippingMethod: input.shippingMethod,
      shippingService: input.shippingService ?? null,
      shippingCents,
      subtotalCents,
      discountCents,
      taxCents,
      totalCents,
      currency: currency ?? "USD",
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
          email: input.recipient.email ?? input.email,
        },
      },
      items: { create: items },
      events: {
        create: {
          type: "order_created",
          message: "Order created",
        },
      },
    },
    include: {
      items: true,
      addresses: true,
      events: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function addOrderEvent(
  orderId: string,
  type: string,
  message: string,
  payload?: unknown,
): Promise<void> {
  await prisma.orderEvent.create({
    data: {
      orderId,
      type,
      message,
      payload: payload === undefined ? null : JSON.stringify(payload),
    },
  });
}

/**
 * Cancel a local order. Orders are never sent to any fulfillment provider
 * (this is a demo storefront), so cancellation is always local.
 */
export async function cancelOrder(orderId: string): Promise<OrderWithDetails> {
  const local = await prisma.order.findUnique({ where: { id: orderId } });
  if (!local) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  return prisma.order.update({
    where: { id: orderId },
    data: {
      status: "canceled",
      canceledAt: new Date(),
      events: {
        create: {
          type: "order_canceled",
          message: "Order canceled",
        },
      },
    },
    include: {
      items: true,
      addresses: true,
      events: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function getOrderDetails(
  orderId: string,
): Promise<OrderWithDetails | null> {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      addresses: true,
      events: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function findOrderForTracking(
  orderNumber: string,
  email: string,
): Promise<OrderWithDetails> {
  const order = await prisma.order.findFirst({
    where: {
      OR: [{ orderNumber }, { externalId: orderNumber }],
    },
    include: {
      items: true,
      addresses: true,
      events: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!order) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  if (!order.email || order.email.toLowerCase() !== email.trim().toLowerCase()) {
    // Deliberately return 404 instead of 403 so order numbers cannot be probed.
    // An order without a stored email cannot be looked up publicly.
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  return order;
}

export function serializeOrder(order: OrderWithDetails) {
  const shippingAddress = order.addresses?.find(
    (address) => address.kind === "shipping",
  );
  const recipient: ShippingAddress | Record<string, never> = shippingAddress
    ? {
        name: shippingAddress.name,
        company: shippingAddress.company ?? undefined,
        address1: shippingAddress.line1,
        address2: shippingAddress.line2 ?? undefined,
        city: shippingAddress.city,
        state_code: shippingAddress.state ?? undefined,
        country_code: shippingAddress.countryCode,
        zip: shippingAddress.postalCode ?? undefined,
        phone: shippingAddress.phone ?? undefined,
        email: shippingAddress.email ?? undefined,
      }
    : {};

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status] ?? order.status,
    paymentStatus: order.paymentStatus,
    printfulStatus: order.printfulStatus,
    refundedCents: order.refundedCents,
    userId: order.userId,
    printfulOrderId: order.printfulOrderId,
    email: order.email,
    customerName: order.customerName,
    shipping: {
      method: order.shippingMethod,
      service: order.shippingService,
      cost: toMajorUnits(order.shippingCents),
      costCents: order.shippingCents,
      currency: order.currency,
    },
    totals: {
      subtotal: toMajorUnits(order.subtotalCents),
      discount: toMajorUnits(order.discountCents),
      tax: toMajorUnits(order.taxCents),
      shipping: toMajorUnits(order.shippingCents),
      total: toMajorUnits(order.totalCents),
      currency: order.currency,
    },
    totalsCents: {
      subtotal: order.subtotalCents,
      discount: order.discountCents,
      tax: order.taxCents,
      shipping: order.shippingCents,
      total: order.totalCents,
      currency: order.currency,
    },
    recipient,
    addresses: (order.addresses ?? []).map((address) => ({
      id: address.id,
      kind: address.kind,
      name: address.name,
      company: address.company,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      countryCode: address.countryCode,
      phone: address.phone,
      email: address.email,
    })),
    tracking: {
      number: order.trackingNumber,
      url: order.trackingUrl,
      carrier: order.carrier,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
    },
    failureReason: order.failureReason,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      size: item.size,
      color: item.color,
      quantity: item.quantity,
      price: toMajorUnits(item.unitPriceCents),
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      currency: item.currency,
      productId: item.productId,
      variantId: item.variantId,
    })),
    events: order.events.map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      payload: parseJson<unknown>(event.payload, null),
      createdAt: event.createdAt,
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

import { createError } from "h3";
import type {
  Order,
  OrderAddress,
  OrderEvent,
  OrderItem,
} from "../generated/prisma/client";
import {
  printful,
  PrintfulError,
  type PrintfulAddress,
  type PrintfulOrder,
  type PrintfulOrderItem,
} from "./printful";
import { prisma } from "./prisma";

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

function toDate(value: number | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    // Printful v1 timestamps are Unix seconds.
    return new Date(value < 10_000_000_000 ? value * 1000 : value);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type TrackingInfo = {
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrier: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  hasShipments: boolean;
  delivered: boolean;
};

export function extractTracking(order: PrintfulOrder): TrackingInfo {
  const shipments = order.shipments ?? [];

  const sorted = [...shipments].sort(
    (a, b) => (b.shipped_at ?? b.created) - (a.shipped_at ?? a.created),
  );

  const latest =
    sorted.find(
      (shipment) =>
        shipment.tracking_number !== null &&
        shipment.tracking_number !== undefined &&
        String(shipment.tracking_number) !== "0",
    ) ?? sorted[0];

  const delivered = shipments.some(
    (shipment) =>
      Boolean(shipment.delivered_at) ||
      shipment.delivery_status?.toLowerCase() === "delivered" ||
      shipment.shipment_status?.toLowerCase() === "delivered",
  );

  const deliveredShipment = shipments.find(
    (shipment) =>
      Boolean(shipment.delivered_at) ||
      shipment.delivery_status?.toLowerCase() === "delivered" ||
      shipment.shipment_status?.toLowerCase() === "delivered",
  );

  return {
    trackingNumber:
      latest?.tracking_number !== null &&
      latest?.tracking_number !== undefined &&
      String(latest.tracking_number) !== "0"
        ? String(latest.tracking_number)
        : null,
    trackingUrl: latest?.tracking_url ?? null,
    carrier: latest?.carrier ?? null,
    shippedAt: toDate(latest?.shipped_at),
    deliveredAt: toDate(deliveredShipment?.delivered_at),
    hasShipments: shipments.length > 0,
    delivered,
  };
}

function mapStatus(order: PrintfulOrder, tracking: TrackingInfo): string {
  if (order.status === "canceled") return "canceled";
  if (order.status === "failed") return "failed";
  if (order.status === "onhold") return "onhold";
  if (tracking.delivered) return "delivered";
  if (tracking.hasShipments) {
    return order.status === "partial" ? "partial" : "shipped";
  }
  return order.status || "pending";
}

function toCents(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function toMajorUnits(cents: number): number {
  return cents / 100;
}

function itemSubtotalCents(order: PrintfulOrder): number {
  return order.items.reduce((total, item) => {
    const price = toCents(item.retail_price ?? item.price ?? 0);
    return total + price * item.quantity;
  }, 0);
}

function mapPrintfulOrderToLocal(
  order: PrintfulOrder,
  existing?: Order | null,
) {
  const tracking = extractTracking(order);
  const retail = order.retail_costs;
  const costs = order.costs;

  const shippingCents =
    existing?.shippingCents ??
    (retail
      ? toCents(retail.shipping)
      : costs
        ? toCents(costs.shipping)
        : 0);
  const subtotalCents =
    existing?.subtotalCents ??
    (retail ? toCents(retail.subtotal) : itemSubtotalCents(order));
  const discountCents =
    existing?.discountCents ?? (retail ? toCents(retail.discount) : 0);
  const taxCents = existing?.taxCents ?? (retail ? toCents(retail.tax) : 0);
  const totalCents =
    existing?.totalCents ??
    (retail
      ? toCents(retail.total)
      : costs
        ? toCents(costs.total)
        : itemSubtotalCents(order));

  return {
    status: mapStatus(order, tracking),
    printfulStatus: order.status ?? null,
    shippingMethod: order.shipping,
    shippingService: order.shipping_service_name,
    shippingCents,
    subtotalCents,
    discountCents,
    taxCents,
    totalCents,
    currency:
      existing?.currency ?? retail?.currency ?? costs?.currency ?? "USD",
    email: order.recipient?.email ?? existing?.email ?? "",
    customerName: order.recipient?.name ?? existing?.customerName ?? null,
    trackingNumber: tracking.trackingNumber,
    trackingUrl: tracking.trackingUrl,
    carrier: tracking.carrier,
    shippedAt: tracking.shippedAt,
    deliveredAt: tracking.deliveredAt,
    canceledAt:
      order.status === "canceled"
        ? (existing?.canceledAt ?? new Date())
        : (existing?.canceledAt ?? null),
    failureReason: order.error ?? null,
    raw: JSON.stringify(order),
  };
}

function orderAddressFromPrintful(
  order: PrintfulOrder,
  email: string,
): {
  kind: string;
  name: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  countryCode: string;
  phone: string | null;
  email: string;
} | null {
  const recipient = order.recipient;
  if (!recipient?.address1 && !recipient?.city) return null;

  return {
    kind: "shipping",
    name: recipient.name ?? "Customer",
    company: recipient.company ?? null,
    line1: recipient.address1 ?? "",
    line2: recipient.address2 ?? null,
    city: recipient.city ?? "",
    state: recipient.state_code ?? null,
    postalCode: recipient.zip ?? null,
    countryCode: recipient.country_code ?? "",
    phone: recipient.phone ?? null,
    email: recipient.email ?? email,
  };
}

async function buildOrderItem(
  item: PrintfulOrderItem,
  currency: string,
): Promise<Omit<OrderItem, "id" | "orderId">> {
  const variant = item.sync_variant_id
    ? await prisma.productVariant.findUnique({
        where: { printfulVariantId: item.sync_variant_id },
      })
    : null;
  const unitPriceCents = toCents(item.retail_price ?? item.price ?? 0);

  return {
    productId: variant?.productId ?? null,
    variantId: variant?.id ?? null,
    printfulItemId: item.id,
    printfulVariantId: item.sync_variant_id ?? item.variant_id ?? null,
    name: item.name,
    sku: variant?.sku ?? item.sku ?? null,
    size: variant?.size ?? null,
    color: variant?.color ?? null,
    quantity: item.quantity,
    unitPriceCents,
    lineTotalCents: unitPriceCents * item.quantity,
    currency,
  };
}

export type CreateLocalOrderInput = {
  recipient: PrintfulAddress;
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
 * caller after it has been quoted by Printful.
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
 * Creates or updates the local copy of an order from a Printful payload.
 * Used by the webhook receiver and by the "refresh" endpoints.
 */
export async function upsertOrderFromPrintful(
  order: PrintfulOrder,
  options: {
    eventType?: string;
    message?: string;
    payload?: unknown;
  } = {},
): Promise<OrderWithDetails> {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.order.findFirst({
        where: {
          OR: [
            { printfulOrderId: order.id },
            ...(order.external_id ? [{ externalId: order.external_id }] : []),
          ],
        },
        include: { items: true, events: true, addresses: true },
      });

      const data = mapPrintfulOrderToLocal(order, existing);
      const address = orderAddressFromPrintful(order, data.email);

      if (!existing) {
        const orderNumber = order.external_id || `PF-${order.id}`;
        const externalId = order.external_id || `pf-${order.id}`;
        const items = await Promise.all(
          order.items.map((item) => buildOrderItem(item, data.currency)),
        );

        return tx.order.create({
          data: {
            ...data,
            orderNumber,
            externalId,
            printfulOrderId: order.id,
            addresses: address ? { create: address } : undefined,
            items: { create: items },
            events: options.eventType
              ? {
                  create: {
                    type: options.eventType,
                    message: options.message ?? options.eventType,
                    payload:
                      options.payload === undefined
                        ? null
                        : JSON.stringify(options.payload),
                  },
                }
              : undefined,
          },
          include: {
            items: true,
            addresses: true,
            events: { orderBy: { createdAt: "desc" } },
          },
        });
      }

      const needsItems = existing.items.length === 0 && order.items.length > 0;
      const items = needsItems
        ? await Promise.all(
            order.items.map((item) => buildOrderItem(item, data.currency)),
          )
        : [];

      return tx.order.update({
        where: { id: existing.id },
        data: {
          ...data,
          printfulOrderId: order.id,
          ...(address
            ? {
                addresses: {
                  upsert: {
                    where: {
                      orderId_kind: { orderId: existing.id, kind: "shipping" },
                    },
                    create: address,
                    update: address,
                  },
                },
              }
            : {}),
          ...(needsItems ? { items: { create: items } } : {}),
          events: options.eventType
            ? {
                create: {
                  type: options.eventType,
                  message: options.message ?? options.eventType,
                  payload:
                    options.payload === undefined
                      ? null
                      : JSON.stringify(options.payload),
                },
              }
            : undefined,
        },
        include: {
          items: true,
          addresses: true,
          events: { orderBy: { createdAt: "desc" } },
        },
      });
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

export async function refreshOrderFromPrintful(
  orderId: string,
): Promise<OrderWithDetails> {
  const local = await prisma.order.findUnique({ where: { id: orderId } });
  if (!local) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  // Every local order has an externalId (the DOT-… order number), but that
  // only becomes a Printful order once submitOrderToPrintful has run. Use the
  // Printful id so refreshing an unsubmitted order cannot hit Printful with a
  // local-only external id.
  if (!local.printfulOrderId) {
    throw createError({
      statusCode: 409,
      statusMessage: "Order has not been submitted to Printful yet.",
    });
  }

  const remote = await printful.getOrder(local.printfulOrderId);

  return upsertOrderFromPrintful(remote, {
    eventType: "order_synced",
    message: "Order refreshed from Printful",
  });
}

/**
 * Submits a local order to Printful as a draft. Draft orders are not charged
 * and are not produced until `confirmPrintfulOrder` is called.
 */
export async function submitOrderToPrintful(
  orderId: string,
): Promise<OrderWithDetails> {
  const local = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, addresses: true },
  });

  if (!local) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  if (local.printfulOrderId) {
    return refreshOrderFromPrintful(orderId);
  }

  const items: Array<{
    sync_variant_id: number;
    quantity: number;
    retail_price: string;
  }> = [];

  for (const item of local.items) {
    let syncVariantId = item.printfulVariantId;

    if (!syncVariantId && item.variantId) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: item.variantId },
      });
      syncVariantId = variant?.printfulVariantId ?? null;
    }

    if (!syncVariantId) {
      throw createError({
        statusCode: 422,
        statusMessage: `"${item.name}" is not linked to a Printful variant. Run the product sync and try again.`,
      });
    }

    items.push({
      sync_variant_id: syncVariantId,
      quantity: item.quantity,
      retail_price: toMajorUnits(item.unitPriceCents).toFixed(2),
    });
  }

  const shippingAddress = local.addresses.find(
    (address) => address.kind === "shipping",
  );
  const recipient: PrintfulAddress = shippingAddress
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
        email: shippingAddress.email ?? local.email,
      }
    : { country_code: "" };

  try {
    const remote = await printful.createOrder({
      external_id: local.externalId,
      shipping: local.shippingMethod ?? "STANDARD",
      recipient,
      items,
      retail_costs: {
        currency: local.currency,
        subtotal: toMajorUnits(local.subtotalCents).toFixed(2),
        discount: toMajorUnits(local.discountCents).toFixed(2),
        shipping: toMajorUnits(local.shippingCents).toFixed(2),
        tax: toMajorUnits(local.taxCents).toFixed(2),
      },
    });

    return upsertOrderFromPrintful(remote, {
      eventType: "order_submitted",
      message: "Order submitted to Printful as a draft",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to submit order";
    await prisma.order.update({
      where: { id: orderId },
      data: { failureReason: message },
    });
    await addOrderEvent(
      orderId,
      "order_submit_failed",
      message,
      error instanceof PrintfulError ? error.details : undefined,
    );
    throw error;
  }
}

export async function confirmPrintfulOrder(
  orderId: string,
): Promise<OrderWithDetails> {
  const local = await prisma.order.findUnique({ where: { id: orderId } });
  if (!local) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }
  if (!local.printfulOrderId) {
    throw createError({
      statusCode: 409,
      statusMessage: "Submit the order to Printful before confirming it.",
    });
  }

  const remote = await printful.confirmOrder(local.printfulOrderId);

  return upsertOrderFromPrintful(remote, {
    eventType: "order_confirmed",
    message: "Order confirmed for fulfillment",
  });
}

export async function cancelOrder(orderId: string): Promise<OrderWithDetails> {
  const local = await prisma.order.findUnique({ where: { id: orderId } });
  if (!local) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  if (!local.printfulOrderId) {
    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: "canceled",
        canceledAt: new Date(),
        events: {
          create: {
            type: "order_canceled",
            message: "Order canceled locally",
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

  const remote = await printful.cancelOrder(local.printfulOrderId);

  return upsertOrderFromPrintful(remote, {
    eventType: "order_canceled",
    message: "Order canceled in Printful",
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
  const recipient: PrintfulAddress | Record<string, never> = shippingAddress
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

import { createHmac } from "node:crypto";
import { createError, getHeader, getQuery, readRawBody } from "h3";
import { prisma } from "../../utils/prisma";
import {
  PrintfulError,
  printful,
  type PrintfulOrder,
} from "../../utils/printful";
import {
  applyStockUpdate,
  deactivatePrintfulProduct,
  syncPrintfulProduct,
} from "../../utils/printful-sync";
import { upsertOrderFromPrintful } from "../../utils/orders";
import { safeCompare } from "../../utils/request";
import { getSetting } from "../../utils/settings";

type WebhookPayload = {
  type?: string;
  created?: number;
  occurred_at?: string;
  retries?: number;
  store?: number;
  store_id?: number;
  data?: Record<string, unknown>;
};

const ORDER_EVENT_MESSAGES: Record<string, string> = {
  order_created: "Order created in Printful",
  order_updated: "Order updated in Printful",
  order_failed: "Order failed in Printful",
  order_canceled: "Order canceled in Printful",
  order_put_hold: "Order put on hold",
  order_put_hold_approval: "Order needs approval",
  order_remove_hold: "Order removed from hold",
  order_refunded: "Order refunded",
  package_shipped: "Order shipped",
  package_returned: "Package returned",
  shipment_sent: "Order shipped",
  shipment_delivered: "Order delivered",
  shipment_returned: "Shipment returned",
  shipment_canceled: "Shipment canceled",
  shipment_out_of_stock: "Shipment out of stock",
};

function signingKey(secret: string): Buffer {
  const isHex = /^[0-9a-f]+$/i.test(secret) && secret.length % 2 === 0;
  return isHex ? Buffer.from(secret, "hex") : Buffer.from(secret, "utf8");
}

function verifyV2Signature(
  rawBody: string,
  signature: string | undefined,
  secret: string | null,
): boolean {
  if (!secret) return true;
  if (!signature) return false;

  const expected = createHmac("sha256", signingKey(secret))
    .update(rawBody)
    .digest("hex");

  return safeCompare(expected, signature.trim().toLowerCase());
}

function isV2(payload: WebhookPayload, query: Record<string, unknown>) {
  if (query.v === "1") return false;
  if (payload.occurred_at) return true;
  return false;
}

async function resolveOrder(
  orderId: number,
  payload: WebhookPayload,
): Promise<PrintfulOrder> {
  try {
    return await printful.getOrder(orderId);
  } catch (error) {
    // v1 payloads contain the full order, so they can still be applied when
    // the follow-up GET temporarily fails.
    const fallback = payload.data?.order as PrintfulOrder | undefined;
    if (
      fallback &&
      fallback.recipient &&
      Array.isArray(fallback.items) &&
      fallback.items.length > 0
    ) {
      return fallback;
    }
    throw error;
  }
}

export default defineEventHandler(async (event) => {
  const rawBody = (await readRawBody(event, "utf8")) ?? "";

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid JSON payload",
    });
  }

  const query = getQuery(event) as Record<string, unknown>;
  const version = isV2(payload, query) ? "v2" : "v1";
  const type = payload.type ?? "unknown";

  // v1 has no signature, so it uses a shared secret in the URL.
  if (version === "v1") {
    const secret =
      (await getSetting("printful_webhook_query_secret")) ??
      process.env.PRINTFUL_WEBHOOK_SECRET ??
      null;

    if (secret) {
      const provided = typeof query.secret === "string" ? query.secret : "";
      if (!provided || !safeCompare(provided, secret)) {
        throw createError({
          statusCode: 401,
          statusMessage: "Invalid webhook secret",
        });
      }
    } else if (process.env.NODE_ENV === "production") {
      throw createError({
        statusCode: 503,
        statusMessage:
          "No v1 webhook secret is configured. Register the webhooks first.",
      });
    }
  } else {
    const secret =
      (await getSetting("printful_webhook_secret")) ??
      process.env.PRINTFUL_WEBHOOK_SECRET ??
      null;

    // In production an unconfigured secret must never mean "accept anything".
    // Registering the v2 webhooks stores the signing secret in AppSetting.
    if (!secret && process.env.NODE_ENV === "production") {
      throw createError({
        statusCode: 503,
        statusMessage:
          "No v2 webhook signing secret is configured. Register the webhooks first.",
      });
    }

    const signature = getHeader(event, "x-pf-webhook-signature");
    if (!verifyV2Signature(rawBody, signature, secret)) {
      throw createError({
        statusCode: 401,
        statusMessage: "Invalid webhook signature",
      });
    }
  }

  const eventKey = [
    type,
    payload.store ?? payload.store_id ?? "",
    payload.created ?? payload.occurred_at ?? "",
    (payload.data?.order as { id?: number } | undefined)?.id ??
      (payload.data?.sync_product as { id?: number } | undefined)?.id ??
      "",
  ].join(":");

  const record = await prisma.webhookEvent.create({
    data: {
      eventType: type,
      eventKey,
      version,
      payload: rawBody,
      status: "received",
    },
  });

  try {
    let status: "processed" | "ignored" = "processed";

    switch (type) {
      case "product_synced":
      case "product_updated": {
        const syncProduct = payload.data?.sync_product as
          | { id?: number }
          | undefined;

        if (!syncProduct?.id) {
          status = "ignored";
          break;
        }

        try {
          await syncPrintfulProduct(syncProduct.id);
        } catch (error) {
          if (error instanceof PrintfulError && error.status === 404) {
            await deactivatePrintfulProduct(syncProduct.id);
          } else {
            throw error;
          }
        }
        break;
      }

      case "product_deleted": {
        const syncProduct = payload.data?.sync_product as
          | { id?: number }
          | undefined;

        if (syncProduct?.id) {
          await deactivatePrintfulProduct(syncProduct.id);
        } else {
          status = "ignored";
        }
        break;
      }

      case "stock_updated":
      case "catalog_stock_updated": {
        if (payload.data) {
          await applyStockUpdate(
            payload.data as Parameters<typeof applyStockUpdate>[0],
          );
        } else {
          status = "ignored";
        }
        break;
      }

      case "catalog_price_changed":
      case "mockup_task_finished":
      case "approval_sheet_status_changed": {
        status = "ignored";
        break;
      }

      default: {
        const orderSummary = payload.data?.order as
          | { id?: number }
          | undefined;

        if (!ORDER_EVENT_MESSAGES[type] || !orderSummary?.id) {
          status = "ignored";
          break;
        }

        const remote = await resolveOrder(orderSummary.id, payload);
        const local = await upsertOrderFromPrintful(remote, {
          eventType: type,
          message: ORDER_EVENT_MESSAGES[type] ?? type,
          payload,
        });

        // v1 order payloads do not carry delivery/return information, while
        // v2 shipment events do. Apply the extra local-only statuses.
        const shipment = payload.data?.shipment as
          | {
              tracking_number?: string | null;
              tracking_url?: string | null;
              delivered_at?: string | null;
              shipped_at?: string | null;
            }
          | undefined;

        const data: {
          status?: string;
          trackingNumber?: string;
          trackingUrl?: string;
          shippedAt?: Date;
          deliveredAt?: Date;
        } = {};

        if (shipment?.tracking_number) {
          data.trackingNumber = String(shipment.tracking_number);
        }
        if (shipment?.tracking_url) {
          data.trackingUrl = shipment.tracking_url;
        }

        if (type === "shipment_delivered" || shipment?.delivered_at) {
          data.status = "delivered";
          data.deliveredAt = shipment?.delivered_at
            ? new Date(shipment.delivered_at)
            : new Date();
        } else if (type === "shipment_sent" || type === "package_shipped") {
          if (!["delivered", "returned"].includes(local.status)) {
            data.status = "shipped";
          }
          if (shipment?.shipped_at) {
            data.shippedAt = new Date(shipment.shipped_at);
          }
        } else if (
          type === "shipment_returned" ||
          type === "package_returned"
        ) {
          data.status = "returned";
        } else if (type === "order_refunded") {
          data.status = "refunded";
        }

        if (Object.keys(data).length > 0) {
          await prisma.order.update({
            where: { id: local.id },
            data,
          });
        }

        break;
      }
    }

    await prisma.webhookEvent.update({
      where: { id: record.id },
      data: {
        status,
        processedAt: new Date(),
      },
    });

    return { ok: true, type, version, status };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook processing failed";

    await prisma.webhookEvent.update({
      where: { id: record.id },
      data: {
        status: "failed",
        error: message,
        processedAt: new Date(),
      },
    });

    console.error(`[printful webhook] ${type} failed: ${message}`);

    throw createError({
      statusCode: 500,
      statusMessage: "Webhook processing failed",
    });
  }
});

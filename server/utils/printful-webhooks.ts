import { randomBytes } from "node:crypto";
import { createError } from "h3";
import {
  printful,
  PrintfulError,
  type WebhookConfigV1,
  type WebhookConfigV2,
} from "./printful";
import { deleteSetting, getSetting, setSetting } from "./settings";

/**
 * v1 webhooks are the only way to be notified when a Sync Product is created,
 * updated or deleted. They are not signed, so a shared secret is appended to
 * the URL and verified by the receiver.
 */
export const PRODUCT_WEBHOOK_EVENTS = [
  "product_synced",
  "product_updated",
  "product_deleted",
  "stock_updated",
] as const;

/**
 * v2 webhooks are signed (HMAC-SHA256) and cover order + shipment events.
 */
export const ORDER_WEBHOOK_EVENTS = [
  "order_created",
  "order_updated",
  "order_failed",
  "order_canceled",
  "order_put_hold",
  "order_put_hold_approval",
  "order_remove_hold",
  "order_refunded",
  "shipment_sent",
  "shipment_delivered",
  "shipment_returned",
  "shipment_out_of_stock",
  "shipment_canceled",
] as const;

export type WebhookRegistrationResult = {
  url: string;
  productWebhooks?: WebhookConfigV1;
  orderWebhooks?: Pick<
    WebhookConfigV2,
    "default_url" | "events" | "public_key"
  >;
  errors: string[];
  signedEvents: boolean;
};

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = raw.trim().replace(/^["']|["']$/g, "");
  return value || undefined;
}

function withQuery(url: string, params: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function errorMessage(error: unknown): string {
  if (error instanceof PrintfulError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Printful rejects non-HTTPS webhook URLs. Normalising here means the API
 * route, the CLI script and any future caller all behave the same way.
 */
export function normalizeWebhookUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw createError({
      statusCode: 400,
      statusMessage: "A webhook URL is required.",
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "The webhook URL is not a valid absolute URL.",
    });
  }

  if (parsed.protocol !== "https:") {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Printful only accepts HTTPS webhook URLs. Use a public HTTPS URL (or a tunnel such as cloudflared/ngrok in development).",
    });
  }

  return parsed.toString().replace(/\/+$/, "");
}

/** The URL Printful should call for this deployment. */
export function defaultWebhookUrl(origin: string): string {
  return `${origin.trim().replace(/\/+$/, "")}/api/webhooks/printful`;
}

/**
 * Registers both webhook sets:
 *  - v1 product events at `<url>?v=1&secret=<shared secret>`
 *  - v2 order/shipment events at `<url>` with an HMAC signing secret
 *
 * The v1 and v2 configurations are independent in Printful, so a failure in
 * one is reported without discarding the other.
 */
export async function registerPrintfulWebhooks(
  baseUrl: string,
  options: { querySecret?: string } = {},
): Promise<WebhookRegistrationResult> {
  const url = normalizeWebhookUrl(baseUrl);

  let querySecret =
    options.querySecret ??
    readEnv("PRINTFUL_WEBHOOK_SECRET") ??
    (await getSetting("printful_webhook_query_secret"));

  if (!querySecret) {
    querySecret = randomBytes(24).toString("hex");
  }

  await setSetting("printful_webhook_query_secret", querySecret);

  const productUrl = withQuery(url, { v: "1", secret: querySecret });
  const result: WebhookRegistrationResult = {
    url,
    errors: [],
    signedEvents: false,
  };

  try {
    result.productWebhooks = await printful.setWebhookConfig({
      url: productUrl,
      types: [...PRODUCT_WEBHOOK_EVENTS],
    });
  } catch (error) {
    result.errors.push(`Product webhooks: ${errorMessage(error)}`);
  }

  try {
    const v2 = await printful.setWebhookConfigV2({
      default_url: url,
      events: ORDER_WEBHOOK_EVENTS.map((type) => ({ type })),
    });

    result.orderWebhooks = {
      default_url: v2.default_url,
      events: v2.events,
      public_key: v2.public_key,
    };

    if (v2.secret_key) {
      await setSetting("printful_webhook_secret", v2.secret_key);
    }
    if (v2.public_key) {
      await setSetting("printful_webhook_public_key", v2.public_key);
    }
  } catch (error) {
    result.errors.push(`Order webhooks: ${errorMessage(error)}`);
  }

  await setSetting("printful_webhook_url", url);

  result.signedEvents = Boolean(await getSetting("printful_webhook_secret"));

  return result;
}

/** Removes both Printful configurations and the locally stored secrets. */
export async function unregisterPrintfulWebhooks(): Promise<{
  ok: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  await printful.deleteWebhookConfig().catch((error) => {
    errors.push(`Product webhooks: ${errorMessage(error)}`);
  });

  await printful.deleteWebhookConfigV2().catch((error) => {
    errors.push(`Order webhooks: ${errorMessage(error)}`);
  });

  await Promise.all([
    deleteSetting("printful_webhook_url"),
    deleteSetting("printful_webhook_secret"),
    deleteSetting("printful_webhook_public_key"),
    deleteSetting("printful_webhook_query_secret"),
  ]);

  return { ok: errors.length === 0, errors };
}

/** Read-only view used by the admin status endpoint and the CLI. */
export async function getPrintfulWebhookStatus() {
  const [v1, v2, storedUrl, hasV2Secret, hasQuerySecret] = await Promise.all([
    printful.getWebhookConfig().catch((error) => ({
      error: errorMessage(error),
    })),
    printful.getWebhookConfigV2().catch((error) => ({
      error: errorMessage(error),
    })),
    getSetting("printful_webhook_url"),
    getSetting("printful_webhook_secret"),
    getSetting("printful_webhook_query_secret"),
  ]);

  return {
    productWebhooks: v1,
    orderWebhooks: v2,
    configuredUrl: storedUrl,
    signedEvents: Boolean(hasV2Secret),
    productSecretConfigured: Boolean(hasQuerySecret),
  };
}

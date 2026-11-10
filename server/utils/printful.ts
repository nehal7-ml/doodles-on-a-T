/**
 * Small typed wrapper around the Printful API.
 *
 * We use both API versions on purpose:
 *  - v1 still exposes Sync Products and the product_* webhooks.
 *  - v2 has the current shipping-rate and signed webhook APIs.
 *
 * Docs: https://developers.printful.com/docs/
 */

const PRINTFUL_API = "https://api.printful.com";
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 25_000;

export class PrintfulError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 502, details?: unknown) {
    super(message);
    this.name = "PrintfulError";
    this.status = status;
    this.details = details;
  }
}

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = raw.trim().replace(/^["']|["']$/g, "");
  return value || undefined;
}

export function getPrintfulToken(): string {
  const token = readEnv("PRINTFUL_KEY");
  if (!token) {
    throw new PrintfulError(
      "PRINTFUL_KEY is not configured. Add it to your .env file.",
      500,
    );
  }
  return token;
}

export function getPrintfulStoreId(): string | undefined {
  return readEnv("PRINTFUL_STORE_ID");
}

function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(
    path.startsWith("http")
      ? path
      : `${PRINTFUL_API}${path.startsWith("/") ? path : `/${path}`}`,
  );

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

type QueryParams = Record<
  string,
  string | number | boolean | undefined | null
>;

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: QueryParams;
  body?: unknown;
};

function extractErrorMessage(payload: unknown): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object") return undefined;

  const body = payload as Record<string, unknown>;
  const error = body.error as Record<string, unknown> | undefined;

  if (error && typeof error.message === "string") return error.message;
  if (typeof body.detail === "string") return body.detail;
  if (typeof body.title === "string") return body.title;
  if (typeof body.result === "string") return body.result;
  if (typeof body.message === "string") return body.message;

  return undefined;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", query, body } = options;
  const url = buildUrl(path, query);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${getPrintfulToken()}`,
    Accept: "application/json",
    "User-Agent": "doodles-on-a-t/1.0",
  };

  const storeId = getPrintfulStoreId();
  if (storeId) headers["X-PF-Store-Id"] = storeId;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let lastError: PrintfulError | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const text = await response.text();
    let payload: unknown;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (response.ok) {
      return payload as T;
    }

    // Printful uses a leaky bucket. Honour Retry-After before giving up.
    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 2);
      const waitMs = Math.min(Math.max(retryAfter, 1), 10) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    lastError = new PrintfulError(
      extractErrorMessage(payload) ??
        `Printful request failed (${response.status} ${response.statusText})`,
      response.status,
      payload,
    );
    throw lastError;
  }

  throw lastError ?? new PrintfulError("Printful request failed");
}

export type PrintfulPaging = {
  total: number;
  offset: number;
  limit: number;
};

export type PrintfulV1Response<T> = {
  code: number;
  result: T;
  paging?: PrintfulPaging;
  extra?: unknown;
};

/** Calls a v1 endpoint and returns the whole `{ code, result, paging }` body. */
export async function printfulV1<T>(
  path: string,
  options: RequestOptions = {},
): Promise<PrintfulV1Response<T>> {
  const payload = await request<PrintfulV1Response<T> | T>(path, options);

  if (
    payload &&
    typeof payload === "object" &&
    "result" in (payload as Record<string, unknown>)
  ) {
    return payload as PrintfulV1Response<T>;
  }

  return { code: 200, result: payload as T };
}

/** Calls a v2 endpoint and returns the `data` member. */
export async function printfulV2<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const payload = await request<{ data: T } | undefined>(path, options);
  return (payload?.data ?? undefined) as T;
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type SyncProductSummary = {
  id: number;
  external_id: string | null;
  name: string;
  variants: number;
  synced: number;
  thumbnail_url: string | null;
  is_ignored: boolean;
};

export type SyncVariantFile = {
  id: number;
  type: string;
  url: string | null;
  filename: string | null;
  preview_url: string | null;
  thumbnail_url: string | null;
  visible: boolean;
};

export type SyncVariant = {
  id: number;
  external_id: string | null;
  sync_product_id: number;
  name: string;
  synced: boolean;
  variant_id: number;
  retail_price: string | null;
  currency: string;
  sku: string | null;
  product: {
    variant_id: number;
    product_id: number;
    image: string | null;
    name: string;
  };
  files: SyncVariantFile[];
  options: Array<{ id: string; value: unknown }>;
  size: string | null;
  color: string | null;
  availability_status: string | null;
  is_ignored: boolean;
};

export type SyncProductInfo = {
  sync_product: SyncProductSummary;
  sync_variants: SyncVariant[];
};

export type CatalogVariant = {
  id: number;
  catalog_product_id: number;
  name: string;
  size: string | null;
  color: string | null;
  color_code: string | null;
  color_code2: string | null;
  image: string | null;
};

export type CatalogProduct = {
  id: number;
  name: string;
  description: string | null;
  image: string | null;
  variant_count: number;
  sizes?: string[];
  colors?: Array<{ name: string; value: string }>;
};

export type ShippingRateV2 = {
  shipping: string;
  shipping_method_name: string;
  rate: string;
  currency: string;
  min_delivery_days: number | null;
  max_delivery_days: number | null;
  min_delivery_date: string | null;
  max_delivery_date: string | null;
  shipments?: Array<{
    departure_country: string;
    customs_fees_possible: boolean;
    shipment_items: Array<{
      catalog_variant_id: number;
      quantity: number;
    }>;
  }>;
};

export type ShippingRateV1 = {
  id: string;
  name: string;
  rate: string;
  currency: string;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
  minDeliveryDate: string | null;
  maxDeliveryDate: string | null;
};

export type Country = {
  code: string;
  name: string;
  region: string | null;
  states: Array<{ code: string; name: string }> | null;
};

export type PrintfulAddress = {
  name?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state_code?: string;
  state_name?: string;
  country_code: string;
  country_name?: string;
  zip?: string;
  phone?: string;
  email?: string;
  tax_number?: string;
};

export type PrintfulOrderItem = {
  id: number;
  external_id: string | null;
  variant_id: number;
  sync_variant_id: number | null;
  external_variant_id: string | null;
  quantity: number;
  price: string | number;
  retail_price: string | null;
  name: string;
  product: {
    variant_id: number;
    product_id: number;
    image: string | null;
    name: string;
  } | null;
  sku: string | null;
  discontinued?: boolean;
  out_of_stock?: boolean;
};

export type PrintfulShipment = {
  id: number;
  carrier: string;
  service: string;
  tracking_number: string | number | null;
  tracking_url: string | null;
  created: number;
  ship_date: string | null;
  shipped_at: number | null;
  delivered_at?: number | string | null;
  shipment_status?: string | null;
  delivery_status?: string | null;
  reshipment: boolean;
  items?: Array<{
    item_id: number;
    quantity: number;
    picked?: number;
    printed?: number;
  }>;
};

export type PrintfulOrder = {
  id: number;
  external_id: string | null;
  store: number;
  status: string;
  error: string | null;
  errorCode?: number;
  shipping: string;
  shipping_service_name: string;
  created: number;
  updated: number;
  recipient: PrintfulAddress;
  items: PrintfulOrderItem[];
  shipments?: PrintfulShipment[];
  costs?: {
    currency: string;
    subtotal: string | number;
    discount: string | number;
    shipping: string | number;
    tax: string | number;
    vat?: string | number;
    total: string | number;
  };
  retail_costs?: {
    currency: string;
    subtotal: string | number;
    discount: string | number;
    shipping: string | number;
    tax: string | number;
    total: string | number;
  };
  dashboard_url?: string;
};

export type WebhookConfigV1 = {
  url: string | null;
  types: string[];
  params?: unknown[];
};

export type WebhookEventV2 = {
  type: string;
  url?: string | null;
  params?: Array<{ name: string; value: unknown }>;
};

export type WebhookConfigV2 = {
  default_url: string | null;
  expires_at: string | null;
  events: WebhookEventV2[];
  public_key?: string;
  secret_key?: string;
};

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                  */
/* -------------------------------------------------------------------------- */

export const printful = {
  /* Sync products (v1) ---------------------------------------------------- */
  async listSyncProducts(options: { limit?: number; offset?: number } = {}) {
    return printfulV1<SyncProductSummary[]>("/sync/products", {
      query: { limit: options.limit ?? 100, offset: options.offset ?? 0 },
    });
  },

  async getSyncProduct(id: number | string) {
    const response = await printfulV1<SyncProductInfo>(
      `/sync/products/${encodeURIComponent(String(id))}`,
    );
    return response.result;
  },

  /* Catalog (v2) ---------------------------------------------------------- */
  async getCatalogProduct(id: number) {
    return printfulV2<CatalogProduct>(`/v2/catalog-products/${id}`);
  },

  async getCatalogProductVariants(id: number) {
    const variants: CatalogVariant[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const page = await printfulV2<CatalogVariant[]>(
        `/v2/catalog-products/${id}/catalog-variants`,
        { query: { limit, offset } },
      );

      if (!Array.isArray(page) || page.length === 0) break;
      variants.push(...page);
      if (page.length < limit) break;
      offset += limit;
    }

    return variants;
  },

  /* Shipping -------------------------------------------------------------- */
  async calculateShippingRatesV2(payload: {
    recipient: PrintfulAddress;
    order_items: Array<{
      source: "catalog";
      catalog_variant_id: number;
      quantity: number;
    }>;
    currency?: string;
  }) {
    return printfulV2<ShippingRateV2[]>("/v2/shipping-rates", {
      method: "POST",
      body: payload,
    });
  },

  async calculateShippingRatesV1(payload: {
    recipient: PrintfulAddress;
    items: Array<{ variant_id: number; quantity: number }>;
    currency?: string;
  }) {
    const response = await printfulV1<ShippingRateV1[]>("/shipping/rates", {
      method: "POST",
      body: payload,
    });
    return response.result;
  },

  async getCountries() {
    const response = await printfulV1<Country[]>("/countries");
    return response.result;
  },

  /* Orders (v1) ----------------------------------------------------------- */
  async createOrder(
    payload: {
      external_id: string;
      shipping: string;
      recipient: PrintfulAddress;
      items: Array<{
        sync_variant_id: number;
        quantity: number;
        retail_price?: string;
      }>;
      retail_costs?: {
        currency: string;
        subtotal: string;
        discount: string;
        shipping: string;
        tax: string;
      };
    },
    options: { confirm?: boolean; updateExisting?: boolean } = {},
  ) {
    const response = await printfulV1<PrintfulOrder>("/orders", {
      method: "POST",
      query: {
        confirm: options.confirm ? true : undefined,
        update_existing: options.updateExisting ? true : undefined,
      },
      body: payload,
    });
    return response.result;
  },

  async getOrder(id: number | string) {
    const response = await printfulV1<PrintfulOrder>(
      `/orders/${encodeURIComponent(String(id))}`,
    );
    return response.result;
  },

  async listOrders(options: { limit?: number; offset?: number } = {}) {
    return printfulV1<PrintfulOrder[]>("/orders", {
      query: { limit: options.limit ?? 20, offset: options.offset ?? 0 },
    });
  },

  async confirmOrder(id: number | string) {
    const response = await printfulV1<PrintfulOrder>(
      `/orders/${encodeURIComponent(String(id))}/confirm`,
      { method: "POST" },
    );
    return response.result;
  },

  async cancelOrder(id: number | string) {
    const response = await printfulV1<PrintfulOrder>(
      `/orders/${encodeURIComponent(String(id))}`,
      { method: "DELETE" },
    );
    return response.result;
  },

  /* Webhooks v1 (product events) ------------------------------------------ */
  async getWebhookConfig() {
    const response = await printfulV1<WebhookConfigV1>("/webhooks");
    return response.result;
  },

  async setWebhookConfig(payload: { url: string; types: string[] }) {
    const response = await printfulV1<WebhookConfigV1>("/webhooks", {
      method: "POST",
      body: payload,
    });
    return response.result;
  },

  async deleteWebhookConfig() {
    const response = await printfulV1<WebhookConfigV1>("/webhooks", {
      method: "DELETE",
    });
    return response.result;
  },

  /* Webhooks v2 (signed order/shipment events) ---------------------------- */
  async getWebhookConfigV2() {
    return printfulV2<WebhookConfigV2>("/v2/webhooks");
  },

  async setWebhookConfigV2(payload: {
    default_url: string;
    events: WebhookEventV2[];
    expires_at?: string | null;
  }) {
    return printfulV2<WebhookConfigV2>("/v2/webhooks", {
      method: "POST",
      body: payload,
    });
  },

  async deleteWebhookConfigV2() {
    await printfulV2<undefined>("/v2/webhooks", { method: "DELETE" });
  },
};

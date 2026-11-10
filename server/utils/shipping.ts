import { createError } from "h3";
import {
  printful,
  PrintfulError,
  type Country,
  type PrintfulAddress,
  type ShippingRateV2,
} from "./printful";
import { prisma } from "./prisma";

const COUNTRY_CACHE_MS = 60 * 60 * 1000;

let countriesCache: { at: number; countries: Country[] } | null = null;

export async function listCountries(): Promise<Country[]> {
  if (countriesCache && Date.now() - countriesCache.at < COUNTRY_CACHE_MS) {
    return countriesCache.countries;
  }

  const countries = await printful.getCountries();
  countriesCache = { at: Date.now(), countries };
  return countries;
}

export async function findCountry(
  countryCode: string,
): Promise<Country | undefined> {
  const code = countryCode.trim().toUpperCase();
  const countries = await listCountries();
  return countries.find((country) => country.code?.toUpperCase() === code);
}

export function stateIsRequired(countryCode: string): boolean {
  return ["US", "CA", "AU"].includes(countryCode.toUpperCase());
}

export type NormalizedShippingRate = {
  id: string;
  name: string;
  rate: number;
  currency: string;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
  minDeliveryDate: string | null;
  maxDeliveryDate: string | null;
  customsFeesPossible: boolean;
};

function normalizeRate(rate: ShippingRateV2): NormalizedShippingRate {
  return {
    id: rate.shipping,
    name: rate.shipping_method_name,
    rate: Number(rate.rate),
    currency: rate.currency,
    minDeliveryDays: rate.min_delivery_days,
    maxDeliveryDays: rate.max_delivery_days,
    minDeliveryDate: rate.min_delivery_date,
    maxDeliveryDate: rate.max_delivery_date,
    customsFeesPossible:
      rate.shipments?.some((shipment) => shipment.customs_fees_possible) ??
      false,
  };
}

export type ShippingEstimate = {
  available: boolean;
  country: { code: string; name: string };
  currency: string;
  rates: NormalizedShippingRate[];
  customsFeesPossible: boolean;
};

/**
 * Calculates live shipping rates for a cart.
 *
 * A missing rate list means Printful cannot deliver these items to the
 * supplied address, which is the signal the storefront should show.
 */
export async function calculateShippingRates(options: {
  recipient: PrintfulAddress;
  items: Array<{ variantId: string; quantity: number }>;
  currency?: string;
}): Promise<ShippingEstimate> {
  const { recipient, items } = options;

  if (!recipient?.country_code) {
    throw createError({
      statusCode: 400,
      statusMessage: "recipient.country_code is required",
    });
  }

  const country = await findCountry(recipient.country_code);
  if (!country) {
    throw createError({
      statusCode: 422,
      statusMessage: `We do not ship to country code "${recipient.country_code}".`,
    });
  }

  if (stateIsRequired(country.code) && !recipient.state_code) {
    throw createError({
      statusCode: 400,
      statusMessage: `state_code is required for deliveries to ${country.name}.`,
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "At least one cart item is required.",
    });
  }

  const variantIds = [...new Set(items.map((item) => item.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: true },
  });

  const byId = new Map(variants.map((variant) => [variant.id, variant]));

  const currencies = new Set(
    variants.map(
      (variant) => variant.currency ?? variant.product.currency ?? "USD",
    ),
  );
  if (currencies.size > 1) {
    throw createError({
      statusCode: 409,
      statusMessage: "Cart items must all use the same currency.",
    });
  }
  const quoteCurrency =
    options.currency?.toUpperCase() ?? [...currencies][0] ?? "USD";

  const orderItems = items.map((item) => {
    const variant = byId.get(item.variantId);
    if (!variant) {
      throw createError({
        statusCode: 404,
        statusMessage: `Product variant "${item.variantId}" was not found.`,
      });
    }
    if (!variant.isActive || !variant.inStock) {
      throw createError({
        statusCode: 409,
        statusMessage: `${variant.name} is currently unavailable.`,
      });
    }
    if (!variant.catalogVariantId) {
      throw createError({
        statusCode: 422,
        statusMessage: `${variant.name} is not linked to a Printful catalog variant yet. Run the Printful product sync first.`,
      });
    }

    return {
      source: "catalog" as const,
      catalog_variant_id: variant.catalogVariantId,
      quantity: Math.max(1, Math.trunc(item.quantity)),
    };
  });

  let rawRates: ShippingRateV2[] = [];

  try {
    rawRates = await printful.calculateShippingRatesV2({
      recipient: {
        country_code: country.code,
        state_code: recipient.state_code,
        city: recipient.city,
        zip: recipient.zip,
        address1: recipient.address1,
      },
      order_items: orderItems,
      currency: quoteCurrency,
    });
  } catch (error) {
    if (error instanceof PrintfulError) {
      // A 4xx here usually means the address/items cannot be quoted.
      if (error.status >= 400 && error.status < 500) {
        return {
          available: false,
          country: { code: country.code, name: country.name },
          currency: quoteCurrency,
          rates: [],
          customsFeesPossible: false,
        };
      }
    }
    throw error;
  }

  const rates = (rawRates ?? []).map(normalizeRate);

  return {
    available: rates.length > 0,
    country: { code: country.code, name: country.name },
    currency: rates[0]?.currency ?? quoteCurrency,
    rates,
    customsFeesPossible: rates.some((rate) => rate.customsFeesPossible),
  };
}

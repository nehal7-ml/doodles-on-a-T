import { createError } from "h3";
import { prisma } from "./prisma";

/**
 * Demo shipping.
 *
 * This storefront is a demo and is deliberately not connected to any
 * fulfillment API, so destinations and rates are static data served locally:
 *
 * - `GET /api/shipping/countries` reads `DEMO_COUNTRIES`.
 * - `POST /api/shipping/rates` still validates the cart server-side (variants
 *   exist, are active, in stock, one currency) but quotes two flat demo rates
 *   instead of calling a carrier.
 *
 * When a real fulfillment provider is wired up later, this is the only module
 * that needs to change — the API shape below is what the checkout consumes.
 */

/** Delivery destination address (the checkout's recipient payload). */
export type ShippingAddress = {
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

export type Country = {
  code: string;
  name: string;
  region: string | null;
  states: Array<{ code: string; name: string }> | null;
};

/**
 * `[ISO-3166-1 alpha-2, name, continent]` — the countries the demo ships to.
 * `region` powers the optional `?region=` filter of the countries endpoint.
 */
const DEMO_COUNTRIES: Array<[string, string, string]> = [
  // North America
  ["US", "United States", "north-america"],
  ["CA", "Canada", "north-america"],
  ["MX", "Mexico", "north-america"],
  ["GT", "Guatemala", "north-america"],
  ["BZ", "Belize", "north-america"],
  ["SV", "El Salvador", "north-america"],
  ["HN", "Honduras", "north-america"],
  ["NI", "Nicaragua", "north-america"],
  ["CR", "Costa Rica", "north-america"],
  ["PA", "Panama", "north-america"],
  ["CU", "Cuba", "north-america"],
  ["JM", "Jamaica", "north-america"],
  ["HT", "Haiti", "north-america"],
  ["DO", "Dominican Republic", "north-america"],
  ["TT", "Trinidad and Tobago", "north-america"],
  ["PR", "Puerto Rico", "north-america"],
  // South America
  ["BR", "Brazil", "south-america"],
  ["AR", "Argentina", "south-america"],
  ["CO", "Colombia", "south-america"],
  ["CL", "Chile", "south-america"],
  ["PE", "Peru", "south-america"],
  ["VE", "Venezuela", "south-america"],
  ["EC", "Ecuador", "south-america"],
  ["UY", "Uruguay", "south-america"],
  ["PY", "Paraguay", "south-america"],
  ["BO", "Bolivia", "south-america"],
  ["GY", "Guyana", "south-america"],
  ["SR", "Suriname", "south-america"],
  // Europe
  ["GB", "United Kingdom", "europe"],
  ["IE", "Ireland", "europe"],
  ["FR", "France", "europe"],
  ["DE", "Germany", "europe"],
  ["ES", "Spain", "europe"],
  ["PT", "Portugal", "europe"],
  ["IT", "Italy", "europe"],
  ["NL", "Netherlands", "europe"],
  ["BE", "Belgium", "europe"],
  ["LU", "Luxembourg", "europe"],
  ["CH", "Switzerland", "europe"],
  ["AT", "Austria", "europe"],
  ["SE", "Sweden", "europe"],
  ["NO", "Norway", "europe"],
  ["DK", "Denmark", "europe"],
  ["FI", "Finland", "europe"],
  ["IS", "Iceland", "europe"],
  ["PL", "Poland", "europe"],
  ["CZ", "Czech Republic", "europe"],
  ["SK", "Slovakia", "europe"],
  ["HU", "Hungary", "europe"],
  ["RO", "Romania", "europe"],
  ["BG", "Bulgaria", "europe"],
  ["GR", "Greece", "europe"],
  ["HR", "Croatia", "europe"],
  ["SI", "Slovenia", "europe"],
  ["RS", "Serbia", "europe"],
  ["BA", "Bosnia and Herzegovina", "europe"],
  ["ME", "Montenegro", "europe"],
  ["MK", "North Macedonia", "europe"],
  ["AL", "Albania", "europe"],
  ["UA", "Ukraine", "europe"],
  ["BY", "Belarus", "europe"],
  ["LT", "Lithuania", "europe"],
  ["LV", "Latvia", "europe"],
  ["EE", "Estonia", "europe"],
  ["MD", "Moldova", "europe"],
  ["CY", "Cyprus", "europe"],
  ["MT", "Malta", "europe"],
  // Asia
  ["IN", "India", "asia"],
  ["PK", "Pakistan", "asia"],
  ["BD", "Bangladesh", "asia"],
  ["LK", "Sri Lanka", "asia"],
  ["NP", "Nepal", "asia"],
  ["MV", "Maldives", "asia"],
  ["CN", "China", "asia"],
  ["JP", "Japan", "asia"],
  ["KR", "South Korea", "asia"],
  ["TW", "Taiwan", "asia"],
  ["HK", "Hong Kong", "asia"],
  ["MO", "Macau", "asia"],
  ["SG", "Singapore", "asia"],
  ["MY", "Malaysia", "asia"],
  ["TH", "Thailand", "asia"],
  ["VN", "Vietnam", "asia"],
  ["PH", "Philippines", "asia"],
  ["ID", "Indonesia", "asia"],
  ["KH", "Cambodia", "asia"],
  ["LA", "Laos", "asia"],
  ["MM", "Myanmar", "asia"],
  ["BN", "Brunei", "asia"],
  ["MN", "Mongolia", "asia"],
  ["KZ", "Kazakhstan", "asia"],
  ["UZ", "Uzbekistan", "asia"],
  ["GE", "Georgia", "asia"],
  ["AM", "Armenia", "asia"],
  ["AZ", "Azerbaijan", "asia"],
  ["KG", "Kyrgyzstan", "asia"],
  ["TJ", "Tajikistan", "asia"],
  ["TM", "Turkmenistan", "asia"],
  ["AF", "Afghanistan", "asia"],
  ["IR", "Iran", "asia"],
  ["IQ", "Iraq", "asia"],
  ["IL", "Israel", "asia"],
  ["JO", "Jordan", "asia"],
  ["LB", "Lebanon", "asia"],
  ["SY", "Syria", "asia"],
  ["SA", "Saudi Arabia", "asia"],
  ["KW", "Kuwait", "asia"],
  ["QA", "Qatar", "asia"],
  ["BH", "Bahrain", "asia"],
  ["OM", "Oman", "asia"],
  ["YE", "Yemen", "asia"],
  ["AE", "United Arab Emirates", "asia"],
  ["TR", "Turkey", "asia"],
  // Oceania
  ["AU", "Australia", "oceania"],
  ["NZ", "New Zealand", "oceania"],
  ["FJ", "Fiji", "oceania"],
  ["PG", "Papua New Guinea", "oceania"],
  ["NC", "New Caledonia", "oceania"],
  ["WS", "Samoa", "oceania"],
  ["TO", "Tonga", "oceania"],
  // Africa
  ["ZA", "South Africa", "africa"],
  ["NG", "Nigeria", "africa"],
  ["KE", "Kenya", "africa"],
  ["GH", "Ghana", "africa"],
  ["EG", "Egypt", "africa"],
  ["MA", "Morocco", "africa"],
  ["DZ", "Algeria", "africa"],
  ["TN", "Tunisia", "africa"],
  ["ET", "Ethiopia", "africa"],
  ["UG", "Uganda", "africa"],
  ["TZ", "Tanzania", "africa"],
  ["RW", "Rwanda", "africa"],
  ["ZM", "Zambia", "africa"],
  ["ZW", "Zimbabwe", "africa"],
  ["BW", "Botswana", "africa"],
  ["NA", "Namibia", "africa"],
  ["MZ", "Mozambique", "africa"],
  ["MG", "Madagascar", "africa"],
  ["CM", "Cameroon", "africa"],
  ["CI", "Côte d'Ivoire", "africa"],
  ["SN", "Senegal", "africa"],
  ["ML", "Mali", "africa"],
  ["BF", "Burkina Faso", "africa"],
  ["NE", "Niger", "africa"],
  ["TD", "Chad", "africa"],
  ["SD", "Sudan", "africa"],
  ["SS", "South Sudan", "africa"],
  ["LY", "Libya", "africa"],
  ["AO", "Angola", "africa"],
  ["CD", "DR Congo", "africa"],
  ["CG", "Republic of the Congo", "africa"],
  ["GA", "Gabon", "africa"],
  ["GQ", "Equatorial Guinea", "africa"],
  ["BI", "Burundi", "africa"],
  ["SL", "Sierra Leone", "africa"],
  ["LR", "Liberia", "africa"],
  ["GM", "Gambia", "africa"],
  ["GN", "Guinea", "africa"],
  ["BJ", "Benin", "africa"],
  ["TG", "Togo", "africa"],
  ["MU", "Mauritius", "africa"],
  ["SC", "Seychelles", "africa"],
];

const DEMO_COUNTRIES_LIST: Country[] = DEMO_COUNTRIES.map(
  ([code, name, region]) => ({
    code,
    name,
    region,
    states: null,
  }),
);

/** Flat demo quotes — same price for every destination. */
const DEMO_RATES = [
  {
    id: "STANDARD",
    name: "Standard shipping",
    rate: 4.99,
    minDeliveryDays: 5,
    maxDeliveryDays: 8,
  },
  {
    id: "EXPRESS",
    name: "Express shipping",
    rate: 12.99,
    minDeliveryDays: 2,
    maxDeliveryDays: 4,
  },
] as const;

export function listCountries(): Country[] {
  return DEMO_COUNTRIES_LIST;
}

export function findCountry(countryCode: string): Country | undefined {
  const code = countryCode.trim().toUpperCase();
  return listCountries().find((country) => country.code === code);
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

export type ShippingEstimate = {
  available: boolean;
  country: { code: string; name: string };
  currency: string;
  rates: NormalizedShippingRate[];
  customsFeesPossible: boolean;
};

/**
 * Quotes shipping for a cart.
 *
 * The cart is re-validated on the server (a client cannot invent an item or a
 * price); the rates themselves are the two flat demo quotes above, so the
 * checkout flow works without any external carrier or fulfillment API.
 */
export async function calculateShippingRates(options: {
  recipient: ShippingAddress;
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

  const country = findCountry(recipient.country_code);
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

  for (const item of items) {
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
  }

  const rates: NormalizedShippingRate[] = DEMO_RATES.map((rate) => ({
    id: rate.id,
    name: rate.name,
    rate: rate.rate,
    currency: quoteCurrency,
    minDeliveryDays: rate.minDeliveryDays,
    maxDeliveryDays: rate.maxDeliveryDays,
    minDeliveryDate: null,
    maxDeliveryDate: null,
    customsFeesPossible: false,
  }));

  return {
    available: rates.length > 0,
    country: { code: country.code, name: country.name },
    currency: quoteCurrency,
    rates,
    customsFeesPossible: false,
  };
}

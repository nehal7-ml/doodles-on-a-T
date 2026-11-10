import { createError } from "h3";
import type { PrintfulAddress } from "./printful";

export type CheckoutItemInput = {
  variantId: string;
  quantity: number;
};

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} must be an object.`,
    });
  }
  return value as Record<string, unknown>;
}

function optionalString(
  value: unknown,
  field: string,
  maxLength = 120,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} must be a string.`,
    });
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} must be at most ${maxLength} characters.`,
    });
  }
  return trimmed;
}

function requiredString(value: unknown, field: string, maxLength = 120): string {
  const parsed = optionalString(value, field, maxLength);
  if (!parsed) {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} is required.`,
    });
  }
  return parsed;
}

export function parseEmail(value: unknown, field = "email"): string {
  const email = requiredString(value, field, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} must be a valid email address.`,
    });
  }
  return email;
}

export function parseRecipient(value: unknown): PrintfulAddress {
  const input = asRecord(value, "recipient");
  const countryCode = requiredString(
    input.country_code ?? input.countryCode,
    "recipient.country_code",
    2,
  ).toUpperCase();

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw createError({
      statusCode: 400,
      statusMessage: "recipient.country_code must be a 2-letter ISO code.",
    });
  }

  const name = requiredString(input.name, "recipient.name", 128);
  const address1 = requiredString(
    input.address1 ?? input.address_1,
    "recipient.address1",
    256,
  );
  const city = requiredString(input.city, "recipient.city", 128);
  const stateCode = optionalString(
    input.state_code ?? input.stateCode,
    "recipient.state_code",
    32,
  );
  const zip = optionalString(input.zip ?? input.postal_code, "recipient.zip", 32);

  if (["US", "CA", "AU"].includes(countryCode) && !stateCode) {
    throw createError({
      statusCode: 400,
      statusMessage: `recipient.state_code is required for ${countryCode}.`,
    });
  }
  if (["US", "CA", "AU"].includes(countryCode) && !zip) {
    throw createError({
      statusCode: 400,
      statusMessage: `recipient.zip is required for ${countryCode}.`,
    });
  }

  return {
    name,
    company: optionalString(input.company, "recipient.company", 128),
    address1,
    address2: optionalString(
      input.address2 ?? input.address_2,
      "recipient.address2",
      256,
    ),
    city,
    state_code: stateCode?.toUpperCase(),
    state_name: optionalString(
      input.state_name ?? input.stateName,
      "recipient.state_name",
      128,
    ),
    country_code: countryCode,
    zip,
    phone: optionalString(input.phone, "recipient.phone", 64),
    email: input.email ? parseEmail(input.email, "recipient.email") : undefined,
    tax_number: optionalString(
      input.tax_number ?? input.taxNumber,
      "recipient.tax_number",
      64,
    ),
  };
}

/**
 * A lighter recipient parser for shipping-rate estimates. Only the country
 * (and state for US/CA/AU) is required, matching Printful's own rules.
 */
export function parseShippingRecipient(value: unknown): PrintfulAddress {
  const input = asRecord(value, "recipient");
  const countryCode = requiredString(
    input.country_code ?? input.countryCode,
    "recipient.country_code",
    2,
  ).toUpperCase();

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw createError({
      statusCode: 400,
      statusMessage: "recipient.country_code must be a 2-letter ISO code.",
    });
  }

  const stateCode = optionalString(
    input.state_code ?? input.stateCode,
    "recipient.state_code",
    32,
  );

  if (["US", "CA", "AU"].includes(countryCode) && !stateCode) {
    throw createError({
      statusCode: 400,
      statusMessage: `recipient.state_code is required for ${countryCode}.`,
    });
  }

  return {
    name: optionalString(input.name, "recipient.name", 128),
    address1: optionalString(
      input.address1 ?? input.address_1,
      "recipient.address1",
      256,
    ),
    address2: optionalString(
      input.address2 ?? input.address_2,
      "recipient.address2",
      256,
    ),
    city: optionalString(input.city, "recipient.city", 128),
    state_code: stateCode?.toUpperCase(),
    country_code: countryCode,
    zip: optionalString(input.zip ?? input.postal_code, "recipient.zip", 32),
    phone: optionalString(input.phone, "recipient.phone", 64),
  };
}

export function parseCheckoutItems(value: unknown): CheckoutItemInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "items must be a non-empty array.",
    });
  }

  const quantities = new Map<string, number>();

  for (const [index, rawItem] of value.entries()) {
    const item = asRecord(rawItem, `items[${index}]`);
    const variantId = requiredString(
      item.variantId ?? item.variant_id ?? item.id,
      `items[${index}].variantId`,
      64,
    );
    const quantity = Number(item.quantity ?? 1);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw createError({
        statusCode: 400,
        statusMessage: `items[${index}].quantity must be a whole number between 1 and 99.`,
      });
    }

    quantities.set(variantId, (quantities.get(variantId) ?? 0) + quantity);
  }

  return [...quantities.entries()].map(([variantId, quantity]) => ({
    variantId,
    quantity,
  }));
}

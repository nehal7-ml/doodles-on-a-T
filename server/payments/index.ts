import { createManualProvider } from "./manual";
import {
  createStripeProvider,
  getStripeSecretKey,
  getStripeWebhookSecret,
} from "./stripe";
import type { PaymentProvider, PaymentProviderId } from "./types";

export type {
  CreatePaymentInput,
  CreatePaymentResult,
  NormalizedEvent,
  PaymentProvider,
  PaymentProviderId,
} from "./types";

const SUPPORTED: PaymentProviderId[] = ["stripe", "manual"];

const cache = new Map<PaymentProviderId, PaymentProvider>();

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = raw.trim().replace(/^["']|["']$/g, "");
  return value || undefined;
}

/**
 * Resolves the configured payment adapter.
 *
 * `PAYMENT_PROVIDER` defaults to `stripe`. Unknown values throw (a deployment
 * misconfiguration should fail loudly), while a missing Stripe key throws only
 * when checkout actually needs the provider so the rest of the storefront
 * keeps working during local setup.
 */
export function getPaymentProviderById(id: PaymentProviderId): PaymentProvider {
  const existing = cache.get(id);
  if (existing) return existing;

  if (id === "manual") {
    const provider = createManualProvider();
    cache.set(id, provider);
    return provider;
  }

  if (id === "stripe") {
    const secretKey = getStripeSecretKey();
    if (!secretKey) {
      throw new Error(
        "Stripe requires STRIPE_SECRET_KEY. Set it or use PAYMENT_PROVIDER=manual.",
      );
    }
    const provider = createStripeProvider(
      secretKey,
      getStripeWebhookSecret() ?? "",
    );
    cache.set(id, provider);
    return provider;
  }

  throw new Error(
    `Payment provider "${id}" is not implemented. Supported: ${SUPPORTED.join(", ")}.`,
  );
}

export function getPaymentProvider(): PaymentProvider {
  return getPaymentProviderById(configuredPaymentProviderId());
}

/** Returns the selected provider id without instantiating the adapter. */
export function configuredPaymentProviderId(): PaymentProviderId {
  const configured = (readEnv("PAYMENT_PROVIDER") ?? "stripe").toLowerCase();
  if (!SUPPORTED.includes(configured as PaymentProviderId)) {
    throw new Error(
      `Unknown PAYMENT_PROVIDER "${configured}". Use one of: ${SUPPORTED.join(", ")}.`,
    );
  }
  return configured as PaymentProviderId;
}

export function paymentProviderConfigured(): boolean {
  try {
    const id = configuredPaymentProviderId();
    if (id === "stripe") return Boolean(getStripeSecretKey());
    return true;
  } catch {
    return false;
  }
}

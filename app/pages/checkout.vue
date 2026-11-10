<script setup lang="ts">
import type { CartViewItem } from "~/types";

type Country = {
  code: string;
  name: string;
  states: Array<{ code: string; name: string }> | null;
};

type ShippingRate = {
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

type ShippingEstimate = {
  available: boolean;
  country: { code: string; name: string };
  currency: string;
  rates: ShippingRate[];
  customsFeesPossible: boolean;
};

type CheckoutResponse = {
  order: { orderNumber: string; status: string; paymentStatus: string };
  payment: { status: string };
  redirectUrl?: string;
  clientSecret?: string;
};

const { cart, loaded, refresh: refreshCart } = useCart();
const { user, refresh: refreshAuth } = useAuth();

const countries = ref<Country[]>([
  { code: "US", name: "United States", states: null },
]);
const countriesLoading = ref(false);
const rates = ref<ShippingRate[]>([]);
const selectedRate = ref("");
const quotePending = ref(false);
const submitPending = ref(false);
const error = ref("");
const quoted = ref(false);

const form = reactive({
  email: "",
  name: "",
  company: "",
  address1: "",
  address2: "",
  city: "",
  state_code: "",
  zip: "",
  country_code: "US",
  phone: "",
});

const quote = computed(
  () => rates.value.find((rate) => rate.id === selectedRate.value) ?? null,
);
const subtotalCents = computed(() => cart.value.totals.subtotalCents);
const shippingCents = computed(() =>
  quote.value ? Math.round(quote.value.rate * 100) : 0,
);
const totalCents = computed(() => subtotalCents.value + shippingCents.value);
const stateRequired = computed(() =>
  ["US", "CA", "AU"].includes(form.country_code),
);
const availableItems = computed(() =>
  cart.value.items.filter((item) => item.available),
);
const canSubmit = computed(
  () =>
    !submitPending.value &&
    !quotePending.value &&
    availableItems.value.length > 0 &&
    Boolean(selectedRate.value) &&
    !cart.value.hasUnavailable,
);

onMounted(async () => {
  await Promise.all([
    refreshCart().catch(() => {}),
    refreshAuth().catch(() => {}),
  ]);

  if (user.value?.email) form.email = user.value.email;
  if (user.value?.name) form.name = user.value.name;

  countriesLoading.value = true;
  try {
    const response = await $fetch<{
      countries: Array<{ code: string; name: string }>;
    }>("/api/shipping/countries");
    if (response.countries.length) {
      countries.value = response.countries.map((country) => ({
        ...country,
        states: null,
      }));
    }
  } catch {
    // Keep the US fallback; quoting will return a useful error if Printful is
    // unreachable.
  } finally {
    countriesLoading.value = false;
  }
});

function recipientPayload() {
  return {
    name: form.name.trim(),
    company: form.company.trim() || undefined,
    address1: form.address1.trim(),
    address2: form.address2.trim() || undefined,
    city: form.city.trim(),
    state_code: form.state_code.trim() || undefined,
    zip: form.zip.trim(),
    country_code: form.country_code,
    phone: form.phone.trim() || undefined,
  };
}

function validateAddress(): string | null {
  if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    return "Enter a valid email address.";
  }
  if (!form.name.trim()) return "Enter the recipient's full name.";
  if (!form.address1.trim()) return "Enter a street address.";
  if (!form.city.trim()) return "Enter a city.";
  if (stateRequired.value && !form.state_code.trim()) {
    return "Enter a state/province code.";
  }
  if (!form.zip.trim()) return "Enter a postal code.";
  return null;
}

async function getRates() {
  error.value = validateAddress() ?? "";
  if (error.value) return;

  quotePending.value = true;
  rates.value = [];
  selectedRate.value = "";
  quoted.value = false;

  try {
    const response = await $fetch<ShippingEstimate>("/api/shipping/rates", {
      method: "POST",
      body: {
        recipient: recipientPayload(),
        items: availableItems.value.map((item: CartViewItem) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        })),
        currency: cart.value.currency,
      },
    });

    if (!response.available || response.rates.length === 0) {
      error.value = `We cannot ship these items to ${response.country.name}.`;
      return;
    }

    rates.value = response.rates;
    selectedRate.value = response.rates[0]?.id ?? "";
    quoted.value = true;
  } catch (requestError) {
    error.value = authErrorMessage(requestError);
  } finally {
    quotePending.value = false;
  }
}

async function submit() {
  error.value = validateAddress() ?? "";
  if (error.value) return;
  if (!selectedRate.value) {
    error.value = "Choose a shipping method.";
    return;
  }
  if (cart.value.hasUnavailable) {
    error.value = "Remove unavailable items before checking out.";
    return;
  }

  submitPending.value = true;
  try {
    const response = await $fetch<CheckoutResponse>("/api/checkout", {
      method: "POST",
      body: {
        email: form.email.trim(),
        customerName: form.name.trim(),
        recipient: recipientPayload(),
        shippingMethod: selectedRate.value,
      },
    });

    if (response.redirectUrl) {
      await navigateTo(response.redirectUrl, { external: true });
      return;
    }

    if (response.clientSecret) {
      error.value =
        "This payment provider needs an on-site card form that is not enabled yet.";
      return;
    }

    await navigateTo(
      `/checkout/success?order=${encodeURIComponent(response.order.orderNumber)}`,
    );
  } catch (requestError) {
    error.value = authErrorMessage(requestError);
  } finally {
    submitPending.value = false;
  }
}

useHead({ title: "Checkout" });
</script>

<template>
  <div class="my-5">
    <h1 class="text-4xl md:text-5xl font-bold text-center">Checkout</h1>
  </div>

  <AppLoader v-if="!loaded" label="Sharpening pencils…" />

  <div
    v-else-if="availableItems.length === 0"
    class="max-w-xl mx-auto border-2 border-dashed border-stone-300 dark:border-zinc-700 rounded-lg p-10 text-center space-y-4"
  >
    <UIcon
      name="i-heroicons-shopping-bag"
      class="w-12 h-12 mx-auto text-stone-400"
    />
    <p class="text-xl font-bold">There is nothing to check out</p>
    <p class="text-stone-500 dark:text-zinc-400">
      Your cart is empty. Add something first.
    </p>
    <UButton to="/explore" color="primary">Explore the sketchbook</UButton>
  </div>

  <div v-else class="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
    <form
      class="border-2 border-dashed border-stone-300 dark:border-zinc-700 rounded-lg p-5 space-y-5"
      @submit.prevent="submit"
    >
      <section class="space-y-3">
        <h2 class="text-xl font-bold">Contact</h2>
        <label class="block text-sm font-medium">
          Email
          <input
            v-model="form.email"
            type="email"
            autocomplete="email"
            required
            class="mt-1 w-full rounded-md border-2 border-stone-300 dark:border-zinc-700 bg-transparent px-3 py-2"
          />
        </label>
      </section>

      <section class="space-y-3">
        <h2 class="text-xl font-bold">Shipping address</h2>

        <label class="block text-sm font-medium">
          Full name
          <input
            v-model="form.name"
            autocomplete="name"
            required
            class="mt-1 w-full rounded-md border-2 border-stone-300 dark:border-zinc-700 bg-transparent px-3 py-2"
          />
        </label>

        <label class="block text-sm font-medium">
          Country
          <select
            v-model="form.country_code"
            :disabled="countriesLoading"
            class="mt-1 w-full rounded-md border-2 border-stone-300 dark:border-zinc-700 bg-transparent px-3 py-2"
          >
            <option
              v-for="country in countries"
              :key="country.code"
              :value="country.code"
            >
              {{ country.name }}
            </option>
          </select>
        </label>

        <label class="block text-sm font-medium">
          Address
          <input
            v-model="form.address1"
            autocomplete="address-line1"
            required
            class="mt-1 w-full rounded-md border-2 border-stone-300 dark:border-zinc-700 bg-transparent px-3 py-2"
          />
        </label>

        <label class="block text-sm font-medium">
          Apartment, suite, etc. (optional)
          <input
            v-model="form.address2"
            autocomplete="address-line2"
            class="mt-1 w-full rounded-md border-2 border-stone-300 dark:border-zinc-700 bg-transparent px-3 py-2"
          />
        </label>

        <div class="grid sm:grid-cols-3 gap-3">
          <label class="block text-sm font-medium">
            City
            <input
              v-model="form.city"
              autocomplete="address-level2"
              required
              class="mt-1 w-full rounded-md border-2 border-stone-300 dark:border-zinc-700 bg-transparent px-3 py-2"
            />
          </label>
          <label class="block text-sm font-medium">
            State / province
            <input
              v-model="form.state_code"
              autocomplete="address-level1"
              :required="stateRequired"
              class="mt-1 w-full rounded-md border-2 border-stone-300 dark:border-zinc-700 bg-transparent px-3 py-2"
            />
          </label>
          <label class="block text-sm font-medium">
            Postal code
            <input
              v-model="form.zip"
              autocomplete="postal-code"
              required
              class="mt-1 w-full rounded-md border-2 border-stone-300 dark:border-zinc-700 bg-transparent px-3 py-2"
            />
          </label>
        </div>

        <label class="block text-sm font-medium">
          Phone (optional)
          <input
            v-model="form.phone"
            autocomplete="tel"
            class="mt-1 w-full rounded-md border-2 border-stone-300 dark:border-zinc-700 bg-transparent px-3 py-2"
          />
        </label>
      </section>

      <section class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-xl font-bold">Shipping</h2>
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="quotePending"
            @click="getRates"
          >
            {{ quoted ? "Refresh rates" : "Get rates" }}
          </UButton>
        </div>

        <p
          v-if="!quoted && !quotePending"
          class="text-sm text-stone-500 dark:text-zinc-400"
        >
          Enter the address, then fetch live shipping rates.
        </p>

        <div v-if="rates.length" class="space-y-2">
          <label
            v-for="rate in rates"
            :key="rate.id"
            class="flex items-center justify-between gap-4 rounded-md border-2 border-stone-300 dark:border-zinc-700 px-3 py-2 cursor-pointer"
            :class="{
              'border-stone-950 dark:border-zinc-50': selectedRate === rate.id,
            }"
          >
            <span class="flex items-center gap-2">
              <input v-model="selectedRate" type="radio" :value="rate.id" />
              <span>
                <span class="font-medium">{{ rate.name }}</span>
                <span
                  v-if="rate.minDeliveryDays || rate.maxDeliveryDays"
                  class="block text-xs text-stone-500 dark:text-zinc-400"
                >
                  {{ rate.minDeliveryDays ?? "?" }}–{{
                    rate.maxDeliveryDays ?? "?"
                  }}
                  business days
                </span>
              </span>
            </span>
            <span class="font-bold">
              {{ formatPrice(rate.rate, rate.currency) }}
            </span>
          </label>
        </div>

        <p
          v-if="rates.some((rate) => rate.customsFeesPossible)"
          class="text-xs text-stone-500 dark:text-zinc-400"
        >
          Customs or import fees may be charged by the destination country.
        </p>
      </section>

      <p
        v-if="error"
        class="rounded-md border-2 border-red-400 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300"
      >
        {{ error }}
      </p>

      <UButton
        type="submit"
        color="primary"
        size="lg"
        class="w-full justify-center font-bold border-2 border-stone-950 dark:border-zinc-50 rounded-md"
        :loading="submitPending"
        :disabled="!canSubmit"
      >
        Pay {{ formatPrice(totalCents / 100, cart.currency) }}
      </UButton>

      <p class="text-xs text-stone-500 dark:text-zinc-400">
        You will be redirected to the payment provider. Card details never touch
        this server.
      </p>
    </form>

    <aside
      class="rounded-md border-2 border-dashed border-stone-300 dark:border-zinc-700 p-5 h-fit space-y-3 lg:sticky lg:top-4"
    >
      <h2 class="text-xl font-bold">Your order</h2>
      <div class="h-1 border-b dark:border-stone-700" />

      <ul class="space-y-2">
        <li
          v-for="item in availableItems"
          :key="item.id"
          class="flex items-start justify-between gap-3 text-sm"
        >
          <span class="min-w-0">
            <span class="font-medium block truncate">
              {{ item.productName }}
            </span>
            <span class="text-stone-500 dark:text-zinc-400">
              {{ [item.variantName, item.size].filter(Boolean).join(" · ") }} ×
              {{ item.quantity }}
            </span>
          </span>
          <span class="font-bold whitespace-nowrap">
            {{ formatPrice(item.lineTotalCents / 100, item.currency) }}
          </span>
        </li>
      </ul>

      <div class="h-1 border-b dark:border-stone-700" />

      <p class="flex justify-between text-sm">
        <span>Subtotal</span>
        <span>{{ formatPrice(subtotalCents / 100, cart.currency) }}</span>
      </p>
      <p class="flex justify-between text-sm">
        <span>Shipping</span>
        <span v-if="quote">{{ formatPrice(quote.rate, quote.currency) }}</span>
        <span v-else class="text-stone-500">Not quoted</span>
      </p>

      <div class="h-1 border-b dark:border-stone-700" />

      <p class="flex justify-between font-bold text-lg">
        <span>Total</span>
        <span>{{ formatPrice(totalCents / 100, cart.currency) }}</span>
      </p>
    </aside>
  </div>
</template>

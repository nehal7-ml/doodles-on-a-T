<script setup lang="ts">
const props = defineProps<{
  subtotalCents: number;
  itemCount: number;
  currency?: string;
  hasUnavailable?: boolean;
}>();

const currency = computed(() => props.currency ?? "USD");
</script>

<template>
  <div
    class="w-full md:w-1/3 md:max-w-1/3 flex flex-col gap-2 rounded-md border-2 border-dashed border-stone-300 dark:border-zinc-700 p-5 h-fit"
  >
    <h2 class="text-xl font-bold">Order Summary</h2>
    <div class="h-1 w-auto border-b dark:border-stone-700" />

    <p class="text-highlighted flex justify-between items-center">
      <span class="font-medium">Items ({{ itemCount }})</span>
      <span class="font-bold">
        {{ formatPrice(subtotalCents / 100, currency) }}
      </span>
    </p>
    <p class="text-highlighted flex justify-between items-center">
      <span class="font-medium">Shipping</span>
      <span class="text-sm text-stone-500 dark:text-zinc-400">
        Calculated at checkout
      </span>
    </p>

    <div class="h-1 w-auto border-b dark:border-stone-700" />

    <p class="text-highlighted flex justify-between font-bold">
      <span>Total</span>
      <span>{{ formatPrice(subtotalCents / 100, currency) }}</span>
    </p>

    <p
      v-if="hasUnavailable"
      class="mt-2 text-sm text-red-600 dark:text-red-400"
    >
      Some items are no longer available and are not included in the total.
    </p>

    <div class="mt-4">
      <slot />
    </div>
  </div>
</template>

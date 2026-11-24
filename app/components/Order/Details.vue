<script setup lang="ts">
import type { Order } from "~/types";

const props = defineProps<{ order: Order }>();

const shipping = computed(() =>
  props.order.addresses.find((address) => address.kind === "shipping"),
);
</script>

<template>
  <section
    class="space-y-6 rounded-lg border-2 border-stone-900 dark:border-zinc-100 bg-white dark:bg-zinc-950 p-4 sm:p-6"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="font-mono text-xs text-stone-500 dark:text-zinc-400">
          {{ order.orderNumber }}
        </p>
        <h2 class="text-2xl font-black">{{ order.statusLabel }}</h2>
        <p class="text-sm text-stone-500 dark:text-zinc-400">
          Placed {{ formatOrderDate(order.createdAt) }}
        </p>
      </div>
      <span
        class="border-2 rounded-full px-3 py-1 text-sm font-bold"
        :class="orderStatusClass(order.status)"
      >
        {{ order.statusLabel }}
      </span>
    </div>

    <div
      v-if="order.tracking.number || order.tracking.url"
      class="border-2 border-dashed border-emerald-700 dark:border-emerald-400 rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-1"
    >
      <p
        class="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-100"
      >
        <UIcon name="i-heroicons-truck" class="w-5 h-5" />
        On its way
      </p>
      <p v-if="order.tracking.carrier" class="text-sm">
        Carrier: {{ order.tracking.carrier }}
      </p>
      <p v-if="order.tracking.number" class="font-mono text-sm">
        {{ order.tracking.number }}
      </p>
      <p v-if="order.tracking.shippedAt" class="text-sm">
        Shipped {{ formatOrderDate(order.tracking.shippedAt) }}
      </p>
      <p v-if="order.tracking.deliveredAt" class="text-sm">
        Delivered {{ formatOrderDate(order.tracking.deliveredAt) }}
      </p>
      <UButton
        v-if="order.tracking.url"
        :to="order.tracking.url"
        target="_blank"
        rel="noopener noreferrer"
        color="primary"
        variant="outline"
        size="sm"
        icon="i-heroicons-arrow-top-right-on-square"
        class="mt-2"
      >
        Track with carrier
      </UButton>
    </div>

    <div
      v-if="order.failureReason"
      class="border-2 border-red-700 dark:border-red-400 rounded-md bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-800 dark:text-red-200"
    >
      {{ order.failureReason }}
    </div>

    <div class="space-y-3">
      <h3 class="text-sm font-bold uppercase tracking-wide">Items</h3>
      <ul class="divide-y-2 divide-dashed divide-stone-200 dark:divide-zinc-800">
        <li
          v-for="item in order.items"
          :key="item.id"
          class="py-3 flex items-start justify-between gap-4"
        >
          <div>
            <p class="font-bold">{{ item.name }}</p>
            <p class="text-sm text-stone-500 dark:text-zinc-400">
              <span v-if="item.color">{{ item.color }}</span>
              <span v-if="item.color && item.size"> · </span>
              <span v-if="item.size">Size {{ item.size }}</span>
              <span v-if="!item.color && !item.size">Qty {{ item.quantity }}</span>
              <span v-if="item.color || item.size"> · Qty {{ item.quantity }}</span>
            </p>
          </div>
          <p class="font-mono text-sm">
            {{ formatPrice(item.price * item.quantity, item.currency) }}
          </p>
        </li>
      </ul>
    </div>

    <div
      v-if="shipping"
      class="space-y-1 border-t-2 border-dashed border-stone-300 dark:border-zinc-700 pt-4 text-sm"
    >
      <h3 class="text-sm font-bold uppercase tracking-wide">Ships to</h3>
      <p class="font-bold">{{ shipping.name }}</p>
      <p class="text-stone-600 dark:text-zinc-400">
        {{ shipping.line1 }}
        <template v-if="shipping.line2">, {{ shipping.line2 }}</template>
      </p>
      <p class="text-stone-600 dark:text-zinc-400">
        {{ shipping.city }}
        <template v-if="shipping.state">, {{ shipping.state }}</template>
        {{ shipping.postalCode }}
      </p>
      <p class="font-mono text-stone-600 dark:text-zinc-400">
        {{ shipping.countryCode }}
      </p>
      <p v-if="shipping.phone" class="text-stone-600 dark:text-zinc-400">
        {{ shipping.phone }}
      </p>
    </div>

    <div
      class="border-t-2 border-stone-200 dark:border-zinc-800 pt-4 space-y-1 text-sm"
    >
      <p class="flex justify-between">
        <span>Subtotal</span>
        <span class="font-mono">{{
          formatPrice(order.totals.subtotal, order.totals.currency)
        }}</span>
      </p>
      <p v-if="order.totals.discount" class="flex justify-between">
        <span>Discount</span>
        <span class="font-mono"
          >-{{
            formatPrice(order.totals.discount, order.totals.currency)
          }}</span
        >
      </p>
      <p class="flex justify-between">
        <span>Shipping</span>
        <span class="font-mono">{{
          formatPrice(order.totals.shipping, order.totals.currency)
        }}</span>
      </p>
      <p v-if="order.totals.tax" class="flex justify-between">
        <span>Tax</span>
        <span class="font-mono">{{
          formatPrice(order.totals.tax, order.totals.currency)
        }}</span>
      </p>
      <p class="flex justify-between text-base font-black pt-2">
        <span>Total</span>
        <span class="font-mono">{{
          formatPrice(order.totals.total, order.totals.currency)
        }}</span>
      </p>
    </div>

    <div v-if="order.events.length" class="space-y-3">
      <h3 class="text-sm font-bold uppercase tracking-wide">History</h3>
      <ol class="space-y-3">
        <li
          v-for="event in order.events"
          :key="event.id"
          class="flex gap-3 text-sm"
        >
          <span
            class="mt-1 h-2 w-2 shrink-0 rounded-full bg-stone-900 dark:bg-zinc-100"
          />
          <div>
            <p class="font-bold">{{ event.message }}</p>
            <p class="text-stone-500 dark:text-zinc-400">
              {{ formatOrderDate(event.createdAt) }}
            </p>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { Order } from "~/types";

const props = defineProps<{ order: Order }>();

const itemCount = computed(() => orderItemCount(props.order));

/** Carrier link when we have one, otherwise the in-site tracking page. */
const trackingHref = computed(() => {
  const url = props.order.tracking.url;
  if (url) return url;

  const params = new URLSearchParams({ order: props.order.orderNumber });
  if (props.order.email) params.set("email", props.order.email);
  return `/track?${params.toString()}`;
});

const trackingExternal = computed(() => Boolean(props.order.tracking.url));
</script>

<template>
  <li
    class="border-b border-dashed border-slate-400 py-4 first:pt-0 last:border-b-0 last:pb-0 dark:border-zinc-700"
  >
    <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div class="min-w-0 space-y-1.5">
        <div class="flex flex-wrap items-center gap-2">
          <NuxtLink
            :to="`/account/orders/${order.id}`"
            class="font-mono text-sm font-bold underline decoration-dotted underline-offset-4 hover:text-coral-700 dark:hover:text-coral-300"
          >
            {{ order.orderNumber }}
          </NuxtLink>
          <span
            class="rounded-full border-2 px-2 py-0.5 text-xs font-bold"
            :class="orderStatusClass(order.status)"
          >
            {{ order.statusLabel }}
          </span>
        </div>

        <p class="text-sm text-stone-600 dark:text-zinc-400">
          {{ formatOrderDate(order.createdAt) }}
          <span aria-hidden="true"> · </span>
          {{ itemCount }}
          {{ itemCount === 1 ? "item" : "items" }}
        </p>

        <p class="font-mono text-sm font-bold">
          {{ formatPrice(order.totals.total, order.totals.currency) }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          :to="`/account/orders/${order.id}`"
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-heroicons-document-text"
        >
          Details
        </UButton>
        <UButton
          :to="trackingHref"
          :target="trackingExternal ? '_blank' : undefined"
          :rel="trackingExternal ? 'noopener noreferrer' : undefined"
          color="primary"
          variant="soft"
          size="sm"
          icon="i-heroicons-truck"
        >
          Track
        </UButton>
      </div>
    </div>
  </li>
</template>

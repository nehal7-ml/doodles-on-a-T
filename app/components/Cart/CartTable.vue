<script setup lang="ts">
import type { CartViewItem } from "~/types";

defineProps<{
  items: CartViewItem[];
  pending?: boolean;
}>();

const emit = defineEmits<{
  update: [item: CartViewItem, quantity: number];
  remove: [item: CartViewItem];
}>();

function itemLabel(item: CartViewItem): string {
  return [item.variantName, item.size].filter(Boolean).join(" · ");
}

/**
 * A line links back to its product page with the exact colour/size that is in
 * the cart already selected, so "buy another variant" is two clicks away.
 */
function productHref(item: CartViewItem): string {
  return `/products/${item.productSlug}?variant=${encodeURIComponent(item.variantId)}`;
}
</script>

<template>
  <div class="w-full md:w-2/3 md:max-w-2/3 p-2">
    <ul class="flex flex-col gap-3">
      <li
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-4 border-2 border-dashed border-stone-300 dark:border-zinc-700 rounded-lg p-3"
        :class="{ 'opacity-60': !item.available }"
      >
        <NuxtLink
          :to="productHref(item)"
          class="shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :title="`View ${item.productName}`"
          tabindex="-1"
          aria-hidden="true"
        >
          <img
            v-if="item.image"
            :src="item.image"
            alt=""
            class="w-16 h-16 rounded-xl object-cover"
            loading="lazy"
          >
          <div
            v-else
            class="w-16 h-16 rounded-xl bg-stone-200 dark:bg-zinc-800"
          />
        </NuxtLink>

        <div class="flex-1 min-w-0">
          <NuxtLink
            :to="productHref(item)"
            class="block font-medium text-highlighted truncate hover:underline underline-offset-4 decoration-wavy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :title="`View ${item.productName}`"
          >
            {{ item.productName }}
          </NuxtLink>
          <p
            v-if="itemLabel(item)"
            class="text-sm text-stone-500 dark:text-zinc-400 truncate"
          >
            {{ itemLabel(item) }}
          </p>
          <p
            v-if="!item.available"
            class="mt-1 text-xs font-bold text-red-600 dark:text-red-400"
          >
            No longer available — remove to continue
          </p>
        </div>

        <div
          class="flex items-center rounded-md border-2 border-stone-900 dark:border-zinc-100"
        >
          <UButton
            icon="i-heroicons-minus"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="pending || item.quantity <= 1"
            @click="emit('update', item, item.quantity - 1)"
          />
          <span class="w-8 text-center font-bold text-sm">
            {{ item.quantity }}
          </span>
          <UButton
            icon="i-heroicons-plus"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="pending || item.quantity >= 99"
            @click="emit('update', item, item.quantity + 1)"
          />
        </div>

        <div class="w-24 text-right font-bold">
          {{ formatPrice(item.lineTotalCents / 100, item.currency) }}
        </div>

        <UButton
          icon="i-heroicons-trash"
          color="neutral"
          variant="ghost"
          :disabled="pending"
          title="Remove from cart"
          @click="emit('remove', item)"
        />
      </li>
    </ul>
  </div>
</template>

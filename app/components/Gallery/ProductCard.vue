<script setup lang="ts">
import type { Product } from "~/types";

const props = defineProps<{ product: Product }>();

const imageFailed = ref(false);
const image = computed(
  () => props.product.thumbnailUrl || props.product.images[0] || null,
);

const sizeLabel = computed(() => {
  const sizes = props.product.sizes;
  if (!sizes.length) return "One size";
  const visible = sizes.slice(0, 4).join(" · ");
  return sizes.length > 4 ? `${visible} +${sizes.length - 4}` : visible;
});

const colorLabel = computed(() => {
  const names = props.product.variants
    .map((variant) => variant.name)
    .filter(Boolean);
  if (!names.length) return "Classic";
  return names.length > 1 ? `${names.length} colors` : names[0];
});

const inStock = computed(
  () =>
    props.product.options.some((option) => option.inStock) ||
    props.product.variants.some((variant) => variant.inStock),
);
</script>

<template>
  <NuxtLink
    :to="`/products/${product.id}`"
    class="group flex flex-col border-2 border-stone-900 dark:border-zinc-200 rounded-lg p-3 bg-white dark:bg-zinc-950 transition-all hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(28,25,23,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(250,250,250,1)]"
  >
    <div
      class="relative aspect-square overflow-hidden rounded border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900"
    >
      <img
        v-if="image && !imageFailed"
        :src="image"
        :alt="product.name"
        loading="lazy"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        @error="imageFailed = true"
      />
      <div
        v-else
        class="flex h-full w-full items-center justify-center p-8 text-stone-300 dark:text-zinc-700"
      >
        <UIcon name="i-heroicons-photo" class="h-16 w-16" />
      </div>

      <span
        class="absolute bottom-2 left-2 text-xs font-mono bg-white/90 dark:bg-zinc-950/90 border border-stone-300 dark:border-zinc-700 px-1.5 py-0.5 rounded rotate-[-1deg]"
      >
        {{ formatPrice(product.price, product.currency) }}
      </span>

      <span
        v-if="!inStock"
        class="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-800 border border-red-700 dark:bg-red-950 dark:text-red-200 dark:border-red-300 px-1.5 py-0.5 rounded"
      >
        Sold out
      </span>
      <span
        v-else-if="product.images.length > 1"
        class="absolute top-2 right-2 text-[10px] font-mono bg-stone-900/80 text-white dark:bg-zinc-100/90 dark:text-zinc-900 px-1.5 py-0.5 rounded"
      >
        {{ product.images.length }} views
      </span>
    </div>

    <div class="mt-3 flex flex-1 flex-col">
      <h2
        class="text-lg font-bold leading-tight group-hover:underline decoration-dotted"
      >
        {{ product.name }}
      </h2>
      <p class="mt-1 text-xs text-stone-500 dark:text-zinc-400 line-clamp-2">
        {{ product.description || "A fresh doodle, printed on demand." }}
      </p>

      <div class="mt-auto space-y-2 pt-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1">
            <span
              v-for="variant in product.variants.slice(0, 5)"
              :key="variant.id"
              :title="variant.name"
              :style="{ backgroundColor: variant.colors[0] || '#d6d3d1' }"
              class="h-4 w-4 rounded-full border border-stone-400 dark:border-zinc-500"
            />
          </div>
          <span
            class="text-[11px] font-bold uppercase tracking-wide text-stone-500 dark:text-zinc-400"
          >
            {{ colorLabel }}
          </span>
        </div>
        <p
          class="font-mono text-[11px] text-stone-500 dark:text-zinc-400 line-clamp-1"
        >
          Sizes: {{ sizeLabel }}
        </p>
      </div>
    </div>
  </NuxtLink>
</template>

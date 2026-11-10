<script setup lang="ts">
import type { Product } from "~/types";
import MainGallery from "~/components/Gallery/MainGallery.vue";

const search = ref("");
const sort = ref<"featured" | "price-asc" | "price-desc" | "name">("featured");

const { data: products, status, error, refresh } = useLazyFetch<Product[]>(
  "/api/products",
  { key: "explore-products" },
);

const isLoading = computed(() => status.value === "pending");

const sortOptions = [
  { label: "Featured", value: "featured" },
  { label: "Price: low to high", value: "price-asc" },
  { label: "Price: high to low", value: "price-desc" },
  { label: "Name: A to Z", value: "name" },
];

const filteredProducts = computed(() => {
  const query = search.value.trim().toLowerCase();
  let list = products.value ?? [];

  if (query) {
    list = list.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.description.toLowerCase().includes(query),
    );
  }

  const sorted = [...list];

  if (sort.value === "price-asc") {
    sorted.sort((a, b) => a.price - b.price);
  } else if (sort.value === "price-desc") {
    sorted.sort((a, b) => b.price - a.price);
  } else if (sort.value === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  }

  return sorted;
});

useHead({ title: "Explore · doodles.on.a.T" });
</script>

<template>
  <div class="space-y-8">
    <header class="space-y-3">
      <span
        class="inline-block bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200 border-2 border-yellow-700 dark:border-yellow-300 px-3 py-1 rounded-full text-sm font-bold rotate-[-1deg]"
      >
        The Sketchbook
      </span>
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-4xl md:text-5xl font-black tracking-tight">
            Explore the doodles
          </h1>
          <p class="mt-2 text-stone-600 dark:text-zinc-400 font-medium">
            Every shirt starts as a messy little drawing. Pick your favourite.
          </p>
        </div>
        <span
          v-if="products"
          class="font-mono text-sm text-stone-500 dark:text-zinc-400 rotate-[1deg]"
        >
          {{ filteredProducts.length }} /
          {{ products.length }} sketches
        </span>
      </div>
    </header>

    <div
      class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between border-y-2 border-dashed border-stone-300 dark:border-zinc-700 py-4"
    >
      <UInput
        v-model="search"
        icon="i-heroicons-magnifying-glass"
        placeholder="Search doodles…"
        size="lg"
        class="w-full sm:max-w-xs"
        :ui="{ base: 'rounded-md' }"
      />
      <div class="flex items-center gap-2">
        <span class="text-sm font-bold whitespace-nowrap">Sort by</span>
        <USelect
          v-model="sort"
          :items="sortOptions"
          size="lg"
          class="w-52"
        />
      </div>
    </div>

    <AppLoader
      v-if="isLoading && !products"
      label="Sketching the catalog…"
      size="lg"
    />

    <div
      v-else-if="error"
      class="border-2 border-stone-900 dark:border-zinc-100 rounded-lg bg-white dark:bg-zinc-950 p-10 text-center space-y-4"
    >
      <UIcon
        name="i-heroicons-exclamation-triangle"
        class="w-12 h-12 mx-auto text-yellow-500"
      />
      <div>
        <h2 class="text-xl font-bold">The pencils jammed.</h2>
        <p class="text-stone-500 dark:text-zinc-400">
          We couldn't load the catalog. Try again in a moment.
        </p>
      </div>
      <UButton color="primary" variant="solid" @click="refresh()">
        Retry
      </UButton>
    </div>

    <div
      v-else-if="!filteredProducts.length"
      class="border-2 border-dashed border-stone-400 dark:border-zinc-600 rounded-lg p-12 text-center space-y-3"
    >
      <UIcon
        name="i-heroicons-face-smile"
        class="w-12 h-12 mx-auto text-stone-400 dark:text-zinc-500"
      />
      <h2 class="text-xl font-bold">No doodles found</h2>
      <p class="text-stone-500 dark:text-zinc-400">
        Try a different search or clear the filters.
      </p>
      <UButton
        v-if="search"
        color="primary"
        variant="outline"
        @click="search = ''"
      >
        Clear search
      </UButton>
    </div>

    <MainGallery v-else :products="filteredProducts" />
  </div>
</template>

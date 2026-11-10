<script setup lang="ts">
import type { Product } from "~/types";
import GalleryProductCard from "~/components/Gallery/ProductCard.vue";

const {
  data: featured,
  status,
  error,
  refresh,
} = await useFetch<Product[]>("/api/products?limit=3", {
  key: "home-featured",
});

const isLoading = computed(() => status.value === "pending");

const hero = computed(() => featured.value?.[0]);
const heroImage = computed(
  () => hero.value?.thumbnailUrl || hero.value?.images[0] || null,
);
const heroColour = computed(
  () => hero.value?.variants.find((variant) => variant.inStock)?.name,
);

useHead({ title: "doodles.on.a.T · Wearable art" });
</script>

<template>
  <div class="space-y-16">
    <!-- Hero Section: The Big Sketch -->
    <section
      class="relative border-4 border-stone-900 dark:border-zinc-100 rounded-lg p-8 md:p-12 bg-white dark:bg-zinc-950 shadow-[4px_4px_0px_0px_rgba(28,25,23,1)] dark:shadow-[4px_4px_0px_0px_rgba(250,250,250,1)] transition-transform hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(28,25,23,1)]"
    >
      <div class="grid md:grid-cols-2 gap-8 items-center">
        <div class="space-y-6">
          <span
            class="inline-block bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-2 border-emerald-800 dark:border-emerald-300 px-3 py-1 rounded-full text-sm font-bold rotate-[-1deg]"
          >
            Freshly Sketched ✏️
          </span>
          <h1
            class="text-4xl md:text-6xl font-black tracking-tight leading-none"
          >
            Wearable art for
            <span
              class="underline decoration-wavy decoration-yellow-400 dark:decoration-yellow-500"
              >unserious</span
            >
            people.
          </h1>
          <p class="text-lg text-stone-600 dark:text-zinc-400 font-medium">
            Raw pencil sketches, messy lines, and pure imagination printed
            directly onto heavy-weight, premium organic cotton T-shirts.
          </p>
          <div>
            <UButton
              to="/explore"
              size="xl"
              color="primary"
              variant="solid"
              class="font-bold border-2 border-stone-950 dark:border-zinc-50 rounded-md transform active:translate-y-1"
            >
              Flip Through the Catalog
            </UButton>
          </div>
        </div>

        <!-- Featured Doodle Showcase Box -->
        <div
          class="border-2 border-dashed border-stone-400 dark:border-zinc-600 p-4 rounded-lg bg-stone-50 dark:bg-zinc-900 flex flex-col items-center justify-center relative min-h-[300px]"
        >
          <div
            class="absolute top-2 right-3 text-xs text-stone-400 font-mono rotate-[4deg]"
          >
            fig_{{ hero?.id ?? "01" }}_{{ hero ? "live" : "doodle" }}.png
          </div>

          <NuxtLink
            v-if="hero"
            :to="`/products/${hero.id}`"
            class="group flex flex-col items-center"
          >
            <div
              class="w-48 h-48 flex items-center justify-center overflow-hidden border border-stone-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 shadow-inner"
            >
              <img
                v-if="heroImage"
                :src="heroImage"
                :alt="hero.name"
                class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <UIcon
                v-else
                name="i-heroicons-paint-brush"
                class="w-24 h-24 text-stone-400 dark:text-zinc-500"
              />
            </div>
            <p
              class="mt-4 font-mono text-sm text-center text-stone-500 dark:text-zinc-400 group-hover:underline decoration-dotted"
            >
              "{{ hero.name }}"{{ heroColour ? ` — ${heroColour}` : "" }}
            </p>
          </NuxtLink>

          <div v-else class="flex flex-col items-center">
            <div
              class="w-48 h-48 flex items-center justify-center border border-stone-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 p-4 shadow-inner"
            >
              <UIcon
                name="i-heroicons-paint-brush"
                class="w-24 h-24 text-stone-400 dark:text-zinc-500"
                :class="{ 'animate-pulse': isLoading }"
              />
            </div>
            <p class="mt-4 font-mono text-sm text-stone-500 dark:text-zinc-400">
              {{ isLoading ? "Sharpening pencils…" : "Waiting for the first doodle" }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Short Featured Grid Section -->
    <section class="space-y-6">
      <div
        class="flex items-end justify-between border-b-2 border-stone-200 dark:border-zinc-800 pb-2"
      >
        <h2 class="text-2xl font-bold tracking-tight">Staff Pick Doodles</h2>
        <NuxtLink
          to="/explore"
          class="text-sm font-bold hover:underline underline-offset-4 flex items-center gap-1"
        >
          See all sketches <UIcon name="i-heroicons-arrow-right-20-solid" />
        </NuxtLink>
      </div>

      <div
        v-if="isLoading && !featured"
        class="grid sm:grid-cols-2 md:grid-cols-3 gap-6"
      >
        <div
          v-for="i in 3"
          :key="i"
          class="border-2 border-stone-200 dark:border-zinc-800 rounded-lg p-3 animate-pulse"
        >
          <div class="aspect-square rounded bg-stone-100 dark:bg-zinc-900" />
          <div class="mt-4 h-4 w-2/3 rounded bg-stone-100 dark:bg-zinc-900" />
          <div class="mt-2 h-3 w-1/2 rounded bg-stone-100 dark:bg-zinc-900" />
        </div>
      </div>

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
            We couldn't load the latest doodles. Try again in a moment.
          </p>
        </div>
        <UButton color="primary" variant="solid" @click="refresh()">
          Retry
        </UButton>
      </div>

      <div
        v-else-if="!featured?.length"
        class="border-2 border-dashed border-stone-400 dark:border-zinc-600 rounded-lg p-12 text-center space-y-3"
      >
        <UIcon
          name="i-heroicons-face-smile"
          class="w-12 h-12 mx-auto text-stone-400 dark:text-zinc-500"
        />
        <h2 class="text-xl font-bold">The sketchbook is empty</h2>
        <p class="text-stone-500 dark:text-zinc-400">
          New doodles will appear here as soon as they are synced from Printful.
        </p>
      </div>

      <div v-else class="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
        <GalleryProductCard
          v-for="product in featured"
          :key="product.id"
          :product="product"
        />
      </div>
    </section>
  </div>
</template>

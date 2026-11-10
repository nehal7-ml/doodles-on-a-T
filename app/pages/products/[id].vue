<script setup lang="ts">
import type { Product } from "~/types";

const route = useRoute();
const toast = useToast();

const { data: product, error, status, refresh } = await useFetch<Product>(
  () => `/api/products/${route.params.id}`,
  { key: `product-${route.params.id}` },
);

const selectedVariantId = ref<string | null>(null);
const selectedSize = ref<string | null>(null);
const quantity = ref(1);

watch(
  () => route.params.id,
  () => {
    selectedVariantId.value = null;
    selectedSize.value = null;
    quantity.value = 1;
  },
);

const selectedVariant = computed(() =>
  product.value?.variants.find((variant) => variant.id === selectedVariantId.value),
);

const availableSizes = computed(() =>
  selectedVariant.value?.sizes.length
    ? selectedVariant.value.sizes
    : (product.value?.sizes ?? []),
);

/**
 * A colour can list a size in its variant group while that exact combination
 * is sold out, so availability must be checked against the flat option list.
 */
function isSizeAvailable(size: string): boolean {
  const group = selectedVariant.value;
  if (!group) return false;

  const matches = (product.value?.options ?? []).filter(
    (option) =>
      (option.color ?? option.name) === group.name && option.size === size,
  );

  // Some products have no size dimension (posters, one-size items).
  if (!matches.length) return group.inStock;
  return matches.some((option) => option.inStock);
}

// Resolve the exact local variant (colour + size) that gets sent to the API.
const selectedOption = computed(() => {
  if (!product.value) return undefined;
  const group = selectedVariant.value;
  const options = product.value.options;

  if (!group) return options[0];

  const inGroup = options.filter(
    (option) => (option.color ?? option.name) === group.name,
  );

  return (
    inGroup.find((option) => option.size === selectedSize.value) ??
    inGroup.find((option) => option.inStock) ??
    inGroup[0]
  );
});

const { addItem } = useCart();
const adding = ref(false);

async function addToCart() {
  if (!product.value || !selectedOption.value) return;

  const option = selectedOption.value;
  const details = [selectedVariant.value?.name, selectedSize.value]
    .filter(Boolean)
    .join(" · ");

  adding.value = true;
  try {
    await addItem(option.id, quantity.value);
    quantity.value = 1;
    toast.add({
      title: "Added to your cart",
      description: `${product.value.name}${details ? ` · ${details}` : ""}`,
      icon: "i-heroicons-check-circle",
      color: "primary",
    });
  } catch (error) {
    toast.add({
      title: authErrorMessage(error),
      color: "error",
      icon: "i-heroicons-exclamation-triangle",
    });
  } finally {
    adding.value = false;
  }
}

const displayPrice = computed(
  () => selectedOption.value?.price ?? product.value?.price ?? 0,
);

const displayCurrency = computed(
  () => selectedOption.value?.currency ?? product.value?.currency ?? "USD",
);

/**
 * Show the selected colour's artwork first, then the remaining product shots.
 * The carousel is keyed by colour so switching colours starts at that image.
 */
const galleryImages = computed(() => {
  const images = [
    selectedOption.value?.image,
    selectedVariant.value?.image,
    ...(product.value?.images ?? []),
    product.value?.thumbnailUrl,
  ].filter((image): image is string => Boolean(image));

  return [...new Set(images)];
});

const galleryKey = computed(() => selectedVariantId.value ?? "all");

const galleryAlt = computed(() => {
  if (!product.value) return "";
  return selectedVariant.value
    ? `${product.value.name} — ${selectedVariant.value.name}`
    : product.value.name;
});

const isLoading = computed(() => status.value === "pending");
const notFound = computed(() => error.value?.statusCode === 404);

// Pick the first colour/size that is actually purchasable.
watch(
  () => product.value,
  (value) => {
    if (!value) return;

    if (selectedVariantId.value === null) {
      selectedVariantId.value =
        value.variants.find((variant) => variant.inStock)?.id ??
        value.variants[0]?.id ??
        null;
    }

    if (selectedSize.value === null) {
      const group = value.variants.find(
        (variant) => variant.id === selectedVariantId.value,
      );
      const sizes = group?.sizes.length ? group.sizes : value.sizes;
      selectedSize.value =
        sizes.find((size) => isSizeAvailable(size)) ?? sizes[0] ?? null;
    }
  },
  { immediate: true },
);

watch(selectedVariantId, () => {
  const sizes = availableSizes.value;
  if (!sizes.length) {
    selectedSize.value = null;
    return;
  }

  if (
    !selectedSize.value ||
    !sizes.includes(selectedSize.value) ||
    !isSizeAvailable(selectedSize.value)
  ) {
    selectedSize.value =
      sizes.find((size) => isSizeAvailable(size)) ?? sizes[0] ?? null;
  }
});

useHead(() => ({
  title: product.value
    ? `${product.value.name} · doodles.on.a.T`
    : "Product · doodles.on.a.T",
}));
</script>

<template>
  <AppLoader v-if="isLoading" label="Pinning up the sketch…" size="lg" />

  <div
    v-else-if="notFound || error || !product"
    class="border-2 border-stone-900 dark:border-zinc-100 rounded-lg bg-white dark:bg-zinc-950 p-12 text-center space-y-4"
  >
    <UIcon
      name="i-heroicons-pencil-square"
      class="w-14 h-14 mx-auto text-stone-400 dark:text-zinc-500"
    />
    <div class="space-y-1">
      <h1 class="text-2xl font-black">
        {{ notFound ? "This doodle got erased" : "Something smudged" }}
      </h1>
      <p class="text-stone-500 dark:text-zinc-400">
        {{
          notFound
            ? "We couldn't find that product. It may have been removed."
            : "We couldn't load this product right now. Please try again."
        }}
      </p>
    </div>
    <div class="flex items-center justify-center gap-2">
      <UButton v-if="!notFound" color="primary" @click="refresh()">Retry</UButton>
      <UButton to="/explore" color="neutral" variant="outline">
        Back to explore
      </UButton>
    </div>
  </div>

  <div v-else class="space-y-8">
    <NuxtLink
      to="/explore"
      class="inline-flex items-center gap-1 text-sm font-bold hover:underline underline-offset-4 decoration-wavy"
    >
      <UIcon name="i-heroicons-arrow-left-20-solid" />
      Back to the sketchbook
    </NuxtLink>

    <div class="grid lg:grid-cols-2 gap-8 lg:gap-12">
      <div>
        <UCarousel
          v-slot="{ item }"
          :key="galleryKey"
          arrows
          dots
          :items="galleryImages"
          :ui="{ item: 'basis-full' }"
          class="rounded-lg overflow-hidden border-2 border-stone-900 dark:border-zinc-200 bg-white dark:bg-zinc-950"
        >
          <img
            :src="item"
            :alt="galleryAlt"
            class="aspect-square w-full object-cover"
          />
        </UCarousel>

        <div
          class="mt-3 flex items-center justify-between font-mono text-xs text-stone-500 dark:text-zinc-400"
        >
          <span>
            fig_{{ product.id }}_{{ product.name.toLowerCase().replaceAll(" ", "_") }}{{
              selectedVariant ? `_${selectedVariant.id}` : ""
            }}.png
          </span>
          <span>{{ galleryImages.length }} views</span>
        </div>
      </div>

      <div class="space-y-6">
        <div class="space-y-2">
          <div
            class="inline-block bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-2 border-emerald-800 dark:border-emerald-300 px-2 py-0.5 rounded-full text-xs font-bold rotate-[-1deg]"
          >
            Freshly sketched
          </div>
          <h1 class="text-4xl md:text-5xl font-black tracking-tight leading-none">
            {{ product.name }}
          </h1>
          <p class="text-2xl font-black">
            {{ formatPrice(displayPrice, displayCurrency) }}
          </p>
        </div>

        <p class="text-stone-600 dark:text-zinc-400 font-medium leading-relaxed">
          {{ product.description }}
        </p>

        <div v-if="product.variants.length" class="space-y-2">
          <h2 class="text-sm font-bold uppercase tracking-wide">
            Color
            <span
              v-if="selectedVariant"
              class="font-mono normal-case tracking-normal text-stone-500 dark:text-zinc-400"
            >
              — {{ selectedVariant.name }}
            </span>
          </h2>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="variant in product.variants"
              :key="variant.id"
              type="button"
              class="flex items-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors"
              :class="
                variant.id === selectedVariantId
                  ? 'border-stone-900 dark:border-zinc-100 bg-stone-100 dark:bg-zinc-800'
                  : 'border-stone-300 dark:border-zinc-700 hover:border-stone-500 dark:hover:border-zinc-500'
              "
              :title="variant.inStock ? variant.name : `${variant.name} (out of stock)`"
              @click="selectedVariantId = variant.id"
            >
              <span
                :style="{ backgroundColor: variant.colors[0] || '#d6d3d1' }"
                class="h-4 w-4 rounded-full border border-stone-400 dark:border-zinc-500"
              />
              <span :class="variant.inStock ? '' : 'line-through opacity-60'">
                {{ variant.name }}
              </span>
            </button>
          </div>
        </div>

        <div v-if="availableSizes.length" class="space-y-2">
          <h2 class="text-sm font-bold uppercase tracking-wide">Size</h2>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="size in availableSizes"
              :key="size"
              type="button"
              :disabled="!isSizeAvailable(size)"
              class="min-w-11 rounded-md border-2 px-3 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed"
              :class="
                size === selectedSize
                  ? 'border-stone-900 dark:border-zinc-100 bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : isSizeAvailable(size)
                    ? 'border-stone-300 dark:border-zinc-700 hover:border-stone-500 dark:hover:border-zinc-500'
                    : 'border-stone-200 dark:border-zinc-800 text-stone-400 dark:text-zinc-600 line-through'
              "
              :title="
                isSizeAvailable(size)
                  ? `${selectedVariant?.name ?? ''} · ${size}`
                  : `${size} is sold out in this colour`
              "
              @click="selectedSize = size"
            >
              {{ size }}
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <div
            class="flex items-center rounded-md border-2 border-stone-900 dark:border-zinc-100"
          >
            <UButton
              icon="i-heroicons-minus"
              color="neutral"
              variant="ghost"
              :disabled="quantity <= 1"
              @click="quantity--"
            />
            <span class="w-10 text-center font-bold">{{ quantity }}</span>
            <UButton
              icon="i-heroicons-plus"
              color="neutral"
              variant="ghost"
              @click="quantity++"
            />
          </div>

          <UButton
            color="primary"
            size="xl"
            icon="i-heroicons-shopping-bag"
            class="flex-1 font-bold border-2 border-stone-950 dark:border-zinc-50 rounded-md"
            :disabled="
              adding ||
              (product.options.length > 0 && !selectedOption?.inStock)
            "
            @click="addToCart"
          >
            {{
              selectedOption && !selectedOption.inStock
                ? "Out of stock"
                : adding
                  ? "Adding…"
                  : "Add to cart"
            }}
          </UButton>
        </div>

        <div class="space-y-2 border-t-2 border-dashed border-stone-300 dark:border-zinc-700 pt-4 text-sm text-stone-500 dark:text-zinc-400">
          <p class="flex items-center gap-2">
            <UIcon name="i-heroicons-truck" class="w-4 h-4" />
            Printed on demand · ships in 3–5 days
          </p>
          <p class="flex items-center gap-2">
            <UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
            Heavyweight organic cotton
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

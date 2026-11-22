<script setup lang="ts">
import type { Product } from "~/types";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const { data: product, error, status, refresh } = await useFetch<Product>(
  () => `/api/products/${route.params.slug}`,
  { key: `product-${route.params.slug}` },
);

// Old links (and the cuid form of the URL) stay valid: redirect them to the
// canonical slug so search engines only index one URL per product.
if (
  product.value &&
  product.value.slug &&
  route.params.slug !== product.value.slug
) {
  await navigateTo(`/products/${product.value.slug}`, {
    redirectCode: 301,
    replace: true,
  });
}

// A product that does not exist must be a real 404 (not a soft 200) so search
// engines do not index empty pages.
if (error.value?.statusCode === 404) setResponseStatus(404);

const selectedVariantId = ref<string | null>(null);
const selectedSize = ref<string | null>(null);
const quantity = ref(1);

/** First value of a (possibly repeated) query parameter, or `null`. */
function queryParam(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first !== "" ? first : null;
}

/**
 * Shareable deep links are `?color=<colour-group-slug>&size=<M>` — readable
 * values a shopper can read, copy and re-send. `color` matches
 * `variants[].id` (the slugified colour name), `size` is matched
 * case-insensitively inside the chosen colour. Older cart links carrying an
 * opaque `?variant=<optionId>` still work: they resolve to a colour + size
 * and are then normalised to the readable form.
 */
function applyVariantQuery(value: Product | null | undefined): void {
  if (!value) return;

  // Legacy one-shot: an exact option id from an older cart link.
  const optionId = queryParam(route.query.variant);
  if (optionId) {
    const option = value.options.find((candidate) => candidate.id === optionId);
    if (option) {
      const group = value.variants.find(
        (variant) => variant.name === (option.color ?? option.name),
      );
      if (group) selectedVariantId.value = group.id;
      if (option.size) selectedSize.value = option.size;
    }
  }

  const color = queryParam(route.query.color);
  if (color) {
    const wanted = color.trim().toLowerCase().replace(/\s+/g, "-");
    const group = value.variants.find((variant) => variant.id === wanted);
    if (group) selectedVariantId.value = group.id;
  }

  const size = queryParam(route.query.size);
  if (size) {
    const group = value.variants.find(
      (variant) => variant.id === selectedVariantId.value,
    );
    const sizes = group?.sizes.length ? group.sizes : value.sizes;
    const match = sizes.find(
      (candidate) => candidate.toLowerCase() === size.trim().toLowerCase(),
    );
    if (match) selectedSize.value = match;
  }

  syncSelectionToQuery();
}

/**
 * Keep the address bar shareable: the current selection is written back as
 * `?color=…&size=…` so any combination can be copied out of the URL. Runs on
 * the client only, uses `replace` (no history spam), preserves unrelated
 * parameters and drops the one-shot legacy `variant`.
 */
function syncSelectionToQuery(): void {
  if (!import.meta.client || !product.value) return;

  const next = { ...route.query };
  delete next.variant;

  const group = product.value.variants.find(
    (variant) => variant.id === selectedVariantId.value,
  );
  if (group) next.color = group.id;
  else delete next.color;
  if (selectedSize.value) next.size = selectedSize.value;
  else delete next.size;

  // Nothing to do: the URL already describes this selection (and carries no
  // legacy parameter) — also what stops the write-back from looping.
  if (
    !queryParam(route.query.variant) &&
    queryParam(route.query.color) === queryParam(next.color) &&
    queryParam(route.query.size) === queryParam(next.size)
  ) {
    return;
  }

  void router.replace({ query: next });
}

watch(
  () => route.params.slug,
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

const { addItem, cart, ensureLoaded } = useCart();
const adding = ref(false);

// The header loads the cart, but this page can be the first thing rendered
// (direct link from a cart line), so make sure the "in cart" state is there.
onMounted(() => {
  ensureLoaded().catch(() => {});
});

/** Lines of *this* product already in the cart, newest state from the server. */
const inCart = computed(() => {
  const slug = product.value?.slug;
  if (!slug) return [];
  return cart.value.items.filter((item) => item.productSlug === slug);
});

/** Quantity per exact colour + size option, for the size-button badges. */
const inCartByVariant = computed(() => {
  const totals = new Map<string, number>();
  for (const item of inCart.value) {
    totals.set(item.variantId, (totals.get(item.variantId) ?? 0) + item.quantity);
  }
  return totals;
});

/** Quantity inside one colour group, for the colour-button badges. */
function inCartForColor(groupName: string): number {
  return (product.value?.options ?? []).reduce((total, option) => {
    if ((option.color ?? option.name) !== groupName) return total;
    return total + (inCartByVariant.value.get(option.id) ?? 0);
  }, 0);
}

/** Quantity for a size inside the currently selected colour group. */
function inCartForSize(size: string): number {
  const groupName = selectedVariant.value?.name;
  if (!groupName) return 0;
  const option = (product.value?.options ?? []).find(
    (candidate) =>
      (candidate.color ?? candidate.name) === groupName &&
      candidate.size === size,
  );
  return option ? (inCartByVariant.value.get(option.id) ?? 0) : 0;
}

/** Quantity of the exact colour + size currently selected. */
const inCartForSelectedOption = computed(() => {
  const optionId = selectedOption.value?.id;
  return optionId ? (inCartByVariant.value.get(optionId) ?? 0) : 0;
});

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
      actions: [
        {
          label: "View cart",
          onClick: () => navigateTo("/cart"),
        },
      ],
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

// Pick the first colour/size that is actually purchasable, then let a
// `?color=`/`?size=` (or legacy `?variant=`) deep link override it with the
// exact combination.
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

    applyVariantQuery(value);
  },
  { immediate: true },
);

// Same product, different cart line (or a shared link opened on this page):
// the slug does not change, so the query alone has to re-apply the
// selection. Joined by value, so the write-back below cannot loop.
watch(
  () =>
    [route.query.variant, route.query.color, route.query.size]
      .map((value) => queryParam(value) ?? "")
      .join("|"),
  () => applyVariantQuery(product.value),
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

// Runs after the size normalizer above, so a colour change is written to the
// address bar as a single, already-valid `?color=…&size=…` pair.
watch([selectedVariantId, selectedSize], () => syncSelectionToQuery());

const requestUrl = useRequestURL();

function seoDescription(value: Product | null | undefined): string | undefined {
  if (!value) return undefined;
  const text = (
    value.description ||
    `${value.name} — printed on demand at doodles.on.a.T.`
  )
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

useHead(() => {
  const value = product.value;
  const title = value
    ? `${value.name} · doodles.on.a.T`
    : "Product · doodles.on.a.T";
  const description = seoDescription(value);
  const canonical = value?.slug
    ? new URL(`/products/${value.slug}`, requestUrl.origin).href
    : requestUrl.href;
  const image = value?.thumbnailUrl || value?.images?.[0];

  // unhead types meta entries as a union: each element must carry either a
  // required `name` or a required `property`, so keep the array a union too.
  const meta: ({ name: string; content: string } | { property: string; content: string })[] = [
    { property: "og:title", content: title },
    { property: "og:type", content: "product" },
    { property: "og:url", content: canonical },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
  ];
  if (description) {
    meta.push(
      { name: "description", content: description },
      { property: "og:description", content: description },
    );
  }
  if (image) meta.push({ property: "og:image", content: image });

  return {
    title,
    link: [{ rel: "canonical", href: canonical }],
    meta,
  };
});
</script>

<template>
  <AppLoader v-if="isLoading" label="Pinning up the sketch…" size="lg" />

  <div
    v-else-if="notFound || error || !product"
    class="border-2 border-slate-900 dark:border-zinc-100 rounded-lg bg-white dark:bg-zinc-950 p-12 text-center space-y-4"
  >
    <UIcon
      name="i-heroicons-pencil-square"
      class="w-14 h-14 mx-auto text-slate-400 dark:text-zinc-500"
    />
    <div class="space-y-1">
      <h1 class="text-2xl font-black">
        {{ notFound ? "This doodle got erased" : "Something smudged" }}
      </h1>
      <p class="text-slate-500 dark:text-zinc-400">
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
          class="rounded-lg overflow-hidden border-2 border-slate-900 dark:border-zinc-200 bg-white dark:bg-zinc-950"
        >
          <img
            :src="item"
            :alt="galleryAlt"
            class="aspect-square w-full object-cover"
          >
        </UCarousel>

        <div
          class="mt-3 flex items-center justify-between font-mono text-xs text-slate-500 dark:text-zinc-400"
        >
          <span class="min-w-0 truncate">
            fig_{{ product.id }}_{{ product.name.toLowerCase().replaceAll(" ", "_") }}{{
              selectedVariant ? `_${selectedVariant.id}` : ""
            }}.png
          </span>
          <span class="shrink-0 pl-3">{{ galleryImages.length }} views</span>
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

        <p class="text-slate-600 dark:text-zinc-400 font-medium leading-relaxed">
          {{ product.description }}
        </p>

        <div v-if="product.variants.length" class="space-y-2">
          <h2 class="text-sm font-bold uppercase tracking-wide">
            Color
            <span
              v-if="selectedVariant"
              class="font-mono normal-case tracking-normal text-slate-500 dark:text-zinc-400"
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
                  ? 'border-slate-900 dark:border-zinc-100 bg-slate-100 dark:bg-zinc-800'
                  : 'border-slate-300 dark:border-zinc-700 hover:border-slate-500 dark:hover:border-zinc-500'
              "
              :title="variant.inStock ? variant.name : `${variant.name} (out of stock)`"
              @click="selectedVariantId = variant.id"
            >
              <span
                :style="{ backgroundColor: variant.colors[0] || '#d6d3d1' }"
                class="h-4 w-4 rounded-full border border-slate-400 dark:border-zinc-500"
              />
              <span :class="variant.inStock ? '' : 'line-through opacity-60'">
                {{ variant.name }}
              </span>
              <span
                v-if="inCartForColor(variant.name) > 0"
                class="min-w-5 h-5 px-1 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center"
                :title="`${inCartForColor(variant.name)} in your cart`"
              >
                {{ inCartForColor(variant.name) }}
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
              class="min-w-11 inline-flex items-center justify-center gap-1.5 rounded-md border-2 px-3 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed"
              :class="
                size === selectedSize
                  ? 'border-slate-900 dark:border-zinc-100 bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : isSizeAvailable(size)
                    ? 'border-slate-300 dark:border-zinc-700 hover:border-slate-500 dark:hover:border-zinc-500'
                    : 'border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-600 line-through'
              "
              :title="
                isSizeAvailable(size)
                  ? `${selectedVariant?.name ?? ''} · ${size}`
                  : `${size} is sold out in this colour`
              "
              @click="selectedSize = size"
            >
              {{ size }}
              <span
                v-if="inCartForSize(size) > 0"
                class="min-w-5 h-5 px-1 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center"
                :title="`${inCartForSize(size)} in your cart`"
              >
                {{ inCartForSize(size) }}
              </span>
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <div
            class="flex items-center rounded-md border-2 border-slate-900 dark:border-zinc-100"
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
            class="flex-1 font-bold border-2 border-slate-950 dark:border-zinc-50 rounded-md"
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

        <p
          v-if="inCartForSelectedOption > 0"
          class="flex flex-wrap items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400"
        >
          <UIcon name="i-heroicons-check-circle" class="w-4 h-4 shrink-0" />
          <span>
            {{ inCartForSelectedOption }} × this variant already in your cart.
          </span>
          <span class="text-slate-500 dark:text-zinc-400">
            Pick another colour or size to add it as a separate line.
          </span>
          <NuxtLink
            to="/cart"
            class="font-bold underline underline-offset-4 decoration-wavy hover:text-emerald-800 dark:hover:text-emerald-300"
          >
            View cart
          </NuxtLink>
        </p>

        <div class="space-y-2 border-t-2 border-dashed border-slate-300 dark:border-zinc-700 pt-4 text-sm text-slate-500 dark:text-zinc-400">
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

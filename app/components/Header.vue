<script setup lang="ts">
const { itemCount, ensureLoaded } = useCart();

onMounted(() => {
  ensureLoaded().catch(() => {
    // The header badge is decorative; a failed fetch must not break the page.
  });
});
</script>

<template>
  <header
    class="relative z-10 border-b-2 border-dashed border-stone-400 dark:border-zinc-700 bg-stone-50/80 dark:bg-zinc-900/80 backdrop-blur"
  >
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <!-- Logo resembling a quick sketch logo -->
      <NuxtLink
        to="/"
        class="text-2xl font-bold tracking-tight hover:scale-105 transition-transform duration-150 inline-block"
      >
        <span
          class="border-2 border-stone-950 dark:border-zinc-50 px-2 py-0.5 rounded-sm rotate-[-2deg] inline-block bg-yellow-100 dark:bg-transparent text-stone-950 dark:text-zinc-50"
        >
          doodles.on.a.T
        </span>
      </NuxtLink>

      <nav class="flex items-center gap-6">
        <NuxtLink
          to="/explore"
          class="hover:underline underline-offset-4 decoration-wavy"
          >Explore</NuxtLink
        >
        <NuxtLink
          to="/track"
          class="hover:underline underline-offset-4 decoration-wavy"
          >Track</NuxtLink
        >
        <NuxtLink
          to="/account"
          class="hover:underline underline-offset-4 decoration-wavy"
          >Account</NuxtLink
        >
        <NuxtLink to="/cart" class="relative group">
          <span class="hover:underline underline-offset-4 decoration-wavy"
            >Cart</span
          >
          <span
            v-if="itemCount > 0"
            class="absolute -top-2 -right-3 bg-red-400 text-white dark:text-zinc-950 text-xs font-bold px-1.5 py-0.5 rounded-full rotate-[12deg]"
          >
            {{ itemCount > 99 ? "99+" : itemCount }}
          </span>
        </NuxtLink>
        <UButton
          color="primary"
          variant="ghost"
          icon="i-heroicons-sun-20-solid"
          dark-icon="i-heroicons-moon-20-solid"
          @click="
            $colorMode.preference =
              $colorMode.value === 'dark' ? 'light' : 'dark'
          "
        />
      </nav>
    </div>
  </header>
</template>

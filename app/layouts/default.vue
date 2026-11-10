<script setup lang="ts">
import BackgroundDoodles from "~/components/BackgroundDoodles.vue";
import Footer from "~/components/Footer.vue";
import Header from "~/components/Header.vue";
import cat1svg from "~/assets/images/cat-1.svg?raw";
import cat2svg from "~/assets/images/cat-2.svg?raw";
import cat3svg from "~/assets/images/cat-3.svg?raw";
import cat4svg from "~/assets/images/cat-4.svg?raw";
const myDoodlePool = [cat1svg];
</script>

<template>
  <div
    class="min-h-screen bg-stone-50 dark:bg-zinc-900 text-stone-900 dark:text-zinc-50 font-sans selection:bg-yellow-200 dark:selection:bg-yellow-900/50"
  >
    <div
      class="absolute inset-0 opacity-20 dark:opacity-10 pointer-events-none bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px]"
    />
    <Header />

    <BackgroundDoodles />

    <main class="relative z-10 max-w-6xl mx-auto px-4 py-8">
      <slot />
    </main>
    <Footer />
  </div>
</template>

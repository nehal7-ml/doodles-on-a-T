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
    class="site-canvas min-h-screen text-stone-900 dark:text-zinc-50 font-sans selection:bg-yellow-200 dark:selection:bg-yellow-900/50"
  >
    <!-- Backgrounds (paper in light, chalkboard in dark) are painted on this
         canvas via assets/css/main.css. -->
    <Header />

    <BackgroundDoodles />

    <main class="relative z-10 max-w-6xl mx-auto px-4 py-8">
      <slot />
    </main>
    <Footer />
  </div>
</template>

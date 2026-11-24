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
    class="site-canvas flex min-h-screen flex-col text-slate-900 dark:text-zinc-50 font-sans selection:bg-coral-200 dark:selection:bg-coral-900/50"
  >
    <!-- Backgrounds (paper in light, chalkboard in dark) are painted on this
         canvas via assets/css/main.css.

         The canvas is a flex column and <main> grows, so the footer is always
         the last thing on screen: spare height becomes empty space above the
         footer, never below it. -->
    <Header />

    <BackgroundDoodles />

    <main class="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <slot />
    </main>
    <Footer />
  </div>
</template>

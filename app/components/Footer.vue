<template>
  <!-- Playful Notebook Footer -->
  <footer
    class="relative z-10 border-t-2 border-dashed border-stone-400 dark:border-zinc-700 mt-20 bg-stone-50/50 dark:bg-zinc-900/50"
  >
    <div class="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-4 gap-8">
      <!-- Column 1: Brand Sketch -->
      <div class="space-y-4 md:col-span-1">
        <div
          class="inline-block border border-stone-950 dark:border-zinc-50 px-2 py-0.5 font-bold rounded rotate-[-1deg] bg-white dark:bg-zinc-950 text-sm"
        >
          doodle.wear
        </div>
        <p
          class="text-xs text-stone-500 dark:text-zinc-400 font-medium leading-relaxed"
        >
          All doodles are imperfectly hand-drawn with real pencils on real
          paper, then scanned in for your wearing pleasure.
        </p>
      </div>

      <!-- Column 2: Browse Links -->
      <div class="space-y-3">
        <h4
          class="font-bold text-sm tracking-wide uppercase text-stone-400 dark:text-zinc-500"
        >
          Catalog
        </h4>
        <ul class="space-y-2 text-sm font-medium">
          <li>
            <NuxtLink
              to="/explore"
              class="hover:underline underline-offset-4 decoration-dotted"
              >All T-Shirts</NuxtLink
            >
          </li>
          <li>
            <NuxtLink
              to="/explore?tag=new"
              class="hover:underline underline-offset-4 decoration-dotted"
              >New Drops</NuxtLink
            >
          </li>
          <li>
            <NuxtLink
              to="/explore?tag=featured"
              class="hover:underline underline-offset-4 decoration-dotted"
              >Staff Picks</NuxtLink
            >
          </li>
        </ul>
      </div>

      <!-- Column 3: Help Desk -->
      <div class="space-y-3">
        <h4
          class="font-bold text-sm tracking-wide uppercase text-stone-400 dark:text-zinc-500"
        >
          Support
        </h4>
        <ul class="space-y-2 text-sm font-medium">
          <li>
            <a
              href="#"
              class="hover:underline underline-offset-4 decoration-dotted"
              >Shipping & Returns</a
            >
          </li>
          <li>
            <a
              href="#"
              class="hover:underline underline-offset-4 decoration-dotted"
              >Printful Tracking</a
            >
          </li>
          <li>
            <a
              href="#"
              class="hover:underline underline-offset-4 decoration-dotted"
              >Size Guide</a
            >
          </li>
        </ul>
      </div>

      <!-- Column 4: Newsletter Box (The Sticky Note) -->
      <div
        class="bg-yellow-100 dark:bg-zinc-950 border-2 border-stone-950 dark:border-zinc-400 p-4 rounded shadow-[3px_3px_0px_0px_rgba(28,25,23,1)] dark:shadow-[3px_3px_0px_0px_rgba(250,250,250,0.2)] rotate-[1deg] space-y-3"
      >
        <h4
          class="font-bold text-sm text-stone-950 dark:text-zinc-50 flex items-center gap-1"
        >
          <span>Don't miss a drop!</span> 📬
        </h4>
        <p class="text-xs text-stone-700 dark:text-zinc-400">
          Get a notification when new sketches are loaded up.
        </p>
        <div class="flex gap-1">
          <input
            type="email"
            placeholder="your.email@email.com"
            class="w-full text-xs px-2 py-1.5 border border-stone-900 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-yellow-500"
          />
          <button
            class="bg-stone-950 text-white dark:bg-zinc-50 dark:text-zinc-950 text-xs px-2.5 font-bold rounded hover:opacity-90 active:translate-y-0.5 transition-transform"
          >
            Join
          </button>
        </div>
      </div>
    </div>

    <!-- Copyright & Bottom Line -->
    <div
      class="max-w-6xl mx-auto px-4 pb-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-stone-400 dark:text-zinc-500"
    >
      <div>© 2026 doodle.wear. Built with Nuxt & Printful.</div>
      <div class="italic">Handle with creative care.</div>
    </div>
  </footer>
</template>

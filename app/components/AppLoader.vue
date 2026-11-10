<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
    size?: "sm" | "md" | "lg";
    fullscreen?: boolean;
  }>(),
  {
    label: "Sharpening pencils…",
    size: "md",
    fullscreen: false,
  },
);

const iconSizes = {
  sm: "h-5 w-5",
  md: "h-8 w-8",
  lg: "h-12 w-12",
};

const ringSizes = {
  sm: "h-10 w-10",
  md: "h-16 w-16",
  lg: "h-24 w-24",
};
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-4"
    :class="
      fullscreen
        ? 'fixed inset-0 z-50 bg-stone-50/90 dark:bg-zinc-900/90 backdrop-blur-sm'
        : 'py-16'
    "
    role="status"
    aria-live="polite"
  >
    <div class="relative" :class="ringSizes[size]">
      <span
        class="absolute inset-0 rounded-full border-2 border-dashed border-stone-400 dark:border-zinc-600 animate-spin"
      />
      <span class="absolute inset-0 flex items-center justify-center">
        <UIcon
          name="i-heroicons-pencil-square"
          class="text-stone-700 dark:text-zinc-200 animate-pulse"
          :class="iconSizes[size]"
        />
      </span>
    </div>

    <p
      v-if="label"
      class="font-mono text-sm text-stone-500 dark:text-zinc-400 rotate-[-1deg]"
    >
      {{ label }}
    </p>
  </div>
</template>

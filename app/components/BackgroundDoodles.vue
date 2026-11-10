<template>
  <div
    class="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none"
  >
    <div
      v-for="doodle in activeDoodles"
      :key="doodle.id"
      class="absolute transition-opacity duration-500 raw-doodle-container"
      :style="{
        left: `${doodle.x}%`,
        top: `${doodle.y}%`,
        transform: `rotate(${doodle.rotation}deg) scale(${doodle.scale})`,
      }"
    >
      <div
        class="doodle-svg-wrapper text-stone-800/15 dark:text-zinc-200/15"
        v-html="doodle.svgContent"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
const props = withDefaults(
  defineProps<{
    svgPool?: string[];
  }>(),
  {
    svgPool: () => [
      `<svg viewBox="0 0 100 100" class="w-20 h-20"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M 20,60 C 15,40 25,25 35,30 C 45,20 55,20 65,30 C 75,25 85,40 80,60 C 20,80 80,80 80,60 M 38,48 Q 42,45 44,48 M 56,48 Q 58,45 62,48 M 48,54 Q 50,57 52,54" /></svg>`,
      `<svg viewBox="0 0 50 50" class="w-12 h-12"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M 25,5 L 30,18 L 45,25 L 30,32 L 25,45 L 20,32 L 5,25 L 20,18 Z" /></svg>`,
    ],
  },
);

interface ActiveDoodle {
  id: number;
  svgContent: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

const activeDoodles = ref<ActiveDoodle[]>([]);
let spawnTimer: ReturnType<typeof setTimeout> | null = null;
let doodleIdCounter = 0;

const spawnDoodle = () => {
  if (!props.svgPool || props.svgPool.length === 0) return;

  const randomSvg =
    props.svgPool[Math.floor(Math.random() * props.svgPool.length)];
  const spawnOnLeftMargin = Math.random() < 0.5;
  let horizontalPosition = 0;

  if (spawnOnLeftMargin) {
    horizontalPosition = Math.floor(Math.random() * 12) + 1; // Left Margin Space
  } else {
    horizontalPosition = Math.floor(Math.random() * 10) + 85; // Right Margin Space
  }

  const newDoodle: ActiveDoodle = {
    id: doodleIdCounter++,
    svgContent: randomSvg as string,
    x: horizontalPosition,
    y: Math.floor(Math.random() * 65) + 15,
    rotation: Math.floor(Math.random() * 40) - 20,
    scale: parseFloat((Math.random() * 0.3 + 0.7).toFixed(2)),
  };

  activeDoodles.value.push(newDoodle);

  // Despawn element nodes safely after 7.5 seconds
  setTimeout(() => {
    activeDoodles.value = activeDoodles.value.filter(
      (d) => d.id !== newDoodle.id,
    );
  }, 7500);

  const nextSpawnDelay = Math.floor(Math.random() * 3000) + 2500;
  spawnTimer = setTimeout(spawnDoodle, nextSpawnDelay);
};

onMounted(() => {
  spawnDoodle();
});

onUnmounted(() => {
  if (spawnTimer) clearTimeout(spawnTimer);
});
</script>
<style scoped>
/* 1. Bounding box constraints */
.doodle-svg-wrapper {
  width: 6rem;
  height: 6rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.doodle-svg-wrapper :deep(svg) {
  width: 100% !important;
  height: 100% !important;
}

/* 2. Pure Path-Drawing Engine 
   This intercepts every single path and animates its stroke line from start to finish.
*/
.doodle-svg-wrapper :deep(path),
.doodle-svg-wrapper :deep(polyline),
.doodle-svg-wrapper :deep(line),
.doodle-svg-wrapper :deep(polygon) {
  /* Ensure the lines are hollow and use the theme's text color */
  fill: none !important;
  stroke: currentColor !important;
  stroke-width: 1.5px !important;
  stroke-linecap: round;
  stroke-linejoin: round;

  /* The Line Animation Setup */
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: drawLineSequence 6.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes drawLineSequence {
  0% {
    stroke-dashoffset: 1000;
    opacity: 0;
  }
  5% {
    opacity: 1; /* Turn on visibility right as sketching begins */
  }
  40% {
    stroke-dashoffset: 0; /* Vector line is completely drawn */
    opacity: 1;
  }
  85% {
    stroke-dashoffset: 0;
    opacity: 1; /* Linger on screen */
  }
  100% {
    stroke-dashoffset: 0;
    opacity: 0; /* Smoothly fade away before unmounting */
  }
}
</style>

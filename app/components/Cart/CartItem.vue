<script setup lang="ts">
import type { CartItem } from "~/types";
const props = defineProps<{ item: CartItem }>();
</script>

<template>
  <div class="flex items-center gap-2 p-4">
    <img
      :src="props.item.image"
      alt="item.name"
      class="w-16 h-16 rounded-full"
    />
    <h3>{{ props.item.name }}</h3>
    <p>{{ props.item.price }} $</p>
    <p>x{{ props.item.quantity }}</p>
  </div>
</template>

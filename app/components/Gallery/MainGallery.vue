<script setup lang="ts">
import type { Product } from "~/types";
import ProductCard from "./ProductCard.vue";

defineProps<{ products: Product[] }>();
</script>
<template>
  <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
    <ProductCard
      v-for="product in products"
      :key="product.id"
      :product="product"
    />
  </div>
</template>

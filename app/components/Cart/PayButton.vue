<script setup lang="ts">
defineProps<{
  orderNumber: string;
}>();
</script>
<template>
  <div class="w-full">
    <form action="/checkout" method="POST" class="flex justify-center">
      <input hidden :value="orderNumber" />
      <button class="bg-blue-600 text-white p-2 rounded-full px-4 mx-auto">
        Confirm Order
      </button>
    </form>
  </div>
</template>

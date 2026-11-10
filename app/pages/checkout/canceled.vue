<script setup lang="ts">
const route = useRoute();
const orderNumber = computed(() =>
  typeof route.query.order === "string" ? route.query.order : null,
);

useHead({ title: "Payment canceled" });
</script>

<template>
  <div class="max-w-xl mx-auto my-12 text-center space-y-5">
    <UIcon
      name="i-heroicons-x-circle"
      class="w-16 h-16 mx-auto text-yellow-600 dark:text-yellow-400"
    />

    <h1 class="text-3xl font-bold">Payment canceled</h1>

    <p class="text-lg">
      <template v-if="orderNumber">
        Order <strong>{{ orderNumber }}</strong> is saved as unpaid.
      </template>
      <template v-else> Your order is saved as unpaid. </template>
    </p>

    <p class="text-stone-500 dark:text-zinc-400">
      No money was taken. If you still want these items, add them to your cart
      again and restart checkout.
    </p>

    <div class="flex flex-wrap justify-center gap-3 pt-2">
      <UButton to="/explore" color="primary">Back to the shop</UButton>
      <UButton to="/cart" color="neutral" variant="outline">View cart</UButton>
      <UButton to="/track" color="neutral" variant="ghost">
        Track an order
      </UButton>
    </div>
  </div>
</template>

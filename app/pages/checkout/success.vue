<script setup lang="ts">
const route = useRoute();
const orderNumber = computed(() =>
  typeof route.query.order === "string" ? route.query.order : null,
);

useHead({ title: "Order received" });
</script>

<template>
  <div class="max-w-xl mx-auto my-12 text-center space-y-5">
    <UIcon
      name="i-heroicons-check-circle"
      class="w-16 h-16 mx-auto text-green-600 dark:text-green-400"
    />

    <h1 class="text-4xl font-bold">Thank you!</h1>

    <p class="text-lg">
      <template v-if="orderNumber">
        We received order <strong>{{ orderNumber }}</strong
        >.
      </template>
      <template v-else> We received your order. </template>
    </p>

    <p class="text-stone-500 dark:text-zinc-400">
      We will email you as soon as the payment is confirmed. You can close this
      page.
    </p>

    <div class="flex flex-wrap justify-center gap-3 pt-2">
      <UButton to="/explore" color="primary">Keep exploring</UButton>
      <UButton to="/account" color="neutral" variant="outline">
        Your account
      </UButton>
      <UButton to="/track" color="neutral" variant="ghost">
        Track an order
      </UButton>
    </div>

    <p class="text-xs text-stone-500 dark:text-zinc-400">
      If you do not receive a confirmation email, contact support with the order
      number above.
    </p>
  </div>
</template>

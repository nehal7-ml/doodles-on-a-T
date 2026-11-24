<script setup lang="ts">
import OrderDetails from "~/components/Order/Details.vue";
import type { Order } from "~/types";

const route = useRoute();
const orderId = computed(() => String(route.params.id));

const order = ref<Order | null>(null);
const pending = ref(false);
const errorMessage = ref("");

onMounted(async () => {
  errorMessage.value = "";
  pending.value = true;
  try {
    order.value = await $fetch<Order>(`/api/orders/${orderId.value}`, {
      headers: { accept: "application/json" },
    });
  } catch {
    errorMessage.value = "We couldn't find that order. It may have been filed elsewhere.";
  } finally {
    pending.value = false;
  }
});

useHead({ title: "Order details · doodles.on.a.T" });
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <header class="space-y-3">
      <NuxtLink
        to="/account"
        class="inline-flex items-center gap-1.5 text-sm font-bold hover:underline underline-offset-4 decoration-dotted"
      >
        <UIcon name="i-heroicons-arrow-left" class="h-4 w-4" />
        Back to your sketchbook
      </NuxtLink>
      <h1 class="text-4xl font-black tracking-tight">Order filed</h1>
      <p class="font-medium text-stone-600 dark:text-zinc-400">
        Every doodle from this order, filed flat.
      </p>
    </header>

    <div
      v-if="pending"
      class="rounded-lg border-2 border-dashed border-slate-400 p-10 text-center font-bold dark:border-zinc-700"
    >
      Firing up the filing cabinet…
    </div>

    <div
      v-else-if="errorMessage"
      class="rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-medium text-red-800 dark:border-red-400 dark:bg-red-950/40 dark:text-red-200"
    >
      {{ errorMessage }}
    </div>

    <OrderDetails v-else-if="order" :order="order" />
  </div>
</template>

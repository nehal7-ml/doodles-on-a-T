<script setup lang="ts">
import CartTable from "~/components/Cart/CartTable.vue";
import OrderSummary from "~/components/Cart/OrderSummary.vue";
import type { CartViewItem } from "~/types";

const { cart, pending, loaded, refresh, updateItem, removeItem } = useCart();
const toast = useToast();

onMounted(async () => {
  await refresh().catch(() => {
    toast.add({
      title: "Could not load your cart",
      color: "error",
      icon: "i-heroicons-exclamation-triangle",
    });
  });
});

async function changeQuantity(item: CartViewItem, quantity: number) {
  try {
    await updateItem(item.id, quantity);
  } catch (error) {
    toast.add({
      title: authErrorMessage(error),
      color: "error",
      icon: "i-heroicons-exclamation-triangle",
    });
  }
}

async function removeItemFromCart(item: CartViewItem) {
  try {
    await removeItem(item.id);
    toast.add({
      title: "Removed from cart",
      description: item.productName,
      icon: "i-heroicons-check-circle",
      color: "primary",
    });
  } catch (error) {
    toast.add({
      title: authErrorMessage(error),
      color: "error",
      icon: "i-heroicons-exclamation-triangle",
    });
  }
}

useHead({ title: "Shopping Cart" });
</script>

<template>
  <div class="my-5 h-20">
    <h1 class="text-5xl font-bold text-center">Shopping Cart</h1>
  </div>

  <AppLoader v-if="!loaded" label="Unpacking the cart…" />

  <div
    v-else-if="cart.items.length === 0"
    class="border-2 border-dashed border-stone-300 dark:border-zinc-700 rounded-lg p-12 text-center space-y-4"
  >
    <UIcon
      name="i-heroicons-shopping-bag"
      class="w-14 h-14 mx-auto text-stone-400 dark:text-zinc-500"
    />
    <p class="text-xl font-bold">Your cart is empty</p>
    <p class="text-stone-500 dark:text-zinc-400">
      Nothing sketched in yet. Go pick something nice.
    </p>
    <UButton to="/explore" color="primary">Explore the sketchbook</UButton>
  </div>

  <div v-else class="flex flex-col md:flex-row gap-4 items-start">
    <CartTable
      :items="cart.items"
      :pending="pending"
      @update="changeQuantity"
      @remove="removeItemFromCart"
    />

    <OrderSummary
      :subtotal-cents="cart.totals.subtotalCents"
      :item-count="cart.itemCount"
      :currency="cart.currency"
      :has-unavailable="cart.hasUnavailable"
    >
      <UButton
        to="/checkout"
        color="primary"
        size="lg"
        class="w-full justify-center font-bold border-2 border-stone-950 dark:border-zinc-50 rounded-md"
        :disabled="cart.hasUnavailable"
      >
        Checkout
      </UButton>
    </OrderSummary>
  </div>
</template>

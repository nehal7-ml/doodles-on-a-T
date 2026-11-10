<script setup lang="ts">
import type { Order } from "~/types";

const orderNumber = ref("");
const email = ref("");
const order = ref<Order | null>(null);
const pending = ref(false);
const errorMessage = ref("");

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-300",
  draft: "bg-stone-100 text-stone-700 border-stone-500 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-500",
  inprocess: "bg-sky-100 text-sky-800 border-sky-700 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-300",
  partial: "bg-sky-100 text-sky-800 border-sky-700 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-300",
  shipped: "bg-emerald-100 text-emerald-800 border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-300",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-300",
  canceled: "bg-red-100 text-red-800 border-red-700 dark:bg-red-950 dark:text-red-200 dark:border-red-300",
  failed: "bg-red-100 text-red-800 border-red-700 dark:bg-red-950 dark:text-red-200 dark:border-red-300",
};

function formatMoney(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

async function trackOrder() {
  errorMessage.value = "";
  order.value = null;
  pending.value = true;

  try {
    order.value = await $fetch<Order>("/api/orders/track", {
      method: "POST",
      body: {
        orderNumber: orderNumber.value.trim(),
        email: email.value.trim(),
      },
    });
  } catch (error) {
    const fetchError = error as {
      data?: { statusMessage?: string; message?: string };
      statusMessage?: string;
    };
    errorMessage.value =
      fetchError.data?.statusMessage ??
      fetchError.data?.message ??
      fetchError.statusMessage ??
      "We couldn't find that order. Check the number and email and try again.";
  } finally {
    pending.value = false;
  }
}

useHead({ title: "Track your order · doodles.on.a.T" });
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-8">
    <header class="space-y-3">
      <span
        class="inline-block bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-200 border-2 border-sky-700 dark:border-sky-300 px-3 py-1 rounded-full text-sm font-bold rotate-[-1deg]"
      >
        Where is my doodle?
      </span>
      <h1 class="text-4xl md:text-5xl font-black tracking-tight">
        Track your order
      </h1>
      <p class="text-stone-600 dark:text-zinc-400 font-medium">
        Enter the order number from your confirmation email and the email
        address you used at checkout.
      </p>
    </header>

    <form
      class="border-2 border-stone-900 dark:border-zinc-100 rounded-lg bg-white dark:bg-zinc-950 p-6 space-y-4"
      @submit.prevent="trackOrder"
    >
      <div class="grid sm:grid-cols-2 gap-4">
        <UInput
          v-model="orderNumber"
          label="Order number"
          placeholder="DOT-XXXXXXXX-XXXX"
          icon="i-heroicons-receipt-percent"
          size="lg"
          autocomplete="off"
          required
        />
        <UInput
          v-model="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          icon="i-heroicons-envelope"
          size="lg"
          autocomplete="email"
          required
        />
      </div>

      <UButton
        type="submit"
        color="primary"
        size="lg"
        icon="i-heroicons-magnifying-glass"
        :loading="pending"
        class="font-bold border-2 border-stone-950 dark:border-zinc-50 rounded-md"
      >
        Find my order
      </UButton>
    </form>

    <div
      v-if="errorMessage"
      class="border-2 border-red-700 dark:border-red-400 rounded-lg bg-red-50 dark:bg-red-950/40 p-4 text-red-800 dark:text-red-200 font-medium"
    >
      {{ errorMessage }}
    </div>

    <section
      v-if="order"
      class="border-2 border-stone-900 dark:border-zinc-100 rounded-lg bg-white dark:bg-zinc-950 p-6 space-y-6"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="font-mono text-xs text-stone-500 dark:text-zinc-400">
            {{ order.orderNumber }}
          </p>
          <h2 class="text-2xl font-black">
            {{ order.statusLabel }}
          </h2>
          <p class="text-sm text-stone-500 dark:text-zinc-400">
            Placed {{ formatDate(order.createdAt) }}
          </p>
        </div>
        <span
          class="border-2 rounded-full px-3 py-1 text-sm font-bold"
          :class="statusColors[order.status] ?? statusColors.draft"
        >
          {{ order.statusLabel }}
        </span>
      </div>

      <div
        v-if="order.tracking.number || order.tracking.url"
        class="border-2 border-dashed border-emerald-700 dark:border-emerald-400 rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-1"
      >
        <p class="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-100">
          <UIcon name="i-heroicons-truck" class="w-5 h-5" />
          On its way
        </p>
        <p v-if="order.tracking.carrier" class="text-sm">
          Carrier: {{ order.tracking.carrier }}
        </p>
        <p v-if="order.tracking.number" class="font-mono text-sm">
          {{ order.tracking.number }}
        </p>
        <p v-if="order.tracking.shippedAt" class="text-sm">
          Shipped {{ formatDate(order.tracking.shippedAt) }}
        </p>
        <p v-if="order.tracking.deliveredAt" class="text-sm">
          Delivered {{ formatDate(order.tracking.deliveredAt) }}
        </p>
        <UButton
          v-if="order.tracking.url"
          :to="order.tracking.url"
          target="_blank"
          rel="noopener noreferrer"
          color="primary"
          variant="outline"
          size="sm"
          icon="i-heroicons-arrow-top-right-on-square"
          class="mt-2"
        >
          Track with carrier
        </UButton>
      </div>

      <div
        v-if="order.failureReason"
        class="border-2 border-red-700 dark:border-red-400 rounded-md bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-800 dark:text-red-200"
      >
        {{ order.failureReason }}
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-bold uppercase tracking-wide">Items</h3>
        <ul class="divide-y-2 divide-dashed divide-stone-200 dark:divide-zinc-800">
          <li
            v-for="item in order.items"
            :key="item.id"
            class="py-3 flex items-start justify-between gap-4"
          >
            <div>
              <p class="font-bold">{{ item.name }}</p>
              <p class="text-sm text-stone-500 dark:text-zinc-400">
                <span v-if="item.color">{{ item.color }}</span>
                <span v-if="item.color && item.size"> · </span>
                <span v-if="item.size">Size {{ item.size }}</span>
                <span v-if="!item.color && !item.size">Qty {{ item.quantity }}</span>
                <span v-if="item.color || item.size"> · Qty {{ item.quantity }}</span>
              </p>
            </div>
            <p class="font-mono text-sm">
              {{ formatMoney(item.price * item.quantity, item.currency) }}
            </p>
          </li>
        </ul>
      </div>

      <div class="border-t-2 border-stone-200 dark:border-zinc-800 pt-4 space-y-1 text-sm">
        <p class="flex justify-between">
          <span>Subtotal</span>
          <span class="font-mono">{{ formatMoney(order.totals.subtotal, order.totals.currency) }}</span>
        </p>
        <p v-if="order.totals.discount" class="flex justify-between">
          <span>Discount</span>
          <span class="font-mono">-{{ formatMoney(order.totals.discount, order.totals.currency) }}</span>
        </p>
        <p class="flex justify-between">
          <span>Shipping</span>
          <span class="font-mono">{{ formatMoney(order.totals.shipping, order.totals.currency) }}</span>
        </p>
        <p v-if="order.totals.tax" class="flex justify-between">
          <span>Tax</span>
          <span class="font-mono">{{ formatMoney(order.totals.tax, order.totals.currency) }}</span>
        </p>
        <p class="flex justify-between text-base font-black pt-2">
          <span>Total</span>
          <span class="font-mono">{{ formatMoney(order.totals.total, order.totals.currency) }}</span>
        </p>
      </div>

      <div v-if="order.events.length" class="space-y-3">
        <h3 class="text-sm font-bold uppercase tracking-wide">History</h3>
        <ol class="space-y-3">
          <li
            v-for="event in order.events"
            :key="event.id"
            class="flex gap-3 text-sm"
          >
            <span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-stone-900 dark:bg-zinc-100" />
            <div>
              <p class="font-bold">{{ event.message }}</p>
              <p class="text-stone-500 dark:text-zinc-400">
                {{ formatDate(event.createdAt) }}
              </p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  </div>
</template>

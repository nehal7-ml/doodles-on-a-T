<script setup lang="ts">
import { header } from "#build/ui";
import { MoveRight, ShoppingCartIcon } from "@lucide/vue";
import type { TableColumn } from "@nuxt/ui";
import type { CartItem } from "~/types";
defineProps<{
  items?: CartItem[];
}>();

const columns: TableColumn<CartItem>[] = [
  {
    header: "Name",
    accessorKey: "name",
    cell: ({ row }) => row.original.name,
  },
  {
    header: "Price",
    accessorKey: "price",
    cell: ({ row }) => `${row.original.price} $`,
  },
  {
    header: "Quantity",
    accessorKey: "quantity",
    cell: ({ row }) => row.original.quantity,
  },
];
</script>

<template>
  <UPopover>
    <UButton variant="outline" class="cursor-pointer p-4">
      <ShoppingCartIcon />
    </UButton>

    <template #content>
      <div
        class="flex flex-col justify-center items-center gap-2 min-w-48 min-h-48 p-2 bg-stone-950 rounded-md"
      >
        <div v-if="!items" class="self-center">
          <p class="text-center text-xl">Your cart is empty</p>
        </div>

        <UTable :data="items" :columns="columns">
          <template #name-cell="{ row }">
            <div class="flex items-center gap-3">
              <UAvatar
                :src="row.original.image"
                size="lg"
                loading="lazy"
                :alt="`${row.original.name}`"
              />
              <div>
                <p class="font-medium text-highlighted">
                  {{ row.original.name }}
                </p>
              </div>
            </div>
          </template>
        </UTable>
        <NuxtLink to="/cart" class="text-blue-600 underline flex gap-2">
          View Cart
          <MoveRight />
        </NuxtLink>
      </div>
    </template>
  </UPopover>
</template>

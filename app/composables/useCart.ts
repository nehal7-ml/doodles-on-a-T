import type { CartView } from "~/types";

function emptyCart(): CartView {
  return {
    id: null,
    status: "active",
    currency: "USD",
    items: [],
    itemCount: 0,
    hasUnavailable: false,
    totals: { subtotalCents: 0, itemCount: 0 },
    expiresAt: null,
  };
}

export function useCart() {
  const cart = useState<CartView>("cart:view", emptyCart);
  const pending = useState<boolean>("cart:pending", () => false);
  const loaded = useState<boolean>("cart:loaded", () => false);

  const itemCount = computed(() => cart.value.itemCount);
  const subtotalCents = computed(() => cart.value.totals.subtotalCents);
  const isEmpty = computed(() => cart.value.items.length === 0);

  async function refresh(): Promise<CartView> {
    try {
      cart.value = await $fetch<CartView>("/api/cart", {
        headers: { accept: "application/json" },
      });
    } finally {
      loaded.value = true;
    }
    return cart.value;
  }

  async function ensureLoaded(): Promise<void> {
    if (!loaded.value) await refresh();
  }

  async function mutate(
    request: () => Promise<CartView>,
  ): Promise<CartView> {
    pending.value = true;
    try {
      cart.value = await request();
      loaded.value = true;
      return cart.value;
    } finally {
      pending.value = false;
    }
  }

  function addItem(variantId: string, quantity = 1): Promise<CartView> {
    return mutate(() =>
      $fetch<CartView>("/api/cart/items", {
        method: "POST",
        body: { variantId, quantity },
      }),
    );
  }

  function updateItem(itemId: string, quantity: number): Promise<CartView> {
    return mutate(() =>
      $fetch<CartView>(`/api/cart/items/${itemId}`, {
        method: "PATCH",
        body: { quantity },
      }),
    );
  }

  function removeItem(itemId: string): Promise<CartView> {
    return mutate(() =>
      $fetch<CartView>(`/api/cart/items/${itemId}`, { method: "DELETE" }),
    );
  }

  return {
    cart,
    pending,
    loaded,
    itemCount,
    subtotalCents,
    isEmpty,
    refresh,
    ensureLoaded,
    addItem,
    updateItem,
    removeItem,
  };
}

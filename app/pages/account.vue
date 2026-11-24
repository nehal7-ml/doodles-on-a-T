<script setup lang="ts">
import type { Order, Transaction } from "~/types";
import OrderRow from "~/components/Order/Row.vue";

type TabId = "orders" | "transactions" | "details" | "security";

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  {
    id: "orders",
    label: "Orders",
    icon: "i-heroicons-clipboard-document-list",
  },
  {
    id: "transactions",
    label: "Transactions",
    icon: "i-heroicons-credit-card",
  },
  { id: "details", label: "Your details", icon: "i-heroicons-user-circle" },
  { id: "security", label: "Sign-in & security", icon: "i-heroicons-key" },
];

const { user, loaded, refresh, logout, logoutEverywhere } = useAuth();

const activeTab = ref<TabId>("orders");
const pending = ref(false);

const orders = ref<Order[]>([]);
const ordersPending = ref(false);
const ordersError = ref("");

const transactions = ref<Transaction[]>([]);
const transactionsPending = ref(false);
const transactionsError = ref("");

const displayName = computed(
  () => user.value?.name?.trim() || "Unnamed doodler",
);

const initials = computed(() => {
  const source = user.value?.name?.trim() || user.value?.email || "?";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length > 1) {
    return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
});

const roleLabel = computed(() => {
  switch (user.value?.role) {
    case "admin":
      return "Administrator";
    case "staff":
      return "Staff";
    default:
      return "Customer";
  }
});

/** Short handle printed on the cover, like a student number. */
const memberId = computed(() => user.value?.id.slice(0, 10) ?? "");

const orderCount = computed(() => orders.value.length);

const currency = computed(
  () =>
    orders.value[0]?.totalsCents?.currency ??
    orders.value[0]?.totals?.currency ??
    "USD",
);

const lifetimeCents = computed(() =>
  orders.value.reduce(
    (sum, order) => sum + (order.totalsCents?.total ?? Math.round(order.totals.total * 100)),
    0,
  ),
);

function selectTab(id: TabId) {
  activeTab.value = id;
}

async function loadOrders() {
  ordersPending.value = true;
  ordersError.value = "";
  try {
    const response = await $fetch<{ orders: Order[]; total: number }>(
      "/api/orders",
      { headers: { accept: "application/json" } },
    );
    orders.value = response.orders;
  } catch {
    ordersError.value = "We couldn't fetch your orders. Please try again.";
  } finally {
    ordersPending.value = false;
  }
}

async function loadTransactions() {
  transactionsPending.value = true;
  transactionsError.value = "";
  try {
    const response = await $fetch<{ transactions: Transaction[] }>(
      "/api/account/transactions",
      { headers: { accept: "application/json" } },
    );
    transactions.value = response.transactions;
  } catch {
    transactionsError.value = "We couldn't fetch your transactions. Please try again.";
  } finally {
    transactionsPending.value = false;
  }
}

async function signOut() {
  pending.value = true;
  try {
    await logout();
    await navigateTo("/");
  } finally {
    pending.value = false;
  }
}

async function signOutEverywhere() {
  pending.value = true;
  try {
    await logoutEverywhere();
    await navigateTo("/login");
  } finally {
    pending.value = false;
  }
}

onMounted(async () => {
  await refresh();
  if (!user.value) {
    await navigateTo("/login?callbackUrl=/account");
    return;
  }
  await Promise.all([loadOrders(), loadTransactions()]);
});

useHead({ title: "Your account · doodles.on.a.T" });
</script>

<template>
  <div class="space-y-6">
    <header class="space-y-3">
      <span
        class="inline-block rotate-[-1deg] border-2 border-slate-900 bg-coral-100 px-3 py-1 text-sm font-bold dark:border-zinc-100 dark:bg-coral-950 dark:text-coral-100"
      >
        Sketchbook
      </span>
      <h1 class="text-4xl font-black tracking-tight md:text-5xl">
        Your account
      </h1>
      <p class="font-medium text-stone-600 dark:text-zinc-400">
        Every doodle you've ordered, filed and paid for — in one sketchbook.
      </p>
    </header>

    <AppLoader v-if="!loaded" label="Opening your sketchbook…" />

    <!-- A sketchbook held open: the front cover on the left, the ruled pages
         on the right, with the user's file tucked between them. -->
    <div
      v-else-if="user"
      class="sketchbook overflow-hidden rounded-2xl border-2 border-slate-900 bg-white shadow-[6px_6px_0_rgba(15,23,42,0.12)] dark:border-zinc-100 dark:bg-zinc-950 dark:shadow-[6px_6px_0_rgba(0,0,0,0.5)]"
    >
      <div class="grid md:grid-cols-[17.5rem_minmax(0,1fr)]">
        <!-- ----------------------------------------------------- cover -->
        <aside
          class="sketch-cover relative border-b-2 border-dashed border-slate-400 px-6 py-7 pl-14 md:border-b-0 md:border-r-2 md:pl-16 dark:border-zinc-700"
        >
          <!-- Punched binding holes down the margin -->
          <span
            aria-hidden="true"
            class="pointer-events-none absolute left-4 top-[14%] h-5 w-5 rounded-full border-2 border-slate-400 bg-white/70 shadow-inner dark:border-zinc-600 dark:bg-zinc-950/70"
          />
          <span
            aria-hidden="true"
            class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-slate-400 bg-white/70 shadow-inner dark:border-zinc-600 dark:bg-zinc-950/70"
          />
          <span
            aria-hidden="true"
            class="pointer-events-none absolute bottom-[14%] left-4 h-5 w-5 rounded-full border-2 border-slate-400 bg-white/70 shadow-inner dark:border-zinc-600 dark:bg-zinc-950/70"
          />
          <!-- Red margin rule, like exercise paper -->
          <span
            aria-hidden="true"
            class="pointer-events-none absolute inset-y-0 left-11 w-px bg-red-400/70 dark:bg-red-500/40"
          />

          <div class="relative z-10 space-y-5">
            <div class="flex items-start justify-between gap-3">
              <p
                class="pt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-600 dark:text-zinc-400"
              >
                Sketchbook
              </p>
              <span
                class="rotate-[-8deg] rounded border-2 border-red-500/70 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-red-600/80 dark:border-red-400/60 dark:text-red-400/80"
              >
                Open
              </span>
            </div>

            <div
              class="grid h-16 w-16 -rotate-3 place-items-center rounded-full border-2 border-slate-900 bg-coral-100 text-2xl font-black text-slate-900 dark:border-zinc-100 dark:bg-coral-950 dark:text-coral-100"
            >
              {{ initials }}
            </div>

            <div class="space-y-1">
              <p
                class="break-words text-2xl font-black leading-tight text-slate-900 dark:text-zinc-50"
              >
                {{ displayName }}
              </p>
              <p class="break-all text-sm text-stone-700 dark:text-zinc-400">
                {{ user.email }}
              </p>
            </div>

            <dl class="space-y-2 border-t-2 border-dashed border-slate-400 pt-4 text-sm dark:border-zinc-700">
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-stone-600 dark:text-zinc-400">Standing</dt>
                <dd class="font-bold text-slate-900 dark:text-zinc-100">
                  {{ roleLabel }}
                </dd>
              </div>
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-stone-600 dark:text-zinc-400">File no.</dt>
                <dd class="font-mono text-xs text-slate-900 dark:text-zinc-100">
                  {{ memberId }}
                </dd>
              </div>
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-stone-600 dark:text-zinc-400">Orders filed</dt>
                <dd class="font-mono text-xs text-slate-900 dark:text-zinc-100">
                  {{ orderCount }}
                </dd>
              </div>
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-stone-600 dark:text-zinc-400">Lifetime spend</dt>
                <dd class="font-mono text-xs text-slate-900 dark:text-zinc-100">
                  {{ formatPrice(lifetimeCents / 100, currency) }}
                </dd>
              </div>
            </dl>

            <div class="space-y-2 border-t-2 border-dashed border-slate-400 pt-4 dark:border-zinc-700">
              <UButton
                to="/track"
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-heroicons-magnifying-glass"
                block
              >
                Track an order
              </UButton>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-heroicons-arrow-right-on-rectangle"
                :loading="pending"
                block
                @click="signOut"
              >
                Sign out
              </UButton>
            </div>
          </div>
        </aside>

        <!-- -------------------------------------------------- pages -->
        <section
          class="sketch-lines flex min-h-[24rem] min-w-0 flex-1 flex-col px-4 py-5 md:px-6 md:py-6"
        >
          <!-- tab strip -->
          <div
            role="tablist"
            aria-label="Account sections"
            class="flex flex-wrap items-end gap-1 border-b-2 border-slate-900 px-3 pt-3 dark:border-zinc-100"
          >
            <button
              v-for="tab in TABS"
              :id="`tab-${tab.id}`"
              :key="tab.id"
              type="button"
              role="tab"
              :aria-selected="activeTab === tab.id"
              :aria-controls="`panel-${tab.id}`"
              class="flex items-center gap-1.5 rounded-t-md border-2 border-b-0 px-3 py-1.5 text-sm font-bold transition-colors"
              :class="
                activeTab === tab.id
                  ? '-mb-[2px] border-slate-900 bg-white text-slate-900 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-50'
                  : 'border-transparent bg-stone-200/60 text-stone-600 hover:text-slate-900 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-100'
              "
              @click="selectTab(tab.id)"
            >
              <UIcon :name="tab.icon" class="h-4 w-4" />
              {{ tab.label }}
            </button>
          </div>

          <!-- panels -->
          <div
            :id="`panel-${activeTab}`"
            role="tabpanel"
            :aria-labelledby="`tab-${activeTab}`"
            class="flex-1 px-1 pb-2 pt-5"
          >
            <!-- Orders -->
            <div v-if="activeTab === 'orders'" class="space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h2 class="text-xl font-black">Orders</h2>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-heroicons-arrow-path"
                  :loading="ordersPending"
                  @click="loadOrders"
                >
                  Refresh
                </UButton>
              </div>

              <p
                v-if="ordersPending && !orders.length"
                class="text-sm text-stone-600 dark:text-zinc-400"
              >
                Filing your orders…
              </p>

              <div
                v-else-if="ordersError"
                class="rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-medium text-red-800 dark:border-red-400 dark:bg-red-950/40 dark:text-red-200"
              >
                {{ ordersError }}
              </div>

              <div
                v-else-if="!orders.length"
                class="space-y-3 rounded-md border-2 border-dashed border-slate-400 p-6 text-center dark:border-zinc-700"
              >
                <UIcon
                  name="i-heroicons-pencil-square"
                  class="mx-auto h-10 w-10 text-stone-400 dark:text-zinc-500"
                />
                <p class="font-bold">No orders filed yet.</p>
                <p class="text-sm text-stone-600 dark:text-zinc-400">
                  When you order something it will be written up here.
                </p>
                <UButton to="/explore" color="primary" size="sm">
                  Start doodling
                </UButton>
              </div>

              <ul v-else class="space-y-0">
                <OrderRow
                  v-for="order in orders"
                  :key="order.id"
                  :order="order"
                />
              </ul>
            </div>

            <!-- Transactions -->
            <div v-else-if="activeTab === 'transactions'" class="space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h2 class="text-xl font-black">Transactions</h2>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-heroicons-arrow-path"
                  :loading="transactionsPending"
                  @click="loadTransactions"
                >
                  Refresh
                </UButton>
              </div>

              <p
                v-if="transactionsPending && !transactions.length"
                class="text-sm text-stone-600 dark:text-zinc-400"
              >
                Auditing your bank…
              </p>

              <div
                v-else-if="transactionsError"
                class="rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-medium text-red-800 dark:border-red-400 dark:bg-red-950/40 dark:text-red-200"
              >
                {{ transactionsError }}
              </div>

              <div
                v-else-if="!transactions.length"
                class="space-y-3 rounded-md border-2 border-dashed border-slate-400 p-6 text-center dark:border-zinc-700"
              >
                <UIcon
                  name="i-heroicons-credit-card"
                  class="mx-auto h-10 w-10 text-stone-400 dark:text-zinc-500"
                />
                <p class="font-bold">No transactions yet.</p>
                <p class="text-sm text-stone-600 dark:text-zinc-400">
                  Charges and refunds will be written down here.
                </p>
                <UButton to="/explore" color="primary" size="sm">
                  Start doodling
                </UButton>
              </div>

              <ul v-else class="space-y-3">
                <li
                  v-for="transaction in transactions"
                  :key="transaction.id"
                  class="rounded-md border-2 border-slate-900 bg-white p-4 dark:border-zinc-100 dark:bg-zinc-950"
                >
                  <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div class="min-w-0 space-y-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <NuxtLink
                          :to="`/account/orders/${transaction.orderId}`"
                          class="font-mono text-sm font-bold underline decoration-dotted underline-offset-4 hover:text-coral-700 dark:hover:text-coral-300"
                        >
                          {{ transaction.orderNumber ?? "Untitled order" }}
                        </NuxtLink>
                        <span
                          class="rounded-full border-2 px-2 py-0.5 text-xs font-bold"
                          :class="transactionStatusClass(transactionState(transaction))"
                        >
                          {{ transactionState(transaction).label }}
                        </span>
                      </div>

                      <p class="text-sm text-stone-600 dark:text-zinc-400">
                        {{ formatOrderDate(transaction.createdAt) }} ·
                        {{ transaction.provider }}
                        <template v-if="transaction.brand">
                          — {{ transaction.brand }} •••• {{ transaction.last4 }}
                        </template>
                      </p>

                      <p
                        v-if="transaction.refunds.length"
                        class="text-sm font-bold text-amber-700 dark:text-amber-300"
                      >
                        Refunded {{
                          formatPrice(
                            (transaction.refunds[0]?.amountCents ?? 0) / 100,
                            transaction.refunds[0]?.currency ?? transaction.currency,
                          )
                        }}
                      </p>
                    </div>

                    <div class="text-right">
                      <p class="font-mono font-bold">
                        {{ formatPrice(transaction.amountCents / 100, transaction.currency) }}
                      </p>
                      <a
                        v-if="transaction.receiptUrl"
                        :href="transaction.receiptUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-xs font-bold text-coral-700 hover:underline underline-offset-4 dark:text-coral-300"
                      >
                        Receipt
                      </a>
                    </div>
                  </div>
                </li>
              </ul>
            </div>

            <!-- Details -->
            <div v-else-if="activeTab === 'details'" class="space-y-5">
              <h2 class="text-xl font-black">Your details</h2>

              <dl class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-1">
                  <dt
                    class="text-[11px] font-bold uppercase tracking-widest text-stone-600 dark:text-zinc-400"
                  >
                    Name
                  </dt>
                  <dd class="font-bold text-slate-900 dark:text-zinc-50">
                    {{ displayName }}
                  </dd>
                </div>
                <div class="space-y-1">
                  <dt
                    class="text-[11px] font-bold uppercase tracking-widest text-stone-600 dark:text-zinc-400"
                  >
                    Email
                  </dt>
                  <dd class="break-all font-bold text-slate-900 dark:text-zinc-50">
                    {{ user.email }}
                  </dd>
                </div>
                <div class="space-y-1">
                  <dt
                    class="text-[11px] font-bold uppercase tracking-widest text-stone-600 dark:text-zinc-400"
                  >
                    Standing
                  </dt>
                  <dd class="font-bold text-slate-900 dark:text-zinc-50">
                    {{ roleLabel }}
                  </dd>
                </div>
                <div class="space-y-1">
                  <dt
                    class="text-[11px] font-bold uppercase tracking-widest text-stone-600 dark:text-zinc-400"
                  >
                    File no.
                  </dt>
                  <dd
                    class="font-mono text-sm font-bold text-slate-900 dark:text-zinc-50"
                  >
                    {{ memberId }}
                  </dd>
                </div>
              </dl>

              <p class="max-w-prose text-sm text-stone-600 dark:text-zinc-400">
                Your name and email come from sign-in, so they can't be edited
                here yet. Need them changed? Sign out and back in, or get in
                touch and we'll sort it.
              </p>
            </div>

            <!-- Security -->
            <div v-else class="space-y-5">
              <h2 class="text-xl font-black">Sign-in &amp; security</h2>

              <div class="space-y-4 max-w-prose">
                <div
                  class="rounded-md border-2 border-slate-900 bg-white p-4 dark:border-zinc-100 dark:bg-zinc-950"
                >
                  <p class="font-bold">Password</p>
                  <p class="text-sm text-stone-600 dark:text-zinc-400">
                    We email you a link, so only someone with your inbox can
                    set a new one.
                  </p>
                  <UButton
                    to="/reset-password"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    icon="i-heroicons-key"
                    class="mt-3"
                  >
                    Email me a reset link
                  </UButton>
                </div>

                <div
                  class="rounded-md border-2 border-dashed border-slate-400 p-4 dark:border-zinc-700"
                >
                  <p class="font-bold">This device</p>
                  <p class="text-sm text-stone-600 dark:text-zinc-400">
                    Signed in as {{ user.email }}. Signing out here keeps every
                    other browser signed in.
                  </p>
                  <UButton
                    color="neutral"
                    variant="outline"
                    size="sm"
                    icon="i-heroicons-arrow-right-on-rectangle"
                    :loading="pending"
                    class="mt-3"
                    @click="signOut"
                  >
                    Sign out
                  </UButton>
                </div>

                <div
                  class="rounded-md border-2 border-red-700 bg-red-50 p-4 dark:border-red-400 dark:bg-red-950/40"
                >
                  <p class="font-bold text-red-800 dark:text-red-200">
                    Sign out everywhere
                  </p>
                  <p class="text-sm text-red-700 dark:text-red-200/80">
                    Ends every session on every device, including this one.
                    Handy if you used a shared computer.
                  </p>
                  <UButton
                    color="error"
                    variant="soft"
                    size="sm"
                    icon="i-heroicons-exclamation-triangle"
                    :loading="pending"
                    class="mt-3"
                    @click="signOutEverywhere"
                  >
                    Sign out everywhere
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

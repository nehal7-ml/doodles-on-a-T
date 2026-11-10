<script setup lang="ts">
const { user, loaded, refresh, logout, logoutEverywhere } = useAuth();
const pending = ref(false);

onMounted(async () => {
  await refresh();
  if (!user.value) {
    await navigateTo("/login?callbackUrl=/account");
  }
});

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

useHead({ title: "Account" });
</script>

<template>
  <div class="max-w-xl mx-auto my-10 p-6 border-2 border-dashed border-stone-400 rounded-lg bg-stone-50/60">
    <h1 class="text-3xl font-bold mb-6">Account</h1>

    <div v-if="!loaded" class="text-stone-500">Loading…</div>

    <template v-else-if="user">
      <dl class="space-y-2 text-sm">
        <div class="flex justify-between gap-4 border-b border-stone-200 py-2">
          <dt class="text-stone-500">Email</dt>
          <dd class="font-medium">{{ user.email }}</dd>
        </div>
        <div class="flex justify-between gap-4 border-b border-stone-200 py-2">
          <dt class="text-stone-500">Name</dt>
          <dd class="font-medium">{{ user.name || "—" }}</dd>
        </div>
        <div class="flex justify-between gap-4 border-b border-stone-200 py-2">
          <dt class="text-stone-500">Role</dt>
          <dd class="font-medium capitalize">{{ user.role }}</dd>
        </div>
      </dl>

      <div class="mt-8 flex flex-wrap gap-3">
        <button
          :disabled="pending"
          class="rounded bg-stone-950 px-4 py-2 font-semibold text-stone-50 hover:bg-stone-800 disabled:opacity-50"
          @click="signOut"
        >
          Sign out
        </button>
        <button
          :disabled="pending"
          class="rounded border-2 border-stone-950 px-4 py-2 font-semibold hover:bg-stone-950 hover:text-stone-50 disabled:opacity-50"
          @click="signOutEverywhere"
        >
          Sign out everywhere
        </button>
      </div>
    </template>
  </div>
</template>

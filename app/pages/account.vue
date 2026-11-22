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
  <div class="max-w-xl mx-auto my-10 p-6 border-2 border-dashed border-slate-400 rounded-lg bg-slate-50/60">
    <h1 class="text-3xl font-bold mb-6">Account</h1>

    <div v-if="!loaded" class="text-slate-500">Loading…</div>

    <template v-else-if="user">
      <dl class="space-y-2 text-sm">
        <div class="flex justify-between gap-4 border-b border-slate-200 py-2">
          <dt class="text-slate-500 shrink-0">Email</dt>
          <dd class="font-medium text-right break-words min-w-0">
            {{ user.email }}
          </dd>
        </div>
        <div class="flex justify-between gap-4 border-b border-slate-200 py-2">
          <dt class="text-slate-500 shrink-0">Name</dt>
          <dd class="font-medium text-right break-words min-w-0">
            {{ user.name || "—" }}
          </dd>
        </div>
        <div class="flex justify-between gap-4 border-b border-slate-200 py-2">
          <dt class="text-slate-500 shrink-0">Role</dt>
          <dd class="font-medium capitalize text-right break-words min-w-0">
            {{ user.role }}
          </dd>
        </div>
      </dl>

      <div class="mt-8 flex flex-wrap gap-3">
        <button
          :disabled="pending"
          class="rounded bg-slate-950 px-4 py-2 font-semibold text-slate-50 hover:bg-slate-800 disabled:opacity-50"
          @click="signOut"
        >
          Sign out
        </button>
        <button
          :disabled="pending"
          class="rounded border-2 border-slate-950 px-4 py-2 font-semibold hover:bg-slate-950 hover:text-slate-50 disabled:opacity-50"
          @click="signOutEverywhere"
        >
          Sign out everywhere
        </button>
      </div>
    </template>
  </div>
</template>

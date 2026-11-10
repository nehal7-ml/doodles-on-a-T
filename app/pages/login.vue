<script setup lang="ts">
const { login, refresh } = useAuth();
const route = useRoute();

const email = ref("");
const password = ref("");
const error = ref("");
const pending = ref(false);
const csrfToken = ref("");
const providers = ref<Record<string, unknown>>({});

onMounted(async () => {
  await refresh();
  try {
    providers.value = await $fetch<Record<string, unknown>>("/api/auth/providers");
    const csrf = await $fetch<{ csrfToken: string }>("/api/auth/csrf");
    csrfToken.value = csrf.csrfToken;
  } catch {
    providers.value = {};
  }
});

async function submit() {
  error.value = "";
  pending.value = true;
  try {
    await login(email.value, password.value);
    await navigateTo(safeCallback(route.query.callbackUrl));
  } catch (cause) {
    error.value = authErrorMessage(cause);
  } finally {
    pending.value = false;
  }
}

useHead({ title: "Sign in" });
</script>

<template>
  <div class="max-w-md mx-auto my-10 p-6 border-2 border-dashed border-stone-400 rounded-lg bg-stone-50/60">
    <h1 class="text-3xl font-bold mb-6">Sign in</h1>

    <form class="space-y-4" @submit.prevent="submit">
      <label class="block">
        <span class="text-sm font-medium">Email</span>
        <input
          v-model="email"
          type="email"
          autocomplete="email"
          required
          class="mt-1 w-full rounded border-2 border-stone-300 bg-white px-3 py-2 text-stone-900 focus:border-stone-950 focus:outline-none"
        />
      </label>

      <label class="block">
        <span class="text-sm font-medium">Password</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          minlength="12"
          class="mt-1 w-full rounded border-2 border-stone-300 bg-white px-3 py-2 text-stone-900 focus:border-stone-950 focus:outline-none"
        />
      </label>

      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

      <button
        type="submit"
        :disabled="pending"
        class="w-full rounded bg-stone-950 px-4 py-2 font-semibold text-stone-50 hover:bg-stone-800 disabled:opacity-50"
      >
        {{ pending ? "Signing in…" : "Sign in" }}
      </button>
    </form>

    <template v-if="providers.google">
      <div class="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-stone-500">
        <span class="h-px flex-1 bg-stone-300" />
        or
        <span class="h-px flex-1 bg-stone-300" />
      </div>

      <form method="post" action="/api/auth/signin/google">
        <input type="hidden" name="csrfToken" :value="csrfToken" />
        <input type="hidden" name="callbackUrl" :value="safeCallback(route.query.callbackUrl)" />
        <button
          type="submit"
          class="w-full rounded border-2 border-stone-950 px-4 py-2 font-semibold hover:bg-stone-950 hover:text-stone-50"
        >
          Continue with Google
        </button>
      </form>
    </template>

    <p class="mt-6 text-sm text-stone-600">
      No account?
      <NuxtLink to="/register" class="underline underline-offset-4">Create one</NuxtLink>
      ·
      <NuxtLink to="/reset-password" class="underline underline-offset-4">Forgot password?</NuxtLink>
    </p>
  </div>
</template>

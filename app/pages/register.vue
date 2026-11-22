<script setup lang="ts">
const { register } = useAuth();
const route = useRoute();

const name = ref("");
const email = ref("");
const password = ref("");
const confirm = ref("");
const error = ref("");
const pending = ref(false);

async function submit() {
  error.value = "";
  if (password.value !== confirm.value) {
    error.value = "Passwords do not match.";
    return;
  }

  pending.value = true;
  try {
    await register({
      email: email.value,
      password: password.value,
      name: name.value || undefined,
    });
    await navigateTo(safeCallback(route.query.callbackUrl));
  } catch (cause) {
    error.value = authErrorMessage(cause);
  } finally {
    pending.value = false;
  }
}

useHead({ title: "Create account" });
</script>

<template>
  <div class="max-w-md mx-auto my-10 p-6 border-2 border-dashed border-slate-400 rounded-lg bg-slate-50/60">
    <h1 class="text-3xl font-bold mb-6">Create account</h1>

    <form class="space-y-4" @submit.prevent="submit">
      <label class="block">
        <span class="text-sm font-medium">Name <span class="text-slate-500">(optional)</span></span>
        <input
          v-model="name"
          type="text"
          autocomplete="name"
          maxlength="80"
          class="mt-1 w-full rounded border-2 border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-950 focus:outline-none"
        />
      </label>

      <label class="block">
        <span class="text-sm font-medium">Email</span>
        <input
          v-model="email"
          type="email"
          autocomplete="email"
          required
          class="mt-1 w-full rounded border-2 border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-950 focus:outline-none"
        />
      </label>

      <label class="block">
        <span class="text-sm font-medium">Password</span>
        <input
          v-model="password"
          type="password"
          autocomplete="new-password"
          required
          minlength="12"
          class="mt-1 w-full rounded border-2 border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-950 focus:outline-none"
        />
        <span class="mt-1 block text-xs text-slate-500">At least 12 characters.</span>
      </label>

      <label class="block">
        <span class="text-sm font-medium">Confirm password</span>
        <input
          v-model="confirm"
          type="password"
          autocomplete="new-password"
          required
          minlength="12"
          class="mt-1 w-full rounded border-2 border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-950 focus:outline-none"
        />
      </label>

      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

      <button
        type="submit"
        :disabled="pending"
        class="w-full rounded bg-slate-950 px-4 py-2 font-semibold text-slate-50 hover:bg-slate-800 disabled:opacity-50"
      >
        {{ pending ? "Creating…" : "Create account" }}
      </button>
    </form>

    <p class="mt-6 text-sm text-slate-600">
      Already have an account?
      <NuxtLink to="/login" class="underline underline-offset-4">Sign in</NuxtLink>
    </p>
  </div>
</template>

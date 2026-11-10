<script setup lang="ts">
const route = useRoute();

const token = computed(() =>
  typeof route.query.token === "string" ? route.query.token : "",
);

const email = ref("");
const password = ref("");
const confirm = ref("");
const error = ref("");
const message = ref("");
const pending = ref(false);

async function requestLink() {
  error.value = "";
  message.value = "";
  pending.value = true;
  try {
    await $fetch("/api/auth/forgot-password", {
      method: "POST",
      body: { email: email.value },
    });
    message.value =
      "If an account exists for that email, a reset link is on its way.";
  } catch (cause) {
    error.value = authErrorMessage(cause);
  } finally {
    pending.value = false;
  }
}

async function resetPassword() {
  error.value = "";
  message.value = "";
  if (password.value !== confirm.value) {
    error.value = "Passwords do not match.";
    return;
  }

  pending.value = true;
  try {
    await $fetch("/api/auth/reset-password", {
      method: "POST",
      body: { token: token.value, password: password.value },
    });
    message.value = "Password updated. You can sign in now.";
  } catch (cause) {
    error.value = authErrorMessage(cause);
  } finally {
    pending.value = false;
  }
}

useHead({ title: "Reset password" });
</script>

<template>
  <div class="max-w-md mx-auto my-10 p-6 border-2 border-dashed border-stone-400 rounded-lg bg-stone-50/60">
    <h1 class="text-3xl font-bold mb-6">
      {{ token ? "Choose a new password" : "Reset password" }}
    </h1>

    <form v-if="!token" class="space-y-4" @submit.prevent="requestLink">
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

      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <p v-if="message" class="text-sm text-emerald-700">{{ message }}</p>

      <button
        type="submit"
        :disabled="pending"
        class="w-full rounded bg-stone-950 px-4 py-2 font-semibold text-stone-50 hover:bg-stone-800 disabled:opacity-50"
      >
        {{ pending ? "Sending…" : "Send reset link" }}
      </button>
    </form>

    <form v-else class="space-y-4" @submit.prevent="resetPassword">
      <label class="block">
        <span class="text-sm font-medium">New password</span>
        <input
          v-model="password"
          type="password"
          autocomplete="new-password"
          required
          minlength="12"
          class="mt-1 w-full rounded border-2 border-stone-300 bg-white px-3 py-2 text-stone-900 focus:border-stone-950 focus:outline-none"
        />
      </label>

      <label class="block">
        <span class="text-sm font-medium">Confirm new password</span>
        <input
          v-model="confirm"
          type="password"
          autocomplete="new-password"
          required
          minlength="12"
          class="mt-1 w-full rounded border-2 border-stone-300 bg-white px-3 py-2 text-stone-900 focus:border-stone-950 focus:outline-none"
        />
      </label>

      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <p v-if="message" class="text-sm text-emerald-700">{{ message }}</p>

      <button
        type="submit"
        :disabled="pending"
        class="w-full rounded bg-stone-950 px-4 py-2 font-semibold text-stone-50 hover:bg-stone-800 disabled:opacity-50"
      >
        {{ pending ? "Saving…" : "Update password" }}
      </button>
    </form>

    <p class="mt-6 text-sm text-stone-600">
      <NuxtLink to="/login" class="underline underline-offset-4">Back to sign in</NuxtLink>
    </p>
  </div>
</template>

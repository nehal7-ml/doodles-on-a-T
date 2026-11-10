export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  image: string | null;
};

type SessionResponse = { user?: AuthUser } | null;

export function useAuth() {
  const user = useState<AuthUser | null>("auth:user", () => null);
  const loaded = useState<boolean>("auth:loaded", () => false);

  const loggedIn = computed(() => Boolean(user.value));

  async function refresh(): Promise<AuthUser | null> {
    try {
      const response = await $fetch<SessionResponse>("/api/auth/session", {
        headers: { accept: "application/json" },
      });
      user.value = response?.user ?? null;
    } catch {
      user.value = null;
    } finally {
      loaded.value = true;
    }
    return user.value;
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    const response = await $fetch<{ user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    user.value = response.user;
    loaded.value = true;
    return response.user;
  }

  async function register(input: {
    email: string;
    password: string;
    name?: string;
  }): Promise<AuthUser> {
    const response = await $fetch<{ user: AuthUser }>("/api/auth/register", {
      method: "POST",
      body: input,
    });
    user.value = response.user;
    loaded.value = true;
    return response.user;
  }

  async function logout(): Promise<void> {
    await $fetch("/api/auth/logout", { method: "POST" });
    user.value = null;
  }

  async function logoutEverywhere(): Promise<void> {
    await $fetch("/api/auth/logout-all", { method: "POST" });
    user.value = null;
  }

  return {
    user,
    loaded,
    loggedIn,
    refresh,
    login,
    register,
    logout,
    logoutEverywhere,
  };
}

export function authErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const data = (error as { data?: { statusMessage?: string } }).data;
    if (data?.statusMessage) return data.statusMessage;
    const message = (error as { statusMessage?: string }).statusMessage;
    if (message) return message;
  }
  return "Something went wrong. Please try again.";
}

export function safeCallback(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/account";
}

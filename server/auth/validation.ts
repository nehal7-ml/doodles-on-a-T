import { createError } from "h3";

export type CredentialsInput = {
  email: string;
  password: string;
  name?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "Email is required.",
    });
  }
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Enter a valid email address.",
    });
  }
  return email;
}

export function parsePassword(value: unknown): string {
  if (typeof value !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "Password is required.",
    });
  }
  if (value.length < 12) {
    throw createError({
      statusCode: 400,
      statusMessage: "Password must be at least 12 characters.",
    });
  }
  if (value.length > 200) {
    throw createError({
      statusCode: 400,
      statusMessage: "Password must be at most 200 characters.",
    });
  }
  return value;
}

export function parseName(value: unknown, email: string): string {
  if (typeof value === "string" && value.trim()) {
    const name = value.trim();
    if (name.length > 80) {
      throw createError({
        statusCode: 400,
        statusMessage: "Name must be at most 80 characters.",
      });
    }
    return name;
  }
  return email.split("@")[0]?.slice(0, 80) || "Customer";
}

export function parseCredentials(body: Record<string, unknown>): CredentialsInput {
  const email = normalizeEmail(body.email);
  const password = parsePassword(body.password);
  return { email, password };
}

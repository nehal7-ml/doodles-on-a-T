import { timingSafeEqual } from "node:crypto";
import { createError, getHeader, type H3Event } from "h3";

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = raw.trim().replace(/^["']|["']$/g, "");
  return value || undefined;
}

export function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Protects machine-to-machine endpoints (Printful sync/webhooks, CLI tools).
 *
 * Humans use Auth.js sessions and roles instead. Set ADMIN_TOKEN in production
 * and send it as `x-admin-token` or as a Bearer token.
 *
 * In development the check is skipped when ADMIN_TOKEN is not set, so local
 * tooling keeps working. Pass `allowDevBypass: false` for endpoints that also
 * accept a browser session: without a token or session they must reject the
 * request even on a development machine.
 */
export function requireAdminToken(
  event: H3Event,
  options: { allowDevBypass?: boolean } = {},
): void {
  const expected = readEnv("ADMIN_TOKEN");
  const allowDevBypass = options.allowDevBypass ?? true;

  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      throw createError({
        statusCode: 503,
        statusMessage:
          "ADMIN_TOKEN is not configured. Set it before using admin endpoints.",
      });
    }
    if (allowDevBypass) return;
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const authorization = getHeader(event, "authorization");
  const bearer = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : undefined;
  const provided = getHeader(event, "x-admin-token") ?? bearer;

  if (!provided || !safeCompare(provided, expected)) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
}

/** Public base URL of this app, used when registering Printful webhooks. */
export function getRequestOrigin(event: H3Event): string {
  const configured =
    readEnv("PUBLIC_SITE_URL") ?? readEnv("NUXT_PUBLIC_SITE_URL");
  if (configured) return configured.replace(/\/+$/, "");

  const proto =
    getHeader(event, "x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const host =
    getHeader(event, "x-forwarded-host")?.split(",")[0]?.trim() ||
    getHeader(event, "host") ||
    "localhost:3000";

  return `${proto}://${host}`;
}

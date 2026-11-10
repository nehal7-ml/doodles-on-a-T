import { createError, getHeader, getRequestURL, type H3Event } from "h3";

/**
 * Cookie-authenticated mutations must be same-origin to blunt CSRF. Auth.js
 * protects its own routes; this covers our custom login/register/logout routes.
 *
 * Non-browser clients (curl, tests) that send no `Origin` header are allowed —
 * they cannot be tricked into riding a victim's cookie.
 */
export function assertSameOrigin(event: H3Event): void {
  const fetchSite = getHeader(event, "sec-fetch-site");
  if (
    fetchSite &&
    fetchSite !== "same-origin" &&
    fetchSite !== "same-site" &&
    fetchSite !== "none"
  ) {
    throw createError({ statusCode: 403, statusMessage: "Cross-site request rejected." });
  }

  const origin = getHeader(event, "origin");
  if (!origin) return;

  let actual: string;
  try {
    actual = new URL(origin).origin;
  } catch {
    throw createError({ statusCode: 403, statusMessage: "Invalid origin." });
  }

  const configured = process.env.AUTH_URL?.trim();
  const expected = configured
    ? new URL(configured).origin
    : getRequestURL(event).origin;

  if (actual !== expected) {
    throw createError({ statusCode: 403, statusMessage: "Cross-site request rejected." });
  }
}

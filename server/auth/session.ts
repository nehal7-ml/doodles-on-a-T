import { randomBytes } from "node:crypto";
import {
  deleteCookie,
  getCookie,
  getHeader,
  getRequestIP,
  getRequestURL,
  setCookie,
  type H3Event,
} from "h3";
import { prisma } from "../utils/prisma";

/** 30 days, matching `authConfig.session.maxAge`. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const DEV_COOKIE = "authjs.session-token";
const SECURE_COOKIE = "__Secure-authjs.session-token";

/**
 * Auth.js prefixes the cookie with `__Secure-` whenever the public URL is
 * HTTPS. Reproduce that decision exactly, otherwise `/api/auth/session` will
 * not see sessions created by the custom email/password endpoints.
 */
export function usesSecureCookies(event: H3Event): boolean {
  const configured = process.env.AUTH_URL?.trim();
  if (configured) return configured.startsWith("https://");

  const forwarded = getHeader(event, "x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  if (forwarded) return forwarded === "https";

  return getRequestURL(event).protocol === "https:";
}

export function sessionCookieName(event: H3Event): string {
  return usesSecureCookies(event) ? SECURE_COOKIE : DEV_COOKIE;
}

export function readSessionToken(event: H3Event): string | undefined {
  return (
    getCookie(event, SECURE_COOKIE) ??
    getCookie(event, DEV_COOKIE) ??
    undefined
  );
}

function cookieOptions(event: H3Event) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: usesSecureCookies(event),
  };
}

export async function createSession(
  event: H3Event,
  userId: string,
): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: {
      sessionToken: token,
      userId,
      expires,
      userAgent: getHeader(event, "user-agent")?.slice(0, 500) ?? null,
      ipAddress: getRequestIP(event, { xForwardedFor: true }) ?? null,
    },
  });

  setCookie(event, sessionCookieName(event), token, {
    ...cookieOptions(event),
    expires,
  });

  return { token, expires };
}

/** Deletes the current session (if any) and clears both cookie variants. */
export async function destroySession(event: H3Event): Promise<void> {
  const token = readSessionToken(event);
  if (token) {
    await prisma.session.deleteMany({ where: { sessionToken: token } });
  }

  for (const name of [SECURE_COOKIE, DEV_COOKIE]) {
    deleteCookie(event, name, cookieOptions(event));
  }
}

export async function destroyAllSessions(userId: string): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { userId } });
  return result.count;
}

/** Housekeeping: called on successful login, never on a hot path. */
export async function deleteExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({
    where: { expires: { lt: new Date() } },
  });
}

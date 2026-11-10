import { createError, type H3Event } from "h3";
import { readSessionToken } from "../auth/session";
import { prisma } from "./prisma";

export type Role = "customer" | "staff" | "admin";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  image: string | null;
};

/**
 * Resolves the Auth.js database session from the request cookie.
 *
 * Reads only; sliding expiry (`updateAge`) is applied by Auth.js whenever the
 * client calls `GET /api/auth/session`. Expired/inactive sessions are deleted
 * opportunistically so a revoked account is rejected on the next request.
 */
export async function getSessionUser(
  event: H3Event,
): Promise<SessionUser | null> {
  const token = readSessionToken(event);
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expires.getTime() <= Date.now() || !session.user.isActive) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    image: session.user.image,
  };
}

export async function requireUser(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Sign in required." });
  }
  return user;
}

export function hasRole(user: SessionUser, roles: readonly string[]): boolean {
  return roles.includes(user.role);
}

export async function requireRole(
  event: H3Event,
  roles: readonly Role[],
): Promise<SessionUser> {
  const user = await requireUser(event);
  if (!hasRole(user, roles)) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden." });
  }
  return user;
}

export function requireStaff(event: H3Event): Promise<SessionUser> {
  return requireRole(event, ["staff", "admin"]);
}

export function requireAdmin(event: H3Event): Promise<SessionUser> {
  return requireRole(event, ["admin"]);
}

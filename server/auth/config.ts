import type { AuthConfig } from "@auth/core";
import Google from "@auth/core/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "../utils/prisma";
import "./types";

const isProduction = process.env.NODE_ENV === "production";

/**
 * A dev-only fallback keeps local sessions working without editing .env files.
 * Production must set AUTH_SECRET; Auth.js raises MissingSecret otherwise.
 */
const secret =
  process.env.AUTH_SECRET?.trim() ||
  (isProduction ? undefined : "doodles-development-only-secret");

const googleId = process.env.AUTH_GOOGLE_ID?.trim();
const googleSecret = process.env.AUTH_GOOGLE_SECRET?.trim();

export const authConfig: AuthConfig = {
  // @auth/core defaults to "/auth"; our routes live under /api/auth because
  // Nitro reserves /api for server routes.
  basePath: "/api/auth",
  adapter: PrismaAdapter(
    prisma as unknown as Parameters<typeof PrismaAdapter>[0],
  ),
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
    verifyRequest: "/login",
  },
  secret,
  trustHost: true,
  providers:
    googleId && googleSecret
      ? [
          Google({
            clientId: googleId,
            clientSecret: googleSecret,
            allowDangerousEmailAccountLinking: false,
          }),
        ]
      : [],
  callbacks: {
    async signIn({ user }) {
      if (!user.id) return true;
      const account = await prisma.user.findUnique({
        where: { id: user.id },
        select: { isActive: true },
      });
      return account?.isActive !== false;
    },
    async session({ session, user }) {
      // Database sessions hand the raw adapter row to this callback. Returning
      // it unchanged would expose `sessionToken` and the password hash to the
      // browser, so return an explicit allow-list instead.
      // The adapter types `expires` as an ISO string but supplies a Date, so
      // normalise through Date.
      const expires = new Date(session.expires).toISOString();

      return {
        expires,
        user: {
          id: user.id,
          name: user.name ?? null,
          email: user.email,
          image: user.image ?? null,
          role: user.role ?? "customer",
          isActive: user.isActive ?? true,
        },
      };
    },
  },
  events: {
    async signIn({ user }) {
      if (!user.id) return;
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      } catch {
        // A login must not fail because the audit timestamp could not be saved.
      }
    },
  },
};

import {
  createError,
  getRequestIP,
  readBody,
  setHeader,
  setResponseStatus,
} from "h3";
import { assertSameOrigin } from "../../auth/csrf";
import {
  consumePasswordCheck,
  verifyPassword,
} from "../../auth/password";
import { consumeRateLimit } from "../../auth/rate-limit";
import {
  createSession,
  deleteExpiredSessions,
} from "../../auth/session";
import { toPublicUser } from "../../auth/user";
import { normalizeEmail, parsePassword } from "../../auth/validation";
import { prisma } from "../../utils/prisma";

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);

  const body = (await readBody(event).catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, statusMessage: "Invalid request body." });
  }

  const email = normalizeEmail(body.email);
  const password = parsePassword(body.password);

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  consumeRateLimit(`login:ip:${ip}`, 50, 15 * 60 * 1000);
  consumeRateLimit(`login:${ip}:${email}`, 5, 15 * 60 * 1000);

  const user = await prisma.user.findUnique({ where: { email } });

  let passwordMatches = false;
  if (user?.passwordHash) {
    passwordMatches = await verifyPassword(user.passwordHash, password);
  } else {
    // Constant-ish timing for unknown accounts / OAuth-only users.
    await consumePasswordCheck(password);
  }

  if (!user || !passwordMatches) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid email or password.",
    });
  }

  if (!user.isActive) {
    throw createError({
      statusCode: 403,
      statusMessage: "This account is disabled.",
    });
  }

  await createSession(event, user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await deleteExpiredSessions();

  setResponseStatus(event, 200);

  return { user: toPublicUser(user) };
});

import {
  createError,
  getRequestIP,
  readBody,
  setHeader,
  setResponseStatus,
} from "h3";
import { assertSameOrigin } from "../../auth/csrf";
import { isUniqueConstraintError } from "../../auth/errors";
import { hashPassword } from "../../auth/password";
import { consumeRateLimit } from "../../auth/rate-limit";
import { createSession } from "../../auth/session";
import { toPublicUser } from "../../auth/user";
import {
  normalizeEmail,
  parseName,
  parsePassword,
} from "../../auth/validation";
import { prisma } from "../../utils/prisma";

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  consumeRateLimit(`register:${ip}`, 10, 60 * 60 * 1000);

  const body = (await readBody(event).catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, statusMessage: "Invalid request body." });
  }

  const email = normalizeEmail(body.email);
  const password = parsePassword(body.password);
  const name = parseName(body.name, email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: "An account with this email already exists.",
    });
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await prisma.user.create({
      data: { email, name, passwordHash, role: "customer" },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw createError({
        statusCode: 409,
        statusMessage: "An account with this email already exists.",
      });
    }
    throw error;
  }

  await createSession(event, user.id);
  setResponseStatus(event, 201);

  return { user: toPublicUser(user) };
});

import {
  createError,
  getRequestIP,
  readBody,
  setHeader,
  setResponseStatus,
} from "h3";
import { assertSameOrigin } from "../../auth/csrf";
import { hashPassword } from "../../auth/password";
import { consumeRateLimit } from "../../auth/rate-limit";
import { hashResetToken } from "../../auth/reset-token";
import { parsePassword } from "../../auth/validation";
import { prisma } from "../../utils/prisma";

const INVALID_LINK = {
  statusCode: 400,
  statusMessage: "This reset link is invalid or has expired.",
} as const;

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  consumeRateLimit(`reset:ip:${ip}`, 15, 15 * 60 * 1000);

  const body = (await readBody(event).catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, statusMessage: "Invalid request body." });
  }

  if (typeof body.token !== "string" || !body.token.trim()) {
    throw createError(INVALID_LINK);
  }
  const token = body.token.trim();
  if (token.length < 16 || token.length > 200) {
    throw createError(INVALID_LINK);
  }

  const password = parsePassword(body.password);
  const tokenHash = hashResetToken(token);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.usedAt || record.expires.getTime() <= Date.now()) {
    throw createError(INVALID_LINK);
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  setResponseStatus(event, 204);
  return null;
});

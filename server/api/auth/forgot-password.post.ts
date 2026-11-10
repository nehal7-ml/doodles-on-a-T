import {
  createError,
  getRequestIP,
  readBody,
  setHeader,
  setResponseStatus,
} from "h3";
import { assertSameOrigin } from "../../auth/csrf";
import { publicOrigin } from "../../auth/origin";
import { consumeRateLimit } from "../../auth/rate-limit";
import {
  createResetToken,
  PASSWORD_RESET_TTL_MINUTES,
} from "../../auth/reset-token";
import { normalizeEmail } from "../../auth/validation";
import { sendEmail } from "../../email";
import { passwordResetEmail } from "../../email/templates";
import { prisma } from "../../utils/prisma";

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  consumeRateLimit(`reset-request:ip:${ip}`, 10, 15 * 60 * 1000);

  const body = (await readBody(event).catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, statusMessage: "Invalid request body." });
  }

  const email = normalizeEmail(body.email);
  consumeRateLimit(`reset-request:${email}`, 3, 15 * 60 * 1000);

  const user = await prisma.user.findUnique({ where: { email } });

  // Always answer 204 so this endpoint cannot be used to enumerate accounts.
  if (user?.isActive) {
    const { token, tokenHash, expires } = createResetToken();

    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const record = await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expires },
    });

    const resetUrl = `${publicOrigin(event)}/reset-password?token=${encodeURIComponent(token)}`;
    const template = passwordResetEmail({
      name: user.name,
      resetUrl,
      expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
    });

    try {
      await sendEmail({ to: user.email, ...template });
    } catch (error) {
      // Roll the token back: an undelivered link should not stay valid.
      await prisma.passwordResetToken.deleteMany({ where: { id: record.id } });
      console.error(
        "Failed to send password reset email:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  setResponseStatus(event, 204);
  return null;
});

import { createHash, randomBytes } from "node:crypto";

const RESET_TTL_MS = 60 * 60 * 1000;

export function createResetToken(): { token: string; tokenHash: string; expires: Date } {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashResetToken(token),
    expires: new Date(Date.now() + RESET_TTL_MS),
  };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const PASSWORD_RESET_TTL_MINUTES = RESET_TTL_MS / 1000 / 60;

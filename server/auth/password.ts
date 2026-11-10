import { hash, verify } from "@node-rs/argon2";

/**
 * OWASP baseline for Argon2id: 19 MiB memory, 2 iterations, 1 lane.
 * Changing these values would invalidate existing hashes, so treat them as
 * part of the stored format.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON2_OPTIONS);
  } catch {
    // Malformed/unknown hash format: treat as a failed login.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Runs a real Argon2 verification for unknown accounts so login timing does not
 * reveal whether an email exists.
 */
export async function consumePasswordCheck(password: string): Promise<void> {
  dummyHash ??= hash("not-a-real-password-timing-equaliser", ARGON2_OPTIONS);
  const hashToCheck = await dummyHash;
  try {
    await verify(hashToCheck, password, ARGON2_OPTIONS);
  } catch {
    // ignored
  }
}

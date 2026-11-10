import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../generated/prisma/client";

const localDatabaseUrl =
  process.env.LOCAL_DATABASE_URL?.trim() || "file:./prisma/dev.db";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0)?.trim();
}

function isRemote(url: string) {
  return (
    url.startsWith("libsql://") ||
    url.startsWith("http://") ||
    url.startsWith("https://")
  );
}

function createPrismaClient() {
  // DATABASE_URL is the canonical name; TURSO_* is still honoured for
  // deployments that already use it.
  const url =
    firstNonEmpty(process.env.DATABASE_URL, process.env.TURSO_DATABASE_URL) ??
    localDatabaseUrl;
  const authToken = firstNonEmpty(
    process.env.DATABASE_TOKEN,
    process.env.TURSO_AUTH_TOKEN,
  );

  const adapter = new PrismaLibSql(
    isRemote(url) && authToken ? { url, authToken } : { url },
  );

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

for (const file of [".env", ".env.development", ".env.local"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "bun prisma/seed.ts",
  },
  datasource: {
    // The Prisma CLI's migration engine only understands local SQLite files.
    // Remote Turso/libSQL URLs are rejected with P1013, so the CLI always
    // works against the local database and `bun run db:turso:deploy` ships the
    // generated migrations to Turso instead.
    url:
      process.env.LOCAL_DATABASE_URL?.trim() || "file:./prisma/dev.db",
  },
});

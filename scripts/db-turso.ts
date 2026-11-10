/**
 * Applies Prisma migrations to a hosted Turso / libSQL database.
 *
 * The Prisma CLI's migration engine only understands `file:` URLs for SQLite
 * (a `libsql://` URL fails with P1013), so migrations are generated locally
 * with `prisma migrate dev` and shipped here through `@libsql/client`.
 *
 * Usage:
 *   bun scripts/db-turso.ts status
 *   bun scripts/db-turso.ts deploy
 */
import { createClient } from "@libsql/client";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");
const MIGRATIONS_TABLE = "_prisma_migrations";

for (const file of [".env", ".env.development", ".env.local"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const url =
  [process.env.DATABASE_URL, process.env.TURSO_DATABASE_URL].find(
    (value) => value && value.trim().length > 0,
  )?.trim();
const authToken = [process.env.DATABASE_TOKEN, process.env.TURSO_AUTH_TOKEN]
  .find((value) => value && value.trim().length > 0)
  ?.trim();

if (!url || url.startsWith("file:")) {
  console.error(
    [
      "No remote database configured.",
      "Set DATABASE_URL to your Turso URL (libsql://…) and DATABASE_TOKEN to a token.",
      "For the local database use: bun run db:deploy",
    ].join("\n"),
  );
  process.exit(1);
}

if (!authToken) {
  console.error(
    "DATABASE_TOKEN is not set. Create one with `turso db tokens create <database>`.",
  );
  process.exit(1);
}

const client = createClient({ url, authToken });
const command = process.argv[2] ?? "deploy";

type Migration = {
  name: string;
  sql: string;
  checksum: string;
};

function readMigrations(): Migration[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];

  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{14}_.+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const file = join(MIGRATIONS_DIR, name, "migration.sql");
      const sql = readFileSync(file, "utf8");
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    });
}

/**
 * Turso's HTTP protocol does not support per-session pragmas, so Prisma's
 * `PRAGMA foreign_keys=...` wrappers have to be removed before the script is
 * submitted. Migrations that rebuild tables will need to be checked by hand.
 */
function prepareSql(sql: string) {
  const pragmas = sql.match(/^\s*PRAGMA\s+.*;\s*$/gm) ?? [];

  if (pragmas.length > 0) {
    console.log(`  · stripped ${pragmas.length} PRAGMA statement(s)`);
  }

  return sql.replace(/^\s*PRAGMA\s+.*;\s*$/gm, "");
}

async function ensureMigrationsTable() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )
  `);
}

async function getApplied() {
  const result = await client.execute(
    `SELECT "migration_name", "checksum" FROM "${MIGRATIONS_TABLE}"
     WHERE "rolled_back_at" IS NULL`,
  );

  return new Map(
    result.rows.map((row) => [String(row.migration_name), String(row.checksum)]),
  );
}

async function status() {
  const migrations = readMigrations();
  await ensureMigrationsTable();
  const applied = await getApplied();

  if (migrations.length === 0) {
    console.log("No migrations found in prisma/migrations.");
    return;
  }

  for (const migration of migrations) {
    const checksum = applied.get(migration.name);

    if (!checksum) {
      console.log(`  pending  ${migration.name}`);
    } else if (checksum !== migration.checksum) {
      console.log(`  changed  ${migration.name} (local file differs from applied)`);
    } else {
      console.log(`  applied  ${migration.name}`);
    }
  }

  const pending = migrations.filter((m) => !applied.has(m.name)).length;
  console.log(
    pending === 0
      ? "\nDatabase is up to date."
      : `\n${pending} migration(s) pending — run \`bun run db:turso:deploy\`.`,
  );
}

async function deploy() {
  const migrations = readMigrations();
  await ensureMigrationsTable();
  const applied = await getApplied();
  const pending = migrations.filter((m) => !applied.has(m.name));

  for (const [name, checksum] of applied) {
    const local = migrations.find((m) => m.name === name);
    if (local && local.checksum !== checksum) {
      console.warn(
        `Warning: ${name} differs from the applied version. The remote schema may not match prisma/schema.prisma.`,
      );
    }
  }

  if (pending.length === 0) {
    console.log("Nothing to apply — database is up to date.");
    return;
  }

  for (const migration of pending) {
    console.log(`Applying ${migration.name}…`);
    const sql = prepareSql(migration.sql);
    const transaction = await client.transaction("write");

    try {
      await transaction.executeMultiple(sql);
      await transaction.execute({
        sql: `INSERT INTO "${MIGRATIONS_TABLE}"
                ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          migration.checksum,
          new Date().toISOString(),
          migration.name,
          new Date().toISOString(),
          1,
        ],
      });
      await transaction.commit();
      console.log(`  ✓ ${migration.name}`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  console.log(`\nApplied ${pending.length} migration(s) to ${url}.`);
}

try {
  if (command === "status") {
    await status();
  } else if (command === "deploy") {
    await deploy();
  } else {
    console.error(`Unknown command "${command}". Use "status" or "deploy".`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  client.close();
}

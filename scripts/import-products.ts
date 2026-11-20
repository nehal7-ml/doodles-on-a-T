/**
 * Imports the product catalogue from a CSV file or URL.
 *
 * The source defaults to the PRODUCTS_CSV environment variable (a local path
 * or http(s) URL) and can be overridden with --file. Nothing is written when
 * --dry-run is passed.
 *
 * Usage:
 *   bun run products:import                    import from PRODUCTS_CSV
 *   bun run products:import -- --dry-run       validate and report only
 *   bun scripts/import-products.ts --file path/to/products.csv
 *
 * See docs/products-csv.md for the column reference.
 */
import { existsSync } from "node:fs";

// Environment first: server/utils/prisma.ts reads DATABASE_URL when it is
// imported, so the dotenv files must be loaded before that module graph.
for (const file of [".env", ".env.development", ".env.local"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fileFlagIndex = args.indexOf("--file");
const override =
  fileFlagIndex !== -1 ? (args[fileFlagIndex + 1] ?? "").trim() : "";

if (fileFlagIndex !== -1 && !override) {
  console.error("--file requires a path or http(s) URL.");
  process.exit(1);
}

const source = override || process.env.PRODUCTS_CSV?.trim();
if (!source) {
  console.error(
    "No CSV source. Set PRODUCTS_CSV to a file path or http(s) URL, or pass --file <path>.",
  );
  process.exit(1);
}

const { readCsvSource, importProductsCatalog } = await import(
  "../server/utils/products-csv"
);

let csv: string;
try {
  csv = await readCsvSource(source);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

let report;
try {
  report = await importProductsCatalog(csv, { source, dryRun });
} catch (error) {
  console.error(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

if (report.errors?.length) {
  console.error(
    `CSV validation failed (${report.errors.length} problem${report.errors.length === 1 ? "" : "s"}):`,
  );
  for (const problem of report.errors) {
    console.error(`  row ${problem.row}: ${problem.message}`);
  }
  process.exit(1);
}

const created =
  report.products.created.length > 0
    ? report.products.created.join(", ")
    : "none";
console.log(
  `${report.dryRun ? "Dry run — no changes written." : "Import complete."} Source: ${report.source}`,
);
console.log(`  records:  ${report.records}`);
console.log(
  `  products: ${report.products.created.length} created (${created}), ${report.products.updated.length} updated`,
);
console.log(
  `  variants: ${report.variants.created} created, ${report.variants.updated} updated, ${report.variants.deactivated} deactivated`,
);
console.log(`  images:   ${report.images} written`);
for (const warning of report.warnings ?? []) {
  console.warn(`  warning: ${warning}`);
}

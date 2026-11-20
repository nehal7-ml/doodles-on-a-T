import { createError, getHeader, readBody } from "h3";
import { assertSameOrigin } from "../../../auth/csrf";
import {
  importProductsCatalog,
  readCsvSource,
} from "../../../utils/products-csv";
import { requireAdminOrToken } from "../../../utils/auth";

/**
 * Runs the catalogue CSV import (docs/products-csv.md). The file itself is
 * never uploaded: the server reads the source named by PRODUCTS_CSV (a local
 * path or an http(s) URL), so re-importing after a CSV edit is one
 * authenticated POST. Body `{ "dryRun": true }` validates and reports without
 * writing anything.
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdminOrToken(event);
  assertSameOrigin(event);

  const body = (await readBody(event).catch(() => null)) as {
    dryRun?: unknown;
  } | null;
  const dryRun = body?.dryRun === true;

  const source = process.env.PRODUCTS_CSV?.trim();
  if (!source) {
    throw createError({
      statusCode: 400,
      statusMessage: "PRODUCTS_CSV is not configured.",
      data: {
        message:
          "Set PRODUCTS_CSV to a file path or an http(s) URL (see docs/products-csv.md).",
      },
    });
  }

  let csv: string;
  try {
    csv = await readCsvSource(source);
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: "Could not read PRODUCTS_CSV.",
      data: { message: error instanceof Error ? error.message : String(error) },
    });
  }

  const report = await importProductsCatalog(csv, {
    source,
    dryRun,
    actorId: admin?.id ?? null,
    ip: getHeader(event, "x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: getHeader(event, "user-agent") ?? null,
  });

  if (report.errors?.length) {
    throw createError({
      statusCode: 422,
      statusMessage: "CSV validation failed.",
      data: report,
    });
  }

  return report;
});

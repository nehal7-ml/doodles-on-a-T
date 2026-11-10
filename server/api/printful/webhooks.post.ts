import { createError } from "h3";
import {
  defaultWebhookUrl,
  registerPrintfulWebhooks,
} from "../../utils/printful-webhooks";
import { getRequestOrigin, requireAdminToken } from "../../utils/request";

export default defineEventHandler(async (event) => {
  requireAdminToken(event);

  const body = (await readBody(event).catch(() => ({}))) as {
    url?: unknown;
  };

  const baseUrl =
    typeof body.url === "string" && body.url.trim()
      ? body.url.trim()
      : defaultWebhookUrl(getRequestOrigin(event));

  const result = await registerPrintfulWebhooks(baseUrl);

  if (result.errors.length === 2) {
    throw createError({
      statusCode: 502,
      statusMessage: "Could not register Printful webhooks.",
      data: result,
    });
  }

  return result;
});

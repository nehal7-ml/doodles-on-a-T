import {
  createError,
  getRequestHeaders,
  getRouterParam,
  readRawBody,
  setHeader,
  setResponseStatus,
} from "h3";
import { getPaymentProvider } from "../../../payments";
import { applyPaymentEvent } from "../../../payments/process";
import { prisma } from "../../../utils/prisma";

function toHeaders(event: Parameters<typeof getRequestHeaders>[0]): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(getRequestHeaders(event))) {
    if (value) headers.set(key, value);
  }
  return headers;
}

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store");

  const routeProvider = getRouterParam(event, "provider");
  if (!routeProvider) {
    throw createError({ statusCode: 404, statusMessage: "Unknown provider." });
  }

  const adapter = getPaymentProvider();
  if (adapter.id === "manual" || routeProvider !== adapter.id) {
    throw createError({ statusCode: 404, statusMessage: "Unknown provider." });
  }

  const rawBody = await readRawBody(event);
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: "Empty webhook body." });
  }

  let parsed;
  try {
    parsed = await adapter.verifyAndParseWebhook({
      headers: toHeaders(event),
      rawBody,
    });
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage:
        error instanceof Error ? error.message : "Invalid webhook signature.",
    });
  }

  const eventKey = parsed.eventId;
  const existing = await prisma.webhookEvent.findUnique({
    where: {
      provider_eventKey: { provider: adapter.id, eventKey },
    },
  });

  if (existing && existing.status !== "failed") {
    return { received: true, duplicate: true };
  }

  const record = existing
    ? await prisma.webhookEvent.update({
        where: { id: existing.id },
        data: {
          eventType: parsed.eventType ?? parsed.event.type,
          payload: rawBody,
          status: "received",
          error: null,
          processedAt: null,
        },
      })
    : await prisma.webhookEvent
        .create({
          data: {
            provider: adapter.id,
            eventType: parsed.eventType ?? parsed.event.type,
            eventKey,
            payload: rawBody,
            status: "received",
          },
        })
        .catch((error: unknown) => {
          // A concurrent delivery of the same event won the insert race.
          if ((error as { code?: string }).code === "P2002") return null;
          throw error;
        });

  if (!record) {
    return { received: true, duplicate: true };
  }

  try {
    const result = await applyPaymentEvent(adapter.id, parsed.event);
    await prisma.webhookEvent.update({
      where: { id: record.id },
      data: {
        status: result.error
          ? "failed"
          : result.status === "ignored"
            ? "ignored"
            : "processed",
        error: result.error ?? null,
        processedAt: new Date(),
      },
    });

    setResponseStatus(event, 200);
    return {
      received: true,
      duplicate: false,
      status: result.status,
      orderId: result.orderId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook processing failed.";
    await prisma.webhookEvent
      .update({
        where: { id: record.id },
        data: { status: "failed", error: message, processedAt: new Date() },
      })
      .catch(() => {});
    throw createError({ statusCode: 500, statusMessage: message });
  }
});

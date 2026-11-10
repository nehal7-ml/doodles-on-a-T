/**
 * Register, inspect or remove the Printful webhooks from a terminal/CI job.
 *
 * Usage:
 *   bun run printful:webhooks register [https://shop.example.com]
 *   bun run printful:webhooks status
 *   bun run printful:webhooks delete
 *
 * `PUBLIC_SITE_URL` is used when no URL is passed. The script talks to
 * Printful directly, so it does not need a running Nuxt server or ADMIN_TOKEN.
 */
import { existsSync } from "node:fs";

for (const file of [".env", ".env.development", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const { prisma } = await import("../server/utils/prisma");
const {
  defaultWebhookUrl,
  getPrintfulWebhookStatus,
  registerPrintfulWebhooks,
  unregisterPrintfulWebhooks,
} = await import("../server/utils/printful-webhooks");

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = raw.trim().replace(/^["']|["']$/g, "");
  return value || undefined;
}

function resolveWebhookUrl(): string {
  const configured = process.argv[3] ?? readEnv("PUBLIC_SITE_URL");
  if (!configured) {
    throw new Error(
      "Set PUBLIC_SITE_URL (for example https://shop.example.com) or pass the URL as the second argument.",
    );
  }

  return configured.includes("/api/webhooks/printful")
    ? configured
    : defaultWebhookUrl(configured);
}

function printErrors(errors: string[]) {
  for (const error of errors) console.error(`  ! ${error}`);
}

const command = (process.argv[2] ?? "register").toLowerCase();

try {
  if (command === "register") {
    const result = await registerPrintfulWebhooks(resolveWebhookUrl());

    console.log(`Webhook URL: ${result.url}`);
    console.log(
      `Product webhooks: ${result.productWebhooks ? "registered" : "failed"}`,
    );
    console.log(
      `Order webhooks: ${result.orderWebhooks ? "registered" : "failed"}`,
    );
    console.log(`Signed v2 events: ${result.signedEvents ? "yes" : "no"}`);

    if (result.errors.length) {
      printErrors(result.errors);
      process.exitCode = 1;
    }
    if (!result.signedEvents) {
      console.warn(
        "Warning: no v2 signing secret is stored. Production will reject v2 events until the webhooks are registered again.",
      );
    }
  } else if (command === "status") {
    const status = await getPrintfulWebhookStatus();
    console.log(JSON.stringify(status, null, 2));
  } else if (command === "delete") {
    const result = await unregisterPrintfulWebhooks();
    console.log(result.ok ? "Webhooks removed." : "Webhooks partially removed.");
    if (result.errors.length) {
      printErrors(result.errors);
      process.exitCode = 1;
    }
  } else {
    console.error(`Unknown command "${command}". Use register, status or delete.`);
    process.exitCode = 1;
  }
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Printful webhook command failed";
  console.error(message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

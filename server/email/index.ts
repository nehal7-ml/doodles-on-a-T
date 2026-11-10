import { createConsoleProvider } from "./console";
import { createResendProvider } from "./resend";
import type { EmailMessage, EmailProvider, SendEmailResult } from "./types";

export type { EmailMessage, EmailProvider, SendEmailResult };

let provider: EmailProvider | undefined;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim().replace(/^["']|["']$/g, "");
  return value || undefined;
}

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;

  const id = (readEnv("EMAIL_PROVIDER") ?? "console").toLowerCase();

  if (id === "resend") {
    const apiKey = readEnv("RESEND_API_KEY");
    const from = readEnv("EMAIL_FROM");
    if (!apiKey || !from) {
      throw new Error(
        "EMAIL_PROVIDER=resend requires RESEND_API_KEY and EMAIL_FROM.",
      );
    }
    provider = createResendProvider(apiKey, from);
    return provider;
  }

  if (id === "console") {
    provider = createConsoleProvider();
    return provider;
  }

  throw new Error(
    `Unknown EMAIL_PROVIDER "${id}". Use "resend" or "console".`,
  );
}

export function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  return getEmailProvider().send({
    ...message,
    replyTo: message.replyTo ?? readEnv("EMAIL_REPLY_TO"),
  });
}

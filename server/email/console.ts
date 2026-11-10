import type { EmailMessage, EmailProvider } from "./types";

/**
 * Development provider. It prints the message to the server console and never
 * runs in production — reset links must not be written to production logs.
 */
export function createConsoleProvider(): EmailProvider {
  return {
    id: "console",
    async send(message: EmailMessage) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "EMAIL_PROVIDER=console is refused in production. Configure Resend or SMTP.",
        );
      }

      console.info(
        [
          "",
          "── email (console provider) ─────────────────────────────",
          `To: ${message.to}`,
          `Subject: ${message.subject}`,
          "",
          message.text ?? message.html,
          "─────────────────────────────────────────────────────────",
          "",
        ].join("\n"),
      );

      return { id: `console-${Date.now()}` };
    },
  };
}

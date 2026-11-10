import type { EmailMessage, EmailProvider } from "./types";

type ResendResponse = {
  id?: string;
  message?: string;
  name?: string;
};

export function createResendProvider(apiKey: string, from: string): EmailProvider {
  return {
    id: "resend",
    async send(message: EmailMessage) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          reply_to: message.replyTo,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as ResendResponse;

      if (!response.ok || !data.id) {
        throw new Error(
          `Resend rejected the email (${response.status}): ${
            data.message ?? "unknown error"
          }`,
        );
      }

      return { id: data.id };
    },
  };
}

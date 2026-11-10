export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type SendEmailResult = { id: string };

export interface EmailProvider {
  id: "resend" | "console";
  send(message: EmailMessage): Promise<SendEmailResult>;
}

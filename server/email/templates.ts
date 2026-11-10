export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type Template = {
  subject: string;
  html: string;
  text: string;
};

function wrap(title: string, body: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f4ef;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1b1b1b">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px">
      <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>
      ${body}
      <p style="margin-top:32px;font-size:12px;color:#6b6b6b">
        Doodles on a T · You received this email because of an action on your account.
      </p>
    </div>
  </body>
</html>`;
}

export function passwordResetEmail(input: {
  name: string | null;
  resetUrl: string;
  expiresInMinutes: number;
}): Template {
  const greeting = input.name ? `Hi ${input.name},` : "Hi,";
  const minutes = input.expiresInMinutes;

  return {
    subject: "Reset your Doodles on a T password",
    text: [
      greeting,
      "",
      "We received a request to reset your password.",
      `Open this link within ${minutes} minutes: ${input.resetUrl}`,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: wrap(
      "Reset your password",
      `<p>${escapeHtml(greeting)}</p>
       <p>We received a request to reset your password.</p>
       <p><a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:#1b1b1b;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Choose a new password</a></p>
       <p style="font-size:13px;color:#6b6b6b">This link expires in ${minutes} minutes. If you did not request it, ignore this email.</p>`,
    ),
  };
}

export function orderConfirmationEmail(input: {
  name: string | null;
  orderNumber: string;
  total: string;
  items: Array<{ name: string; quantity: number }>;
}): Template {
  const greeting = input.name ? `Hi ${input.name},` : "Hi,";
  const lines = input.items.map((item) => `${item.quantity} × ${item.name}`);

  return {
    subject: `Order ${input.orderNumber} confirmed`,
    text: [
      greeting,
      "",
      `Thanks for your order ${input.orderNumber}.`,
      "",
      ...lines,
      "",
      `Total: ${input.total}`,
    ].join("\n"),
    html: wrap(
      `Order ${input.orderNumber} confirmed`,
      `<p>${escapeHtml(greeting)}</p>
       <p>Thanks for your order <strong>${escapeHtml(input.orderNumber)}</strong>.</p>
       <ul>${input.items
         .map(
           (item) =>
             `<li>${item.quantity} × ${escapeHtml(item.name)}</li>`,
         )
         .join("")}</ul>
       <p>Total: <strong>${escapeHtml(input.total)}</strong></p>`,
    ),
  };
}

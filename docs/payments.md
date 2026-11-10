# Payments & email architecture

Status: **decided** — 2026-10-28
Audience: checkout, orders, admin, finance and auth work.
Companion: [`docs/database.md`](database.md) (schema and money conventions).

> Decision in one line: **Stripe is the default payment provider; Polar is not
> usable for this store because it does not support physical goods or
> multi-product carts. Transactional email is separate from payments and uses a
> provider-agnostic `EmailProvider` (Resend on the free tier).**

Sources were checked on 2026-10-28:
[Polar fees](https://polar.sh/docs/merchant-of-record/fees),
[Polar acceptable use](https://polar.sh/docs/merchant-of-record/acceptable-use/introduction),
[Polar checkout links](https://polar.sh/docs/features/checkout/links),
[Polar MoR](https://polar.sh/docs/merchant-of-record/introduction),
[Stripe pricing](https://stripe.com/pricing),
[Resend pricing](https://resend.com/pricing). Re-check fees before launch.

---

## 1. What this store actually needs

| Need | Why it matters here |
| --- | --- |
| Physical goods | Every product is apparel fulfilled by Printful; the payment provider must support shipping addresses and physical-goods tax rules |
| Multi-item carts | A cart can contain several variants/products in one payment |
| Shipping + tax lines | Totals come from the server, not the provider's product catalogue |
| Hosted card form | Keep PCI scope at SAQ-A; never post card data to our server |
| Webhooks | Payment state changes must be server-authoritative and idempotent |
| Receipts | Customers expect an emailed receipt/invoice |
| No fixed monthly cost | Very low order volume; per-transaction pricing only |
| Swappable provider | The DB schema must not depend on Stripe-specific ids |

---

## 2. Polar findings (and why it loses here)

Polar is an open-source **Merchant of Record (MoR)**: Polar is the legal seller,
handles international sales tax registration/remittance, and provides a hosted
checkout, orders, refunds and customer portal. That is genuinely useful — but
its scope is digital products.

Blocking issues for this store:

1. **Physical goods are excluded.** Polar's Acceptable Use Policy covers
   software, digital products and premium content, and explicitly lists
   *physical goods* as unsupported. Apparel + Printful is the core of this
   store.
2. **No multi-product checkout.** Polar's checkout docs state that customers
   purchase a single product per checkout and that “true multi-product checkout
   (multiple products in the same order) isn't supported yet.” Our cart
   routinely has multiple items.
3. **Product catalogue, not shipping.** Polar's products/prices are the source
   of truth for what is sold; shipping is not part of its order model. Printful
   fulfilment needs item-level variants plus a shipping address that we own.
4. **Cost.** Starter is free/month but **5% + 50¢** per transaction, plus 1.5%
   for international cards. Stripe's standard card rate is roughly **2.9% + 30¢**
   for US cards (varies by country; cross-border cards add ~1%). At low volume
   Polar is both more restrictive and more expensive.

What Polar does better, and what we should copy conceptually:

- It is the merchant of record, so it files/remits sales tax (VAT/GST/US sales
  tax). If tax compliance later becomes the dominant pain, revisit a MoR that
  supports physical goods (e.g. Paddle/Lemon Squeezy — also digital-first, so
  verify) or use **Stripe Tax** (≈0.5% per transaction, optional).
- It issues receipts/invoices as seller of record and provides a customer portal.
  With Stripe we enable **receipt emails** in the Dashboard and/or send our own
  order emails.
- Its webhook model (`order.paid`, `order.refunded`, `refund.updated`) is clean;
  our normalized events below mirror that shape.

**Verdict:** do not integrate Polar for checkout now. Keep `Payment.provider`
generic so a digital-goods side of the business could add Polar later without a
schema migration.

---

## 3. Provider comparison

| Criterion | Stripe | Polar |
| --- | --- | --- |
| Physical goods | ✅ | ❌ (AUP excludes) |
| Multi-item cart | ✅ | ❌ (one product per checkout) |
| Shipping address / shipping lines | ✅ (Checkout or PaymentIntent + our address) | ❌ not part of the model |
| Merchant of record / tax remittance | ❌ (Stripe Tax can calculate, not remit) | ✅ |
| Hosted checkout | ✅ Checkout / Payment Links | ✅ |
| Receipts / invoices | ✅ (receipt emails, Invoicing) | ✅ (as MoR) |
| Webhooks + idempotency | ✅ | ✅ |
| Refunds (full/partial) | ✅ | ✅ |
| Monthly fixed cost | $0 | $0 (Starter) |
| Per-transaction (published) | ~2.9% + 30¢ US cards; varies by country | 5% + 50¢ Starter; 3.8% + 40¢ on $20/mo Pro |
| Integration effort | Medium (PaymentIntents or Checkout) | Low, but unusable for this catalogue |

**Chosen:** Stripe. **Fallback provider to design for:** PayPal (common customer
expectation, physical goods supported) and Polar only for digital products.
Manual/bank-transfer is already representable as `provider = "manual"`.

---

## 4. Provider abstraction

The rule: **orders, totals, statuses and snapshots are ours.** A provider only
creates a payment session and reports money events. No Stripe/Polar types leak
outside `server/payments/`.

### 4.1 Interface

```ts
// server/payments/types.ts
export type CreatePaymentInput = {
  order: {
    id: string;
    orderNumber: string;
    email: string;
    currency: string;
    totalCents: number;
    items: Array<{
      name: string;
      variantId: string;
      quantity: number;
      unitPriceCents: number;
    }>;
  };
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
};

export type CreatePaymentResult =
  | { kind: "client_secret"; clientSecret: string; providerPaymentId: string }
  | { kind: "redirect"; url: string; providerCheckoutId: string };

export type NormalizedEvent =
  | { type: "payment_succeeded"; providerPaymentId: string; amountCents: number; raw: unknown }
  | { type: "payment_failed"; providerPaymentId: string; failureMessage?: string; raw: unknown }
  | { type: "payment_refunded"; providerPaymentId: string; amountCents: number; raw: unknown }
  | { type: "ignored"; raw: unknown };

export interface PaymentProvider {
  id: "stripe" | "polar" | "paypal" | "manual";
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyAndParseWebhook(input: {
    headers: Headers;
    rawBody: string;
  }): Promise<{ eventId: string; event: NormalizedEvent }>;
  refund(input: {
    providerPaymentId: string;
    amountCents: number;
    reason?: string;
  }): Promise<{ providerRefundId: string; status: string }>;
}
```

`server/payments/index.ts` picks the adapter from `PAYMENT_PROVIDER`
(`stripe` by default) and throws at startup for an unknown value. Adding a
provider = one new adapter file + one registry entry + the provider's env vars.
No schema change and no checkout rewrite.

### 4.2 Provider-specific behaviour

| Concern | Stripe adapter | Polar adapter (future, digital only) |
| --- | --- | --- |
| Session | Hosted Checkout Session (`redirect`); PaymentIntent/client-secret remains supported by the interface for future on-site forms | Checkout Session (`redirect`) |
| Stored id | `Payment.providerCheckoutId` = `cs_…`, then `providerPaymentId` = PaymentIntent id from the webhook | `Payment.providerCheckoutId` = checkout id, then `providerPaymentId` = order id |
| Webhook verification | `stripe.webhooks.constructEvent(rawBody, signature, secret)` | Standard Webhooks signature (`webhook-id`, `webhook-timestamp`, `webhook-signature`) |
| Event mapping | `checkout.session.completed` and `payment_intent.succeeded` → `payment_succeeded`; `payment_intent.payment_failed`/`canceled` → `payment_failed`; `charge.refunded` / `refund.updated` → `payment_refunded` | `order.paid` → `payment_succeeded`; `order.refunded` / `refund.updated` → `payment_refunded` |
| Refund | Refunds API | Refunds API |

`Payment.providerCheckoutId` exists precisely because hosted-checkout providers
need a second identifier before a payment id exists. Stripe Checkout also uses
it (`cs_…`).

### 4.3 Checkout flow (provider-agnostic)

1. `POST /api/checkout` validates the cart, re-prices from the DB, quotes
   shipping, and creates `Order` + snapshots.
2. It calls `provider.createPayment(...)` with an idempotency key of
   `order.id` (or `order.id + attempt`).
3. The response is either:
   - `{ kind: "client_secret", clientSecret }` → browser confirms with Stripe.js, or
   - `{ kind: "redirect", url }` → browser navigates to the hosted page.
4. Success redirect is **cosmetic**. The order is only marked paid by the
   verified webhook.
5. `POST /api/payments/webhook/[provider]` verifies the signature, dedupes on
   `WebhookEvent(provider, eventKey)`, then in one transaction updates
   `Payment`, `Order.paymentStatus`, `Order.status` (`submitted`) and triggers the
   Printful draft submission.
6. Refunds are admin-only and go through `provider.refund(...)`; the resulting
   webhook is authoritative, but write the `Refund` row immediately with
   `status = "pending"` for UX and reconcile on the event.
7. The cart is marked `converted` in the same transaction that stores the
   `Payment` row — after the provider session exists, but before payment is
   confirmed. If `createPayment` or that transaction throws, the order is
   deleted and the cart stays active. A canceled hosted checkout therefore
   leaves an unpaid order with its own `/checkout/canceled` page; the customer
   re-adds items to start a new cart. Treat abandoned unpaid orders as normal
   and clean them up separately.
8. Stripe uses **hosted Checkout**, which needs only `STRIPE_SECRET_KEY` (no
   publishable key or Stripe.js). `PUBLIC_SITE_URL` (falling back to `AUTH_URL`)
   builds the absolute success/cancel URLs.
9. `PAYMENT_PROVIDER=manual` has no webhook endpoint. An admin settles it with
   `POST /api/orders/{id}/mark-paid`; refunds use
   `POST /api/orders/{id}/refund`.

---

## 5. Emails

Payments and transactional email are separate concerns; do not couple them to
the payment provider.

| Email | Owner | Notes |
| --- | --- | --- |
| Payment receipt / tax invoice | Stripe (or MoR) | Enable receipt emails in the Dashboard; the provider is the legal issuer. Do not duplicate |
| Order confirmation | Our app | Includes order number, items, totals, shipping address |
| Shipping/tracking update | Our app (from Printful webhook) | `Order.shippedAt`, `trackingNumber` |
| Verify email, password reset | Our app | Required by the auth flow |
| Refund confirmation | Our app (optional) | Provider also sends its receipt |

### 5.1 Provider abstraction

```ts
// server/email/types.ts
export interface EmailProvider {
  id: "resend" | "smtp" | "console";
  send(input: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
  }): Promise<{ id: string }>;
}
```

`EMAIL_PROVIDER` selects the adapter; `console` only logs (development, and the
fallback when no key is set). Templates live in `server/email/templates/` and
receive plain data — no provider SDK imports.

### 5.2 Recommendation: Resend free tier

- 3,000 transactional emails/month, **100/day**, 1 custom domain, DKIM/SPF/DMARC,
  REST API + SMTP, React Email support. That comfortably covers a small store
  (order confirmation + shipping + password resets).
- Alternatives: Brevo (300/day free), Postmark (paid, best deliverability),
  Amazon SES (cheapest at scale, more setup). Any of them fits behind the
  `EmailProvider` interface.
- Verify the sending domain before launch; until then Resend only delivers to
  the account owner's address (`onboarding@resend.dev`).
- Never send marketing email through the transactional API.

### 5.3 Email rules

- Never log full email bodies or reset tokens.
- Order emails are sent after the DB transaction commits, and failures must not
  fail the webhook (queue/retry; record `OrderEvent` with the failure).
- One email per state transition, keyed by `order.id + type` to avoid duplicates
  on webhook retries. Use an `OrderEvent` row (`type = "email.order_confirmation"`,
  etc.) as the idempotency marker; no separate email table is needed.
- Unsubscribe is only required for marketing; transactional mail still needs a
  physical address in the footer for CAN-SPAM.

---

## 6. Google OAuth

Google is a first-class login method (in addition to email/password):

- `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` enable the provider; if either is
  missing the provider is omitted and email/password still works.
- `allowDangerousEmailAccountLinking` stays **false**. A user who registered
  with a password must sign in first and explicitly link Google from
  `/account/security` (planned) rather than being auto-linked by email.
- Google users get `role = "customer"`; the adapter creates `User` +
  `Account` rows. `User.passwordHash` stays null for OAuth-only users.
- The OAuth callback still creates a **database session**; no JWT is issued.
- Redirect URI to register in Google Cloud Console:
  `{AUTH_URL}/api/auth/callback/google`.

---

## 7. Environment

```dotenv
# Payments
PAYMENT_PROVIDER="stripe"          # stripe | manual (polar/paypal when added)
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""

# Optional / future providers
POLAR_ACCESS_TOKEN=""
POLAR_WEBHOOK_SECRET=""
POLAR_ORGANIZATION_ID=""

# Email
EMAIL_PROVIDER="resend"            # resend | smtp | console (console in dev)
RESEND_API_KEY=""
EMAIL_FROM="orders@example.com"
EMAIL_REPLY_TO="support@example.com"
SMTP_URL=""                        # only for EMAIL_PROVIDER=smtp

# Google OAuth
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
```

Production uses the same names in the host environment; Nitro does not read
`.env*` at runtime. Webhook endpoints:

- Stripe: `POST /api/payments/webhook/stripe`
- Polar (future): `POST /api/payments/webhook/polar`

---

## 8. Testing checklist

- Stripe CLI: `stripe listen --forward-to localhost:3000/api/payments/webhook/stripe`
  and `stripe trigger payment_intent.succeeded`.
- Replay the same event twice → exactly one `Payment` transition, one
  `WebhookEvent` row, one Printful submission.
- Forge a success redirect → order stays `unpaid`.
- Partial refund → `Payment.amountRefundedCents`, `Order.refundedCents` and
  `Order.paymentStatus` agree.
- Admin-created pending refund + provider webhook → the existing `Refund` row is
  marked `succeeded` in place; no duplicate row or unique-key error.
- Provider swap smoke test: `PAYMENT_PROVIDER=manual` must still complete an
  order (admin marks it paid) with no Stripe imports loaded.
- Email: reset + order confirmation render with `EMAIL_PROVIDER=console` in dev
  and send through Resend in staging.

---

## 9. Revisit triggers

- Selling digital goods (presets, sample packs, licences) → Polar becomes
  viable as a **second** provider alongside Stripe.
- International tax volume grows → evaluate Stripe Tax (≈0.5%) or a
  physical-goods MoR.
- Order volume makes Stripe's per-transaction cost material → negotiate or
  compare Adyen/Braintree; the adapter boundary keeps this cheap.

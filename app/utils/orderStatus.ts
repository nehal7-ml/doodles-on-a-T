/** Shared presentation helpers for order views (account, order detail, track). */

/** Badge classes for every status the API can return. */
export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending:
    "bg-coral-100 text-coral-800 border-coral-700 dark:bg-coral-950 dark:text-coral-200 dark:border-coral-300",
  draft: "bg-stone-100 text-stone-700 border-stone-500 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-500",
  submitted:
    "bg-sky-100 text-sky-800 border-sky-700 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-300",
  inprocess:
    "bg-sky-100 text-sky-800 border-sky-700 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-300",
  in_production:
    "bg-sky-100 text-sky-800 border-sky-700 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-300",
  partial:
    "bg-sky-100 text-sky-800 border-sky-700 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-300",
  partially_fulfilled:
    "bg-sky-100 text-sky-800 border-sky-700 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-300",
  fulfilled:
    "bg-emerald-100 text-emerald-800 border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-300",
  shipped:
    "bg-emerald-100 text-emerald-800 border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-300",
  delivered:
    "bg-emerald-100 text-emerald-800 border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-300",
  returned:
    "bg-amber-100 text-amber-800 border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-300",
  refunded:
    "bg-red-100 text-red-800 border-red-700 dark:bg-red-950 dark:text-red-200 dark:border-red-300",
  canceled:
    "bg-red-100 text-red-800 border-red-700 dark:bg-red-950 dark:text-red-200 dark:border-red-300",
  failed:
    "bg-red-100 text-red-800 border-red-700 dark:bg-red-950 dark:text-red-200 dark:border-red-300",
  onhold:
    "bg-amber-100 text-amber-800 border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-300",
  on_hold:
    "bg-amber-100 text-amber-800 border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-300",
};

/** Badge classes for an order status, falling back to the neutral draft look. */
export function orderStatusClass(status: string): string {
  return ORDER_STATUS_COLORS[status] ?? ORDER_STATUS_COLORS.draft ?? "";
}

/** Human date/time for order rows and history entries. */
export function formatOrderDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

/** Total number of physical items across all order lines. */
export function orderItemCount(order: {
  items: Array<{ quantity: number }>;
}): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

/* --------------------------------------------------------------------------
   Payment / transaction ledger — mirrors the states the payment provider
   pipeline writes to `Payment.status`.
   -------------------------------------------------------------------------- */

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  requires_payment_method: "Awaiting payment",
  requires_confirmation: "Awaiting confirmation",
  succeeded: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};

/** Human label for a raw `Payment.status` value. */
export function paymentStatusLabel(status: string): string {
  const known = PAYMENT_STATUS_LABELS[status];
  if (known) return known;
  return status
    .split(/[_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type TransactionTone = "paid" | "refunded" | "partial" | "failed" | "pending";

export type TransactionState = {
  label: string;
  tone: TransactionTone;
};

/**
 * Derives the headline state of a payment record: a refund that covers the
 * full capture flips a paid order into "refunded"; a partial refund lands in
 * between. Falls back to the raw status for anything unclassified.
 */
export function transactionState(payment: {
  status: string;
  amountCents: number;
  amountRefundedCents: number;
}): TransactionState {
  const amount = payment.amountCents;
  const refunded = payment.amountRefundedCents;
  const covered = amount > 0 && refunded >= amount;

  if (covered) return { label: "Refunded", tone: "refunded" };
  if (refunded > 0) return { label: "Partially refunded", tone: "partial" };

  switch (payment.status) {
    case "succeeded":
      return { label: "Paid", tone: "paid" };
    case "failed":
      return { label: "Failed", tone: "failed" };
    case "requires_confirmation":
      return { label: "Awaiting confirmation", tone: "pending" };
    case "requires_payment_method":
      return { label: "Awaiting payment", tone: "pending" };
    default:
      return { label: paymentStatusLabel(payment.status), tone: "pending" };
  }
}

/** Badge classes for a transaction state (reuses the order badge palette). */
export function transactionStatusClass(state: TransactionState): string {
  switch (state.tone) {
    case "paid":
      return ORDER_STATUS_COLORS.succeeded ?? "";
    case "refunded":
      return ORDER_STATUS_COLORS.refunded ?? "";
    case "partial":
      return ORDER_STATUS_COLORS.partial ?? "";
    case "failed":
      return ORDER_STATUS_COLORS.failed ?? "";
    default:
      return ORDER_STATUS_COLORS.pending ?? "";
  }
}

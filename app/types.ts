export type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
};

/** One line in the server cart (cents, unlike the legacy `CartItem` above). */
export type CartViewItem = {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  size: string | null;
  color: string | null;
  image: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  currency: string;
  available: boolean;
};

export type CartView = {
  id: string | null;
  status: string;
  currency: string;
  items: CartViewItem[];
  itemCount: number;
  hasUnavailable: boolean;
  totals: {
    subtotalCents: number;
    itemCount: number;
  };
  expiresAt: string | null;
};

export enum ApparelSize {
  XS = "XS",
  S = "S",
  M = "M",
  L = "L",
  XL = "XL",
  XXL = "XXL",
}

/**
 * One purchasable size/colour combination. `id` is the local variant id that
 * must be sent to `/api/orders` when checking out.
 */
export type ProductOption = {
  id: string;
  name: string;
  size: string | null;
  color: string | null;
  price: number | null;
  currency: string | null;
  image: string | null;
  inStock: boolean;
  sku: string | null;
};

/** Variants grouped by colour, used for the product page swatches. */
export type ApparelVariant = {
  id: string;
  name: string;
  colors: string[];
  sizes: string[];
  price: number | null;
  currency: string | null;
  image: string | null;
  inStock: boolean;
};

export type Product = {
  id: string;
  printfulProductId: number | null;
  images: string[];
  thumbnailUrl: string | null;
  name: string;
  price: number;
  currency: string;
  description: string;
  variants: ApparelVariant[];
  sizes: string[];
  options: ProductOption[];
};

export type OrderItem = {
  id: string;
  name: string;
  size: string | null;
  color: string | null;
  quantity: number;
  price: number;
  currency: string;
  productId: string | null;
  variantId: string | null;
};

export type OrderEvent = {
  id: string;
  type: string;
  message: string;
  payload: unknown;
  createdAt: string;
};

export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  refundedCents: number;
  userId: string | null;
  printfulOrderId: number | null;
  email: string | null;
  customerName: string | null;
  shipping: {
    method: string | null;
    service: string | null;
    cost: number;
    currency: string;
  };
  totals: {
    subtotal: number;
    discount: number;
    tax: number;
    shipping: number;
    total: number;
    currency: string;
  };
  recipient: Record<string, unknown>;
  tracking: {
    number: string | null;
    url: string | null;
    carrier: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
  };
  failureReason: string | null;
  items: OrderItem[];
  events: OrderEvent[];
  createdAt: string;
  updatedAt: string;
};
